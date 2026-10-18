import { inventoryReceiptCompletedPostingPolicyV1 } from '@gigalibs/posting-rules';
import type { PoolClient } from 'pg';

const CONSUMER = 'finance.inventory-subledger';

export type InventoryReceiptPostingStatusV1 = {
  readonly status: 'NOT_APPLICABLE' | 'AWAITING_POSTING' | 'POSTED' | 'POSTING_REJECTED';
  readonly rejectionCode: string | null;
};

/** ADR-0033 D3: Finance-side posting state for one Inventory goods receipt. */
export async function resolveInventoryReceiptPostingStatus(
  client: PoolClient,
  schema: string,
  tenantId: string,
  receiptId: string,
  receiptOperationalStatus: string,
): Promise<InventoryReceiptPostingStatusV1> {
  if (receiptOperationalStatus !== 'COMPLETED') {
    return { status: 'NOT_APPLICABLE', rejectionCode: null };
  }

  const eventType = inventoryReceiptCompletedPostingPolicyV1.eventType;

  const inbox = await client.query<{ status: string; last_error_code: string | null }>(
    `SELECT status, last_error_code FROM ${schema}.inbox_receipts
      WHERE tenant_id = $1 AND consumer_name = $2 AND event_type = $3 AND correlation_id = $4
      ORDER BY created_at DESC
      LIMIT 1`,
    [tenantId, CONSUMER, eventType, receiptId],
  );
  const inboxRow = inbox.rows[0];
  if (inboxRow?.status === 'FAILED') {
    return { status: 'POSTING_REJECTED', rejectionCode: inboxRow.last_error_code };
  }

  const register = await client.query<{ journal_id: string | null }>(
    `SELECT journal_id FROM ${schema}.subledger_posting_register
      WHERE tenant_id = $1 AND consumer_name = $2 AND source_document_id LIKE $3 || ':%'`,
    [tenantId, CONSUMER, receiptId],
  );

  if (register.rows.length === 0) {
    return { status: 'AWAITING_POSTING', rejectionCode: null };
  }

  const missingJournal = register.rows.some((row) => !row.journal_id);
  if (missingJournal) {
    return { status: 'AWAITING_POSTING', rejectionCode: null };
  }

  return { status: 'POSTED', rejectionCode: null };
}
