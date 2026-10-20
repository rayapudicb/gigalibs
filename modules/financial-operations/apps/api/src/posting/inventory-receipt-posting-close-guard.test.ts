import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { assertInventoryReceiptPostingReadyForClose } from './inventory-receipt-posting-close-guard.js';

const PERIOD = 'period-1';

describe('assertInventoryReceiptPostingReadyForClose', () => {
  it('passes when reconciliation is balanced and cutoff is confirmed', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM gigalibs_finance.fiscal_periods')) {
          return { rows: [{ start_date: '2026-10-01', end_date: '2026-10-31' }] };
        }
        if (sql.includes('journal_id IS NULL')) return { rows: [] };
        if (sql.includes("status = 'PROCESSED'")) return { rows: [{ count: '1' }] };
        if (sql.includes("status = 'FAILED'")) return { rows: [] };
        if (sql.includes("status = 'PROCESSING'")) return { rows: [{ count: '0' }] };
        if (sql.includes("status = 'PROCESSED'")) return { rows: [{ count: '1' }] };
        if (sql.includes('inventory_posting_cutoff_confirmations')) {
          return { rows: [{ undelivered_receipt_count: 0 }] };
        }
        return { rows: [] };
      }),
    };
    await expect(
      assertInventoryReceiptPostingReadyForClose(client as never, 'gigalibs_finance', 'tenant-a', PERIOD),
    ).resolves.toBeUndefined();
  });

  it('skips cutoff when no processed inventory postings exist in the period', async () => {
    // regression: GL-only tenants (U12) must lock periods without M3 cutoff confirmation
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM gigalibs_finance.fiscal_periods')) {
          return { rows: [{ start_date: '2026-04-01', end_date: '2026-04-30' }] };
        }
        if (sql.includes('journal_id IS NULL')) return { rows: [] };
        if (sql.includes("status = 'PROCESSED'")) return { rows: [{ count: '0' }] };
        if (sql.includes("status = 'FAILED'")) return { rows: [] };
        if (sql.includes("status = 'PROCESSING'")) return { rows: [{ count: '0' }] };
        if (sql.includes('inventory_posting_cutoff_confirmations')) {
          throw new Error('cutoff should not be queried when processed count is zero');
        }
        return { rows: [] };
      }),
    };
    await expect(
      assertInventoryReceiptPostingReadyForClose(client as never, 'gigalibs_finance', 'tenant-a', PERIOD),
    ).resolves.toBeUndefined();
  });

  it('refuses close when inbox failures exist in the period', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM gigalibs_finance.fiscal_periods')) {
          return { rows: [{ start_date: '2026-10-01', end_date: '2026-10-31' }] };
        }
        if (sql.includes('journal_id IS NULL')) return { rows: [] };
        if (sql.includes("status = 'PROCESSED'")) return { rows: [{ count: '0' }] };
        if (sql.includes("status = 'FAILED'")) return { rows: [{ message_id: 'm1', last_error_code: 'X' }] };
        if (sql.includes("status = 'PROCESSING'")) return { rows: [{ count: '0' }] };
        return { rows: [] };
      }),
    };
    await expect(
      assertInventoryReceiptPostingReadyForClose(client as never, 'gigalibs_finance', 'tenant-a', PERIOD),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
