import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModulePrincipal, OrganizationClaim } from '@gigalibs/module-sdk';
import pg from 'pg';
import { SCHEMA_CONTRACT_VERSION } from '../config.js';
import { DatabaseService } from '../database.service.js';

// WI-OI-120bw/120bx: SPEED's PostgreSQL proofs. Opt-in, and only against a local database named speed_proof (never the
// UAT instance on port 5440): start a throwaway PostgreSQL and set SPEED_TEST_DATABASE_URL to its admin URL. Each test
// file gets its own database and runtime role, created and dropped here, so files may run in parallel.

export const adminUrl = process.env.SPEED_TEST_DATABASE_URL;
if (adminUrl) {
  const parsed = new URL(adminUrl);
  if (
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    parsed.port === '5440' ||
    parsed.pathname !== '/speed_proof'
  ) {
    throw new Error(
      'Refusing the SPEED proof: only a local speed_proof database (not port 5440) is allowed.',
    );
  }
}

const MIGRATIONS = join(import.meta.dirname, '../../../../db/migrations');
const RUNTIME_MANIFEST = join(import.meta.dirname, '../../../../db/runtime-manifest.txt');
/** As in module.yaml `spec.runtime`. */
const APPEND_ONLY = ['audit_events', 'results'];
const READ_ONLY = ['auth_revocation_events'];

export const TREE = 'tree-version-1';

export interface SpeedDatabase {
  readonly admin: pg.Client;
  readonly database: DatabaseService;
  readonly runtimeUrl: string;
  /** Runs `statements` as the runtime role inside a tenant-bound transaction that is rolled back. */
  asRuntime(tenantId: string, statements: (client: pg.Client) => Promise<void>): Promise<void>;
  close(): Promise<void>;
}

/** A fresh database at the module's schema contract, with the runtime role as run-module-migrations.mjs creates it. */
export async function speedDatabase(name: string): Promise<SpeedDatabase> {
  if (!adminUrl) throw new Error('SPEED_TEST_DATABASE_URL is not set.');
  const suffix = `${name}_${randomUUID().slice(0, 8)}`.replace(/[^a-z0-9_]/g, '_');
  const databaseName = `speed_proof_${suffix}`;
  const role = `speed_runtime_${suffix}`;
  const password = randomUUID().replaceAll('-', '');
  const root = new pg.Client({ connectionString: adminUrl });
  await root.connect();
  await root.query(`CREATE DATABASE ${databaseName}`);
  await root.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`);
  await root.end();

  const adminTarget = new URL(adminUrl);
  adminTarget.pathname = `/${databaseName}`;
  const admin = new pg.Client({ connectionString: adminTarget.toString() });
  await admin.connect();
  const files = readFileSync(RUNTIME_MANIFEST, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  for (const file of files) await admin.query(readFileSync(join(MIGRATIONS, file), 'utf8'));
  await admin.query(`GRANT CONNECT ON DATABASE ${databaseName} TO ${role}`);
  await admin.query(`GRANT USAGE ON SCHEMA gigalibs_speed TO ${role}`);
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA gigalibs_speed TO ${role}`,
  );
  await admin.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA gigalibs_speed TO ${role}`);
  await admin.query(
    `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON gigalibs_speed.schema_migrations FROM ${role}`,
  );
  for (const table of READ_ONLY)
    await admin.query(
      `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON gigalibs_speed.${table} FROM ${role}`,
    );
  for (const table of APPEND_ONLY)
    await admin.query(`REVOKE UPDATE, DELETE, TRUNCATE ON gigalibs_speed.${table} FROM ${role}`);

  const runtime = new URL(adminTarget.toString());
  runtime.username = role;
  runtime.password = password;
  const runtimeUrl = runtime.toString();
  const database = new DatabaseService({
    databaseUrl: runtimeUrl,
    databasePoolSize: 4,
    expectedMigrationVersion: SCHEMA_CONTRACT_VERSION,
  } as never);
  // Readiness as the module host runs it: the schema exactly at the contract version, the role neither superuser nor
  // BYPASSRLS.
  await database.onModuleInit();

  return {
    admin,
    database,
    runtimeUrl,
    async asRuntime(tenantId, statements) {
      const client = new pg.Client({ connectionString: runtimeUrl });
      await client.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
        await statements(client);
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        await client.end();
      }
    },
    async close() {
      await database.onModuleDestroy();
      await admin.end();
      const cleanup = new pg.Client({ connectionString: adminUrl });
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      await cleanup.query(`DROP ROLE IF EXISTS ${role}`);
      await cleanup.end();
    },
  };
}

/** A tenant's organization in force: a group of sites holding North and South, which hold records; the group does not. */
export async function seedOrganization(admin: pg.Client, tenantId: string): Promise<void> {
  await admin.query(
    `INSERT INTO gigalibs_speed.org_replica_versions (tenant_id, version_id, tree_id, tree_kind, version_number, checksum, status, unit_count, ready_at)
     VALUES ($1, $2, 'tree-1', 'PRIMARY', 1, $3, 'READY', 3, now())`,
    [tenantId, TREE, `sha256:${'0'.repeat(64)}`],
  );
  for (const [unit, parent, holds, order] of [
    ['sites', null, false, 0],
    ['north', 'sites', true, 1],
    ['south', 'sites', true, 2],
  ] as const) {
    await admin.query(
      `INSERT INTO gigalibs_speed.org_replica_units (tenant_id, version_id, unit_id, parent_unit_id, code, name, sort_order, status, holds_records, type_code)
       VALUES ($1, $2, $3, $4, $3, $3, $5, 'ACTIVE', $6, $7)`,
      [tenantId, TREE, unit, parent, order, holds, holds ? 'SITE' : 'REGION'],
    );
  }
  for (const [ancestor, descendant, depth] of [
    ['sites', 'sites', 0],
    ['north', 'north', 0],
    ['south', 'south', 0],
    ['sites', 'north', 1],
    ['sites', 'south', 1],
  ] as const) {
    await admin.query(
      `INSERT INTO gigalibs_speed.org_replica_closure (tenant_id, version_id, ancestor_unit_id, descendant_unit_id, depth) VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, TREE, ancestor, descendant, depth],
    );
  }
}

export function principal(
  tenantId: string,
  subject: string,
  permissions: readonly string[],
  organization?: OrganizationClaim,
): ModulePrincipal {
  return {
    tenantId,
    subject,
    sessionId: `session-${subject}`,
    authVersion: 1,
    permissions,
    roles: [],
    persona: 'TENANT_ADMIN' as ModulePrincipal['persona'],
    ...(organization ? { organization } : {}),
    departmentScope: { mode: 'ALL' },
    placeScope: { mode: 'ALL' },
  } as ModulePrincipal;
}

export const units = (roots: string[]): OrganizationClaim => ({
  mode: 'UNITS',
  tree_version: TREE,
  read_roots: roots,
  write_roots: roots,
});
