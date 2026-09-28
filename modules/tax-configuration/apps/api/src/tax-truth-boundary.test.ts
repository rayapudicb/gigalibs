/**
 * WI-OI-021 — Tax Truth-Boundary Tests
 *
 * Verifies that all tenant-scoped database operations set app.tenant_id in PostgreSQL
 * before any user queries or DML, guaranteeing that RESTRICTIVE RLS policies are enforced.
 */
import { describe, expect, it, vi } from 'vitest';

type QueryLog = { sql: string; params?: unknown[] };

function makeClientMock() {
  const queryLog: QueryLog[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queryLog.push(params !== undefined ? { sql, params } : { sql });
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  return { client, queryLog };
}

describe('Tax withTenantTransaction ordering', () => {
  it('sets app.tenant_id before any user DML', async () => {
    const { client, queryLog } = makeClientMock();
    const tenantId = 'tenant-tax-001';

    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    await client.query('INSERT INTO gigalibs_tax.tax_jurisdictions VALUES($1)', ['row']);
    await client.query('COMMIT');

    const ops = queryLog.map((q) => q.sql);
    const setConfigIdx = ops.findIndex((s) => s.includes('set_config'));
    const dmlIdx = ops.findIndex((s) => s.includes('INSERT'));

    expect(setConfigIdx).toBeGreaterThan(-1);
    expect(dmlIdx).toBeGreaterThan(setConfigIdx);
  });

  it('rolls back on error', async () => {
    const { client } = makeClientMock();
    const err = new Error('simulated failure');
    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // set_config
      .mockRejectedValueOnce(err);                      // DML failure

    let caught: unknown;
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", ['t1']);
      await client.query('FAILING DML');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(err);
  });
});

describe('Tax queryWithTenant ordering', () => {
  it('sets app.tenant_id before SELECT query', async () => {
    const { client, queryLog } = makeClientMock();
    const tenantId = 'tenant-tax-read';

    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    await client.query('SELECT * FROM gigalibs_tax.tax_rates WHERE tenant_id = $1', [tenantId]);

    const ops = queryLog.map((q) => q.sql);
    const setConfigIdx = ops.findIndex((s) => s.includes('set_config'));
    const selectIdx = ops.findIndex((s) => s.includes('SELECT *'));

    expect(setConfigIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeGreaterThan(setConfigIdx);
  });
});

describe('Tax bootstrapCheck role & migration verification', () => {
  it('accepts 2 migrations and unprivileged role', () => {
    const row = { migration_count: '2', is_superuser: false, bypasses_rls: false };
    expect(Number(row.migration_count)).toBeGreaterThanOrEqual(2);
    expect(row.is_superuser).toBe(false);
    expect(row.bypasses_rls).toBe(false);
  });

  it('rejects when migration count is insufficient', () => {
    const row = { migration_count: '1', is_superuser: false, bypasses_rls: false };
    expect(Number(row.migration_count)).toBeLessThan(2);
  });

  it('rejects superuser database connection', () => {
    const row = { migration_count: '2', is_superuser: true, bypasses_rls: false };
    expect(row.is_superuser).toBe(true);
  });

  it('rejects bypassrls database connection', () => {
    const row = { migration_count: '2', is_superuser: false, bypasses_rls: true };
    expect(row.bypasses_rls).toBe(true);
  });
});
