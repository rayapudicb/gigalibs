import { afterEach, describe, expect, it, vi } from 'vitest';

const connect = vi.fn();
const release = vi.fn();
const query = vi.fn();

vi.mock('pg', () => ({
  default: {
    Pool: vi.fn(() => ({
      connect,
    })),
  },
}));

describe('assertInventoryReceiptFinancePeriodOpen', () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.FINANCE_PERIOD_LOCK_DATABASE_URL;
    delete process.env.FINANCIAL_OPERATIONS_DATABASE_URL;
    connect.mockReset();
    release.mockReset();
    query.mockReset();
  });

  it('skips when no Finance database URL is configured', async () => {
    const { assertInventoryReceiptFinancePeriodOpen } = await import('./finance-period-lock-guard.js');
    await expect(
      assertInventoryReceiptFinancePeriodOpen('tenant-1', '2026-10-18T12:00:00.000Z'),
    ).resolves.toBeUndefined();
  });

  it('refuses when the fiscal period is locked', async () => {
    process.env.FINANCE_PERIOD_LOCK_DATABASE_URL = 'postgresql://local/test';
    connect.mockResolvedValue({ query, release });
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('accounting_books')) return { rows: [{ id: 'book-1' }] };
      if (sql.includes('fiscal_periods')) {
        return { rows: [{ id: 'p1', status: 'LOCKED', period_name: '2026-09' }] };
      }
      return { rows: [] };
    });

    const { assertInventoryReceiptFinancePeriodOpen } = await import('./finance-period-lock-guard.js');
    await expect(
      assertInventoryReceiptFinancePeriodOpen('tenant-1', '2026-09-15T10:00:00.000Z'),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error &&
        error.name === 'DocumentGuardRefusedError' &&
        error.message.includes('locked'),
    );
    expect(release).toHaveBeenCalled();
  });
});
