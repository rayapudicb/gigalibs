import { describe, expect, it, vi } from 'vitest';
import { summarizeInventoryReceiptPostingInbox } from './inventory-receipt-posting-reconciliation.js';

describe('summarizeInventoryReceiptPostingInbox', () => {
  it('aggregates processed, failed and stale processing receipts', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("status = 'PROCESSED'")) return { rows: [{ count: '3' }] };
        if (sql.includes("status = 'FAILED'")) {
          return {
            rows: [
              { message_id: 'msg-1', last_error_code: 'FINANCE_PERIOD_LOCKED' },
              { message_id: 'msg-2', last_error_code: null },
            ],
          };
        }
        if (sql.includes("status = 'PROCESSING'")) return { rows: [{ count: '1' }] };
        return { rows: [] };
      }),
    };

    await expect(
      summarizeInventoryReceiptPostingInbox(client as never, 'gigalibs_finance', 'tenant-a'),
    ).resolves.toEqual({
      processed: 3,
      failed: [
        { messageId: 'msg-1', code: 'FINANCE_PERIOD_LOCKED' },
        { messageId: 'msg-2', code: null },
      ],
      processingStale: 1,
    });
  });
});
