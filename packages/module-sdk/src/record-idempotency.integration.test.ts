import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ModuleIdempotencyStore } from './record-idempotency.js';

// WI-OI-120f (F0.3): the Idempotency-Key store on PostgreSQL 16, as a restricted role under forced row-level security.
// Opt-in, and only against a local database named record_idempotency_proof (never the UAT instance on port 5440).
const adminUrl = process.env.RECORD_IDEMPOTENCY_TEST_DATABASE_URL;
if (adminUrl) {
  const parsed = new URL(adminUrl);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.port === '5440' || parsed.pathname !== '/record_idempotency_proof') {
    throw new Error('Refusing the idempotency proof: only a local record_idempotency_proof database (not port 5440) is allowed.');
  }
}

describe.skipIf(!adminUrl)('record idempotency store on PostgreSQL (isolated)', () => {
  const role = 'record_idempotency_runtime';
  const password = randomUUID().replaceAll('-', '');
  let admin: pg.Client;
  let pool: pg.Pool;
  let store: ModuleIdempotencyStore;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query('DROP SCHEMA IF EXISTS proof_records CASCADE');
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`);
    await admin.query(`
      CREATE SCHEMA proof_records;
      CREATE TABLE proof_records.record_idempotency (
        tenant_id text NOT NULL,
        idempotency_key uuid NOT NULL,
        operation text NOT NULL,
        request_hash char(64) NOT NULL,
        state text NOT NULL CHECK (state IN ('IN_PROGRESS', 'COMPLETED')),
        response jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz,
        PRIMARY KEY (tenant_id, idempotency_key)
      );
      ALTER TABLE proof_records.record_idempotency ENABLE ROW LEVEL SECURITY;
      ALTER TABLE proof_records.record_idempotency FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON proof_records.record_idempotency FOR ALL
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
      GRANT USAGE ON SCHEMA proof_records TO ${role};
      GRANT SELECT, INSERT, UPDATE, DELETE ON proof_records.record_idempotency TO ${role};
    `);
    const url = new URL(adminUrl!);
    url.username = role;
    url.password = password;
    pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
    // The same tenant binding as ModuleDatabase.withTenantTransaction.
    const database = {
      async withTenantTransaction<T>(tenantId: string, operation: (client: pg.PoolClient) => Promise<T>): Promise<T> {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`SELECT set_config('search_path', 'proof_records, public', true), set_config('app.tenant_id', $1, true)`, [tenantId]);
          const result = await operation(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
    };
    store = new ModuleIdempotencyStore(database as never);
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query('DROP SCHEMA IF EXISTS proof_records CASCADE');
    await admin?.query(`DROP ROLE IF EXISTS ${role}`);
    await admin?.end();
  });

  it('claims a new key, then replays the stored answer to a repeat', async () => {
    const key = randomUUID();
    expect(await store.claim('tenant-a', key, 'create:inventory.warehouses', 'a'.repeat(64))).toBeNull();
    expect(await store.claim('tenant-a', key, 'create:inventory.warehouses', 'a'.repeat(64))).toEqual({
      requestHash: 'a'.repeat(64),
      state: 'IN_PROGRESS',
      response: null,
    });
    await store.complete('tenant-a', key, { id: 'w-1', version: 1 });
    expect(await store.claim('tenant-a', key, 'create:inventory.warehouses', 'a'.repeat(64))).toEqual({
      requestHash: 'a'.repeat(64),
      state: 'COMPLETED',
      response: { id: 'w-1', version: 1 },
    });
  });

  it('releases a failed claim so a retry can own the key', async () => {
    const key = randomUUID();
    expect(await store.claim('tenant-a', key, 'create:x', 'b'.repeat(64))).toBeNull();
    await store.release('tenant-a', key);
    expect(await store.claim('tenant-a', key, 'create:x', 'b'.repeat(64))).toBeNull();
  });

  it('lets a retry take over a claim abandoned for more than ten minutes, but not a completed one', async () => {
    const abandoned = randomUUID();
    const completed = randomUUID();
    await store.claim('tenant-a', abandoned, 'create:x', 'c'.repeat(64));
    await store.claim('tenant-a', completed, 'create:x', 'c'.repeat(64));
    await store.complete('tenant-a', completed, { id: 'done' });
    await admin.query(`UPDATE proof_records.record_idempotency SET created_at = now() - interval '11 minutes' WHERE idempotency_key = ANY($1::uuid[])`, [[abandoned, completed]]);
    expect(await store.claim('tenant-a', abandoned, 'create:x', 'c'.repeat(64))).toBeNull();
    expect(await store.claim('tenant-a', completed, 'create:x', 'c'.repeat(64))).toMatchObject({ state: 'COMPLETED' });
  });

  it("keeps tenants apart: the same key in another tenant is a new claim, and it cannot see the first tenant's answer", async () => {
    const key = randomUUID();
    await store.claim('tenant-a', key, 'create:x', 'd'.repeat(64));
    await store.complete('tenant-a', key, { secret: 'tenant-a only' });
    expect(await store.claim('tenant-b', key, 'create:x', 'd'.repeat(64))).toBeNull();
    const seen = await pool.query('SELECT count(*)::int AS n FROM proof_records.record_idempotency');
    expect(seen.rows[0].n).toBe(0); // no tenant bound: forced RLS shows nothing
  });
});
