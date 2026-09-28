import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const applicationRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(applicationRoot, '../..');

try {
  process.loadEnvFile?.(resolve(repositoryRoot, '.env'));
} catch {}

if (process.env.NODE_ENV === 'production') {
  throw new Error('Configuration Studio HTTP certification must not run in production.');
}

const configuredUrl = process.env.DATABASE_URL?.trim();
if (!configuredUrl) throw new Error('DATABASE_URL is required.');
const baseDatabaseUrl = new URL(configuredUrl);
if (!['postgres:', 'postgresql:'].includes(baseDatabaseUrl.protocol)) {
  throw new Error('DATABASE_URL must use PostgreSQL.');
}
if (!['127.0.0.1', 'localhost', '::1'].includes(baseDatabaseUrl.hostname)) {
  throw new Error('HTTP certification requires an explicitly local PostgreSQL endpoint.');
}
if (!existsSync(resolve(applicationRoot, 'dist/main.js'))) {
  throw new Error('Build apps/playground-api before running HTTP certification.');
}
const CONFIGURATION_OUTBOX_CHANNEL = 'gigalibs_configuration_events_v1';

const suffix = `${Date.now()}_${randomBytes(4).toString('hex')}`;
const certificationDatabaseName = `gigalibs_configuration_cert_http_${suffix}`;
const evidencePath = process.env.CONFIGURATION_HTTP_EVIDENCE_PATH?.trim();
const signingKey = generateKeyPairSync('ed25519').privateKey;
const oneRunEnvironment = {
  JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
  JWT_REFRESH_SECRET: randomBytes(48).toString('base64url'),
  CONTROL_PAYLOAD_KEY_VERSION: `cert-${suffix}`,
  CONTROL_PAYLOAD_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  CONTROL_PAYLOAD_PREVIOUS_KEYS_JSON: '{}',
  OBSERVABILITY_METRICS_TOKEN: randomBytes(48).toString('base64url'),
  CONTROL_OUTBOX_POLL_INTERVAL_SECONDS: '1',
  CONTROL_OUTBOX_CLAIM_TIMEOUT_SECONDS: '1',
  CONFIGURATION_PACKAGE_SIGNING_KEY_ID: `cert-${suffix}`,
  CONFIGURATION_PACKAGE_SIGNING_PRIVATE_KEY_BASE64: signingKey
    .export({ format: 'der', type: 'pkcs8' })
    .toString('base64'),
};
const startedAt = new Date();
let apiProcess;
let apiLog = '';
let databaseCreated = false;
let evidence;
let notificationClient;
const configurationNotifications = [];
const notificationErrors = [];

function databaseUrl(name) {
  const value = new URL(baseDatabaseUrl);
  value.pathname = `/${name}`;
  value.searchParams.delete('schema');
  return value.toString();
}

function quoteIdentifier(value) {
  if (!/^gigalibs_configuration_cert_http_[a-z0-9_]{8,}$/i.test(value)) {
    throw new Error('Unsafe HTTP-certification database identifier.');
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
  return run(
    'psql',
    [url, '--no-psqlrc', '--quiet', '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement],
    {
      capture: true,
    },
  );
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
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: applicationRoot,
    env: {
      ...process.env,
      ...oneRunEnvironment,
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

async function scrapeMetrics(baseUrl) {
  const response = await fetch(`${baseUrl}/api/v1/internal/metrics`, {
    headers: { Authorization: `Bearer ${oneRunEnvironment.OBSERVABILITY_METRICS_TOKEN}` },
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

function processedNotificationCount(body) {
  return ['applied', 'deduplicated', 'ignored', 'invalid', 'failed'].reduce(
    (total, result) =>
      total +
      metricValue(
        body,
        `gigalibs_configuration_manifest_consumer_notifications_total{result="${result}"}`,
      ),
    0,
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

  notificationClient = new Client({ connectionString: certUrl });
  notificationClient.on('notification', (message) => {
    if (message.channel !== CONFIGURATION_OUTBOX_CHANNEL || !message.payload) return;
    try {
      const envelope = JSON.parse(message.payload);
      assert.deepEqual(Object.keys(envelope).sort(), [
        'aggregateId',
        'attempt',
        'envelopeVersion',
        'eventId',
        'eventType',
        'tenantId',
      ]);
      assert.equal(envelope.envelopeVersion, '1.0');
      assert.match(envelope.eventId, /^[A-Za-z0-9_-]{1,200}$/);
      assert.match(envelope.tenantId, /^[A-Za-z0-9_-]{1,200}$/);
      assert.match(envelope.aggregateId, /^[A-Za-z0-9_-]{1,200}$/);
      assert.match(
        envelope.eventType,
        /^configuration\.[a-z0-9]+(?:[.-][a-z0-9]+)*\.v[1-9][0-9]*$/,
      );
      assert.ok(Number.isSafeInteger(envelope.attempt) && envelope.attempt >= 1);
      configurationNotifications.push(envelope);
    } catch (error) {
      notificationErrors.push(error instanceof Error ? error.message : String(error));
    }
  });
  notificationClient.on('error', (error) => notificationErrors.push(error.message));
  await notificationClient.connect();
  await notificationClient.query(`LISTEN ${CONFIGURATION_OUTBOX_CHANNEL}`);

  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  apiProcess = startApi(port, certUrl);
  await waitForHealth(apiProcess, baseUrl);

  const verifierRaw = await run(
    process.execPath,
    ['scripts/verify-configuration-studio-http.mjs'],
    {
      cwd: applicationRoot,
      capture: true,
      env: {
        ...process.env,
        ...oneRunEnvironment,
        NODE_ENV: 'test',
        DATABASE_URL: certUrl,
        CONTROL_PLANE_TEST_URL: baseUrl,
      },
    },
  );
  const verifier = JSON.parse(verifierRaw);
  assert.equal(verifier.certification, 'WI-OI-039-http-boundary');
  assert.ok(
    verifier.outcomes.includes('membership-user-and-tenant-suspension-denied'),
    'Suspension matrix evidence is missing.',
  );
  assert.ok(
    verifier.outcomes.includes(
      'database-role-downgrade-removes-authoring-but-preserves-viewer-runtime-read',
    ),
    'Role-downgrade matrix evidence is missing.',
  );
  assert.ok(
    verifier.outcomes.includes('live-java-11-http-bearer-runtime-manifest-decoded'),
    'Live Java HTTP client evidence is missing.',
  );
  assert.equal(verifier.javaHttpClient?.certification, 'WI-OI-039-java-live-http-client');
  assert.equal(verifier.javaHttpClient?.rawCredentialPersistedInEvidence, false);
  assert.equal(verifier.javaHttpClient?.releaseAcceptance, false);

  const publicationDeadline = Date.now() + 15_000;
  let publishedCandidate;
  while (Date.now() < publicationDeadline) {
    publishedCandidate = await sql(
      certUrl,
      `SELECT "id" || '|' || "eventId" || '|' || "attempts"::text
       FROM "control_outbox_events"
       WHERE "eventType" LIKE 'configuration.%' AND "status" = 'PUBLISHED'
       ORDER BY "createdAt" ASC
       LIMIT 1`,
    );
    if (publishedCandidate) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  assert.ok(publishedCandidate, 'No Configuration outbox event reached PUBLISHED state.');

  const [publishedRowId, publishedEventId, publishedAttemptsRaw] = publishedCandidate.split('|');
  assert.match(publishedRowId ?? '', /^[A-Za-z0-9_-]+$/);
  assert.match(publishedEventId ?? '', /^[A-Za-z0-9_-]+$/);
  const publishedAttempts = Number(publishedAttemptsRaw);
  assert.ok(Number.isInteger(publishedAttempts) && publishedAttempts >= 1);

  const firstReceiptDeadline = Date.now() + 5_000;
  while (
    Date.now() < firstReceiptDeadline &&
    !configurationNotifications.some(
      (notification) =>
        notification.eventId === publishedEventId && notification.attempt === publishedAttempts,
    )
  ) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  assert.deepEqual(notificationErrors, [], 'Configuration transport emitted an invalid envelope.');
  assert.ok(
    configurationNotifications.some(
      (notification) =>
        notification.eventId === publishedEventId && notification.attempt === publishedAttempts,
    ),
    'No PostgreSQL notification was received for the published Configuration event.',
  );
  const consumerProcessingDeadline = Date.now() + 5_000;
  let metricsBeforeReplay;
  while (Date.now() < consumerProcessingDeadline) {
    metricsBeforeReplay = await scrapeMetrics(baseUrl);
    if (processedNotificationCount(metricsBeforeReplay) >= configurationNotifications.length) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  assert.ok(metricsBeforeReplay, 'Configuration consumer metrics were not available.');
  assert.equal(
    metricValue(metricsBeforeReplay, 'gigalibs_configuration_manifest_listener_connected'),
    1,
  );
  const deduplicatedBeforeReplay = metricValue(
    metricsBeforeReplay,
    'gigalibs_configuration_manifest_consumer_notifications_total{result="deduplicated"}',
  );

  const staleClaim = await sql(
    certUrl,
    `UPDATE "control_outbox_events"
     SET "status" = 'PROCESSING',
         "claimedAt" = NOW() - INTERVAL '5 minutes',
         "publishedAt" = NULL,
         "lastErrorCode" = 'CERTIFICATION_STALE_CLAIM'
     WHERE "id" = '${publishedRowId}' AND "status" = 'PUBLISHED'
     RETURNING "id" || '|' || "attempts"::text`,
  );
  const [staleEventId, staleAttemptsRaw] = staleClaim.split('|');
  assert.match(staleEventId ?? '', /^[A-Za-z0-9_-]+$/);
  const staleAttempts = Number(staleAttemptsRaw);
  assert.ok(Number.isInteger(staleAttempts));

  const recoveryDeadline = Date.now() + 15_000;
  let recoveredAttempts;
  while (Date.now() < recoveryDeadline) {
    const state = await sql(
      certUrl,
      `SELECT "status" || '|' || "attempts"::text || '|' || COALESCE("lastErrorCode", '') || '|' || COALESCE("claimedAt"::text, '')
       FROM "control_outbox_events"
       WHERE "id" = '${staleEventId}'`,
    );
    const [status, attemptsRaw, lastErrorCode, claimedAt] = state.split('|');
    const attempts = Number(attemptsRaw);
    if (
      status === 'PUBLISHED' &&
      attempts > staleAttempts &&
      lastErrorCode === '' &&
      claimedAt === ''
    ) {
      recoveredAttempts = attempts;
      break;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  assert.ok(recoveredAttempts, 'The stale Configuration outbox claim did not recover.');
  const replayReceiptDeadline = Date.now() + 5_000;
  while (
    Date.now() < replayReceiptDeadline &&
    !configurationNotifications.some(
      (notification) =>
        notification.eventId === publishedEventId && notification.attempt === recoveredAttempts,
    )
  ) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  assert.deepEqual(notificationErrors, [], 'Configuration transport emitted an invalid envelope.');
  const eventReceipts = configurationNotifications.filter(
    (notification) => notification.eventId === publishedEventId,
  );
  assert.ok(
    eventReceipts.some((notification) => notification.attempt === recoveredAttempts),
    'No PostgreSQL notification was received for the replayed Configuration event.',
  );
  assert.ok(eventReceipts.length >= 2, 'The Configuration event was not delivered at least twice.');
  const consumerReplayDeadline = Date.now() + 5_000;
  let deduplicatedAfterReplay = deduplicatedBeforeReplay;
  while (Date.now() < consumerReplayDeadline) {
    const metrics = await scrapeMetrics(baseUrl);
    deduplicatedAfterReplay = metricValue(
      metrics,
      'gigalibs_configuration_manifest_consumer_notifications_total{result="deduplicated"}',
    );
    if (deduplicatedAfterReplay > deduplicatedBeforeReplay) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  assert.ok(
    deduplicatedAfterReplay > deduplicatedBeforeReplay,
    'The adopting manifest consumer did not deduplicate the replayed event.',
  );
  verifier.outcomes.push('configuration-outbox-postgresql-notify-receipt-verified');
  verifier.outcomes.push('stale-configuration-outbox-claim-recovered-and-republished');
  verifier.outcomes.push('adopting-manifest-consumer-deduplicated-successful-replay');

  const terminalRowId = `certfail_${randomBytes(12).toString('hex')}`;
  const terminalEventId = `certfail_${randomBytes(16).toString('hex')}`;
  const insertedTerminal = await sql(
    certUrl,
    `INSERT INTO "control_outbox_events"
       ("id", "eventId", "tenantId", "aggregateType", "aggregateId", "eventType", "payload")
     SELECT
       '${terminalRowId}',
       '${terminalEventId}',
       "tenantId",
       "aggregateType",
       "aggregateId",
       'configuration.invalid',
       '{"certification":"WI-OI-039-terminal-failure","testAttributable":true}'::jsonb
     FROM "control_outbox_events"
     WHERE "id" = '${publishedRowId}'
     RETURNING "id"`,
  );
  assert.equal(insertedTerminal, terminalRowId);

  const terminalDeadline = Date.now() + 15_000;
  let terminalFailureAttempts;
  while (Date.now() < terminalDeadline) {
    const state = await sql(
      certUrl,
      `SELECT "status" || '|' || "attempts"::text || '|' || COALESCE("lastErrorCode", '') || '|' || COALESCE("publishedAt"::text, '') || '|' || COALESCE("claimedAt"::text, '')
       FROM "control_outbox_events"
       WHERE "id" = '${terminalRowId}'`,
    );
    const [status, attemptsRaw, lastErrorCode, publishedAt, claimedAt] = state.split('|');
    if (
      status === 'FAILED' &&
      lastErrorCode === 'CONFIGURATION_EVENT_TYPE_INVALID' &&
      publishedAt === '' &&
      claimedAt === ''
    ) {
      terminalFailureAttempts = Number(attemptsRaw);
      break;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  assert.equal(terminalFailureAttempts, 1, 'The invalid Configuration event did not fail once.');
  const terminalAudit = await sql(
    certUrl,
    `SELECT ("after"->>'status') || '|' || ("after"->>'eventId') || '|' || ("after"->>'errorCode') || '|' || ("after"->>'attempts')
     FROM "audit_logs"
     WHERE "resource" = 'control-outbox-event' AND "resourceId" = '${terminalRowId}'
     ORDER BY "createdAt" DESC
     LIMIT 1`,
  );
  assert.equal(
    terminalAudit,
    `FAILED|${terminalEventId}|CONFIGURATION_EVENT_TYPE_INVALID|1`,
    'Terminal Configuration outbox failure audit is missing or incomplete.',
  );
  assert.equal(
    configurationNotifications.filter(({ eventId }) => eventId === terminalEventId).length,
    0,
    'A terminally invalid Configuration event emitted a notification.',
  );
  verifier.outcomes.push('invalid-configuration-outbox-event-failed-once-and-was-audited');

  evidence = {
    recordedAt: new Date().toISOString(),
    environment: 'isolated-local-uat',
    certification: verifier.certification,
    acceptanceStatus: 'LOCAL_HTTP_BOUNDARY_ONLY',
    releaseAcceptance: false,
    databaseEngine: serverVersion,
    migrationCount,
    apiReplicaCount: 1,
    configurationTransport: 'postgresql-notify',
    configurationTransportChannel: CONFIGURATION_OUTBOX_CHANNEL,
    configurationTransportReceiptCount: configurationNotifications.length,
    replayedEventReceiptCount: eventReceipts.length,
    terminalFailureAttempts,
    terminalFailureAuditVerified: true,
    manifestListenerConnected: true,
    manifestConsumerDeduplicatedReplayCount: deduplicatedAfterReplay,
    javaHttpClient: verifier.javaHttpClient,
    outcomes: verifier.outcomes,
    outcomeCount: verifier.outcomes.length,
    testData: verifier.testData,
    staleClaimRecoveryAttempts: recoveredAttempts,
    limitations: [
      'This is isolated local PostgreSQL and one control-plane API, not either claimed deployment profile.',
      'Named Security and QA reviewers have not independently accepted the authorization matrix.',
      'External identity-provider, SCIM and organization-specific custom-role interoperability remain outside this certification.',
      'The Java client leg proves authenticated loopback HTTP and rejects non-loopback cleartext; target-profile TLS/trust-chain behavior, consumer rendering and independent API/client acceptance remain outside this run.',
      'The transport check proves commit-coupled notification, adopting-consumer replay deduplication and audited permanent-envelope rejection; transaction-commit failure injection remains outside this run.',
    ],
    certificationDatabaseRetained: false,
    rawCredentialsPersistedInEvidence: false,
    durationMs: Date.now() - startedAt.getTime(),
  };
} catch (error) {
  if (apiLog) console.error(apiLog);
  throw error;
} finally {
  await stopApi(apiProcess);
  await notificationClient?.end().catch(() => undefined);
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
    assert.equal(retainedCount, 0, 'HTTP-certification database cleanup failed.');
  }
}

assert.ok(evidence, 'HTTP certification did not produce evidence.');
if (evidencePath) {
  const target = resolve(repositoryRoot, evidencePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}
console.log(JSON.stringify(evidence, null, 2));
