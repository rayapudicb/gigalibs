import type { PoolClient } from 'pg';
import { listInventoryReceiptJournalGaps } from './subledger-posting-register.js';

const CONSUMER = 'finance.inventory-subledger';
const STALE_PROCESSING_MINUTES = 15;

export type InventoryReceiptPostingInboxSummary = {
  readonly processed: number;
  readonly failed: ReadonlyArray<{ readonly messageId: string; readonly code: string | null }>;
  readonly processingStale: number;
};

export type InventoryReceiptPostingReconciliationV1 = InventoryReceiptPostingInboxSummary & {
  readonly missingJournalSourceIds: readonly string[];
  readonly balanced: boolean;
};

export type FiscalPeriodDateRange = {
  readonly periodStart: string;
  readonly periodEnd: string;
};

/** ADR-0033 F2: inbox summary plus journal tie-out for Inventory receipt posting. */
export async function reconcileInventoryReceiptPosting(
  client: PoolClient,
  schema: string,
  tenantId: string,
  eventType: string,
  periodRange?: FiscalPeriodDateRange,
): Promise<InventoryReceiptPostingReconciliationV1> {
  const inbox = await summarizeInventoryReceiptPostingInbox(client, schema, tenantId, eventType, periodRange);
  const missingJournalSourceIds = await listInventoryReceiptJournalGaps(client, schema, tenantId, periodRange);
  const balanced =
    inbox.failed.length === 0 && inbox.processingStale === 0 && missingJournalSourceIds.length === 0;
  return { ...inbox, missingJournalSourceIds, balanced };
}

/** Inbox-side counts for Inventory receipt posting. */
export async function summarizeInventoryReceiptPostingInbox(
  client: PoolClient,
  schema: string,
  tenantId: string,
  eventType: string,
  periodRange?: FiscalPeriodDateRange,
): Promise<InventoryReceiptPostingInboxSummary> {
  const periodFilter = periodRange
    ? ` AND posting_date IS NOT NULL AND posting_date >= $4::date AND posting_date <= $5::date`
    : '';
  const periodParams = periodRange ? [periodRange.periodStart, periodRange.periodEnd] : [];

  const processed = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${schema}.inbox_receipts
      WHERE tenant_id = $1 AND consumer_name = $2 AND event_type = $3 AND status = 'PROCESSED'${periodFilter}`,
    [tenantId, CONSUMER, eventType, ...periodParams],
  );

  const failed = await client.query<{ message_id: string; last_error_code: string | null }>(
    `SELECT message_id, last_error_code FROM ${schema}.inbox_receipts
      WHERE tenant_id = $1 AND consumer_name = $2 AND event_type = $3 AND status = 'FAILED'${periodFilter}
      ORDER BY created_at DESC
      LIMIT 200`,
    [tenantId, CONSUMER, eventType, ...periodParams],
  );

  const stale = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${schema}.inbox_receipts
      WHERE tenant_id = $1 AND consumer_name = $2 AND event_type = $3 AND status = 'PROCESSING'
        AND created_at < now() - ($${periodRange ? 6 : 4}::text || ' minutes')::interval${periodFilter}`,
    periodRange
      ? [tenantId, CONSUMER, eventType, periodRange.periodStart, periodRange.periodEnd, String(STALE_PROCESSING_MINUTES)]
      : [tenantId, CONSUMER, eventType, String(STALE_PROCESSING_MINUTES)],
  );

  return {
    processed: Number(processed.rows[0]?.count ?? 0),
    failed: failed.rows.map((row) => ({
      messageId: row.message_id,
      code: row.last_error_code,
    })),
    processingStale: Number(stale.rows[0]?.count ?? 0),
  };
}

export async function loadFiscalPeriodDateRange(
  client: PoolClient,
  schema: string,
  tenantId: string,
  fiscalPeriodId: string,
): Promise<FiscalPeriodDateRange | null> {
  const res = await client.query<{ start_date: string; end_date: string }>(
    `SELECT start_date::text, end_date::text FROM ${schema}.fiscal_periods
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, fiscalPeriodId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return { periodStart: row.start_date, periodEnd: row.end_date };
}
