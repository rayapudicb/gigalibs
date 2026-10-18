import { describe, expect, it, vi } from 'vitest';
import { resolvePrimaryBookPostingContext } from './finance-posting-context.js';

describe('resolvePrimaryBookPostingContext', () => {
  it('returns the primary book and open period', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('accounting_books')) {
          return { rows: [{ id: 'book-1' }] };
        }
        if (sql.includes('fiscal_periods')) {
          return { rows: [{ id: 'period-1', status: 'OPEN', period_name: '2026-10' }] };
        }
        return { rows: [] };
      }),
    };
    await expect(
      resolvePrimaryBookPostingContext(client as never, 'gigalibs_finance', 'tenant-1', '2026-10-18'),
    ).resolves.toEqual({ bookId: 'book-1', periodId: 'period-1', postingDate: '2026-10-18' });
  });

  it('refuses a locked period', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('accounting_books')) return { rows: [{ id: 'book-1' }] };
        if (sql.includes('fiscal_periods')) {
          return { rows: [{ id: 'period-1', status: 'LOCKED', period_name: '2026-09' }] };
        }
        return { rows: [] };
      }),
    };
    await expect(
      resolvePrimaryBookPostingContext(client as never, 'gigalibs_finance', 'tenant-1', '2026-09-15'),
    ).resolves.toBe('FINANCE_PERIOD_LOCKED');
  });
});
