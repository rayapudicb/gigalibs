import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

const adminDatabaseUrl = required('DATABASE_URL');
const runtimeDatabaseUrl = required('MODULE_RUNTIME_DATABASE_URL');
const migrationDirectory = required('MODULE_MIGRATIONS_DIRECTORY');
const schema = identifier(required('MODULE_SCHEMA'), 'MODULE_SCHEMA');
const expectedVersion = positiveInteger(required('MODULE_EXPECTED_MIGRATION_VERSION'));
const appendOnlyTables = identifierList(process.env.MODULE_APPEND_ONLY_TABLES ?? '');
const readOnlyTables = identifierList(process.env.MODULE_READ_ONLY_TABLES ?? '');

const runtimeUrl = new URL(runtimeDatabaseUrl);
const runtimeRole = identifier(decodeURIComponent(runtimeUrl.username), 'runtime database role');
const runtimePassword = decodeURIComponent(runtimeUrl.password);
if (!runtimePassword) throw new Error('MODULE_RUNTIME_DATABASE_URL must include a password.');

const adminUrl = new URL(adminDatabaseUrl);
const adminDatabase = decodeURIComponent(adminUrl.pathname.slice(1));
const runtimeDatabase = decodeURIComponent(runtimeUrl.pathname.slice(1));
if (!adminDatabase || adminDatabase !== runtimeDatabase) {
  throw new Error('Migration and runtime URLs must target the same database.');
}

const migrationFiles = (await readdir(migrationDirectory))
  .filter((name) => /^\d{6}_.+\.up\.sql$/.test(name))
  .sort();
if (migrationFiles.length === 0) throw new Error('No ordered module migrations were found.');

const versions = migrationFiles.map((name) => Number(name.slice(0, 6)));
if (versions.at(-1) !== expectedVersion) {
  throw new Error(
    `Migration directory ends at ${versions.at(-1) ?? 0}; expected ${expectedVersion}.`,
  );
}

const admin = new Client({ connectionString: adminDatabaseUrl });
await admin.connect();
// Module runs share database-wide catalog rows (GRANT ... ON DATABASE, CREATE EXTENSION, roles), so
// concurrent runs for different schemas raise "tuple concurrently updated". The global lock serialises
// runs and is always taken before the per-schema lock to keep a single acquisition order.
const GLOBAL_LOCK = 'gigalibs:module-migrations';
let globalLockHeld = false;
let lockHeld = false;
try {
  await admin.query('SELECT pg_advisory_lock(hashtext($1))', [GLOBAL_LOCK]);
  globalLockHeld = true;
  await admin.query('SELECT pg_advisory_lock(hashtext($1))', [`gigalibs:${schema}:migrations`]);
  lockHeld = true;
  const currentVersion = await readCurrentVersion(admin, schema);
  if (currentVersion > expectedVersion) {
    throw new Error(
      `${schema} is at migration ${currentVersion}, newer than this image contract ${expectedVersion}.`,
    );
  }

  for (const [index, filename] of migrationFiles.entries()) {
    const version = versions[index];
    if (version <= currentVersion) continue;
    const sql = await readFile(path.join(migrationDirectory, filename), 'utf8');
    await admin.query(sql);
    process.stdout.write(`Applied ${schema}/${filename}\n`);
  }

  const migratedVersion = await readCurrentVersion(admin, schema);
  if (migratedVersion !== expectedVersion) {
    throw new Error(
      `${schema} migration ledger is ${migratedVersion}; expected exactly ${expectedVersion}.`,
    );
  }

  await provisionRuntimeRole(admin, {
    database: adminDatabase,
    schema,
    role: runtimeRole,
    password: runtimePassword,
    appendOnlyTables,
    readOnlyTables,
  });
  process.stdout.write(
    `Module schema ${schema} is ready at migration ${migratedVersion}; runtime role configured.\n`,
  );
} finally {
  if (lockHeld) {
    await admin.query('SELECT pg_advisory_unlock(hashtext($1))', [
      `gigalibs:${schema}:migrations`,
    ]).catch(() => undefined);
  }
  if (globalLockHeld) {
    await admin.query('SELECT pg_advisory_unlock(hashtext($1))', [GLOBAL_LOCK]).catch(() => undefined);
  }
  await admin.end();
}

const runtime = new Client({ connectionString: runtimeDatabaseUrl });
await runtime.connect();
try {
  const result = await runtime.query(
    `SELECT current_user AS role, r.rolsuper, r.rolbypassrls
     FROM pg_roles r
     WHERE r.rolname = current_user`,
  );
  const state = result.rows[0];
  if (state?.role !== runtimeRole || state?.rolsuper || state?.rolbypassrls) {
    throw new Error('Runtime role verification failed.');
  }
} finally {
  await runtime.end();
}

async function readCurrentVersion(client, schemaName) {
  const relation = `${quoted(schemaName)}.schema_migrations`;
  const presence = await client.query('SELECT to_regclass($1) AS relation', [
    `${schemaName}.schema_migrations`,
  ]);
  if (!presence.rows[0]?.relation) return 0;
  const result = await client.query(
    `SELECT COALESCE(MAX(version), 0)::int AS version FROM ${relation}`,
  );
  return Number(result.rows[0]?.version ?? 0);
}

async function provisionRuntimeRole(
  client,
  { database, schema: schemaName, role, password, appendOnlyTables: appendOnly, readOnlyTables: readOnly },
) {
  const roleSql = await formattedSql(
    client,
    "SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION', $1::text, $2::text) AS sql",
    [role, password],
  );
  const alterSql = await formattedSql(
    client,
    "SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION', $1::text, $2::text) AS sql",
    [role, password],
  );
  const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
  await client.query(exists.rowCount === 0 ? roleSql : alterSql);

  const roleIdent = quoted(role);
  const schemaIdent = quoted(schemaName);
  const databaseIdent = quoted(database);
  await client.query(`GRANT CONNECT ON DATABASE ${databaseIdent} TO ${roleIdent}`);
  await client.query(`GRANT USAGE ON SCHEMA ${schemaIdent} TO ${roleIdent}`);
  await client.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schemaIdent} TO ${roleIdent}`,
  );
  await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schemaIdent} TO ${roleIdent}`);
  // Module functions (for example SECURITY DEFINER relay leases) are executable by the module's own runtime role;
  // migrations revoke PUBLIC EXECUTE on the privileged ones (WI-OI-068 hardening).
  await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schemaIdent} TO ${roleIdent}`);
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaIdent} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${roleIdent}`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaIdent} GRANT USAGE, SELECT ON SEQUENCES TO ${roleIdent}`,
  );

  await client.query(
    `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ${schemaIdent}.schema_migrations FROM ${roleIdent}`,
  );
  await client.query(`GRANT SELECT ON ${schemaIdent}.schema_migrations TO ${roleIdent}`);
  for (const table of readOnly) {
    await client.query(
      `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ${schemaIdent}.${quoted(table)} FROM ${roleIdent}`,
    );
    await client.query(`GRANT SELECT ON ${schemaIdent}.${quoted(table)} TO ${roleIdent}`);
  }
  for (const table of appendOnly) {
    await client.query(
      `REVOKE UPDATE, DELETE, TRUNCATE ON ${schemaIdent}.${quoted(table)} FROM ${roleIdent}`,
    );
  }
}

async function formattedSql(client, query, params) {
  const result = await client.query(query, params);
  const sql = result.rows[0]?.sql;
  if (typeof sql !== 'string') throw new Error('Failed to construct database role statement.');
  return sql;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function positiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error('MODULE_EXPECTED_MIGRATION_VERSION must be a positive integer.');
  }
  return parsed;
}

function identifier(value, label) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)) {
    throw new Error(`${label} is not a valid PostgreSQL identifier.`);
  }
  return value;
}

function identifierList(value) {
  if (!value.trim()) return [];
  return value.split(',').map((item) => identifier(item.trim(), 'table name'));
}

function quoted(value) {
  return `"${value.replaceAll('"', '""')}"`;
}
