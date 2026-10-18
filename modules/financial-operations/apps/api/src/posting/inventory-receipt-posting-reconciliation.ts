import { inventoryReceiptCompletedPostingPolicyV1 } from '@gigalibs/posting-rules';
import type { PoolClient } from 'pg';

const CONSUMER = 'finance.inventory-subledger';
const STALE_PROCESSING_MINUTES = 15;

export type InventoryReceiptPostingInboxSummary = {
  readonly processed: number;
  readonly failed: ReadonlyArray<{ readonly messageId: string; readonly code: string | null }>;
  readonly processingStale: number;
};

/** ADR-0033 F2: inbox-side reconciliation for Inventory receipt posting (journal tie-out is a follow-up). */
export async function summarizeInventoryReceiptPostingInbox(
  client: PoolClient,
  schema: string,
  tenantId: string,
): Promise<InventoryReceiptPostingInboxSummary> {
  const eventType = inventoryReceiptCompletedPostingPolicyV1.eventType;

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
