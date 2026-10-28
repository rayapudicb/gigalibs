import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertOrganizationWrite,
  assertOwningUnit,
  organizationAccess,
  organizationReadCondition,
  OrganizationScopeRefusal,
  OrganizationVersionPendingError,
} from './organization-access.js';
import type { OrganizationReplica, ReplicaUnit } from './organization-replica.js';

// Opt-in proof against a disposable PostgreSQL 16 container; no owner or UAT database is used.
const enabled = process.env.ORGANIZATION_SCOPE_PG_PROOF === '1';

describe.skipIf(!enabled)('organization ownership with tenant RLS on isolated PostgreSQL', () => {
  const container = `gigalibs-org-scope-${randomUUID().slice(0, 8)}`;
  const adminPassword = randomBytes(18).toString('hex');
  const runtimePassword = randomBytes(18).toString('hex');
  let admin: pg.Client;
  let pool: pg.Pool;

  const unit = (id: string, holdsRecords = true): ReplicaUnit => ({
    unit_id: id,
    parent_unit_id: null,
    code: id,
    name: id,
    sort_order: 1,
    status: 'ACTIVE',
    holds_records: holdsRecords,
    type_code: holdsRecords ? 'BRANCH' : 'GROUP',
  });
  let versionReady = true;
  const replica = {
    isReady: async () => versionReady,
    expand: async (_client: unknown, _tenant: string, _version: string, roots: readonly string[]) => roots,
    unit: async (_client: unknown, _tenant: string, _version: string, id: string) =>
      id === 'north' || id === 'south' ? unit(id) : id === 'group' ? unit(id, false) : null,
  } as unknown as OrganizationReplica;

  beforeAll(async () => {
    execFileSync('docker', [
      'run', '-d', '--rm', '--name', container,
      '-e', `POSTGRES_PASSWORD=${adminPassword}`,
      '-e', 'POSTGRES_DB=organization_scope_proof',
      '-p', '127.0.0.1::5432', 'postgres:16-alpine',
    ], { stdio: 'ignore' });
    const port = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' })
      .trim().split(':').pop();
    const adminUrl = `postgres://postgres:${adminPassword}@127.0.0.1:${port}/organization_scope_proof`;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      admin = new pg.Client({ connectionString: adminUrl });
      try {
        await admin.connect();
        break;
      } catch {
        await admin.end().catch(() => undefined);
        if (attempt === 59) throw new Error('Isolated PostgreSQL did not start.');
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    await admin!.query(`
      CREATE ROLE organization_scope_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS;
      CREATE SCHEMA proof;
      CREATE TABLE proof.records (
        tenant_id text NOT NULL, id text NOT NULL, owning_unit_id text,
        label text NOT NULL, PRIMARY KEY (tenant_id, id)
      );
      ALTER TABLE proof.records ENABLE ROW LEVEL SECURITY;
      ALTER TABLE proof.records FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant ON proof.records FOR ALL
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
      GRANT USAGE ON SCHEMA proof TO organization_scope_runtime;
      GRANT SELECT, INSERT, UPDATE ON proof.records TO organization_scope_runtime;
      INSERT INTO proof.records VALUES
        ('tenant-a', 'n', 'north', 'North record'),
        ('tenant-a', 's', 'south', 'South record'),
        ('tenant-a', 'shared', NULL, 'Shared record'),
        ('tenant-b', 'bn', 'north', 'Other tenant record');
    `);
    const runtimeUrl = new URL(adminUrl);
    runtimeUrl.username = 'organization_scope_runtime';
    runtimeUrl.password = runtimePassword;
    pool = new pg.Pool({ connectionString: runtimeUrl.toString() });
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.end();
    execFileSync('docker', ['rm', '-f', '-v', container], { stdio: 'ignore' });
  });

  async function scoped<T>(tenantId: string, run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  it('reads its granted unit and explicit shared rows, excluding siblings and other tenants', async () => {
    await scoped('tenant-a', async (client) => {
      const access = await organizationAccess(replica, client, 'tenant-a', {
        mode: 'UNITS', tree_version: 'v1', read_roots: ['north'], write_roots: ['north'],
      });
      const params: unknown[] = ['tenant-a'];
      const condition = organizationReadCondition(access, 'owning_unit_id', (value) => {
        params.push(value);
        return `$${params.length}`;
      });
      const rows = await client.query<{ id: string }>(
        `SELECT id FROM proof.records WHERE tenant_id = $1 AND ${condition} ORDER BY id`, params,
      );
      expect(rows.rows.map((row) => row.id)).toEqual(['n', 'shared']);
      expect(() => assertOrganizationWrite(access, 'south')).toThrow(OrganizationScopeRefusal);
      expect(() => assertOrganizationWrite(access, null)).toThrow(OrganizationScopeRefusal);
      await expect(assertOwningUnit(replica, client, 'tenant-a', access, 'UNIT', 'group'))
        .rejects.toThrow(OrganizationScopeRefusal);
      await expect(assertOwningUnit(replica, client, 'tenant-a', access, 'UNIT', 'north'))
        .resolves.toBeUndefined();
      await expect(client.query(
        `INSERT INTO proof.records VALUES ('tenant-b', 'forged', 'north', 'forged')`,
      )).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('refuses an organization version the module has not received', async () => {
    versionReady = false;
    try {
      await scoped('tenant-a', async (client) => {
        await expect(organizationAccess(replica, client, 'tenant-a', {
          mode: 'UNITS', tree_version: 'v2', read_roots: ['north'], write_roots: ['north'],
        })).rejects.toBeInstanceOf(OrganizationVersionPendingError);
      });
    } finally {
      versionReady = true;
    }
  });
});
