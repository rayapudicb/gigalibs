import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  FINANCE_FISCAL_PERIOD_SNAPSHOT_COMPLETED_V1,
  FINANCE_FISCAL_PERIOD_STATE_CHANGED_V1,
  FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1,
  FinanceFiscalPeriodSnapshotCompletedPayloadSchema,
  FinanceFiscalPeriodStateChangedPayloadSchema,
  FinanceInventoryReceiptPostingOutcomePayloadSchema,
  ExactDecimal,
  RelayEnvelopeV1Schema,
  type RelayEnvelopeV1,
  type FinanceInventoryReceiptCostLineV1,
} from '@gigalibs/contracts';
import { type InboxReceiptOptions, receiveOnce } from '@gigalibs/module-sdk';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { InventoryPostingCutoffService } from '../inventory/inventory-posting-cutoff.service.js';

const CONSUMER = 'inventory.finance-relay';
const RECEIPTS: InboxReceiptOptions = { schema: SCHEMA, consumer: CONSUMER, sourceModule: 'finance' };

export type FinanceInventoryInboxOutcome = { readonly status: 'PROCESSED' | 'DUPLICATE' | 'REJECTED'; readonly code?: string };

@Injectable()
export class FinanceInventoryInboxService {
  private readonly logger = new Logger(FinanceInventoryInboxService.name);
  private unknownPostingOutcomeCount = 0;

  constructor(
    private readonly database: DatabaseService,
    private readonly postingCutoff: InventoryPostingCutoffService,
  ) {}

  async receive(rawEnvelope: unknown, rawBody: string): Promise<FinanceInventoryInboxOutcome> {
    const parsed = RelayEnvelopeV1Schema.safeParse(rawEnvelope);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'INVENTORY_INBOX_ENVELOPE_INVALID', message: parsed.error.issues[0]?.message });
    }
    const envelope = parsed.data;
    return this.database.withTenantTransaction(envelope.tenantId, (client) =>
      receiveOnce(client, RECEIPTS, envelope, rawBody, () => this.apply(client, envelope)),
    );
  }

  private async apply(client: PoolClient, envelope: RelayEnvelopeV1): Promise<FinanceInventoryInboxOutcome> {
    switch (envelope.eventType) {
      case FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1:
        return this.applyPostingOutcome(client, envelope);
      case FINANCE_FISCAL_PERIOD_STATE_CHANGED_V1:
        return this.applyFiscalPeriodState(client, envelope);
      case FINANCE_FISCAL_PERIOD_SNAPSHOT_COMPLETED_V1:
        return this.applyFiscalPeriodSnapshotCompleted(client, envelope);
      default:
        throw new BadRequestException({ code: 'INVENTORY_INBOX_EVENT_UNKNOWN', message: `No consumer for ${envelope.eventType}.` });
    }
  }

  private async applyPostingOutcome(client: PoolClient, envelope: RelayEnvelopeV1): Promise<FinanceInventoryInboxOutcome> {
    const payload = FinanceInventoryReceiptPostingOutcomePayloadSchema.safeParse(envelope.payload);
    if (!payload.success) return { status: 'REJECTED', code: 'INVENTORY_INBOX_PAYLOAD_INVALID' };

    const current = await client.query<{ finance_posting_status: string | null }>(
      `SELECT finance_posting_status FROM ${SCHEMA}.receipts WHERE tenant_id = $1 AND id = $2`,
      [envelope.tenantId, payload.data.receiptId],
    );
    const existing = current.rows[0]?.finance_posting_status;
    if (existing === 'POSTED' && payload.data.status === 'POSTING_REJECTED') {
      return { status: 'PROCESSED' };
    }

    if (payload.data.status === 'POSTED' && payload.data.costLines) {
      const projection = await this.projectReceiptCosts(client, envelope.tenantId, payload.data.receiptId, payload.data.costLines);
      if (projection.status === 'REJECTED') return projection;
    }

    const rejection =
      payload.data.status === 'POSTING_REJECTED' ? (payload.data.rejectionCode ?? 'FINANCE_POSTING_REJECTED').slice(0, 128) : null;

    const status = payload.data.status;
    const updated = await client.query<{ completed_at: string | null }>(
      `UPDATE ${SCHEMA}.receipts
          SET finance_posting_status = $3,
              finance_posting_rejection_code = $4,
              updated_at = clock_timestamp()
        WHERE tenant_id = $1 AND id = $2
        RETURNING completed_at`,
      [envelope.tenantId, payload.data.receiptId, status, status === 'POSTING_REJECTED' ? rejection : null],
    );
    if ((updated.rowCount ?? 0) === 0) {
      this.unknownPostingOutcomeCount += 1;
      this.logger.warn(
        `Finance posting outcome for unknown receipt ${payload.data.receiptId} (tenant ${envelope.tenantId}); count=${this.unknownPostingOutcomeCount}.`,
      );
      return { status: 'PROCESSED' };
    }
    if (payload.data.status === 'POSTED') {
      const completedAt = updated.rows[0]?.completed_at;
      if (completedAt) {
        await this.postingCutoff.tryPublishClearCutoffForReceiptDate(
          client,
          envelope.tenantId,
          new Date(completedAt).toISOString(),
        );
      }
    }
    return { status: 'PROCESSED' };
  }

  private async projectReceiptCosts(
    client: PoolClient,
    tenantId: string,
    receiptId: string,
    costLines: readonly FinanceInventoryReceiptCostLineV1[],
  ): Promise<FinanceInventoryInboxOutcome> {
    const expected = await client.query<{
      id: string; product_id: string; received_quantity: string; target_location_id: string | null;
      warehouse_id: string; org_unit_id: string | null;
    }>(
      `SELECT rl.id, rl.product_id, rl.received_quantity, rl.target_location_id,
              r.warehouse_id, w.org_unit_id
         FROM ${SCHEMA}.receipt_lines rl
         JOIN ${SCHEMA}.receipts r ON r.tenant_id = rl.tenant_id AND r.id = rl.receipt_id
         JOIN ${SCHEMA}.warehouses w ON w.tenant_id = r.tenant_id AND w.id = r.warehouse_id
        WHERE rl.tenant_id = $1 AND rl.receipt_id = $2 AND rl.received_quantity > 0`,
      [tenantId, receiptId],
    );
    const rowsById = new Map(expected.rows.map((row) => [row.id, row]));
    if (costLines.length !== rowsById.size || new Set(costLines.map((line) => line.receiptLineId)).size !== costLines.length) {
      return { status: 'REJECTED', code: 'INVENTORY_COST_LINE_SET_MISMATCH' };
    }
    const inserts: Array<{ line: FinanceInventoryReceiptCostLineV1; source: NonNullable<ReturnType<typeof rowsById.get>> }> = [];
    for (const line of costLines) {
      const source = rowsById.get(line.receiptLineId);
      if (!source || !source.target_location_id || source.product_id !== line.productId ||
          ExactDecimal.toScaledBigInt(String(source.received_quantity)) !== ExactDecimal.toScaledBigInt(line.quantity)) {
        return { status: 'REJECTED', code: 'INVENTORY_COST_LINE_MISMATCH' };
      }
      const prior = await client.query<{
        finance_cost_layer_id: string; valuation_method: string; unit_cost_scaled: string; total_cost_minor: string;
      }>(
        `SELECT finance_cost_layer_id, valuation_method, unit_cost_scaled, total_cost_minor
           FROM ${SCHEMA}.inventory_receipt_cost_records
          WHERE tenant_id = $1 AND receipt_line_id = $2`,
        [tenantId, line.receiptLineId],
      );
      if (prior.rowCount) {
        const old = prior.rows[0]!;
        if (old.finance_cost_layer_id !== line.financeCostLayerId || old.valuation_method !== line.valuationMethod ||
            String(old.unit_cost_scaled) !== line.unitCostScaled || String(old.total_cost_minor) !== line.totalCostMinor) {
          return { status: 'REJECTED', code: 'INVENTORY_COST_REPLAY_CONFLICT' };
        }
        continue;
      }
      inserts.push({ line, source });
    }
    for (const { line, source } of inserts) {
      await client.query(
        `INSERT INTO ${SCHEMA}.inventory_receipt_cost_records
           (tenant_id, receipt_id, receipt_line_id, finance_cost_layer_id, warehouse_id, location_id,
            product_id, org_unit_id, valuation_method, quantity, unit_cost_scaled, total_cost_minor)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [tenantId, receiptId, line.receiptLineId, line.financeCostLayerId, source.warehouse_id,
          source.target_location_id, line.productId, source.org_unit_id, line.valuationMethod,
          line.quantity, line.unitCostScaled, line.totalCostMinor],
      );
    }
    return { status: 'PROCESSED' };
  }

  private async applyFiscalPeriodState(client: PoolClient, envelope: RelayEnvelopeV1): Promise<FinanceInventoryInboxOutcome> {
    const payload = FinanceFiscalPeriodStateChangedPayloadSchema.safeParse(envelope.payload);
    if (!payload.success) return { status: 'REJECTED', code: 'INVENTORY_INBOX_PAYLOAD_INVALID' };

    if (payload.data.isPrimaryBook) {
      await client.query(
        `INSERT INTO ${SCHEMA}.finance_period_replica_meta (tenant_id, primary_book_id)
         VALUES ($1, $2)
         ON CONFLICT (tenant_id) DO UPDATE
           SET primary_book_id = EXCLUDED.primary_book_id`,
        [envelope.tenantId, payload.data.accountingBookId],
      );
    }

    const upsert = await client.query(
      `INSERT INTO ${SCHEMA}.finance_fiscal_period_replica (
         tenant_id, fiscal_period_id, accounting_book_id, period_name, start_date, end_date, status, state_version, updated_at
       ) VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8, clock_timestamp())
       ON CONFLICT (tenant_id, fiscal_period_id) DO UPDATE
         SET accounting_book_id = EXCLUDED.accounting_book_id,
             period_name = EXCLUDED.period_name,
             start_date = EXCLUDED.start_date,
             end_date = EXCLUDED.end_date,
             status = EXCLUDED.status,
             state_version = EXCLUDED.state_version,
             updated_at = clock_timestamp()
       WHERE ${SCHEMA}.finance_fiscal_period_replica.state_version < EXCLUDED.state_version`,
      [
        envelope.tenantId,
        payload.data.fiscalPeriodId,
        payload.data.accountingBookId,
        payload.data.periodName,
        payload.data.startDate,
        payload.data.endDate,
        payload.data.status,
        payload.data.stateVersion,
      ],
    );
    if ((upsert.rowCount ?? 0) > 0) {
      await this.postingCutoff.tryPublishClearCutoffForPeriod(client, envelope.tenantId, payload.data.fiscalPeriodId);
    }
    return { status: 'PROCESSED' };
  }

  private async applyFiscalPeriodSnapshotCompleted(
    client: PoolClient,
    envelope: RelayEnvelopeV1,
  ): Promise<FinanceInventoryInboxOutcome> {
    const payload = FinanceFiscalPeriodSnapshotCompletedPayloadSchema.safeParse(envelope.payload);
    if (!payload.success) return { status: 'REJECTED', code: 'INVENTORY_INBOX_PAYLOAD_INVALID' };

    await client.query(
      `INSERT INTO ${SCHEMA}.finance_period_replica_meta (tenant_id, primary_book_id, initial_sync_completed_at)
       VALUES ($1, $2, clock_timestamp())
       ON CONFLICT (tenant_id) DO UPDATE
         SET primary_book_id = EXCLUDED.primary_book_id,
             initial_sync_completed_at = COALESCE(${SCHEMA}.finance_period_replica_meta.initial_sync_completed_at, clock_timestamp())`,
      [envelope.tenantId, payload.data.primaryBookId],
    );
    return { status: 'PROCESSED' };
  }
}
