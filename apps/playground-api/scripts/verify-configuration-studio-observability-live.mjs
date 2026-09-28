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
  throw new Error(
    'Configuration Studio live-observability certification must not run in production.',
  );
}

const configuredUrl = process.env.DATABASE_URL?.trim();
if (!configuredUrl) throw new Error('DATABASE_URL is required.');
const baseDatabaseUrl = new URL(configuredUrl);
if (!['postgres:', 'postgresql:'].includes(baseDatabaseUrl.protocol)) {
  throw new Error('DATABASE_URL must use PostgreSQL.');
}
if (!['127.0.0.1', 'localhost', '::1'].includes(baseDatabaseUrl.hostname)) {
  throw new Error(
    'Live-observability certification requires an explicitly local PostgreSQL endpoint.',
  );
}
if (!existsSync(resolve(applicationRoot, 'dist/main.js'))) {
  throw new Error('Build apps/playground-api before running live-observability certification.');
}

const suffix = `${Date.now()}_${randomBytes(4).toString('hex')}`;
const certificationDatabaseName = `gigalibs_configuration_cert_observability_${suffix}`;
const evidencePath = process.env.CONFIGURATION_LIVE_OBSERVABILITY_EVIDENCE_PATH?.trim();
const metricsToken = randomBytes(32).toString('base64url');
const startedAt = new Date();
let databaseCreated = false;
let apiProcess;
let apiLog = '';
let evidence;

const configurationMetrics = {
  gigalibs_configuration_change_sets: 'gauge',
  gigalibs_configuration_activations: 'gauge',
  gigalibs_configuration_published_versions: 'gauge',
  gigalibs_configuration_records: 'gauge',
  gigalibs_configuration_outbox_events: 'gauge',
  gigalibs_configuration_outbox_oldest_pending_age_seconds: 'gauge',
  gigalibs_configuration_submitted_change_sets_older_than_24h: 'gauge',
  gigalibs_configuration_manifest_listener_connected: 'gauge',
  gigalibs_configuration_manifest_cache_entries: 'gauge',
  gigalibs_configuration_manifest_cache_requests_total: 'counter',
  gigalibs_configuration_manifest_consumer_notifications_total: 'counter',
  gigalibs_configuration_manifest_resynchronizations_total: 'counter',
  gigalibs_configuration_manifest_reconnects_total: 'counter',
};

function databaseUrl(name) {
  const value = new URL(baseDatabaseUrl);
  value.pathname = `/${name}`;
  value.searchParams.delete('schema');
  return value.toString();
}

function quoteIdentifier(value) {
  if (!/^gigalibs_configuration_cert_observability_[a-z0-9_]{8,}$/i.test(value)) {
    throw new Error('Unsafe live-observability certification database identifier.');
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
      OBSERVABILITY_METRICS_TOKEN: metricsToken,
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

  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  apiProcess = startApi(port, certUrl);
  await waitForHealth(apiProcess, baseUrl);

  const verifierRaw = await run(process.execPath, ['scripts/verify-observability.mjs'], {
    cwd: applicationRoot,
    capture: true,
    env: {
      ...process.env,
      API_URL: `${baseUrl}/api/v1`,
      OBSERVABILITY_METRICS_TOKEN: metricsToken,
    },
  });
  const verifier = JSON.parse(verifierRaw);
  assert.equal(verifier.status, 'passed');

  const response = await fetch(`${baseUrl}/api/v1/internal/metrics`, {
    headers: { Authorization: `Bearer ${metricsToken}` },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/plain/);
  const body = await response.text();
  assert.match(body, /gigalibs_metrics_collection_success\{collector="database"\} 1/);
  assert.doesNotMatch(body, /gigalibs_metrics_collection_success\{collector="database"\} 0/);
  for (const [metric, type] of Object.entries(configurationMetrics)) {
    assert.ok(body.includes(`# TYPE ${metric} ${type}`), `Live scrape is missing ${metric}.`);
  }
  assert.match(body, /gigalibs_configuration_published_versions 0/);
  assert.match(body, /gigalibs_configuration_records\{status="ACTIVE"\} 0/);
  assert.match(body, /gigalibs_configuration_records\{status="DELETED"\} 0/);
  assert.match(body, /gigalibs_configuration_outbox_oldest_pending_age_seconds 0/);
  assert.match(body, /gigalibs_configuration_submitted_change_sets_older_than_24h 0/);
  assert.match(body, /gigalibs_configuration_manifest_listener_connected 1/);
  assert.match(body, /gigalibs_configuration_manifest_cache_entries 0/);
  assert.match(body, /gigalibs_configuration_manifest_cache_requests_total\{result="bypass"\} 0/);
  assert.match(
    body,
    /gigalibs_configuration_manifest_consumer_notifications_total\{result="failed"\} 0/,
  );
  assert.doesNotMatch(body, /(?:tenantId|userId|recordId|eventId|sourceConnectionId)=/);

  evidence = {
    recordedAt: new Date().toISOString(),
    environment: 'isolated-local-uat',
    certification: 'WI-OI-039-configuration-studio-live-observability',
    acceptanceStatus: 'LOCAL_LIVE_SCRAPE_ONLY',
    releaseAcceptance: false,
    databaseEngine: serverVersion,
    migrationCount,
    apiReplicaCount: 1,
    configurationMetricCount: Object.keys(configurationMetrics).length,
    liveVerifierChecks: verifier.checks,
    outcomes: [
      'disposable-postgresql16-database-replayed-all-forward-migrations',
      'real-control-plane-api-started-with-one-run-dedicated-scraper-secret',
      'missing-and-invalid-scraper-credentials-rejected',
      'authenticated-prometheus-content-contract-returned',
      'database-collector-reported-current-success',
      'thirteen-configuration-metric-families-present-in-live-scrape',
      'manifest-invalidation-listener-reported-connected',
      'bounded-cache-and-consumer-counters-exported-without-high-cardinality-labels',
      'empty-database-configuration-gauges-reported-honest-zeroes',
      'route-cardinality-and-tenant-user-record-event-label-boundaries-passed',
    ],
    outcomeCount: 10,
    limitations: [
      'This is a local single-replica live scrape, not managed-cloud or customer-managed deployment evidence.',
      'Grafana dashboard import, Prometheus rule evaluation and fired-and-resolved notification delivery were not exercised.',
      'An independent operator has not executed the database, outbox and rollback runbook scenarios.',
    ],
    certificationDatabaseRetained: false,
    metricsTokenPersistedInEvidence: false,
    rawMetricsPersistedInEvidence: false,
    durationMs: Date.now() - startedAt.getTime(),
  };
} catch (error) {
  if (apiLog) console.error(apiLog);
  throw error;
} finally {
  await stopApi(apiProcess);
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
    assert.equal(retainedCount, 0, 'Live-observability certification database cleanup failed.');
  }
}

assert.ok(evidence, 'Live-observability certification did not produce evidence.');
if (evidencePath) {
  const target = resolve(repositoryRoot, evidencePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}
console.log(JSON.stringify(evidence, null, 2));
