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

/** ADR-0033 F2: inbox summary plus journal tie-out for Inventory receipt posting. */
export async function reconcileInventoryReceiptPosting(
  client: PoolClient,
  schema: string,
  tenantId: string,
  eventType: string,
): Promise<InventoryReceiptPostingReconciliationV1> {
  const inbox = await summarizeInventoryReceiptPostingInbox(client, schema, tenantId, eventType);
  const missingJournalSourceIds = await listInventoryReceiptJournalGaps(client, schema, tenantId);
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
): Promise<InventoryReceiptPostingInboxSummary> {
  const processed = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${schema}.inbox_receipts
      WHERE tenant_id = $1 AND consumer_name = $2 AND event_type = $3 AND status = 'PROCESSED'`,
    [tenantId, CONSUMER, eventType],
  );

  const failed = await client.query<{ message_id: string; last_error_code: string | null }>(
    `SELECT message_id, last_error_code FROM ${schema}.inbox_receipts
      WHERE tenant_id = $1 AND consumer_name = $2 AND event_type = $3 AND status = 'FAILED'
      ORDER BY created_at DESC
      LIMIT 200`,
    [tenantId, CONSUMER, eventType],
  );

  const stale = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${schema}.inbox_receipts
      WHERE tenant_id = $1 AND consumer_name = $2 AND event_type = $3 AND status = 'PROCESSING'
        AND created_at < now() - ($4::text || ' minutes')::interval`,
    [tenantId, CONSUMER, eventType, String(STALE_PROCESSING_MINUTES)],
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
