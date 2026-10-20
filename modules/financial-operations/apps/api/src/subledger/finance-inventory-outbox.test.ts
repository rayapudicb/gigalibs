import { describe, expect, it, vi } from 'vitest';
import {
  appendFiscalPeriodSnapshotCompleted,
  ensureInventoryFiscalPeriodSnapshotPublished,
} from './finance-inventory-outbox.js';

describe('ensureInventoryFiscalPeriodSnapshotPublished', () => {
  it('appends period events and snapshot-completed before marking publish', async () => {
    const outboxTypes: string[] = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('inventory_fiscal_replica_publish') && sql.includes('SELECT')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('FROM gigalibs_finance.fiscal_periods')) {
          return {
            rows: [
              {
                id: 'period-1',
                accounting_book_id: 'book-1',
                period_name: '2026-10',
                start_date: '2026-10-01',
                end_date: '2026-10-31',
                status: 'LOCKED',
                is_primary: true,
                version: 3,
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes('INSERT INTO gigalibs_finance.outbox_events')) {
          outboxTypes.push(String(params?.[3] ?? ''));
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 };
        if (sql.includes('aggregate_version')) return { rows: [{ version: 1 }], rowCount: 1 };
        if (sql.includes('INSERT INTO gigalibs_finance.inventory_fiscal_replica_publish')) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    await ensureInventoryFiscalPeriodSnapshotPublished(client as never, 'tenant-a');
    expect(outboxTypes).toContain('finance.fiscal-period.state-changed.v1');
    expect(outboxTypes).toContain('finance.fiscal-period.snapshot-completed.v1');
  });
});

describe('appendFiscalPeriodSnapshotCompleted', () => {
  it('writes snapshot-completed with primary book and period count', async () => {
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 };
        if (sql.includes('aggregate_version')) return { rows: [{ version: 1 }], rowCount: 1 };
        if (sql.includes('outbox_events') && sql.trimStart().startsWith('INSERT')) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    await appendFiscalPeriodSnapshotCompleted(client as never, 'tenant-a', 'book-1', 12);
    const insertCall = client.query.mock.calls.find(
      (call) => String(call[0]).includes('outbox_events') && String(call[0]).trimStart().startsWith('INSERT'),
    );
    expect(insertCall?.[1]?.[3]).toBe('finance.fiscal-period.snapshot-completed.v1');
    expect(String(insertCall?.[1]?.at(-1))).toContain('primaryBookId');
    expect(String(insertCall?.[1]?.at(-1))).toContain('"periodCount":12');
  });
});
