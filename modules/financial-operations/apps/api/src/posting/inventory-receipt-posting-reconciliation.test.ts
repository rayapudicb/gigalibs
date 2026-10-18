import { inventoryReceiptCompletedPostingPolicyV1 } from '@gigalibs/posting-rules';
import { describe, expect, it, vi } from 'vitest';
import { reconcileInventoryReceiptPosting } from './inventory-receipt-posting-reconciliation.js';

describe('reconcileInventoryReceiptPosting', () => {
  it('aggregates inbox state and journal gaps', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('subledger_posting_register') && sql.includes('journal_id IS NULL')) {
          return { rows: [{ source_document_id: 'rcpt:line-1' }] };
        }
        if (sql.includes("status = 'PROCESSED'")) return { rows: [{ count: '2' }] };
        if (sql.includes("status = 'FAILED'")) return { rows: [] };
        if (sql.includes("status = 'PROCESSING'")) return { rows: [{ count: '0' }] };
        return { rows: [] };
      }),
    };

    await expect(
      reconcileInventoryReceiptPosting(
        client as never,
        'gigalibs_finance',
        'tenant-a',
        inventoryReceiptCompletedPostingPolicyV1.eventType,
      ),
    ).resolves.toEqual({
      processed: 2,
      failed: [],
      processingStale: 0,
      missingJournalSourceIds: ['rcpt:line-1'],
      balanced: false,
    });
  });
});
