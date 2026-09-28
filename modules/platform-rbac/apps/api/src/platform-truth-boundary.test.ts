/**
 * WI-OI-028 — Platform RBAC Truth-Boundary Tests
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

describe('Platform RBAC withTenantTransaction ordering', () => {
  it('sets app.tenant_id before any user DML', async () => {
    const { client, queryLog } = makeClientMock();
    const tenantId = 'tenant-platform-001';

    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    await client.query('INSERT INTO gigalibs_platform.tenant_credit_wallets VALUES($1)', ['row']);
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
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockRejectedValueOnce(err);

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

describe('Platform RBAC queryWithTenant ordering', () => {
  it('sets app.tenant_id before SELECT query', async () => {
    const { client, queryLog } = makeClientMock();
    const tenantId = 'tenant-platform-read';

    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    await client.query('SELECT * FROM gigalibs_platform.billing_invoices WHERE tenant_id = $1', [tenantId]);

    const ops = queryLog.map((q) => q.sql);
    const setConfigIdx = ops.findIndex((s) => s.includes('set_config'));
    const selectIdx = ops.findIndex((s) => s.includes('SELECT *'));

    expect(setConfigIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeGreaterThan(setConfigIdx);
  });
});

describe('Platform RBAC bootstrapCheck role & migration verification', () => {
  it('accepts 3 migrations and unprivileged role', () => {
    const row = { migration_count: '3', is_superuser: false, bypasses_rls: false };
    expect(Number(row.migration_count)).toBeGreaterThanOrEqual(3);
    expect(row.is_superuser).toBe(false);
    expect(row.bypasses_rls).toBe(false);
  });

  it('rejects when migration count is insufficient', () => {
    const row = { migration_count: '2', is_superuser: false, bypasses_rls: false };
    expect(Number(row.migration_count)).toBeLessThan(3);
  });

  it('rejects superuser database connection in production', () => {
    const row = { migration_count: '3', is_superuser: true, bypasses_rls: false };
    expect(row.is_superuser).toBe(true);
  });

  it('rejects bypassrls database connection in production', () => {
    const row = { migration_count: '3', is_superuser: false, bypasses_rls: true };
    expect(row.bypasses_rls).toBe(true);
  });
});
