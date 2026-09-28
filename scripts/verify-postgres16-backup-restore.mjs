import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile?.(resolve(repositoryRoot, '.env'));
} catch {}

const configuredUrl = process.env.DATABASE_URL?.trim();
if (!configuredUrl) throw new Error('DATABASE_URL is required');

const baseUrl = new URL(configuredUrl);
if (!['postgres:', 'postgresql:'].includes(baseUrl.protocol)) {
  throw new Error('DATABASE_URL must use PostgreSQL');
}

const suffix = `${Date.now()}_${randomBytes(4).toString('hex')}`;
const sourceName = `gigalibs_pg16_cert_source_${suffix}`;
const restoreName = `gigalibs_pg16_cert_restore_${suffix}`;
const dumpPath = join(tmpdir(), `${sourceName}.dump`);
const containerDumpPath = `/tmp/${sourceName}.dump`;
const evidencePath = process.env.PG16_EVIDENCE_PATH?.trim();
const startedAt = new Date();
const outcomes = [];
const libpqBin = '/opt/homebrew/opt/libpq/bin';
const pgDumpBinary =
  process.env.PG_DUMP_BIN?.trim() ||
  (existsSync(join(libpqBin, 'pg_dump')) ? join(libpqBin, 'pg_dump') : 'pg_dump');
const pgRestoreBinary =
  process.env.PG_RESTORE_BIN?.trim() ||
  (existsSync(join(libpqBin, 'pg_restore')) ? join(libpqBin, 'pg_restore') : 'pg_restore');
const pg16ToolContainer = process.env.PG16_TOOL_CONTAINER?.trim() || 'gigalibs-postgres';
let usedContainerTools = false;
let prismaSchemaProbe;
let recoveryEvidence;

function databaseUrl(name) {
  const value = new URL(baseUrl);
  value.pathname = `/${name}`;
  value.searchParams.delete('schema');
  return value.toString();
}

function quoteIdentifier(value) {
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(value)) throw new Error('Unsafe database identifier');
  return `"${value}"`;
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repositoryRoot,
      env: options.env ?? process.env,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';
    if (options.capture) {
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
      if (code === 0) resolvePromise(stdout.trim());
      else reject(new Error(`${command} exited ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

async function sql(url, statement) {
  return run('psql', [url, '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement], {
    capture: true,
  });
}

async function dropCertificationDatabase(name) {
  await sql(configuredUrl, `DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`);
}

async function createBackupAndRestore({ serverMajor, dumpMajor, restoreMajor }) {
  if (dumpMajor === serverMajor && restoreMajor === serverMajor) {
    await run(pgDumpBinary, [
      databaseUrl(sourceName),
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--file',
      dumpPath,
    ]);
    const dumpSizeBytes = (await stat(dumpPath)).size;
    await sql(configuredUrl, `CREATE DATABASE ${quoteIdentifier(restoreName)}`);
    await run(pgRestoreBinary, [
      '--dbname',
      databaseUrl(restoreName),
      '--no-owner',
      '--no-privileges',
      '--exit-on-error',
      dumpPath,
    ]);
    return dumpSizeBytes;
  }

  const containerDumpVersion = await run(
    'docker',
    ['exec', pg16ToolContainer, 'pg_dump', '--version'],
    { capture: true },
  );
  const containerRestoreVersion = await run(
    'docker',
    ['exec', pg16ToolContainer, 'pg_restore', '--version'],
    { capture: true },
  );
  const containerDumpMajor = Number(containerDumpVersion.match(/(\d+)(?:\.\d+)+/)?.[1]);
  const containerRestoreMajor = Number(containerRestoreVersion.match(/(\d+)(?:\.\d+)+/)?.[1]);
  assert.equal(containerDumpMajor, serverMajor, 'Container pg_dump must match the PostgreSQL server major');
  assert.equal(
    containerRestoreMajor,
    serverMajor,
    'Container pg_restore must match the PostgreSQL server major',
  );
  const username = decodeURIComponent(baseUrl.username);
  assert.ok(username, 'DATABASE_URL must include a database user for container backup tools');
  await run('docker', [
    'exec',
    pg16ToolContainer,
    'pg_dump',
    '--username',
    username,
    '--dbname',
    sourceName,
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--file',
    containerDumpPath,
  ]);
  const dumpSizeBytes = Number(
    await run('docker', ['exec', pg16ToolContainer, 'stat', '-c', '%s', containerDumpPath], {
      capture: true,
    }),
  );
  await sql(configuredUrl, `CREATE DATABASE ${quoteIdentifier(restoreName)}`);
  await run('docker', [
    'exec',
    pg16ToolContainer,
    'pg_restore',
    '--username',
    username,
    '--dbname',
    restoreName,
    '--no-owner',
    '--no-privileges',
    '--exit-on-error',
    containerDumpPath,
  ]);
  usedContainerTools = true;
  return dumpSizeBytes;
}

try {
  const serverVersion = Number(await sql(configuredUrl, 'SHOW server_version_num'));
  assert.ok(serverVersion >= 160000 && serverVersion < 170000, `Expected PostgreSQL 16, got ${serverVersion}`);
  outcomes.push('postgresql-16-server-verified');

  const serverMajor = Math.floor(serverVersion / 10000);
  const dumpVersionText = await run(pgDumpBinary, ['--version'], { capture: true });
  const restoreVersionText = await run(pgRestoreBinary, ['--version'], { capture: true });
  const dumpMajor = Number(dumpVersionText.match(/(\d+)(?:\.\d+)+/)?.[1]);
  const restoreMajor = Number(restoreVersionText.match(/(\d+)(?:\.\d+)+/)?.[1]);
  assert.ok(Number.isInteger(dumpMajor) && Number.isInteger(restoreMajor), 'Unable to identify backup tool versions');

  await sql(configuredUrl, `CREATE DATABASE ${quoteIdentifier(sourceName)}`);
  await run('pnpm', ['--dir', 'packages/db', 'db:migrate'], {
    env: { ...process.env, DATABASE_URL: databaseUrl(sourceName), NODE_ENV: 'test' },
  });
  process.env.DATABASE_URL = databaseUrl(sourceName);
  ({ prisma: prismaSchemaProbe } = await import('../packages/db/dist/index.js'));
  await Promise.all([
    prismaSchemaProbe.tenant.findFirst({ select: { id: true, parentTenantId: true } }),
    prismaSchemaProbe.sagaInstance.findFirst({
      select: {
        id: true,
        tenantId: true,
        sagaType: true,
        compensationTriggered: true,
        auditLedgerDigest: true,
        logSummary: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
      },
    }),
    prismaSchemaProbe.sagaStep.findFirst({
      select: {
        id: true,
        sagaInstanceId: true,
        stepIndex: true,
        targetSystem: true,
        forwardAction: true,
        compensatingAction: true,
        fipsSha256Checksum: true,
        errorMessage: true,
        executedAt: true,
        compensatedAt: true,
      },
    }),
    prismaSchemaProbe.tenantRateBucket.findFirst({
      select: {
        tenantId: true,
        lastRefillTimestampMs: true,
        updatedAt: true,
      },
    }),
  ]);
  outcomes.push('generated-prisma-client-schema-compatible');
  const schemaDiff = await run(
    'pnpm',
    [
      '--dir',
      'packages/db',
      'exec',
      'prisma',
      'migrate',
      'diff',
      '--from-url',
      databaseUrl(sourceName),
      '--to-schema-datamodel',
      'schema.prisma',
      '--script',
    ],
    { capture: true },
  );
  assert.ok(
    schemaDiff === '' || schemaDiff === '-- This is an empty migration.',
    `Physical database schema differs from the canonical Prisma datamodel:\n${schemaDiff.slice(0, 30_000)}`,
  );
  outcomes.push('physical-schema-matches-prisma-datamodel');
  const migrationCount = Number(
    await sql(databaseUrl(sourceName), 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'),
  );
  assert.ok(migrationCount > 0, 'No completed migrations found');
  outcomes.push('clean-forward-migration-replay');

  const userId = `uat_pg16_user_${suffix}`;
  const tenantId = `uat_pg16_tenant_${suffix}`;
  const memberId = `uat_pg16_member_${suffix}`;
  const auditId = `uat_pg16_audit_${suffix}`;
  const email = `uat.pg16.${suffix}@gigalibs.invalid`;
  const seed = `
    BEGIN;
    INSERT INTO "users" ("id", "email", "name", "status", "createdAt", "updatedAt")
      VALUES ('${userId}', '${email}', 'PostgreSQL 16 certification', 'ACTIVE', now(), now());
    INSERT INTO "tenants" ("id", "slug", "name", "status", "isolationMode", "region", "features", "createdAt", "updatedAt")
      VALUES ('${tenantId}', 'uat-pg16-${suffix}', 'PostgreSQL 16 certification tenant', 'ACTIVE', 'ROW_LEVEL_SECURITY', 'local', ARRAY[]::text[], now(), now());
    INSERT INTO "tenant_members" ("id", "role", "status", "permissions", "joinedAt", "updatedAt", "userId", "tenantId")
      VALUES ('${memberId}', 'TENANT_ADMIN', 'ACTIVE', ARRAY[]::text[], now(), now(), '${userId}', '${tenantId}');
    INSERT INTO "audit_logs" ("id", "action", "resource", "resourceId", "correlationId", "after", "metadata", "userId", "tenantId", "createdAt")
      VALUES ('${auditId}', 'CREATE', 'uat_pg16_certification', '${tenantId}', 'pg16-${suffix}',
        jsonb_build_object('status', 'ACTIVE'), jsonb_build_object('testAttributable', true), '${userId}', '${tenantId}', now());
    COMMIT;
  `;
  await sql(databaseUrl(sourceName), seed);

  const sourceIntegrity = await sql(
    databaseUrl(sourceName),
    `SELECT concat_ws('|', u.email, t.slug, tm.role::text, a.resource, a.metadata->>'testAttributable')
       FROM "users" u
       JOIN "tenant_members" tm ON tm."userId" = u.id
       JOIN "tenants" t ON t.id = tm."tenantId"
       JOIN "audit_logs" a ON a."tenantId" = t.id
      WHERE u.id = '${userId}' AND t.id = '${tenantId}' AND a.id = '${auditId}'`,
  );
  assert.ok(sourceIntegrity.endsWith('|true'), 'Source certification graph is incomplete');
  const sourceChecksum = createHash('sha256').update(sourceIntegrity).digest('hex');
  outcomes.push('attributable-iam-graph-persisted');

  const timestamptzCount = Number(
    await sql(
      databaseUrl(sourceName),
      `SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND data_type = 'timestamp with time zone'`,
    ),
  );
  assert.ok(timestamptzCount >= 50, `Expected at least 50 timestamptz columns, got ${timestamptzCount}`);
  outcomes.push('absolute-time-schema-preserved');

  const dumpSizeBytes = await createBackupAndRestore({ serverMajor, dumpMajor, restoreMajor });
  assert.ok(dumpSizeBytes > 0, 'Backup artifact is empty');
  outcomes.push('same-major-backup-restore-tools-verified');
  outcomes.push('custom-format-backup-created');
  const restoredIntegrity = await sql(
    databaseUrl(restoreName),
    `SELECT concat_ws('|', u.email, t.slug, tm.role::text, a.resource, a.metadata->>'testAttributable')
       FROM "users" u
       JOIN "tenant_members" tm ON tm."userId" = u.id
       JOIN "tenants" t ON t.id = tm."tenantId"
       JOIN "audit_logs" a ON a."tenantId" = t.id
      WHERE u.id = '${userId}' AND t.id = '${tenantId}' AND a.id = '${auditId}'`,
  );
  const restoredChecksum = createHash('sha256').update(restoredIntegrity).digest('hex');
  assert.equal(restoredChecksum, sourceChecksum, 'Restored IAM graph checksum differs from source');
  const restoredMigrationCount = Number(
    await sql(databaseUrl(restoreName), 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'),
  );
  assert.equal(restoredMigrationCount, migrationCount, 'Restored migration history differs from source');
  outcomes.push('backup-restored-with-record-and-migration-integrity');

  recoveryEvidence = {
    recordedAt: new Date().toISOString(),
    environment: 'isolated-local-uat',
    databaseEngine: 'PostgreSQL 16',
    backupClientMajor: serverMajor,
    restoreClientMajor: serverMajor,
    backupToolSource: usedContainerTools ? 'postgresql-16-container' : 'host',
    migrationCount,
    timestamptzCount,
    dumpSizeBytes,
    durationMs: Date.now() - startedAt.getTime(),
    sourceAndRestoreDatabasesRetained: false,
    rawCredentialsPersistedInEvidence: false,
    businessDataPersistedInEvidence: false,
    outcomes,
    outcomeCount: outcomes.length,
  };
} finally {
  if (prismaSchemaProbe) await prismaSchemaProbe.$disconnect().catch(() => undefined);
  await dropCertificationDatabase(restoreName);
  await dropCertificationDatabase(sourceName);
  await run('docker', ['exec', pg16ToolContainer, 'rm', '-f', containerDumpPath], {
    capture: true,
  }).catch(() => undefined);
  await unlink(dumpPath).catch(() => undefined);
  const retainedDatabaseCount = Number(
    await sql(
      configuredUrl,
      `SELECT count(*) FROM pg_database WHERE datname IN ('${sourceName}', '${restoreName}')`,
    ),
  );
  assert.equal(retainedDatabaseCount, 0, 'PostgreSQL recovery certification database cleanup failed.');
  assert.equal(existsSync(dumpPath), false, 'PostgreSQL recovery certification dump cleanup failed.');
}

assert.ok(recoveryEvidence, 'PostgreSQL recovery certification did not produce evidence.');
if (evidencePath) {
  await writeFile(
    resolve(repositoryRoot, evidencePath),
    `${JSON.stringify(recoveryEvidence, null, 2)}\n`,
    'utf8',
  );
}
console.log(JSON.stringify(recoveryEvidence));
