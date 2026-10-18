import { inventoryReceiptCompletedPostingPolicyV1 } from '@gigalibs/posting-rules';
import type { PoolClient } from 'pg';

const INVENTORY_CONSUMER = 'finance.inventory-subledger';

export type SubledgerPostingRegisterInput = {
  readonly tenantId: string;
  readonly messageId: string;
  readonly sourceDocumentId: string;
  readonly journalEntryType: string;
};

/** Records the expected journal source key and links the posted journal when present (same tenant). */
export async function recordInventoryReceiptLinePosting(
  client: PoolClient,
  schema: string,
  input: SubledgerPostingRegisterInput,
): Promise<void> {
  const policy = inventoryReceiptCompletedPostingPolicyV1;
  const journal = await client.query<{ id: string }>(
    `SELECT id FROM ${schema}.gl_journals
      WHERE tenant_id = $1
        AND source_document_type = $2
        AND source_document_id = $3
        AND entry_type = $4
      LIMIT 1`,
    [input.tenantId, policy.sourceDocumentType, input.sourceDocumentId, input.journalEntryType],
  );

  await client.query(
    `INSERT INTO ${schema}.subledger_posting_register (
       tenant_id, consumer_name, message_id, event_type,
       source_document_type, source_document_id, journal_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tenant_id, consumer_name, source_document_type, source_document_id)
     DO UPDATE SET journal_id = COALESCE(EXCLUDED.journal_id, ${schema}.subledger_posting_register.journal_id),
                   message_id = EXCLUDED.message_id`,
    [
      input.tenantId,
      INVENTORY_CONSUMER,
      input.messageId,
      policy.eventType,
      policy.sourceDocumentType,
      input.sourceDocumentId,
      journal.rows[0]?.id ?? null,
    ],
  );
}

export async function listInventoryReceiptJournalGaps(
  client: PoolClient,
  schema: string,
  tenantId: string,
): Promise<readonly string[]> {
  const rows = await client.query<{ source_document_id: string }>(
    `SELECT source_document_id FROM ${schema}.subledger_posting_register
      WHERE tenant_id = $1 AND consumer_name = $2 AND journal_id IS NULL
      ORDER BY created_at DESC
      LIMIT 500`,
    [tenantId, INVENTORY_CONSUMER],
  );
  return rows.rows.map((row) => row.source_document_id);
}
