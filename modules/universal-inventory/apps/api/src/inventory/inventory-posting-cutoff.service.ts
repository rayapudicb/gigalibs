import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const INVENTORY_POSTING_CUTOFF_V1 = 'inventory.posting-cutoff.v1';
import type { PoolClient } from 'pg';
import { SCHEMA, TOPIC } from '../config.js';

/** WI-OI-120bq (M3): publish zero-backlog confirmations to Finance over the outbox relay. */
@Injectable()
export class InventoryPostingCutoffService {
  async tryPublishClearCutoffForPeriod(
    client: PoolClient,
    tenantId: string,
    fiscalPeriodId: string,
  ): Promise<void> {
    const period = await client.query<{
      fiscal_period_id: string;
      accounting_book_id: string;
      end_date: string;
      start_date: string;
    }>(
      `SELECT fiscal_period_id, accounting_book_id, end_date::text, start_date::text
         FROM ${SCHEMA}.finance_fiscal_period_replica
        WHERE tenant_id = $1 AND fiscal_period_id = $2`,
      [tenantId, fiscalPeriodId],
    );
    const row = period.rows[0];
    if (!row) return;
    await this.publishClearCutoffIfNoBacklog(client, tenantId, row);
  }

  async tryPublishClearCutoffForReceiptDate(
    client: PoolClient,
    tenantId: string,
    receivedAtIso: string,
  ): Promise<void> {
    const receivedDate = receivedAtIso.slice(0, 10);
    const period = await client.query<{
      fiscal_period_id: string;
      accounting_book_id: string;
      end_date: string;
      start_date: string;
    }>(
      `SELECT fiscal_period_id, accounting_book_id, end_date::text, start_date::text
         FROM ${SCHEMA}.finance_fiscal_period_replica
        WHERE tenant_id = $1 AND start_date <= $2::date AND end_date >= $2::date
        ORDER BY updated_at DESC
        LIMIT 1`,
      [tenantId, receivedDate],
    );
    const row = period.rows[0];
    if (!row) return;
    await this.publishClearCutoffIfNoBacklog(client, tenantId, row);
  }

  private async publishClearCutoffIfNoBacklog(
    client: PoolClient,
    tenantId: string,
    row: { fiscal_period_id: string; accounting_book_id: string; end_date: string; start_date: string },
  ): Promise<void> {
    const backlog = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM ${SCHEMA}.outbox_events
        WHERE tenant_id = $1
          AND event_type = 'inventory.receipt.completed.v1'
          AND status IN ('PENDING', 'FAILED')
          AND (payload->>'receivedAt')::timestamptz::date >= $2::date
          AND (payload->>'receivedAt')::timestamptz::date <= $3::date`,
      [tenantId, row.start_date, row.end_date],
    );
    const undelivered = Number(backlog.rows[0]?.count ?? 0);
    if (undelivered > 0) return;

    const payload = {
      accountingBookId: row.accounting_book_id,
      fiscalPeriodId: row.fiscal_period_id,
      periodEnd: row.end_date,
      undeliveredReceiptCount: 0,
    };
    const aggregateId = `${row.fiscal_period_id}:posting-cutoff`;
    const pending = await client.query<{ id: string }>(
      `SELECT id FROM ${SCHEMA}.outbox_events
        WHERE tenant_id = $1 AND event_type = $2 AND aggregate_id = $3 AND status IN ('PENDING', 'LEASED')
        LIMIT 1`,
      [tenantId, INVENTORY_POSTING_CUTOFF_V1, aggregateId],
    );
    if (pending.rows[0]) return;

    const now = new Date().toISOString();
    await client.query(
      `INSERT INTO ${SCHEMA}.outbox_events (
         id, tenant_id, topic, event_type, aggregate_type, aggregate_id,
         aggregate_version, correlation_id, schema_version, payload, status, created_at
       ) VALUES ($1, $2, $3, $4, 'inventory_posting_cutoff', $5, 1, $5, 1, $6, 'PENDING', $7)`,
      [randomUUID(), tenantId, TOPIC, INVENTORY_POSTING_CUTOFF_V1, aggregateId, JSON.stringify(payload), now],
    );
  }
}
