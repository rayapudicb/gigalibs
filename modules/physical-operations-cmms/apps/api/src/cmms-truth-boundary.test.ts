/**
 * WI-OI-038 — CMMS tenant transaction boundary: the tenant binding and every statement share one transaction,
 * failures roll back, and an invalid tenant id never reaches PostgreSQL. Live RLS is certified separately.
 */
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from './database/database.service.js';

function serviceWith(client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }) {
  const service = new DatabaseService({ expectedMigrationVersion: 10 } as never);
  (service as unknown as { pool: unknown }).pool = { connect: vi.fn(async () => client) };
  return service;
}

describe('CMMS DatabaseService tenant transactions', () => {
  it('binds app.tenant_id locally and runs the operation in the same transaction', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const release = vi.fn();
    const service = serviceWith({ query, release });
    const result = await service.withTenantTransaction('cmtenant0001', async (client) => {
      await client.query('SELECT 1 FROM gigalibs_cmms.assets');
      return 'done';
    });
    expect(result).toBe('done');
    expect(query.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      'BEGIN',
      'SET LOCAL search_path TO gigalibs_cmms, public',
      'SELECT set_config($1, $2, true)',
      'SELECT 1 FROM gigalibs_cmms.assets',
      'COMMIT',
    ]);
    expect((query.mock.calls[2] as unknown[])[1]).toEqual(['app.tenant_id', 'cmtenant0001']);
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases the connection when a statement fails', async () => {
    const failure = new Error('rejected');
    const query = vi.fn(async (sql: string) => {
      if (sql === 'FAILING') throw failure;
      return { rows: [], rowCount: 0 };
    });
    const release = vi.fn();
    const service = serviceWith({ query, release });
    await expect(service.withTenantTransaction('cmtenant0001', (client) => client.query('FAILING'))).rejects.toBe(failure);
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(release).toHaveBeenCalledOnce();
  });

  it('refuses an invalid tenant id before connecting', async () => {
    const query = vi.fn();
    const service = serviceWith({ query, release: vi.fn() });
    await expect(service.withTenantTransaction("a'; DROP TABLE x; --", async () => 1)).rejects.toThrow(/invalid/);
    expect(query).not.toHaveBeenCalled();
  });
});
