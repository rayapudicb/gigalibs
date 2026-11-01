import {
  generatedModuleAnalyticsSources,
  MODULE_ANALYTICS_CONTROL_TOTAL_V1,
  parseModuleAnalyticsControlTotalV1,
  type ModuleAnalyticsControlTotalV1,
  type ModuleSourceReconciliationStatusV1,
} from '@gigalibs/contracts';
import type { RelayEnvelope } from '@gigalibs/module-sdk';
import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export type ControlTotalReceiveStatus = 'applied' | 'duplicate';

@Injectable()
export class ModuleSourceReconciliationService {
  private readonly contractsBySourceKey = new Map(
    generatedModuleAnalyticsSources.map((contract) => [contract.sourceKey, contract]),
  );

  constructor(private readonly db: DatabaseService) {}

  async receiveFromRelay(
    producer: string | undefined,
    body: unknown,
  ): Promise<{ status: ControlTotalReceiveStatus; reconciliationStatus?: ModuleSourceReconciliationStatusV1 }> {
    const envelope = body as Partial<RelayEnvelope>;
    if (envelope?.eventType !== MODULE_ANALYTICS_CONTROL_TOTAL_V1) {
      throw new BadRequestException(`${String(producer)} may not deliver ${String(envelope?.eventType)} here.`);
    }
    const controlTotal = parseModuleAnalyticsControlTotalV1(envelope.payload);
    this.assertProducerMayReport(producer, controlTotal);
    return this.receive(producer ?? 'module', envelope as RelayEnvelope, controlTotal);
  }

  async receive(
    producer: string,
    envelope: RelayEnvelope,
    controlTotal: ModuleAnalyticsControlTotalV1,
  ): Promise<{ status: ControlTotalReceiveStatus; reconciliationStatus?: ModuleSourceReconciliationStatusV1 }> {
    const contract = this.contractsBySourceKey.get(controlTotal.sourceKey);
    if (!contract || contract.catalogModuleKey !== controlTotal.catalogModuleKey) {
      throw new BadRequestException(`Unknown module analytics source ${controlTotal.sourceKey}.`);
    }

    return this.db.withTenantTransaction(envelope.tenantId, async (client) => {
      const receipt = await client.query(
        `INSERT INTO gigalibs_analytics.inbox_receipts (message_id, tenant_id, source, event_type)
         VALUES ($1, $2, $3, $4) ON CONFLICT (message_id) DO NOTHING`,
        [envelope.messageId, envelope.tenantId, producer, envelope.eventType],
      );
      if ((receipt.rowCount ?? 0) === 0) return { status: 'duplicate' as const };

      await client.query(
        `INSERT INTO gigalibs_analytics.module_source_control_totals
           (tenant_id, source_key, producer_record_count, reported_at, backfill_complete,
            backfill_cursor, backfill_batch_seq, message_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (tenant_id, source_key) DO UPDATE SET
           producer_record_count = EXCLUDED.producer_record_count,
           reported_at = EXCLUDED.reported_at,
           backfill_complete = EXCLUDED.backfill_complete,
           backfill_cursor = EXCLUDED.backfill_cursor,
           backfill_batch_seq = EXCLUDED.backfill_batch_seq,
           message_id = EXCLUDED.message_id,
           received_at = now()`,
        [
          envelope.tenantId,
          controlTotal.sourceKey,
          controlTotal.producerRecordCount,
          controlTotal.reportedAt,
          controlTotal.backfillComplete,
          controlTotal.backfillCursor ?? null,
          controlTotal.backfillBatchSeq ?? null,
          envelope.messageId,
        ],
      );

      const backfillStatus = controlTotal.backfillComplete ? 'COMPLETE' : 'RUNNING';
      await client.query(
        `INSERT INTO gigalibs_analytics.module_source_backfill_cursors
           (tenant_id, source_key, cursor_token, batch_seq, status, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (tenant_id, source_key) DO UPDATE SET
           cursor_token = EXCLUDED.cursor_token,
           batch_seq = GREATEST(gigalibs_analytics.module_source_backfill_cursors.batch_seq, EXCLUDED.batch_seq),
           status = EXCLUDED.status,
           updated_at = now()`,
        [
          envelope.tenantId,
          controlTotal.sourceKey,
          controlTotal.backfillCursor ?? null,
          controlTotal.backfillBatchSeq ?? 0,
          backfillStatus,
        ],
      );

      const reconciliationStatus = await this.reconcileCounts(
        client,
        envelope.tenantId,
        controlTotal.sourceKey,
        controlTotal.producerRecordCount,
      );
      return { status: 'applied' as const, reconciliationStatus };
    });
  }

  /** Recomputes parity for one tenant source (also used by the reconciliation sweeper). */
  async reconcileTenantSource(
    tenantId: string,
    sourceKey: string,
  ): Promise<ModuleSourceReconciliationStatusV1> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const control = await client.query<{ producer_record_count: string | null }>(
        `SELECT producer_record_count::text FROM gigalibs_analytics.module_source_control_totals
         WHERE tenant_id = $1 AND source_key = $2`,
        [tenantId, sourceKey],
      );
      const producerCount =
        control.rows[0]?.producer_record_count === null || control.rows[0]?.producer_record_count === undefined
          ? null
          : Number(control.rows[0].producer_record_count);
      return this.reconcileCounts(client, tenantId, sourceKey, producerCount);
    });
  }

  private async reconcileCounts(
    client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> },
    tenantId: string,
    sourceKey: string,
    producerRecordCount: number | null,
  ): Promise<ModuleSourceReconciliationStatusV1> {
    const counts = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE fact_kind = 'UPSERT')::text AS upserts,
         COUNT(*) FILTER (WHERE fact_kind = 'REVERSAL')::text AS reversals
       FROM gigalibs_analytics.module_fact_receipts
       WHERE tenant_id = $1 AND source_key = $2 AND data_origin = 'PRODUCTION'`,
      [tenantId, sourceKey],
    );
    const countRow = counts.rows[0] as { upserts: string; reversals: string } | undefined;
    const upserts = Number(countRow?.upserts ?? 0);
    const reversals = Number(countRow?.reversals ?? 0);
    const status = this.deriveStatus(producerRecordCount, upserts);
    await client.query(
      `INSERT INTO gigalibs_analytics.module_source_reconciliation
         (tenant_id, source_key, checked_at, producer_record_count, analytics_upsert_count,
          analytics_reversal_count, status)
       VALUES ($1, $2, now(), $3, $4, $5, $6)
       ON CONFLICT (tenant_id, source_key) DO UPDATE SET
         checked_at = now(),
         producer_record_count = EXCLUDED.producer_record_count,
         analytics_upsert_count = EXCLUDED.analytics_upsert_count,
         analytics_reversal_count = EXCLUDED.analytics_reversal_count,
         status = EXCLUDED.status`,
      [tenantId, sourceKey, producerRecordCount, upserts, reversals, status],
    );
    return status;
  }

  private deriveStatus(producerRecordCount: number | null, upserts: number): ModuleSourceReconciliationStatusV1 {
    if (producerRecordCount === null) return 'UNKNOWN';
    if (upserts === producerRecordCount) return 'MATCH';
    if (upserts < producerRecordCount) return 'UNDER';
    return 'OVER';
  }

  private assertProducerMayReport(producer: string | undefined, controlTotal: ModuleAnalyticsControlTotalV1): void {
    const allowed: Record<string, readonly string[]> = {
      cmms: ['asset-maintenance'],
      workforce: ['gigaops'],
    };
    const catalogKeys = allowed[String(producer)] ?? [];
    if (catalogKeys.length > 0 && !catalogKeys.includes(controlTotal.catalogModuleKey)) {
      throw new BadRequestException(`${String(producer)} may not report for ${controlTotal.catalogModuleKey}.`);
    }
  }
}
