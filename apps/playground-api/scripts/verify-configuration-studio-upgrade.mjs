import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const applicationRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(applicationRoot, '../..');
const databasePackageRoot = resolve(repositoryRoot, 'packages/db');
const migrationsRoot = resolve(databasePackageRoot, 'migrations');
const baselineCutoff = '20260915000000';

try {
  process.loadEnvFile?.(resolve(repositoryRoot, '.env'));
} catch {}

if (process.env.NODE_ENV === 'production') {
  throw new Error('Configuration Studio upgrade certification must not run in production.');
}
const configuredUrl = process.env.DATABASE_URL?.trim();
if (!configuredUrl) throw new Error('DATABASE_URL is required.');
const baseDatabaseUrl = new URL(configuredUrl);
if (!['postgres:', 'postgresql:'].includes(baseDatabaseUrl.protocol)) {
  throw new Error('DATABASE_URL must use PostgreSQL.');
}
if (!['127.0.0.1', 'localhost', '::1'].includes(baseDatabaseUrl.hostname)) {
  throw new Error('Upgrade certification requires an explicitly local PostgreSQL endpoint.');
}

const suffix = `${Date.now()}_${randomBytes(4).toString('hex')}`;
const certificationDatabaseName = `gigalibs_configuration_cert_upgrade_${suffix}`;
const evidencePath = process.env.CONFIGURATION_UPGRADE_EVIDENCE_PATH?.trim();
const startedAt = new Date();
let databaseCreated = false;
let temporaryMigrationRoot;
let prisma;
let apiProcess;
let evidence;
let apiLog = '';

function databaseUrl(name) {
  const value = new URL(baseDatabaseUrl);
  value.pathname = `/${name}`;
  value.searchParams.delete('schema');
  return value.toString();
}

function quoteIdentifier(value) {
  if (!/^gigalibs_configuration_cert_upgrade_[a-z0-9_]{8,}$/i.test(value)) {
    throw new Error('Unsafe upgrade-certification database identifier.');
  }
  return `"${value}"`;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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

function sql(url, statement) {
  return run('psql', [url, '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement], {
    capture: true,
  });
}

function allocatePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolvePromise(port)));
    });
  });
}

function startApi(port, certUrl) {
  apiLog = '';
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: applicationRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      API_HOST: '127.0.0.1',
      API_PORT: String(port),
      DATABASE_URL: certUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const append = (stream, chunk) => {
    apiLog = `${apiLog}${stream}: ${String(chunk)}`.slice(-16_000);
  };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => append('stdout', chunk));
  child.stderr.on('data', (chunk) => append('stderr', chunk));
  return child;
}

async function stopApi(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolvePromise) => child.once('exit', resolvePromise));
  child.kill('SIGTERM');
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise((resolvePromise) => setTimeout(() => resolvePromise(false), 10_000)),
  ]);
  if (!graceful && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await exited;
  }
}

async function waitForHealth(child, baseUrl) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Upgraded API exited before readiness.\n${apiLog}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/v1/health`);
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Upgraded API did not become ready.\n${apiLog}`);
}

async function request(baseUrl, path, { token, method = 'GET', body, expected = 200 } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : null;
  assert.equal(response.status, expected, `${method} ${path}: ${raw}`);
  return payload;
}

async function selectedTenantToken(baseUrl, email, password, tenantId) {
  const login = await request(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  const selected = await request(baseUrl, '/api/v1/auth/select-tenant', {
    method: 'POST',
    token: login.accessToken,
    body: { tenantId },
  });
  return selected.accessToken;
}

async function createBaselineMigrationConfig() {
  temporaryMigrationRoot = await mkdtemp(
    resolve(databasePackageRoot, '.configuration-upgrade-cert-'),
  );
  const temporaryMigrations = resolve(temporaryMigrationRoot, 'migrations');
  await mkdir(temporaryMigrations);
  await cp(
    resolve(migrationsRoot, 'migration_lock.toml'),
    resolve(temporaryMigrations, 'migration_lock.toml'),
  );
  const entries = await readdir(migrationsRoot, { withFileTypes: true });
  const baselineMigrations = entries
    .filter(
      (entry) =>
        entry.isDirectory() && /^\d{14}_[a-z0-9_]+$/.test(entry.name) && entry.name < baselineCutoff,
    )
    .map((entry) => entry.name)
    .sort();
  assert.equal(baselineMigrations.length, 33, 'Expected the accepted 33-migration baseline.');
  for (const name of baselineMigrations) {
    await cp(resolve(migrationsRoot, name), resolve(temporaryMigrations, name), { recursive: true });
  }
  const configPath = resolve(temporaryMigrationRoot, 'prisma.config.ts');
  const configSource = `import { defineConfig } from 'prisma/config';\n\nexport default defineConfig({\n  schema: ${JSON.stringify(resolve(databasePackageRoot, 'schema.prisma'))},\n  migrations: { path: ${JSON.stringify(temporaryMigrations)} },\n});\n`;
  await writeFile(configPath, configSource, { mode: 0o600 });
  return { configPath, baselineMigrations };
}

try {
  const serverVersion = Number(await sql(configuredUrl, 'SHOW server_version_num'));
  assert.ok(serverVersion >= 160000 && serverVersion < 170000, `Expected PostgreSQL 16, got ${serverVersion}`);
  await sql(configuredUrl, `CREATE DATABASE ${quoteIdentifier(certificationDatabaseName)}`);
  databaseCreated = true;
  const certUrl = databaseUrl(certificationDatabaseName);
  const { configPath, baselineMigrations } = await createBaselineMigrationConfig();
  await run(
    'pnpm',
    ['--dir', 'packages/db', 'exec', 'prisma', 'migrate', 'deploy', '--config', configPath],
    { env: { ...process.env, DATABASE_URL: certUrl, NODE_ENV: 'test' } },
  );
  const baselineMigrationCount = Number(
    await sql(certUrl, 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'),
  );
  assert.equal(baselineMigrationCount, baselineMigrations.length);

  const [{ hashPassword }, { compileConfiguration }] = await Promise.all([
    import('../../../packages/auth-core/dist/index.js'),
    import('../../../packages/configuration-core/dist/index.js'),
  ]);
  const password = `Uat-${randomBytes(20).toString('base64url')}!`;
  const passwordHash = await hashPassword(password);
  const ids = {
    parentTenant: `uat_upgrade_parent_${suffix}`,
    childTenant: `uat_upgrade_child_${suffix}`,
    user: `uat_upgrade_user_${suffix}`,
    member: `uat_upgrade_member_${suffix}`,
    settings: `uat_upgrade_settings_${suffix}`,
    changeSet: `uat_upgrade_change_${suffix}`,
    published: `uat_upgrade_published_${suffix}`,
    activation: `uat_upgrade_activation_${suffix}`,
    saga: `uat_upgrade_saga_${suffix}`,
    sagaStep: `uat_upgrade_step_${suffix}`,
  };
  const email = `uat.config.upgrade.${suffix}@gigalibs.invalid`;
  const definition = {
    contractVersion: '1.0',
    moduleKey: 'tenant-settings',
    entityKey: 'tenant-profile',
    surfaceKey: 'profile-extension',
    mode: 'EDIT',
    title: 'Upgrade-preserved profile extension',
    fields: [
      {
        key: 'upgrade-site',
        label: 'Upgrade site',
        type: 'TEXT',
        component: 'text-input',
        required: false,
        readOnly: false,
        classification: 'INTERNAL',
      },
    ],
    sections: [
      {
        key: 'upgrade',
        title: 'Upgrade',
        columns: 1,
        fieldKeys: ['upgrade-site'],
      },
    ],
  };
  const compiled = compileConfiguration(definition);
  assert.equal(compiled.valid, true);
  assert.ok(compiled.manifest);
  const manifest = compiled.manifest;
  const checksum = manifest.checksum;
  const seed = `
    BEGIN;
    INSERT INTO "users" ("id", "email", "passwordHash", "name", "status", "createdAt", "updatedAt")
      VALUES (${sqlLiteral(ids.user)}, ${sqlLiteral(email)}, ${sqlLiteral(passwordHash)}, 'Upgrade certification user', 'ACTIVE', now(), now());
    INSERT INTO "tenants" ("id", "slug", "name", "status", "isolationMode", "region", "features", "createdAt", "updatedAt")
      VALUES (${sqlLiteral(ids.parentTenant)}, ${sqlLiteral(`uat-upgrade-parent-${suffix}`.slice(0, 63))}, 'Upgrade parent tenant', 'ACTIVE', 'ROW_LEVEL_SECURITY', 'local', ARRAY[]::text[], now(), now());
    INSERT INTO "tenants" ("id", "slug", "name", "status", "isolationMode", "region", "features", "parent_tenant_id", "createdAt", "updatedAt")
      VALUES (${sqlLiteral(ids.childTenant)}, ${sqlLiteral(`uat-upgrade-child-${suffix}`.slice(0, 63))}, 'Upgrade child tenant', 'ACTIVE', 'ROW_LEVEL_SECURITY', 'local', ARRAY['dynamic-forms']::text[], ${sqlLiteral(ids.parentTenant)}, now(), now());
    INSERT INTO "tenant_settings" ("id", "tenantId", "branding", "security", "localization", "features", "metadata", "updatedById", "createdAt", "updatedAt")
      VALUES (${sqlLiteral(ids.settings)}, ${sqlLiteral(ids.childTenant)}, '{}'::jsonb, '{"enforceMfa":false}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"testAttributable":true}'::jsonb, ${sqlLiteral(ids.user)}, now(), now());
    INSERT INTO "tenant_members" ("id", "role", "status", "permissions", "joinedAt", "updatedAt", "userId", "tenantId")
      VALUES (${sqlLiteral(ids.member)}, 'TENANT_ADMIN', 'ACTIVE', ARRAY[]::text[], now(), now(), ${sqlLiteral(ids.user)}, ${sqlLiteral(ids.childTenant)});
    INSERT INTO "saga_instances" ("id", "tenant_id", "saga_type", "status", "payload", "compensation_triggered", "audit_ledger_digest", "log_summary", "created_at", "updated_at")
      VALUES (${sqlLiteral(ids.saga)}, ${sqlLiteral(ids.childTenant)}, 'UPGRADE_CERTIFICATION', 'IN_PROGRESS', '{"testAttributable":true}'::jsonb, false, 'sha256:upgrade-certification', ARRAY['baseline']::text[], now(), now());
    INSERT INTO "saga_steps" ("id", "saga_instance_id", "step_index", "name", "target_system", "forward_action", "compensating_action", "status")
      VALUES (${sqlLiteral(ids.sagaStep)}, ${sqlLiteral(ids.saga)}, 0, 'Preserve state', 'CERTIFICATION', 'VERIFY', 'NOOP', 'SUCCESS');
    INSERT INTO "tenant_rate_buckets" ("tenant_id", "tier", "tokens", "last_refill_timestamp_ms", "updated_at")
      VALUES (${sqlLiteral(ids.childTenant)}, 'STANDARD', 37.5, 1789490000000, now());
    INSERT INTO "configuration_change_sets" ("id", "tenantId", "moduleKey", "entityKey", "surfaceKey", "status", "definition", "compiledManifest", "checksum", "findings", "compatibility", "reason", "version", "createdById", "approvedById", "approvedAt", "publishedAt", "createdAt", "updatedAt")
      VALUES (${sqlLiteral(ids.changeSet)}, ${sqlLiteral(ids.childTenant)}, 'tenant-settings', 'tenant-profile', 'profile-extension', 'PUBLISHED', ${sqlLiteral(JSON.stringify(definition))}::jsonb, ${sqlLiteral(JSON.stringify(manifest))}::jsonb, ${sqlLiteral(checksum)}, '[]'::jsonb, 'COMPATIBLE', 'Upgrade certification baseline', 1, ${sqlLiteral(ids.user)}, ${sqlLiteral(ids.user)}, now(), now(), now(), now());
    INSERT INTO "configuration_published_versions" ("id", "tenantId", "changeSetId", "moduleKey", "entityKey", "surfaceKey", "sequence", "manifest", "checksum", "compilerVersion", "publishedById", "publishedAt")
      VALUES (${sqlLiteral(ids.published)}, ${sqlLiteral(ids.childTenant)}, ${sqlLiteral(ids.changeSet)}, 'tenant-settings', 'tenant-profile', 'profile-extension', 1, ${sqlLiteral(JSON.stringify(manifest))}::jsonb, ${sqlLiteral(checksum)}, ${sqlLiteral(manifest.compilerVersion)}, ${sqlLiteral(ids.user)}, now());
    INSERT INTO "configuration_activations" ("id", "tenantId", "publishedVersionId", "moduleKey", "entityKey", "surfaceKey", "environmentKey", "cohortKey", "status", "reason", "activatedById", "activatedAt")
      VALUES (${sqlLiteral(ids.activation)}, ${sqlLiteral(ids.childTenant)}, ${sqlLiteral(ids.published)}, 'tenant-settings', 'tenant-profile', 'profile-extension', 'local-uat', 'all-users', 'ACTIVE', 'Upgrade certification baseline', ${sqlLiteral(ids.user)}, now());
    COMMIT;
  `;
  await sql(certUrl, seed);
  const baselineSemanticState = await sql(
    certUrl,
    `SELECT concat_ws('|', t."parent_tenant_id", s."saga_type", ss."target_system", rb."tokens"::text, pv."checksum")
       FROM "tenants" t
       JOIN "saga_instances" s ON s."tenant_id" = t."id"
       JOIN "saga_steps" ss ON ss."saga_instance_id" = s."id"
       JOIN "tenant_rate_buckets" rb ON rb."tenant_id" = t."id"
       JOIN "configuration_published_versions" pv ON pv."tenantId" = t."id"
      WHERE t."id" = ${sqlLiteral(ids.childTenant)}`,
  );
  const baselineChecksum = createHash('sha256').update(baselineSemanticState).digest('hex');

  await run('pnpm', ['--dir', 'packages/db', 'db:migrate'], {
    env: { ...process.env, DATABASE_URL: certUrl, NODE_ENV: 'test' },
  });
  const upgradedMigrationCount = Number(
    await sql(certUrl, 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'),
  );
  assert.equal(upgradedMigrationCount, 35);
  process.env.DATABASE_URL = certUrl;
  ({ prisma } = await import('../../../packages/db/dist/index.js'));
  const [childTenant, saga, rateBucket, activation] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: ids.childTenant },
      select: { id: true, parentTenantId: true },
    }),
    prisma.sagaInstance.findUniqueOrThrow({
      where: { id: ids.saga },
      include: { steps: true },
    }),
    prisma.tenantRateBucket.findUniqueOrThrow({ where: { tenantId: ids.childTenant } }),
    prisma.configurationActivation.findUniqueOrThrow({
      where: { id: ids.activation },
      include: { publishedVersion: true },
    }),
  ]);
  assert.equal(childTenant.parentTenantId, ids.parentTenant);
  assert.equal(saga.sagaType, 'UPGRADE_CERTIFICATION');
  assert.equal(saga.steps[0]?.targetSystem, 'CERTIFICATION');
  assert.equal(rateBucket.tokens, 37.5);
  assert.equal(activation.publishedVersion.checksum, checksum);
  const upgradedSemanticState = await sql(
    certUrl,
    `SELECT concat_ws('|', t."parentTenantId", s."sagaType", ss."targetSystem", rb."tokens"::text, pv."checksum")
       FROM "tenants" t
       JOIN "saga_instances" s ON s."tenantId" = t."id"
       JOIN "saga_steps" ss ON ss."sagaInstanceId" = s."id"
       JOIN "tenant_rate_buckets" rb ON rb."tenantId" = t."id"
       JOIN "configuration_published_versions" pv ON pv."tenantId" = t."id"
      WHERE t."id" = ${sqlLiteral(ids.childTenant)}`,
  );
  const upgradedChecksum = createHash('sha256').update(upgradedSemanticState).digest('hex');
  assert.equal(upgradedChecksum, baselineChecksum);

  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  apiProcess = startApi(port, certUrl);
  await waitForHealth(apiProcess, baseUrl);
  const token = await selectedTenantToken(baseUrl, email, password, ids.childTenant);
  const runtimePath = '/api/v1/configuration/runtime/manifest?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension&environmentKey=local-uat&cohortKey=all-users';
  const firstRuntime = await request(baseUrl, runtimePath, { token });
  assert.equal(firstRuntime.checksum, checksum);
  await stopApi(apiProcess);
  apiProcess = undefined;
  apiProcess = startApi(port, certUrl);
  await waitForHealth(apiProcess, baseUrl);
  const afterRestart = await request(baseUrl, runtimePath, { token });
  assert.equal(afterRestart.checksum, checksum);
  assert.equal(afterRestart.publishedVersionId, ids.published);

  evidence = {
    recordedAt: new Date().toISOString(),
    environment: 'isolated-local-uat',
    databaseEngine: 'PostgreSQL 16',
    baselineMigrationCount,
    upgradedMigrationCount,
    baselineCutoff,
    durationMs: Date.now() - startedAt.getTime(),
    applicationRestartCount: 1,
    databaseRestartPerformed: false,
    semanticStateChecksumPreserved: true,
    certificationDatabaseRetained: false,
    temporaryMigrationDirectoryRetained: false,
    rawCredentialsPersistedInEvidence: false,
    businessDataPersistedInEvidence: false,
    outcomes: [
      'accepted-33-migration-baseline-replayed',
      'representative-hierarchy-saga-governor-configuration-state-seeded',
      'two-forward-fix-migrations-applied',
      'semantic-state-checksum-preserved-across-column-alignment',
      'generated-client-read-all-upgraded-models',
      'upgraded-api-served-preserved-active-manifest',
      'application-restart-served-same-active-manifest',
    ],
    outcomeCount: 7,
  };
} catch (error) {
  if (apiLog) console.error(apiLog);
  throw error;
} finally {
  await stopApi(apiProcess);
  await prisma?.$disconnect().catch(() => undefined);
  if (databaseCreated) {
    await sql(
      configuredUrl,
      `DROP DATABASE IF EXISTS ${quoteIdentifier(certificationDatabaseName)} WITH (FORCE)`,
    );
    const retainedCount = Number(
      await sql(
        configuredUrl,
        `SELECT count(*) FROM pg_database WHERE datname = '${certificationDatabaseName}'`,
      ),
    );
    assert.equal(retainedCount, 0, 'Upgrade-certification database cleanup was not verified.');
  }
  if (temporaryMigrationRoot) {
    const expectedPrefix = resolve(databasePackageRoot, '.configuration-upgrade-cert-');
    assert.ok(
      temporaryMigrationRoot.startsWith(expectedPrefix),
      'Refusing to remove an unexpected temporary migration path.',
    );
    await rm(temporaryMigrationRoot, { recursive: true, force: true });
  }
}

assert.ok(evidence, 'Upgrade certification did not produce evidence.');
if (evidencePath) {
  const target = resolve(repositoryRoot, evidencePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}
console.log(JSON.stringify(evidence, null, 2));
