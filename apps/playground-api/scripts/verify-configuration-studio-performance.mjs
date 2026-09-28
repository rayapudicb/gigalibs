import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const applicationRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(applicationRoot, '../..');

try {
  process.loadEnvFile?.(resolve(repositoryRoot, '.env'));
} catch {}

if (process.env.NODE_ENV === 'production') {
  throw new Error('Configuration Studio performance certification must not run in production.');
}

const configuredUrl = process.env.DATABASE_URL?.trim();
if (!configuredUrl) throw new Error('DATABASE_URL is required.');
const baseDatabaseUrl = new URL(configuredUrl);
if (!['postgres:', 'postgresql:'].includes(baseDatabaseUrl.protocol)) {
  throw new Error('DATABASE_URL must use PostgreSQL.');
}
if (!['127.0.0.1', 'localhost', '::1'].includes(baseDatabaseUrl.hostname)) {
  throw new Error('Performance certification requires an explicitly local PostgreSQL endpoint.');
}
if (!existsSync(resolve(applicationRoot, 'dist/main.js'))) {
  throw new Error('Build apps/playground-api before running performance certification.');
}

const FIELD_COUNT = 250;
const PRIMARY_RECORD_COUNT = 100;
const NEIGHBOR_RECORD_COUNT = 25;
const WARMUP_READ_COUNT = 10;
const WARM_MANIFEST_READ_COUNT = 100;
const MIXED_MANIFEST_READ_COUNT = 80;
const CONCURRENT_EDIT_COUNT = 16;
const PROJECTION_READ_COUNT = 30;
const NOISY_NEIGHBOR_READ_COUNT = 40;
const READ_CONCURRENCY = 10;
const WRITE_CONCURRENCY = 5;
const PROVISIONAL_READ_BUDGET_MS = 2_000;

const suffix = `${Date.now()}_${randomBytes(4).toString('hex')}`;
const certificationDatabaseName = `gigalibs_configuration_cert_performance_${suffix}`;
const evidencePath = process.env.CONFIGURATION_PERFORMANCE_EVIDENCE_PATH?.trim();
const startedAt = new Date();
let databaseCreated = false;
let prisma;
let apiProcess;
let apiLog = '';
let evidence;

function databaseUrl(name) {
  const value = new URL(baseDatabaseUrl);
  value.pathname = `/${name}`;
  value.searchParams.delete('schema');
  return value.toString();
}

function quoteIdentifier(value) {
  if (!/^gigalibs_configuration_cert_performance_[a-z0-9_]{8,}$/i.test(value)) {
    throw new Error('Unsafe performance-certification database identifier.');
  }
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
      throw new Error(`API exited before readiness.\n${apiLog}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/v1/health`);
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`API did not become ready.\n${apiLog}`);
}

async function timedRequest(
  baseUrl,
  path,
  { token, method = 'GET', body, expected = [200] } = {},
) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const requestStartedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  const durationMs = performance.now() - requestStartedAt;
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
  }
  assert.ok(
    expected.includes(response.status),
    `${method} ${path}: expected ${expected.join('/')} but received ${response.status}: ${raw}`,
  );
  return { status: response.status, payload, durationMs };
}

async function request(baseUrl, path, options) {
  return (await timedRequest(baseUrl, path, options)).payload;
}

async function tenantToken(baseUrl, email, password, tenantId) {
  const login = await request(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: { email, password },
    expected: [200],
  });
  const selected = await request(baseUrl, '/api/v1/auth/select-tenant', {
    method: 'POST',
    token: login.accessToken,
    body: { tenantId },
    expected: [200],
  });
  return selected.accessToken;
}

function fieldFor(index) {
  const common = {
    key: `perf-field-${String(index).padStart(3, '0')}`,
    label: `Performance field ${index}`,
    required: index < 20,
    readOnly: false,
    classification: 'INTERNAL',
  };
  switch (index % 5) {
    case 0:
      return { ...common, type: 'TEXT', component: 'text-input', maxLength: 200 };
    case 1:
      return { ...common, type: 'INTEGER', component: 'number-input', minimum: 0 };
    case 2:
      return { ...common, type: 'BOOLEAN', component: 'checkbox' };
    case 3:
      return { ...common, type: 'DATE', component: 'date-input' };
    default:
      return {
        ...common,
        type: 'SELECT',
        component: 'select',
        options: [
          { value: 'option-a', label: 'Option A' },
          { value: 'option-b', label: 'Option B' },
          { value: 'option-c', label: 'Option C' },
        ],
      };
  }
}

const fields = Array.from({ length: FIELD_COUNT }, (_, index) => fieldFor(index));

function definitionFor(entityKey, title) {
  return {
    contractVersion: '1.0',
    moduleKey: 'tenant-apps',
    entityKey,
    surfaceKey: 'custom-form',
    mode: 'EDIT',
    title,
    description: 'Attributable isolated high-field performance certification application.',
    fields,
    sections: [
      {
        key: 'performance-fields-1',
        title: 'Performance fields 1',
        columns: 2,
        fieldKeys: fields.slice(0, 100).map(({ key }) => key),
      },
      {
        key: 'performance-fields-2',
        title: 'Performance fields 2',
        columns: 2,
        fieldKeys: fields.slice(100, 200).map(({ key }) => key),
      },
      {
        key: 'performance-fields-3',
        title: 'Performance fields 3',
        columns: 2,
        fieldKeys: fields.slice(200).map(({ key }) => key),
      },
    ],
    listView: {
      columnKeys: fields.slice(0, 20).map(({ key }) => key),
      defaultSortKey: fields[0].key,
      defaultSortDirection: 'DESC',
      searchableFieldKeys: fields.slice(0, 10).map(({ key }) => key),
    },
  };
}

function valuesFor(recordIndex) {
  return Object.fromEntries(
    fields.map((field, fieldIndex) => {
      switch (field.type) {
        case 'INTEGER':
          return [field.key, recordIndex * 1_000 + fieldIndex];
        case 'BOOLEAN':
          return [field.key, fieldIndex % 2 === 0];
        case 'DATE':
          return [field.key, `2026-09-${String((fieldIndex % 28) + 1).padStart(2, '0')}`];
        case 'SELECT':
          return [field.key, fieldIndex % 2 === 0 ? 'option-a' : 'option-b'];
        default:
          return [field.key, `record-${recordIndex}-field-${fieldIndex}`];
      }
    }),
  );
}

async function createDraft(baseUrl, token, entityKey, title, reason) {
  return request(baseUrl, '/api/v1/configuration/change-sets', {
    token,
    method: 'POST',
    body: {
      definition: definitionFor(entityKey, title),
      reason,
      idempotencyKey: `performance-draft-${randomBytes(12).toString('hex')}`,
    },
    expected: [201],
  });
}

async function publishAndActivate(baseUrl, authorToken, reviewerToken, entityKey, label) {
  const lifecycleStartedAt = performance.now();
  const draft = await createDraft(
    baseUrl,
    authorToken,
    entityKey,
    `${label} high-field form`,
    `Create ${label} performance profile`,
  );
  const submitted = await request(baseUrl, `/api/v1/configuration/change-sets/${draft.id}/submit`, {
    token: authorToken,
    method: 'POST',
    body: { reason: `Submit ${label} performance profile`, expectedVersion: draft.version },
    expected: [200],
  });
  const approved = await request(baseUrl, `/api/v1/configuration/change-sets/${draft.id}/approve`, {
    token: reviewerToken,
    method: 'POST',
    body: { reason: `Review ${label} performance profile`, expectedVersion: submitted.version },
    expected: [200],
  });
  const published = await request(baseUrl, `/api/v1/configuration/change-sets/${draft.id}/publish`, {
    token: reviewerToken,
    method: 'POST',
    body: { reason: `Publish ${label} performance profile`, expectedVersion: approved.version },
    expected: [200],
  });
  await request(baseUrl, '/api/v1/configuration/activations', {
    token: reviewerToken,
    method: 'POST',
    body: {
      publishedVersionId: published.id,
      environmentKey: 'local-uat',
      cohortKey: 'all-users',
      reason: `Activate ${label} performance profile`,
      idempotencyKey: `performance-activation-${randomBytes(12).toString('hex')}`,
    },
    expected: [201],
  });
  return { published, lifecycleDurationMs: performance.now() - lifecycleStartedAt };
}

function runtimeManifestPath(entityKey) {
  const query = new URLSearchParams({
    moduleKey: 'tenant-apps',
    entityKey,
    surfaceKey: 'custom-form',
    environmentKey: 'local-uat',
    cohortKey: 'all-users',
  });
  return `/api/v1/configuration/runtime/manifest?${query}`;
}

function percentile(sorted, ratio) {
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

function latencySummary(samples) {
  assert.ok(samples.length > 0, 'At least one latency sample is required.');
  const sorted = samples.map((value) => Number(value)).sort((a, b) => a - b);
  const rounded = (value) => Number(value.toFixed(3));
  return {
    count: sorted.length,
    minMs: rounded(sorted[0]),
    meanMs: rounded(sorted.reduce((total, value) => total + value, 0) / sorted.length),
    p50Ms: rounded(percentile(sorted, 0.5)),
    p95Ms: rounded(percentile(sorted, 0.95)),
    p99Ms: rounded(percentile(sorted, 0.99)),
    maxMs: rounded(sorted[sorted.length - 1]),
  };
}

async function runBounded(count, concurrency, operation) {
  const results = new Array(count);
  let next = 0;
  const workers = Array.from({ length: Math.min(count, concurrency) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= count) return;
      results[index] = await operation(index);
    }
  });
  await Promise.all(workers);
  return results;
}

function assertReadBudget(label, summary) {
  assert.ok(
    summary.p95Ms < PROVISIONAL_READ_BUDGET_MS,
    `${label} p95 ${summary.p95Ms}ms exceeded the provisional ${PROVISIONAL_READ_BUDGET_MS}ms read budget.`,
  );
}

try {
  const serverVersionNumber = Number(await sql(configuredUrl, 'SHOW server_version_num'));
  assert.ok(
    serverVersionNumber >= 160000 && serverVersionNumber < 170000,
    `Expected PostgreSQL 16, got ${serverVersionNumber}`,
  );
  const serverVersion = await sql(configuredUrl, 'SHOW server_version');
  await sql(configuredUrl, `CREATE DATABASE ${quoteIdentifier(certificationDatabaseName)}`);
  databaseCreated = true;
  const certUrl = databaseUrl(certificationDatabaseName);
  await run('pnpm', ['--dir', 'packages/db', 'db:migrate'], {
    env: { ...process.env, DATABASE_URL: certUrl, NODE_ENV: 'test' },
  });
  const migrationCount = Number(
    await sql(certUrl, 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'),
  );

  process.env.DATABASE_URL = certUrl;
  ({ prisma } = await import('../../../packages/db/dist/index.js'));
  const { hashPassword } = await import('../../../packages/auth-core/dist/index.js');
  const password = `Uat-${randomBytes(20).toString('base64url')}!`;
  const passwordHash = await hashPassword(password);
  const [author, reviewer] = await prisma.$transaction([
    prisma.user.create({
      data: {
        email: `uat.config.performance.author.${suffix}@gigalibs.invalid`,
        name: 'Performance certification author',
        passwordHash,
        status: 'ACTIVE',
      },
    }),
    prisma.user.create({
      data: {
        email: `uat.config.performance.reviewer.${suffix}@gigalibs.invalid`,
        name: 'Performance certification reviewer',
        passwordHash,
        status: 'ACTIVE',
      },
    }),
  ]);

  const createTenant = (slug, name) =>
    prisma.tenant.create({
      data: {
        slug,
        name,
        status: 'ACTIVE',
        features: ['dynamic-forms'],
        settings: {
          create: {
            branding: {},
            security: { enforceMfa: false },
            localization: {},
            features: {},
            metadata: { testAttributable: true, certification: 'WI-OI-039-performance' },
            updatedById: author.id,
          },
        },
      },
    });
  const [primaryTenant, neighborTenant] = await Promise.all([
    createTenant(`uat-config-perf-primary-${suffix}`.slice(0, 63), 'UAT primary performance tenant'),
    createTenant(`uat-config-perf-neighbor-${suffix}`.slice(0, 63), 'UAT noisy-neighbor tenant'),
  ]);
  await prisma.tenantMember.createMany({
    data: [primaryTenant, neighborTenant].flatMap((tenant) => [
      { tenantId: tenant.id, userId: author.id, role: 'TENANT_ADMIN' },
      { tenantId: tenant.id, userId: reviewer.id, role: 'TENANT_ADMIN' },
    ]),
  });

  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  apiProcess = startApi(port, certUrl);
  await waitForHealth(apiProcess, baseUrl);

  const [primaryAuthorToken, primaryReviewerToken, neighborAuthorToken, neighborReviewerToken] =
    await Promise.all([
      tenantToken(baseUrl, author.email, password, primaryTenant.id),
      tenantToken(baseUrl, reviewer.email, password, primaryTenant.id),
      tenantToken(baseUrl, author.email, password, neighborTenant.id),
      tenantToken(baseUrl, reviewer.email, password, neighborTenant.id),
    ]);

  const primaryEntityKey = 'performance-primary-record';
  const neighborEntityKey = 'performance-neighbor-record';
  const primaryLifecycle = await publishAndActivate(
    baseUrl,
    primaryAuthorToken,
    primaryReviewerToken,
    primaryEntityKey,
    'Primary tenant',
  );
  const neighborLifecycle = await publishAndActivate(
    baseUrl,
    neighborAuthorToken,
    neighborReviewerToken,
    neighborEntityKey,
    'Neighbor tenant',
  );
  assert.equal(primaryLifecycle.published.manifest.fields.length, FIELD_COUNT);
  assert.equal(neighborLifecycle.published.manifest.fields.length, FIELD_COUNT);

  await stopApi(apiProcess);
  apiProcess = startApi(port, certUrl);
  await waitForHealth(apiProcess, baseUrl);

  const primaryManifestPath = runtimeManifestPath(primaryEntityKey);
  const coldManifest = await timedRequest(baseUrl, primaryManifestPath, {
    token: primaryAuthorToken,
    expected: [200],
  });
  assert.equal(coldManifest.payload.manifest.fields.length, FIELD_COUNT);
  for (let index = 0; index < WARMUP_READ_COUNT; index += 1) {
    const warmup = await request(baseUrl, primaryManifestPath, {
      token: primaryAuthorToken,
      expected: [200],
    });
    assert.equal(warmup.checksum, primaryLifecycle.published.checksum);
  }
  const warmManifestReads = await runBounded(
    WARM_MANIFEST_READ_COUNT,
    READ_CONCURRENCY,
    () =>
      timedRequest(baseUrl, primaryManifestPath, {
        token: primaryAuthorToken,
        expected: [200],
      }),
  );
  for (const result of warmManifestReads) {
    assert.equal(result.payload.checksum, primaryLifecycle.published.checksum);
    assert.equal(result.payload.manifest.fields.length, FIELD_COUNT);
  }
  const warmManifestSummary = latencySummary(warmManifestReads.map(({ durationMs }) => durationMs));
  assertReadBudget('Warm manifest read', warmManifestSummary);

  const competingDraft = await createDraft(
    baseUrl,
    primaryAuthorToken,
    'performance-concurrent-edit',
    'Concurrent edit baseline',
    'Create competing-edit performance draft',
  );
  const mixedResults = await Promise.all([
    runBounded(MIXED_MANIFEST_READ_COUNT, READ_CONCURRENCY, () =>
      timedRequest(baseUrl, primaryManifestPath, {
        token: primaryAuthorToken,
        expected: [200],
      }),
    ),
    Promise.all(
      Array.from({ length: CONCURRENT_EDIT_COUNT }, (_, index) =>
        timedRequest(baseUrl, `/api/v1/configuration/change-sets/${competingDraft.id}`, {
          token: index % 2 === 0 ? primaryAuthorToken : primaryReviewerToken,
          method: 'PATCH',
          body: {
            definition: definitionFor(
              'performance-concurrent-edit',
              `Concurrent edit contender ${index}`,
            ),
            reason: `Competing author edit ${index}`,
            expectedVersion: competingDraft.version,
          },
          expected: [200, 409],
        }),
      ),
    ),
  ]);
  const [mixedReads, competingEdits] = mixedResults;
  const successfulEdits = competingEdits.filter(({ status }) => status === 200);
  const conflictedEdits = competingEdits.filter(({ status }) => status === 409);
  assert.equal(successfulEdits.length, 1, 'Exactly one competing author must win.');
  assert.equal(conflictedEdits.length, CONCURRENT_EDIT_COUNT - 1);
  const mixedReadSummary = latencySummary(mixedReads.map(({ durationMs }) => durationMs));
  assertReadBudget('Manifest read during competing edits', mixedReadSummary);

  const primaryRecordCreates = await runBounded(
    PRIMARY_RECORD_COUNT,
    WRITE_CONCURRENCY,
    (index) =>
      timedRequest(baseUrl, `/api/v1/configuration/apps/${primaryEntityKey}/records`, {
        token: primaryAuthorToken,
        method: 'POST',
        body: {
          publishedVersionId: primaryLifecycle.published.id,
          values: valuesFor(index),
          reason: `Create primary performance record ${index}`,
          idempotencyKey: `performance-record-${randomBytes(12).toString('hex')}`,
        },
        expected: [201],
      }),
  );
  const primaryRecordCount = await prisma.configurationRecord.count({
    where: { tenantId: primaryTenant.id, entityKey: primaryEntityKey, deletedAt: null },
  });
  assert.equal(primaryRecordCount, PRIMARY_RECORD_COUNT);
  const projectionPath = `/api/v1/configuration/apps/${primaryEntityKey}/records?limit=${PRIMARY_RECORD_COUNT}`;
  const firstProjection = await request(baseUrl, projectionPath, {
    token: primaryAuthorToken,
    expected: [200],
  });
  assert.equal(firstProjection.records.length, PRIMARY_RECORD_COUNT);
  assert.equal(firstProjection.manifest.fields.length, FIELD_COUNT);
  assert.equal(firstProjection.columnKeys.length, 20);
  const projectionReads = await runBounded(PROJECTION_READ_COUNT, READ_CONCURRENCY, () =>
    timedRequest(baseUrl, projectionPath, {
      token: primaryAuthorToken,
      expected: [200],
    }),
  );
  for (const result of projectionReads) {
    assert.equal(result.payload.records.length, PRIMARY_RECORD_COUNT);
    assert.equal(result.payload.columnKeys.length, 20);
  }
  const projectionSummary = latencySummary(projectionReads.map(({ durationMs }) => durationMs));
  assertReadBudget('High-field projected record read', projectionSummary);

  const noisyNeighborResults = await Promise.all([
    runBounded(NOISY_NEIGHBOR_READ_COUNT, READ_CONCURRENCY, () =>
      timedRequest(baseUrl, projectionPath, {
        token: primaryAuthorToken,
        expected: [200],
      }),
    ),
    runBounded(NEIGHBOR_RECORD_COUNT, WRITE_CONCURRENCY, (index) =>
      timedRequest(baseUrl, `/api/v1/configuration/apps/${neighborEntityKey}/records`, {
        token: neighborAuthorToken,
        method: 'POST',
        body: {
          publishedVersionId: neighborLifecycle.published.id,
          values: valuesFor(PRIMARY_RECORD_COUNT + index),
          reason: `Create noisy-neighbor performance record ${index}`,
          idempotencyKey: `performance-neighbor-${randomBytes(12).toString('hex')}`,
        },
        expected: [201],
      }),
    ),
  ]);
  const [protectedTenantReads, neighborWrites] = noisyNeighborResults;
  const neighborRecordCount = await prisma.configurationRecord.count({
    where: { tenantId: neighborTenant.id, entityKey: neighborEntityKey, deletedAt: null },
  });
  assert.equal(neighborRecordCount, NEIGHBOR_RECORD_COUNT);
  const protectedTenantSummary = latencySummary(
    protectedTenantReads.map(({ durationMs }) => durationMs),
  );
  assertReadBudget('Primary-tenant projection under neighbor writes', protectedTenantSummary);

  const auditCount = await prisma.auditLog.count({
    where: { tenantId: { in: [primaryTenant.id, neighborTenant.id] } },
  });
  const outboxCount = await prisma.controlOutboxEvent.count({
    where: { tenantId: { in: [primaryTenant.id, neighborTenant.id] } },
  });
  assert.ok(auditCount >= PRIMARY_RECORD_COUNT + NEIGHBOR_RECORD_COUNT);
  assert.ok(outboxCount >= PRIMARY_RECORD_COUNT + NEIGHBOR_RECORD_COUNT);

  evidence = {
    recordedAt: new Date().toISOString(),
    environment: 'isolated-local-uat',
    certification: 'WI-OI-039-configuration-studio-performance',
    acceptanceStatus: 'LOCAL_BASELINE_MEASUREMENT_ONLY',
    releaseAcceptance: false,
    budgetQualification:
      'Read assertions apply the global NFR-PERF-002 p95-under-2-seconds baseline provisionally; independent reviewers must still accept the representative deployment profiles and resource envelope.',
    databaseEngine: serverVersion,
    migrationCount,
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      logicalCpuCount: cpus().length,
      apiReplicaCount: 1,
      databaseReadModel: 'authoritative-postgresql-per-request',
    },
    profile: {
      tenantCount: 2,
      fieldCount: FIELD_COUNT,
      requiredFieldCount: fields.filter(({ required }) => required).length,
      sectionCount: 3,
      projectedColumnCount: 20,
      primaryRecordCount: PRIMARY_RECORD_COUNT,
      noisyNeighborRecordCount: NEIGHBOR_RECORD_COUNT,
      warmupReadCount: WARMUP_READ_COUNT,
      warmManifestReadCount: WARM_MANIFEST_READ_COUNT,
      mixedManifestReadCount: MIXED_MANIFEST_READ_COUNT,
      concurrentEditCount: CONCURRENT_EDIT_COUNT,
      projectionReadCount: PROJECTION_READ_COUNT,
      noisyNeighborReadCount: NOISY_NEIGHBOR_READ_COUNT,
      readConcurrency: READ_CONCURRENCY,
      writeConcurrency: WRITE_CONCURRENCY,
      provisionalReadBudgetMs: PROVISIONAL_READ_BUDGET_MS,
    },
    measurements: {
      primaryLifecycleMs: Number(primaryLifecycle.lifecycleDurationMs.toFixed(3)),
      neighborLifecycleMs: Number(neighborLifecycle.lifecycleDurationMs.toFixed(3)),
      coldManifestReadMs: Number(coldManifest.durationMs.toFixed(3)),
      warmManifestReads: warmManifestSummary,
      manifestReadsDuringCompetingEdits: mixedReadSummary,
      competingEdits: {
        ...latencySummary(competingEdits.map(({ durationMs }) => durationMs)),
        successful: successfulEdits.length,
        conflicts: conflictedEdits.length,
      },
      primaryRecordCreates: latencySummary(
        primaryRecordCreates.map(({ durationMs }) => durationMs),
      ),
      projectedRecordReads: projectionSummary,
      primaryReadsDuringNeighborWrites: protectedTenantSummary,
      neighborRecordCreates: latencySummary(neighborWrites.map(({ durationMs }) => durationMs)),
    },
    persistence: {
      primaryRecordCount,
      neighborRecordCount,
      auditCount,
      outboxCount,
    },
    outcomes: [
      '250-field-contract-and-registered-surface-accepted',
      'cold-and-warm-runtime-manifest-read-through-authoritative-postgresql',
      'warm-manifest-p95-below-provisional-two-second-read-budget',
      'exactly-one-winner-for-concurrent-250-field-author-edits',
      'manifest-reads-remained-below-provisional-budget-during-competing-edits',
      '100-persisted-250-field-records-returned-with-20-column-projection',
      'projected-record-read-p95-below-provisional-two-second-read-budget',
      'primary-tenant-read-p95-below-provisional-budget-during-second-tenant-writes',
      'record-writes-created-durable-audit-and-outbox-evidence',
    ],
    outcomeCount: 9,
    limitations: [
      'Local single-API-replica measurements are not cloud or customer-managed profile acceptance.',
      'No independent performance reviewer has accepted this machine or workload as representative.',
      'Write latency is measured but has no approved Configuration Studio-specific SLO in the baseline.',
      'This run does not exercise browser rendering, projection index backfill, database failover, worker loss or downstream-provider faults.',
    ],
    certificationDatabaseRetained: false,
    rawCredentialsPersistedInEvidence: false,
    businessDataPersistedInEvidence: false,
    durationMs: Date.now() - startedAt.getTime(),
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
    assert.equal(retainedCount, 0, 'Performance-certification database cleanup was not verified.');
  }
}

assert.ok(evidence, 'Performance certification did not produce evidence.');
if (evidencePath) {
  const target = resolve(repositoryRoot, evidencePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}
console.log(JSON.stringify(evidence, null, 2));
