import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../../..');
const composeDirectory = resolve(repositoryRoot, 'infra/compose');
const databasePackageRoot = resolve(repositoryRoot, 'packages/db');
const migrationsRoot = resolve(databasePackageRoot, 'migrations');
const prismaCli = resolve(databasePackageRoot, 'node_modules/prisma/build/index.js');

if (process.env.NODE_ENV === 'production') {
  throw new Error('Exact migration-image verification is forbidden with NODE_ENV=production.');
}
process.loadEnvFile(resolve(composeDirectory, '.env'));

const configuredDatabaseUrl = process.env.DATABASE_URL?.trim();
const migrationsImage = process.env.MIGRATIONS_IMAGE?.trim();
const expectedImageId = process.env.EXPECTED_MIGRATIONS_IMAGE_ID?.trim();
const evidencePath = process.env.EVIDENCE_PATH?.trim();
const expectedMigrationCount = Number(process.env.EXPECTED_MIGRATION_COUNT ?? '37');

if (!configuredDatabaseUrl || !URL.canParse(configuredDatabaseUrl)) {
  throw new Error('A valid DATABASE_URL is required in infra/compose/.env.');
}
if (!migrationsImage || !expectedImageId || !evidencePath) {
  throw new Error('MIGRATIONS_IMAGE, EXPECTED_MIGRATIONS_IMAGE_ID and EVIDENCE_PATH are required.');
}
if (!Number.isInteger(expectedMigrationCount) || expectedMigrationCount < 1) {
  throw new Error('EXPECTED_MIGRATION_COUNT must be a positive integer.');
}
if (process.env.PROFILE_KEY !== 'configuration-local-development-v1') {
  throw new Error('This verifier is restricted to configuration-local-development-v1.');
}

const configuredUrl = new URL(configuredDatabaseUrl);
if (!['postgres:', 'postgresql:'].includes(configuredUrl.protocol)) {
  throw new Error('DATABASE_URL must use PostgreSQL.');
}
if (!['127.0.0.1', 'localhost', 'host.docker.internal'].includes(configuredUrl.hostname)) {
  throw new Error('Verification requires an explicitly local PostgreSQL endpoint.');
}

function urlForHost(databaseName) {
  const value = new URL(configuredUrl);
  if (value.hostname === 'host.docker.internal') value.hostname = '127.0.0.1';
  value.pathname = `/${databaseName}`;
  value.searchParams.delete('schema');
  return value.toString();
}

function urlForContainer(databaseName) {
  const value = new URL(configuredUrl);
  if (value.hostname === '127.0.0.1' || value.hostname === 'localhost') {
    value.hostname = 'host.docker.internal';
  }
  value.pathname = `/${databaseName}`;
  value.searchParams.delete('schema');
  return value.toString();
}

function safeMessage(value) {
  let message = String(value);
  for (const secret of [configuredDatabaseUrl, configuredUrl.password]) {
    if (secret) message = message.replaceAll(secret, '[REDACTED]');
  }
  return message.slice(0, 4000);
}

function run(command, args, { cwd = repositoryRoot, env = process.env, capture = true } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
    }
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise({ stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(new Error(`${command} exited ${code}: ${safeMessage(stderr || stdout)}`));
    });
  });
}

function runResult(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd ?? repositoryRoot,
      env: options?.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code) => resolvePromise({ code, stdout, stderr }));
  });
}

async function sql(databaseUrl, statement) {
  const result = await run('psql', [databaseUrl, '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement]);
  return result.stdout;
}

async function sqlMustFail(databaseUrl, statement) {
  const result = await runResult('psql', [
    databaseUrl,
    '--no-psqlrc',
    '-v',
    'ON_ERROR_STOP=1',
    '-At',
    '-c',
    statement,
  ]);
  assert.notEqual(result.code, 0, 'Expected the cross-tenant database mutation to fail.');
}

function quoteIdentifier(value) {
  if (!/^gigalibs_wi_oi_047_(?:clean|upgrade)_\d{13}_[a-f0-9]{8}$/.test(value)) {
    throw new Error(`Unsafe disposable database identifier: ${value}`);
  }
  return `"${value}"`;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function createDatabase(name) {
  await sql(urlForHost(configuredUrl.pathname.replace(/^\//, '')), `CREATE DATABASE ${quoteIdentifier(name)}`);
}

async function removeDatabase(name) {
  await sql(
    urlForHost(configuredUrl.pathname.replace(/^\//, '')),
    `DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`,
  );
  const retained = Number(
    await sql(
      urlForHost(configuredUrl.pathname.replace(/^\//, '')),
      `SELECT count(*) FROM pg_database WHERE datname = ${sqlLiteral(name)}`,
    ),
  );
  assert.equal(retained, 0, `Disposable database cleanup failed for ${name}.`);
}

async function runExactMigrationImage(databaseName) {
  await run('docker', [
    'run',
    '--rm',
    '--pull',
    'never',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m',
    '--user',
    '65532:65532',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--add-host',
    'host.docker.internal:host-gateway',
    '--env',
    `DATABASE_URL=${urlForContainer(databaseName)}`,
    migrationsImage,
  ]);
}

async function completedMigrationCount(databaseName) {
  return Number(
    await sql(
      urlForHost(databaseName),
      'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
    ),
  );
}

async function verifyPhysicalSchema(databaseName) {
  const result = await run(
    process.execPath,
    [
      prismaCli,
      'migrate',
      'diff',
      '--from-url',
      urlForHost(databaseName),
      '--to-schema-datamodel',
      resolve(databasePackageRoot, 'schema.prisma'),
      '--script',
    ],
    { capture: true },
  );
  if (result.stdout === '' || result.stdout === '-- This is an empty migration.') return null;
  return safeMessage(result.stdout);
}

async function createBaselineMigrationConfig() {
  const temporaryRoot = await mkdtemp(resolve(databasePackageRoot, '.wi-oi-047-exact-migration-'));
  const temporaryMigrations = resolve(temporaryRoot, 'migrations');
  await mkdir(temporaryMigrations);
  await cp(
    resolve(migrationsRoot, 'migration_lock.toml'),
    resolve(temporaryMigrations, 'migration_lock.toml'),
  );
  const entries = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d{14}_[a-z0-9_]+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  assert.equal(entries.length, expectedMigrationCount);
  const baselineMigrations = entries.slice(0, expectedMigrationCount - 2);
  assert.equal(baselineMigrations.length, 35);
  assert.equal(baselineMigrations.at(-1), '20260915001000_align_configuration_datamodel');
  for (const name of baselineMigrations) {
    await cp(resolve(migrationsRoot, name), resolve(temporaryMigrations, name), { recursive: true });
  }
  const configPath = resolve(temporaryRoot, 'prisma.config.mjs');
  await writeFile(
    configPath,
    `import { defineConfig } from 'prisma/config';\nexport default defineConfig({ schema: ${JSON.stringify(resolve(databasePackageRoot, 'schema.prisma'))}, migrations: { path: ${JSON.stringify(temporaryMigrations)} } });\n`,
    { mode: 0o600 },
  );
  return { temporaryRoot, configPath, baselineMigrationCount: baselineMigrations.length };
}

const suffix = `${Date.now()}_${randomBytes(4).toString('hex')}`;
const cleanDatabase = `gigalibs_wi_oi_047_clean_${suffix}`;
const upgradeDatabase = `gigalibs_wi_oi_047_upgrade_${suffix}`;
const createdDatabases = [];
let temporaryMigrationRoot;
let caughtError;
const failures = [];
const outcomes = [];
const timings = {};
const startedAt = new Date();
let removedDatabaseCount = 0;
let temporaryMigrationDirectoryRetained = false;

try {
  const serverVersion = Number(await sql(urlForHost(configuredUrl.pathname.replace(/^\//, '')), 'SHOW server_version_num'));
  assert.ok(serverVersion >= 160000 && serverVersion < 170000, `Expected PostgreSQL 16, got ${serverVersion}.`);
  outcomes.push('postgresql-16-server-verified');

  const inspectedImageId = (await run('docker', ['image', 'inspect', migrationsImage, '--format', '{{.Id}}'])).stdout;
  assert.equal(inspectedImageId, expectedImageId, 'Configured migration tag does not resolve to the required image ID.');
  outcomes.push('exact-migration-image-id-verified');

  await createDatabase(cleanDatabase);
  createdDatabases.push(cleanDatabase);
  const cleanStarted = Date.now();
  await runExactMigrationImage(cleanDatabase);
  assert.equal(await completedMigrationCount(cleanDatabase), expectedMigrationCount);
  const cleanSchemaDrift = await verifyPhysicalSchema(cleanDatabase);
  if (cleanSchemaDrift) failures.push(`clean-schema-drift: ${cleanSchemaDrift}`);
  timings.cleanReplayMs = Date.now() - cleanStarted;
  outcomes.push('exact-image-clean-37-migration-replay');
  if (!cleanSchemaDrift) outcomes.push('clean-physical-schema-matches-prisma-datamodel');

  await createDatabase(upgradeDatabase);
  createdDatabases.push(upgradeDatabase);
  const baseline = await createBaselineMigrationConfig();
  temporaryMigrationRoot = baseline.temporaryRoot;
  await run(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--config', baseline.configPath],
    {
      cwd: databasePackageRoot,
      env: { ...process.env, DATABASE_URL: urlForHost(upgradeDatabase), NODE_ENV: 'test' },
    },
  );
  assert.equal(await completedMigrationCount(upgradeDatabase), baseline.baselineMigrationCount);

  const ids = {
    userA: `wi047_user_a_${suffix}`,
    userB: `wi047_user_b_${suffix}`,
    tenantA: `wi047_tenant_a_${suffix}`,
    tenantB: `wi047_tenant_b_${suffix}`,
    memberA: `wi047_member_a_${suffix}`,
    memberB: `wi047_member_b_${suffix}`,
    departmentA: `wi047_department_a_${suffix}`,
  };
  await sql(
    urlForHost(upgradeDatabase),
    `BEGIN;
     INSERT INTO "users" ("id", "email", "name", "status", "createdAt", "updatedAt") VALUES
       (${sqlLiteral(ids.userA)}, ${sqlLiteral(`wi047.a.${suffix}@gigalibs.invalid`)}, 'WI-OI-047 upgrade A', 'ACTIVE', now(), now()),
       (${sqlLiteral(ids.userB)}, ${sqlLiteral(`wi047.b.${suffix}@gigalibs.invalid`)}, 'WI-OI-047 upgrade B', 'ACTIVE', now(), now());
     INSERT INTO "tenants" ("id", "slug", "name", "status", "isolationMode", "region", "features", "createdAt", "updatedAt") VALUES
       (${sqlLiteral(ids.tenantA)}, ${sqlLiteral(`wi047-upgrade-a-${suffix}`.slice(0, 63))}, 'WI-OI-047 upgrade tenant A', 'ACTIVE', 'ROW_LEVEL_SECURITY', 'local', ARRAY[]::text[], now(), now()),
       (${sqlLiteral(ids.tenantB)}, ${sqlLiteral(`wi047-upgrade-b-${suffix}`.slice(0, 63))}, 'WI-OI-047 upgrade tenant B', 'ACTIVE', 'ROW_LEVEL_SECURITY', 'local', ARRAY[]::text[], now(), now());
     INSERT INTO "tenant_members" ("id", "role", "status", "permissions", "joinedAt", "updatedAt", "userId", "tenantId") VALUES
       (${sqlLiteral(ids.memberA)}, 'TENANT_ADMIN', 'ACTIVE', ARRAY[]::text[], now(), now(), ${sqlLiteral(ids.userA)}, ${sqlLiteral(ids.tenantA)}),
       (${sqlLiteral(ids.memberB)}, 'TENANT_ADMIN', 'ACTIVE', ARRAY[]::text[], now(), now(), ${sqlLiteral(ids.userB)}, ${sqlLiteral(ids.tenantB)});
     COMMIT;`,
  );
  const semanticQuery = `SELECT string_agg(concat_ws('|', u.email, t.slug, tm.role::text, tm.status::text), ',' ORDER BY t.id)
      FROM "users" u
      JOIN "tenant_members" tm ON tm."userId" = u.id
      JOIN "tenants" t ON t.id = tm."tenantId"
     WHERE t.id IN (${sqlLiteral(ids.tenantA)}, ${sqlLiteral(ids.tenantB)})`;
  const baselineStateHash = createHash('sha256')
    .update(await sql(urlForHost(upgradeDatabase), semanticQuery))
    .digest('hex');

  const upgradeStarted = Date.now();
  await runExactMigrationImage(upgradeDatabase);
  assert.equal(await completedMigrationCount(upgradeDatabase), expectedMigrationCount);
  assert.equal(
    createHash('sha256').update(await sql(urlForHost(upgradeDatabase), semanticQuery)).digest('hex'),
    baselineStateHash,
  );
  await sql(
    urlForHost(upgradeDatabase),
    `INSERT INTO "departments" ("id", "tenantId", "name", "code", "createdAt", "updatedAt")
       VALUES (${sqlLiteral(ids.departmentA)}, ${sqlLiteral(ids.tenantA)}, 'Review A', 'REVIEW-A', now(), now());
     UPDATE "tenant_members" SET "departmentId" = ${sqlLiteral(ids.departmentA)} WHERE "id" = ${sqlLiteral(ids.memberA)};`,
  );
  await sqlMustFail(
    urlForHost(upgradeDatabase),
    `UPDATE "tenant_members" SET "departmentId" = ${sqlLiteral(ids.departmentA)} WHERE "id" = ${sqlLiteral(ids.memberB)}`,
  );
  assert.equal(
    Number(
      await sql(
        urlForHost(upgradeDatabase),
        `SELECT count(*) FROM "tenant_members" tm JOIN "departments" d ON d."tenantId" = tm."tenantId" AND d.id = tm."departmentId" WHERE tm.id = ${sqlLiteral(ids.memberA)}`,
      ),
    ),
    1,
  );
  assert.equal(
    await sql(
      urlForHost(upgradeDatabase),
      `SELECT COALESCE("departmentId", '') FROM "tenant_members" WHERE id = ${sqlLiteral(ids.memberB)}`,
    ),
    '',
  );
  await runExactMigrationImage(upgradeDatabase);
  assert.equal(await completedMigrationCount(upgradeDatabase), expectedMigrationCount);
  const upgradedSchemaDrift = await verifyPhysicalSchema(upgradeDatabase);
  if (upgradedSchemaDrift) failures.push(`upgraded-schema-drift: ${upgradedSchemaDrift}`);
  timings.upgradeAndIdempotencyMs = Date.now() - upgradeStarted;
  outcomes.push('exact-image-35-to-37-representative-upgrade');
  outcomes.push('pre-upgrade-tenant-membership-state-preserved');
  outcomes.push('tenant-safe-department-relationship-enforced');
  outcomes.push('cross-tenant-department-assignment-denied');
  outcomes.push('exact-image-second-run-idempotent');
  if (!upgradedSchemaDrift) outcomes.push('upgraded-physical-schema-matches-prisma-datamodel');
} catch (error) {
  caughtError = error;
  failures.push(safeMessage(error instanceof Error ? error.message : error));
} finally {
  for (const databaseName of createdDatabases.reverse()) {
    try {
      await removeDatabase(databaseName);
      removedDatabaseCount += 1;
      outcomes.push(`disposable-database-removed:${databaseName.includes('_clean_') ? 'clean' : 'upgrade'}`);
    } catch (error) {
      failures.push(safeMessage(error instanceof Error ? error.message : error));
    }
  }
  if (temporaryMigrationRoot) {
    temporaryMigrationDirectoryRetained = true;
    const expectedPrefix = resolve(databasePackageRoot, '.wi-oi-047-exact-migration-');
    if (!temporaryMigrationRoot.startsWith(expectedPrefix)) {
      failures.push('Refused to remove an unexpected temporary migration path.');
    } else {
      await rm(temporaryMigrationRoot, { recursive: true, force: true });
      temporaryMigrationDirectoryRetained = false;
      outcomes.push('temporary-baseline-migration-directory-removed');
    }
  }

  const evidence = {
    verifier: 'verify-exact-migration-image',
    recordedAt: new Date().toISOString(),
    profile: process.env.PROFILE_KEY,
    status: caughtError || failures.length > 0 ? 'FAIL' : 'PASS',
    gitRevision: process.env.SOURCE_REVISION,
    sourceStateSha256: process.env.SOURCE_STATE_SHA256,
    migrationsImage,
    migrationsImageId: expectedImageId,
    databaseEngine: 'PostgreSQL 16',
    expectedMigrationCount,
    baselineMigrationCount: expectedMigrationCount - 2,
    timings,
    outcomes,
    failures,
    cleanup: {
      disposableDatabaseCount: createdDatabases.length,
      retainedDisposableDatabases: createdDatabases.length - removedDatabaseCount,
      temporaryMigrationDirectoryRetained,
    },
    limitations: [
      'This verifies two disposable databases on the existing local PostgreSQL 16 container.',
      'This is not WAL/PITR, encrypted backup, host-loss, failover, representative-volume RTO or production evidence.',
    ],
    productionReleaseClaim: 'NONE',
    durationMs: Date.now() - startedAt.getTime(),
  };
  const target = resolve(repositoryRoot, evidencePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify(evidence, null, 2));
}

if (caughtError || failures.length > 0) {
  console.error('Exact migration-image verification failed; inspect the sanitized evidence record.');
  process.exit(1);
}
