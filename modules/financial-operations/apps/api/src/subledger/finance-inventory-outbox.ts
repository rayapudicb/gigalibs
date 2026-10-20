import { randomUUID } from 'node:crypto';
import {
  financeFiscalPeriodStateChangedV1,
  financeInventoryReceiptPostingOutcomeV1,
  type FinanceInventoryReceiptPostingOutcomeStatus,
} from '@gigalibs/posting-rules';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import { appendOutboxEvent } from '../outbox.js';

/** One-time per-tenant snapshot so Inventory's fiscal replica can refuse locked periods before live relay events. */
export async function ensureInventoryFiscalPeriodSnapshotPublished(
  client: PoolClient,
  tenantId: string,
): Promise<void> {
  const existing = await client.query<{ tenant_id: string }>(
    `SELECT tenant_id FROM ${SCHEMA}.inventory_fiscal_replica_publish WHERE tenant_id = $1`,
    [tenantId],
  );
  if (existing.rowCount) return;

  const rows = await client.query<{
    id: string;
    accounting_book_id: string;
    period_name: string;
    start_date: string;
    end_date: string;
    status: string;
    is_primary: boolean;
  }>(
    `SELECT p.id, p.accounting_book_id, p.period_name, p.start_date::text, p.end_date::text, p.status,
            b.is_primary
       FROM ${SCHEMA}.fiscal_periods p
       JOIN ${SCHEMA}.accounting_books b
         ON b.tenant_id = p.tenant_id AND b.id = p.accounting_book_id
      WHERE p.tenant_id = $1`,
    [tenantId],
  );

  for (const row of rows.rows) {
    await appendFiscalPeriodStateChanged(client, tenantId, row);
  }

  await client.query(
    `INSERT INTO ${SCHEMA}.inventory_fiscal_replica_publish (tenant_id) VALUES ($1)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId],
  );
}

export async function appendFiscalPeriodStateChanged(
  client: PoolClient,
  tenantId: string,
  period: {
    id: string;
    accounting_book_id: string;
    period_name: string;
    start_date: string;
    end_date: string;
    status: string;
    is_primary: boolean;
  },
): Promise<void> {
  const eventId = randomUUID();
  await appendOutboxEvent(client, tenantId, {
    id: eventId,
    type: financeFiscalPeriodStateChangedV1.eventType,
    aggregateType: financeFiscalPeriodStateChangedV1.aggregateType,
    aggregateId: period.id,
    correlationId: eventId,
    data: {
      fiscalPeriodId: period.id,
      accountingBookId: period.accounting_book_id,
      periodName: period.period_name,
      startDate: period.start_date,
      endDate: period.end_date,
      status: period.status,
      isPrimaryBook: period.is_primary,
    },
  });
}

export async function appendInventoryReceiptPostingOutcome(
  client: PoolClient,
  tenantId: string,
  receiptId: string,
  status: FinanceInventoryReceiptPostingOutcomeStatus,
  rejectionCode: string | null,
): Promise<void> {
  const eventId = randomUUID();
  await appendOutboxEvent(client, tenantId, {
    id: eventId,
    type: financeInventoryReceiptPostingOutcomeV1.eventType,
    aggregateType: financeInventoryReceiptPostingOutcomeV1.aggregateType,
    aggregateId: receiptId,
    correlationId: eventId,
    data: {
      receiptId,
      status,
      rejectionCode: rejectionCode ?? undefined,
    },
  });
}
