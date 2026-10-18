import { describe, expect, it, vi } from 'vitest';
import { resolveInventoryReceiptPostingStatus } from './inventory-receipt-posting-status.js';

describe('resolveInventoryReceiptPostingStatus', () => {
  it('returns NOT_APPLICABLE for draft receipts', async () => {
    const client = { query: vi.fn() };
    await expect(
      resolveInventoryReceiptPostingStatus(client as never, 'gigalibs_finance', 't1', 'r1', 'DRAFT'),
    ).resolves.toEqual({ status: 'NOT_APPLICABLE', rejectionCode: null });
    expect(client.query).not.toHaveBeenCalled();
  });

  it('returns POSTING_REJECTED when the inbox failed', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('inbox_receipts')) return { rows: [{ status: 'FAILED', last_error_code: 'FINANCE_PERIOD_CLOSED' }] };
        return { rows: [] };
      }),
    };
    await expect(
      resolveInventoryReceiptPostingStatus(client as never, 'gigalibs_finance', 't1', 'r1', 'COMPLETED'),
    ).resolves.toEqual({ status: 'POSTING_REJECTED', rejectionCode: 'FINANCE_PERIOD_CLOSED' });
  });

  it('returns POSTED when every register line has a journal', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('inbox_receipts')) return { rows: [{ status: 'PROCESSED', last_error_code: null }] };
        if (sql.includes('subledger_posting_register')) {
          return { rows: [{ journal_id: 'j1' }, { journal_id: 'j2' }] };
        }
        return { rows: [] };
      }),
    };
    await expect(
      resolveInventoryReceiptPostingStatus(client as never, 'gigalibs_finance', 't1', 'r1', 'COMPLETED'),
    ).resolves.toEqual({ status: 'POSTED', rejectionCode: null });
  });
});
