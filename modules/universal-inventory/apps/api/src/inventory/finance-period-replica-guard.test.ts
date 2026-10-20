import { describe, expect, it, vi } from 'vitest';

const query = vi.fn();

describe('assertInventoryReceiptFinancePeriodOpenFromReplica', () => {
  it('allows completion when Finance replica was never synced (no Finance module)', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('finance_period_replica_meta')) return { rows: [] };
      return { rows: [] };
    });
    const { assertInventoryReceiptFinancePeriodOpenFromReplica } = await import('./finance-period-replica-guard.js');
    await expect(
      assertInventoryReceiptFinancePeriodOpenFromReplica({ query } as never, 'tenant-1', '2026-10-18T12:00:00.000Z'),
    ).resolves.toBeUndefined();
  });

  it('refuses when initial sync completed but no period covers the posting date', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('finance_period_replica_meta')) {
        return { rows: [{ primary_book_id: 'book-1', initial_sync_completed_at: '2026-01-01' }] };
      }
      if (sql.includes('finance_fiscal_period_replica')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const { assertInventoryReceiptFinancePeriodOpenFromReplica } = await import('./finance-period-replica-guard.js');
    await expect(
      assertInventoryReceiptFinancePeriodOpenFromReplica({ query } as never, 'tenant-1', '2026-09-15T10:00:00.000Z'),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error && error.name === 'DocumentGuardRefusedError' && error.message.includes('No fiscal period'),
    );
  });

  it('refuses when the replicated fiscal period is locked', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('finance_period_replica_meta')) {
        return { rows: [{ primary_book_id: 'book-1', initial_sync_completed_at: '2026-01-01' }] };
      }
      if (sql.includes('finance_fiscal_period_replica')) {
        return { rows: [{ status: 'LOCKED' }] };
      }
      return { rows: [] };
    });
    const { assertInventoryReceiptFinancePeriodOpenFromReplica } = await import('./finance-period-replica-guard.js');
    await expect(
      assertInventoryReceiptFinancePeriodOpenFromReplica({ query } as never, 'tenant-1', '2026-09-15T10:00:00.000Z'),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error && error.name === 'DocumentGuardRefusedError' && error.message.includes('locked'),
    );
  });
});
