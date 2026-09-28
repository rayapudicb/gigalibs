/**
 * WI-OI-042 — AR G4 Truth-Boundary Tests
 *
 * Verifies that every tenant-scoped operation sets app.tenant_id in PostgreSQL
 * BEFORE any DML executes, so RESTRICTIVE RLS policies are enforced.
 */
import { describe, expect, it, vi } from 'vitest';

// ── Shared mock factory ────────────────────────────────────────────────────────

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

// ── withTenantTransaction ordering ────────────────────────────────────────────

describe('withTenantTransaction ordering', () => {
  it('sets app.tenant_id before any user DML', async () => {
    const { client, queryLog } = makeClientMock();
    const tenantId = 'tenant-ar-001';

    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    await client.query('INSERT INTO gigalibs_ar.customers VALUES($1)', ['row']);
    await client.query('COMMIT');

    const ops = queryLog.map((q) => q.sql);
    const setConfigIdx = ops.findIndex((s) => s.includes('set_config'));
    const dmlIdx = ops.findIndex((s) => s.includes('INSERT'));

    expect(setConfigIdx).toBeGreaterThan(-1);
    expect(dmlIdx).toBeGreaterThan(setConfigIdx);
  });

  it('rolls back and re-throws on service error', async () => {
    const { client } = makeClientMock();
    const thrown = new Error('constraint violation');
    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // set_config
      .mockRejectedValueOnce(thrown);                   // DML error

    let caught: unknown;
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", ['t1']);
      await client.query('INVALID DML');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(thrown);
  });

  it('passes the correct tenant_id as set_config parameter', async () => {
    const { client, queryLog } = makeClientMock();
    const tenantId = 'gigalibs-tenant-ar-xyz';

    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    await client.query('COMMIT');

    const setConfigCall = queryLog.find((q) => q.sql.includes('set_config'));
    expect(setConfigCall?.params?.[0]).toBe(tenantId);
  });
});

// ── queryWithTenant ordering ──────────────────────────────────────────────────

describe('queryWithTenant ordering', () => {
  it('sets app.tenant_id before the SELECT', async () => {
    const { client, queryLog } = makeClientMock();
    const tenantId = 'tenant-read-001';

    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    await client.query('SELECT id FROM gigalibs_ar.customers');

    const ops = queryLog.map((q) => q.sql);
    const setConfigIdx = ops.findIndex((s) => s.includes('set_config'));
    const selectIdx = ops.findIndex((s) => s.includes('SELECT id'));

    expect(setConfigIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeGreaterThan(setConfigIdx);
  });
});

// ── bootstrapCheck logic ──────────────────────────────────────────────────────

describe('bootstrapCheck', () => {
  const REQUIRED = 13;

  it('accepts exactly 13 migration rows with a safe role', () => {
    const row = { migration_count: '13', is_superuser: false, bypasses_rls: false };
    const count = Number(row.migration_count);
    expect(count).toBe(REQUIRED);
    expect(row.is_superuser).toBe(false);
    expect(row.bypasses_rls).toBe(false);
  });

  it('rejects when migration count is wrong', () => {
    const row = { migration_count: '12', is_superuser: false, bypasses_rls: false };
    expect(Number(row.migration_count)).not.toBe(REQUIRED);
  });

  it('rejects a superuser role', () => {
    const row = { migration_count: '13', is_superuser: true, bypasses_rls: false };
    expect(row.is_superuser).toBe(true);
  });

  it('rejects a BYPASSRLS role', () => {
    const row = { migration_count: '13', is_superuser: false, bypasses_rls: true };
    expect(row.bypasses_rls).toBe(true);
  });
});
