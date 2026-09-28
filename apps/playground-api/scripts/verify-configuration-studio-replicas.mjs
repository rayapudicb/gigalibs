import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const applicationRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(applicationRoot, '../..');

try {
  process.loadEnvFile?.(resolve(repositoryRoot, '.env'));
} catch {}

if (process.env.NODE_ENV === 'production') {
  throw new Error('Configuration Studio replica certification must not run in production.');
}

const configuredUrl = process.env.DATABASE_URL?.trim();
if (!configuredUrl) throw new Error('DATABASE_URL is required.');
const baseDatabaseUrl = new URL(configuredUrl);
if (!['postgres:', 'postgresql:'].includes(baseDatabaseUrl.protocol)) {
  throw new Error('DATABASE_URL must use PostgreSQL.');
}
if (!['127.0.0.1', 'localhost', '::1'].includes(baseDatabaseUrl.hostname)) {
  throw new Error('Replica certification requires an explicitly local PostgreSQL endpoint.');
}
if (!existsSync(resolve(applicationRoot, 'dist/main.js'))) {
  throw new Error('Build apps/playground-api before running replica certification.');
}

const suffix = `${Date.now()}_${randomBytes(4).toString('hex')}`;
const certificationDatabaseName = `gigalibs_configuration_cert_replicas_${suffix}`;
const evidencePath = process.env.CONFIGURATION_REPLICA_EVIDENCE_PATH?.trim();
const metricsToken = randomBytes(48).toString('base64url');
const startedAt = new Date();
const childLogs = new Map();
const children = new Set();
let prisma;
let databaseCreated = false;

function databaseUrl(name) {
  const value = new URL(baseDatabaseUrl);
  value.pathname = `/${name}`;
  value.searchParams.delete('schema');
  return value.toString();
}

function quoteIdentifier(value) {
  if (!/^gigalibs_configuration_cert_replicas_[a-z0-9_]{8,}$/i.test(value)) {
    throw new Error('Unsafe replica-certification database identifier.');
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

function boundedLog(label, stream, chunk) {
  const existing = childLogs.get(label) ?? '';
  const next = `${existing}${stream}: ${String(chunk)}`;
  childLogs.set(label, next.slice(-12_000));
}

function startReplica(label, port, certUrl) {
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: applicationRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      API_HOST: '127.0.0.1',
      API_PORT: String(port),
      DATABASE_URL: certUrl,
      OBSERVABILITY_METRICS_TOKEN: metricsToken,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => boundedLog(label, 'stdout', chunk));
  child.stderr.on('data', (chunk) => boundedLog(label, 'stderr', chunk));
  child.once('exit', () => children.delete(child));
  return child;
}

async function stopReplica(child) {
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

async function waitForHealth(label, child, baseUrl) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`${label} exited before readiness.\n${childLogs.get(label) ?? ''}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/v1/health`);
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`${label} did not become ready.\n${childLogs.get(label) ?? ''}`);
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
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
  }
  assert.equal(response.status, expected, `${method} ${path}: ${raw}`);
  return payload;
}

async function tenantToken(baseUrl, email, password, tenantId) {
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

async function createPublishedVersion({ baseUrl, authorToken, reviewerToken, title, fields }) {
  const definition = {
    contractVersion: '1.0',
    moduleKey: 'tenant-settings',
    entityKey: 'tenant-profile',
    surfaceKey: 'profile-extension',
    mode: 'EDIT',
    title,
    fields,
    sections: [
      {
        key: 'replica-certification',
        title: 'Replica certification',
        columns: 1,
        fieldKeys: fields.map((field) => field.key),
      },
    ],
  };
  const draft = await request(baseUrl, '/api/v1/configuration/change-sets', {
    token: authorToken,
    method: 'POST',
    body: {
      definition,
      reason: 'Two-replica convergence certification',
      idempotencyKey: `replica-draft-${randomBytes(12).toString('hex')}`,
    },
    expected: 201,
  });
  const submitted = await request(baseUrl, `/api/v1/configuration/change-sets/${draft.id}/submit`, {
    token: authorToken,
    method: 'POST',
    body: { reason: 'Submit replica certification version', expectedVersion: draft.version },
  });
  const approved = await request(baseUrl, `/api/v1/configuration/change-sets/${draft.id}/approve`, {
    token: reviewerToken,
    method: 'POST',
    body: {
      reason: 'Independent approval for replica certification',
      expectedVersion: submitted.version,
    },
  });
  return request(baseUrl, `/api/v1/configuration/change-sets/${draft.id}/publish`, {
    token: reviewerToken,
    method: 'POST',
    body: { reason: 'Publish replica certification version', expectedVersion: approved.version },
  });
}

async function activate(baseUrl, token, publishedVersionId) {
  return request(baseUrl, '/api/v1/configuration/activations', {
    token,
    method: 'POST',
    body: {
      publishedVersionId,
      environmentKey: 'local-uat',
      cohortKey: 'all-users',
      reason: 'Activate during two-replica convergence certification',
      idempotencyKey: `replica-activate-${randomBytes(12).toString('hex')}`,
    },
    expected: 201,
  });
}

async function runtimeManifest(baseUrl, token) {
  return request(
    baseUrl,
    '/api/v1/configuration/runtime/manifest?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension&environmentKey=local-uat&cohortKey=all-users',
    { token },
  );
}

async function scrapeMetrics(baseUrl) {
  const response = await fetch(`${baseUrl}/api/v1/internal/metrics`, {
    headers: { Authorization: `Bearer ${metricsToken}` },
  });
  const body = await response.text();
  assert.equal(response.status, 200, body);
  return body;
}

function metricValue(body, series) {
  const line = body.split('\n').find((candidate) => candidate.startsWith(`${series} `));
  assert.ok(line, `Metrics scrape is missing ${series}.`);
  const value = Number(line.slice(series.length + 1));
  assert.ok(Number.isFinite(value), `Metrics series ${series} is not numeric.`);
  return value;
}

async function waitForManifest(baseUrl, token, expectedChecksum) {
  const deadline = Date.now() + 15_000;
  let latest;
  while (Date.now() < deadline) {
    latest = await runtimeManifest(baseUrl, token);
    if (latest.checksum === expectedChecksum) return latest;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(
    `Replica manifest did not converge to ${expectedChecksum}; latest was ${latest?.checksum}.`,
  );
}

async function waitForPublishedOutbox(tenantId, expectedMinimum) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const count = await prisma.controlOutboxEvent.count({
      where: {
        tenantId,
        eventType: {
          in: ['configuration.activation.changed.v1', 'configuration.activation.rolled-back.v1'],
        },
        status: 'PUBLISHED',
      },
    });
    if (count >= expectedMinimum) return count;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error('Configuration activation outbox events did not reach PUBLISHED in time.');
}

let replicaA;
let replicaB;
let evidence;

try {
  const serverVersion = Number(await sql(configuredUrl, 'SHOW server_version_num'));
  assert.ok(
    serverVersion >= 160000 && serverVersion < 170000,
    `Expected PostgreSQL 16, got ${serverVersion}`,
  );
  await sql(configuredUrl, `CREATE DATABASE ${quoteIdentifier(certificationDatabaseName)}`);
  databaseCreated = true;
  const certUrl = databaseUrl(certificationDatabaseName);
  await run('pnpm', ['--dir', 'packages/db', 'db:migrate'], {
    env: { ...process.env, DATABASE_URL: certUrl, NODE_ENV: 'test' },
  });
  process.env.DATABASE_URL = certUrl;
  ({ prisma } = await import('../../../packages/db/dist/index.js'));
  const { hashPassword } = await import('../../../packages/auth-core/dist/index.js');

  const password = `Uat-${randomBytes(20).toString('base64url')}!`;
  const passwordHash = await hashPassword(password);
  const [author, reviewer] = await prisma.$transaction([
    prisma.user.create({
      data: {
        email: `uat.config.replica.author.${suffix}@gigalibs.invalid`,
        name: 'Replica certification author',
        passwordHash,
        status: 'ACTIVE',
      },
    }),
    prisma.user.create({
      data: {
        email: `uat.config.replica.reviewer.${suffix}@gigalibs.invalid`,
        name: 'Replica certification reviewer',
        passwordHash,
        status: 'ACTIVE',
      },
    }),
  ]);
  const tenant = await prisma.tenant.create({
    data: {
      slug: `uat-config-replicas-${suffix}`.slice(0, 63),
      name: 'UAT Configuration Replica Tenant',
      status: 'ACTIVE',
      features: ['dynamic-forms'],
      settings: {
        create: {
          branding: {},
          security: { enforceMfa: false },
          localization: {},
          features: {},
          metadata: { testAttributable: true },
          updatedById: author.id,
        },
      },
    },
  });
  await prisma.tenantMember.createMany({
    data: [
      { tenantId: tenant.id, userId: author.id, role: 'TENANT_ADMIN' },
      { tenantId: tenant.id, userId: reviewer.id, role: 'TENANT_ADMIN' },
    ],
  });

  const [portA, portB] = await Promise.all([allocatePort(), allocatePort()]);
  assert.notEqual(portA, portB);
  const baseUrlA = `http://127.0.0.1:${portA}`;
  const baseUrlB = `http://127.0.0.1:${portB}`;
  replicaA = startReplica('replica-a', portA, certUrl);
  replicaB = startReplica('replica-b', portB, certUrl);
  await Promise.all([
    waitForHealth('replica-a', replicaA, baseUrlA),
    waitForHealth('replica-b', replicaB, baseUrlB),
  ]);

  const [authorTokenA, reviewerTokenA, authorTokenB, reviewerTokenB] = await Promise.all([
    tenantToken(baseUrlA, author.email, password, tenant.id),
    tenantToken(baseUrlA, reviewer.email, password, tenant.id),
    tenantToken(baseUrlB, author.email, password, tenant.id),
    tenantToken(baseUrlB, reviewer.email, password, tenant.id),
  ]);
  const firstFields = [
    {
      key: 'replica-site',
      label: 'Replica site',
      type: 'TEXT',
      component: 'text-input',
      required: false,
      readOnly: false,
      classification: 'INTERNAL',
    },
  ];
  const first = await createPublishedVersion({
    baseUrl: baseUrlA,
    authorToken: authorTokenA,
    reviewerToken: reviewerTokenB,
    title: 'Replica certification v1',
    fields: firstFields,
  });
  await activate(baseUrlA, reviewerTokenA, first.id);
  const firstFromB = await waitForManifest(baseUrlB, authorTokenB, first.checksum);
  assert.equal(firstFromB.checksum, first.checksum);
  assert.equal(firstFromB.publishedVersionId, first.id);
  await runtimeManifest(baseUrlB, authorTokenB);

  const second = await createPublishedVersion({
    baseUrl: baseUrlA,
    authorToken: authorTokenA,
    reviewerToken: reviewerTokenA,
    title: 'Replica certification v2',
    fields: [
      ...firstFields,
      {
        key: 'replica-region',
        label: 'Replica region',
        type: 'TEXT',
        component: 'text-input',
        required: false,
        readOnly: false,
        classification: 'INTERNAL',
      },
    ],
  });
  assert.notEqual(second.checksum, first.checksum);
  await activate(baseUrlA, reviewerTokenA, second.id);
  const secondFromA = await runtimeManifest(baseUrlA, authorTokenA);
  assert.equal(secondFromA.checksum, second.checksum);
  const secondFromOnlineB = await waitForManifest(baseUrlB, authorTokenB, second.checksum);
  assert.equal(secondFromOnlineB.publishedVersionId, second.id);
  const onlineReplicaBMetrics = await scrapeMetrics(baseUrlB);
  assert.equal(
    metricValue(onlineReplicaBMetrics, 'gigalibs_configuration_manifest_listener_connected'),
    1,
  );
  assert.ok(
    metricValue(
      onlineReplicaBMetrics,
      'gigalibs_configuration_manifest_cache_requests_total{result="hit"}',
    ) >= 1,
  );
  assert.ok(
    metricValue(
      onlineReplicaBMetrics,
      'gigalibs_configuration_manifest_consumer_notifications_total{result="applied"}',
    ) >= 2,
  );

  await stopReplica(replicaB);
  replicaB = undefined;
  const third = await createPublishedVersion({
    baseUrl: baseUrlA,
    authorToken: authorTokenA,
    reviewerToken: reviewerTokenA,
    title: 'Replica certification v3',
    fields: [
      ...firstFields,
      {
        key: 'replica-country',
        label: 'Replica country',
        type: 'TEXT',
        component: 'text-input',
        required: false,
        readOnly: false,
        classification: 'INTERNAL',
      },
    ],
  });
  assert.notEqual(third.checksum, second.checksum);
  await activate(baseUrlA, reviewerTokenA, third.id);
  const thirdFromA = await runtimeManifest(baseUrlA, authorTokenA);
  assert.equal(thirdFromA.checksum, third.checksum);

  replicaB = startReplica('replica-b-restarted', portB, certUrl);
  await waitForHealth('replica-b-restarted', replicaB, baseUrlB);
  const thirdFromRestartedB = await runtimeManifest(baseUrlB, authorTokenB);
  assert.equal(thirdFromRestartedB.checksum, third.checksum);
  assert.equal(thirdFromRestartedB.publishedVersionId, third.id);

  await request(baseUrlB, '/api/v1/configuration/activations/rollback', {
    token: reviewerTokenB,
    method: 'POST',
    body: {
      publishedVersionId: first.id,
      environmentKey: 'local-uat',
      cohortKey: 'all-users',
      reason: 'Rollback through replica B during convergence certification',
      idempotencyKey: `replica-rollback-${randomBytes(12).toString('hex')}`,
    },
    expected: 201,
  });
  const rolledBackFromA = await waitForManifest(baseUrlA, authorTokenA, first.checksum);
  assert.equal(rolledBackFromA.checksum, first.checksum);
  assert.equal(rolledBackFromA.publishedVersionId, first.id);
  const publishedActivationEvents = await waitForPublishedOutbox(tenant.id, 4);
  const replicaAMetrics = await scrapeMetrics(baseUrlA);
  const replicaBMetrics = await scrapeMetrics(baseUrlB);
  const listenerConnected = {
    replicaA: metricValue(replicaAMetrics, 'gigalibs_configuration_manifest_listener_connected'),
    replicaB: metricValue(replicaBMetrics, 'gigalibs_configuration_manifest_listener_connected'),
  };
  assert.deepEqual(listenerConnected, { replicaA: 1, replicaB: 1 });
  const appliedNotifications = {
    replicaA: metricValue(
      replicaAMetrics,
      'gigalibs_configuration_manifest_consumer_notifications_total{result="applied"}',
    ),
    replicaB: metricValue(
      replicaBMetrics,
      'gigalibs_configuration_manifest_consumer_notifications_total{result="applied"}',
    ),
  };
  assert.ok(appliedNotifications.replicaA >= 1);
  assert.ok(appliedNotifications.replicaB >= 1);

  evidence = {
    recordedAt: new Date().toISOString(),
    environment: 'isolated-local-uat',
    databaseEngine: 'PostgreSQL 16',
    replicaCount: 2,
    databaseReadModel:
      'bounded-read-through-manifest-cache-with-authoritative-postgresql-resynchronization',
    cacheInvalidationRequired: true,
    manifestCacheMaxAgeSeconds: 30,
    listenerConnected,
    appliedNotifications,
    durationMs: Date.now() - startedAt.getTime(),
    publishedActivationEvents,
    certificationDatabaseRetained: false,
    rawCredentialsPersistedInEvidence: false,
    businessDataPersistedInEvidence: false,
    outcomes: [
      'two-api-replicas-ready-on-one-authoritative-database',
      'activation-on-replica-a-observed-on-online-cached-replica-b',
      'connected-replica-b-served-bounded-cache-hit',
      'postgresql-notification-invalidated-and-reconciled-replica-b-cache',
      'replica-b-offline-during-third-activation',
      'restarted-replica-b-resynchronized-from-authoritative-postgresql',
      'rollback-on-replica-b-invalidated-online-replica-a-cache',
      'both-replica-listeners-reported-connected-with-bounded-metrics',
      'activation-and-rollback-outbox-events-published',
    ],
    outcomeCount: 9,
    metricsTokenPersistedInEvidence: false,
  };
} catch (error) {
  const logs = [...childLogs].map(([label, value]) => `--- ${label} ---\n${value}`).join('\n');
  if (logs) console.error(logs);
  throw error;
} finally {
  await Promise.all([...children].map((child) => stopReplica(child)));
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
    assert.equal(retainedCount, 0, 'Replica-certification database cleanup was not verified.');
  }
}

assert.ok(evidence, 'Replica certification did not produce evidence.');
if (evidencePath) {
  const target = resolve(repositoryRoot, evidencePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}
console.log(JSON.stringify(evidence, null, 2));
