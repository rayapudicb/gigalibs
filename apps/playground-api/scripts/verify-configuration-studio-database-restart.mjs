import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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
  throw new Error(
    'Configuration Studio database-restart certification must not run in production.',
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
    'Database-restart certification requires an explicitly local PostgreSQL endpoint.',
  );
}
if (!existsSync(resolve(applicationRoot, 'dist/main.js'))) {
  throw new Error('Build apps/playground-api before running database-restart certification.');
}
const CONFIGURATION_OUTBOX_CHANNEL = 'gigalibs_configuration_events_v1';

const containerName = process.env.POSTGRES_CERT_CONTAINER?.trim() || 'gigalibs-postgres';
if (!/^gigalibs-postgres(?:-[a-z0-9_.-]+)?$/.test(containerName)) {
  throw new Error(
    'POSTGRES_CERT_CONTAINER must name a dedicated gigalibs-postgres certification service.',
  );
}

const suffix = `${Date.now()}_${randomBytes(4).toString('hex')}`;
const certificationDatabaseName = `gigalibs_configuration_cert_restart_${suffix}`;
const evidencePath = process.env.CONFIGURATION_RESTART_EVIDENCE_PATH?.trim();
const startedAt = new Date();
let databaseCreated = false;
let prisma;
let apiProcess;
let apiLog = '';
let evidence;
let notificationClient;
let faultNotificationClient;
const configurationNotifications = [];
const notificationErrors = [];
const interruptedTransactionNotifications = [];
const interruptedTransactionListenerErrors = [];

function databaseUrl(name) {
  const value = new URL(baseDatabaseUrl);
  value.pathname = `/${name}`;
  value.searchParams.delete('schema');
  return value.toString();
}

function quoteIdentifier(value) {
  if (!/^gigalibs_configuration_cert_restart_[a-z0-9_]{8,}$/i.test(value)) {
    throw new Error('Unsafe database-restart certification identifier.');
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

function docker(args) {
  return run('docker', args, { capture: true });
}

async function containerState() {
  const raw = await docker([
    'inspect',
    '--format',
    '{{.State.Status}}|{{.State.StartedAt}}|{{.Config.Image}}',
    containerName,
  ]);
  const [status, startedAtValue, image] = raw.split('|');
  return { status, startedAt: startedAtValue, image };
}

async function ensureContainerRunning() {
  const state = await containerState();
  if (state.status !== 'running') {
    await docker(['start', containerName]);
  }
}

async function waitForPostgres(url) {
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const version = Number(await sql(url, 'SHOW server_version_num'));
      if (version >= 160000 && version < 170000) return version;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`PostgreSQL did not recover after restart: ${lastError?.message ?? 'timeout'}`);
}

async function connectNotificationListener(
  url,
  notifications = configurationNotifications,
  errors = notificationErrors,
) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    const client = new Client({ connectionString: url });
    client.on('notification', (message) => {
      if (message.channel !== CONFIGURATION_OUTBOX_CHANNEL || !message.payload) return;
      try {
        const envelope = JSON.parse(message.payload);
        assert.equal(envelope.envelopeVersion, '1.0');
        assert.match(envelope.eventId, /^[A-Za-z0-9_-]{1,200}$/);
        assert.match(
          envelope.eventType,
          /^configuration\.[a-z0-9]+(?:[.-][a-z0-9]+)*\.v[1-9][0-9]*$/,
        );
        assert.ok(Number.isSafeInteger(envelope.attempt) && envelope.attempt >= 1);
        notifications.push(envelope);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${CONFIGURATION_OUTBOX_CHANNEL}`);
      client.on('error', (error) => errors.push(error.message));
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    }
  }
  throw new Error(
    `Configuration notification listener did not reconnect: ${lastError?.message ?? 'timeout'}`,
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
  apiLog = '';
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: applicationRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      API_HOST: '127.0.0.1',
      API_PORT: String(port),
      DATABASE_URL: certUrl,
      CONTROL_OUTBOX_POLL_INTERVAL_SECONDS: '10',
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

async function publishAndActivate(baseUrl, authorToken, reviewerToken) {
  const definition = {
    contractVersion: '1.0',
    moduleKey: 'tenant-settings',
    entityKey: 'tenant-profile',
    surfaceKey: 'profile-extension',
    mode: 'EDIT',
    title: 'Database restart certification profile',
    fields: [
      {
        key: 'restart-marker',
        label: 'Restart marker',
        type: 'TEXT',
        component: 'text-input',
        required: true,
        readOnly: false,
        classification: 'INTERNAL',
        maxLength: 200,
      },
    ],
    sections: [
      {
        key: 'restart-certification',
        title: 'Restart certification',
        columns: 1,
        fieldKeys: ['restart-marker'],
      },
    ],
  };
  const draft = await request(baseUrl, '/api/v1/configuration/change-sets', {
    token: authorToken,
    method: 'POST',
    body: {
      definition,
      reason: 'Create database restart certification version',
      idempotencyKey: `restart-draft-${randomBytes(12).toString('hex')}`,
    },
    expected: 201,
  });
  const submitted = await request(baseUrl, `/api/v1/configuration/change-sets/${draft.id}/submit`, {
    token: authorToken,
    method: 'POST',
    body: { reason: 'Submit database restart version', expectedVersion: draft.version },
  });
  const approved = await request(baseUrl, `/api/v1/configuration/change-sets/${draft.id}/approve`, {
    token: reviewerToken,
    method: 'POST',
    body: { reason: 'Approve database restart version', expectedVersion: submitted.version },
  });
  const published = await request(
    baseUrl,
    `/api/v1/configuration/change-sets/${draft.id}/publish`,
    {
      token: reviewerToken,
      method: 'POST',
      body: { reason: 'Publish database restart version', expectedVersion: approved.version },
    },
  );
  await request(baseUrl, '/api/v1/configuration/activations', {
    token: reviewerToken,
    method: 'POST',
    body: {
      publishedVersionId: published.id,
      environmentKey: 'local-uat',
      cohortKey: 'all-users',
      reason: 'Activate database restart version',
      idempotencyKey: `restart-activation-${randomBytes(12).toString('hex')}`,
    },
    expected: 201,
  });
  return published;
}

const manifestPath =
  '/api/v1/configuration/runtime/manifest?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension&environmentKey=local-uat&cohortKey=all-users';

async function probeDuringRestart(baseUrl, token, expectedChecksum, state) {
  while (!state.stop) {
    const observedAt = new Date().toISOString();
    try {
      const response = await fetch(`${baseUrl}${manifestPath}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(1_000),
      });
      const raw = await response.text();
      let checksum;
      if (response.status === 200) {
        const payload = JSON.parse(raw);
        checksum = payload.checksum;
        assert.equal(
          checksum,
          expectedChecksum,
          'A successful restart probe returned stale state.',
        );
      }
      state.samples.push({
        observedAt,
        status: response.status,
        checksum,
        retryAfter: response.headers.get('retry-after') ?? undefined,
      });
    } catch (error) {
      state.samples.push({ observedAt, networkError: error?.name ?? 'Error' });
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
}

try {
  const initialContainerState = await containerState();
  assert.equal(
    initialContainerState.status,
    'running',
    `${containerName} must already be running.`,
  );
  const publishedPort = await docker(['port', containerName, '5432/tcp']);
  const configuredPort = baseDatabaseUrl.port || '5432';
  assert.ok(
    publishedPort.split('\n').some((line) => line.endsWith(`:${configuredPort}`)),
    `${containerName} does not publish PostgreSQL on configured port ${configuredPort}.`,
  );

  const serverVersionNumber = await waitForPostgres(configuredUrl);
  assert.ok(serverVersionNumber >= 160000 && serverVersionNumber < 170000);
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
  assert.equal(migrationCount, 35);

  process.env.DATABASE_URL = certUrl;
  ({ prisma } = await import('../../../packages/db/dist/index.js'));
  const { hashPassword } = await import('../../../packages/auth-core/dist/index.js');
  const password = `Uat-${randomBytes(20).toString('base64url')}!`;
  const passwordHash = await hashPassword(password);
  const [author, reviewer] = await prisma.$transaction([
    prisma.user.create({
      data: {
        email: `uat.config.restart.author.${suffix}@gigalibs.invalid`,
        name: 'Database restart certification author',
        passwordHash,
        status: 'ACTIVE',
      },
    }),
    prisma.user.create({
      data: {
        email: `uat.config.restart.reviewer.${suffix}@gigalibs.invalid`,
        name: 'Database restart certification reviewer',
        passwordHash,
        status: 'ACTIVE',
      },
    }),
  ]);
  const tenant = await prisma.tenant.create({
    data: {
      slug: `uat-config-restart-${suffix}`.slice(0, 63),
      name: 'UAT Configuration Database Restart Tenant',
      status: 'ACTIVE',
      features: ['dynamic-forms'],
      settings: {
        create: {
          branding: {},
          security: { enforceMfa: false },
          localization: {},
          features: {},
          metadata: { testAttributable: true, certification: 'WI-OI-039-database-restart' },
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

  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  apiProcess = startApi(port, certUrl);
  await waitForHealth(apiProcess, baseUrl);
  const [authorToken, reviewerToken] = await Promise.all([
    tenantToken(baseUrl, author.email, password, tenant.id),
    tenantToken(baseUrl, reviewer.email, password, tenant.id),
  ]);
  const published = await publishAndActivate(baseUrl, authorToken, reviewerToken);
  const markerBeforeRestart = `before-restart-${randomBytes(8).toString('hex')}`;
  const savedBeforeRestart = await request(
    baseUrl,
    `/api/v1/configuration/extension-values/tenant-profile/${tenant.id}`,
    {
      token: authorToken,
      method: 'POST',
      body: {
        publishedVersionId: published.id,
        expectedVersion: 0,
        values: { 'restart-marker': markerBeforeRestart },
        reason: 'Persist value before PostgreSQL restart',
        idempotencyKey: `restart-values-before-${randomBytes(12).toString('hex')}`,
      },
    },
  );
  assert.equal(savedBeforeRestart.version, 1);
  const manifestBeforeRestart = await request(baseUrl, manifestPath, { token: authorToken });
  assert.equal(manifestBeforeRestart.checksum, published.checksum);

  const outageEventId = `restart_${randomBytes(16).toString('hex')}`;
  const outageEventAvailableAt = new Date(Date.now() + 15_000);
  const outageEvent = await prisma.controlOutboxEvent.create({
    data: {
      eventId: outageEventId,
      tenantId: tenant.id,
      aggregateType: 'configuration-version',
      aggregateId: published.id,
      eventType: 'configuration.version.published.v1',
      payload: {
        certification: 'WI-OI-039-database-restart',
        testAttributable: true,
      },
      availableAt: outageEventAvailableAt,
    },
    select: { id: true, status: true, attempts: true },
  });
  assert.equal(outageEvent.status, 'PENDING');
  assert.equal(outageEvent.attempts, 0);

  const commitFaultRowId = `certcommit_${randomBytes(12).toString('hex')}`;
  const commitFaultEventId = `certcommit_${randomBytes(16).toString('hex')}`;
  await sql(
    certUrl,
    `CREATE OR REPLACE FUNCTION certification_delay_configuration_publish()
     RETURNS trigger
     LANGUAGE plpgsql
     AS $$
     BEGIN
       IF NEW."id" = '${commitFaultRowId}'
          AND OLD."status" = 'PROCESSING'
          AND NEW."status" = 'PUBLISHED' THEN
         PERFORM pg_sleep(30);
       ELSIF NEW."id" = '${outageEvent.id}'
          AND OLD."status" = 'PROCESSING'
          AND NEW."status" = 'PUBLISHED' THEN
         PERFORM pg_sleep(5);
       END IF;
       RETURN NEW;
     END;
     $$;
     CREATE TRIGGER certification_delay_configuration_publish_trigger
     BEFORE UPDATE OF "status" ON "control_outbox_events"
     FOR EACH ROW
     EXECUTE FUNCTION certification_delay_configuration_publish();`,
  );
  const commitFaultEvent = await prisma.controlOutboxEvent.create({
    data: {
      id: commitFaultRowId,
      eventId: commitFaultEventId,
      tenantId: tenant.id,
      aggregateType: 'configuration-version',
      aggregateId: published.id,
      eventType: 'configuration.version.published.v1',
      payload: {
        certification: 'WI-OI-039-transaction-interruption',
        testAttributable: true,
      },
    },
    select: { id: true, status: true, attempts: true },
  });
  assert.equal(commitFaultEvent.status, 'PENDING');
  assert.equal(commitFaultEvent.attempts, 0);
  faultNotificationClient = await connectNotificationListener(
    certUrl,
    interruptedTransactionNotifications,
    interruptedTransactionListenerErrors,
  );

  const transactionDelayDeadline = Date.now() + 30_000;
  let transactionDelayObserved = false;
  while (Date.now() < transactionDelayDeadline) {
    const sleepingPublishTransactions = Number(
      await sql(
        certUrl,
        `SELECT count(*)
         FROM pg_stat_activity
         WHERE datname = current_database()
           AND state = 'active'
           AND wait_event = 'PgSleep'
           AND query LIKE '%control_outbox_events%'`,
      ),
    );
    if (sleepingPublishTransactions > 0) {
      transactionDelayObserved = true;
      break;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  assert.ok(transactionDelayObserved, 'The certification publish transaction did not pause.');
  assert.deepEqual(
    interruptedTransactionListenerErrors,
    [],
    'The pre-interruption listener received an invalid notification.',
  );
  const claimedBeforeInterruption = await sql(
    certUrl,
    `SELECT "status" || '|' || "attempts"::text || '|' || COALESCE("publishedAt"::text, '')
     FROM "control_outbox_events"
     WHERE "id" = '${commitFaultRowId}'`,
  );
  assert.equal(claimedBeforeInterruption, 'PROCESSING|1|');
  const pendingBeforeInterruption = await sql(
    certUrl,
    `SELECT "status" || '|' || "attempts"::text
     FROM "control_outbox_events"
     WHERE "id" = '${outageEvent.id}'`,
  );
  assert.equal(
    pendingBeforeInterruption,
    'PENDING|0',
    'The pending-outage event was claimed before PostgreSQL shutdown began.',
  );

  const probeState = { stop: false, samples: [] };
  const probePromise = probeDuringRestart(baseUrl, authorToken, published.checksum, probeState);
  const restartStartedAt = Date.now();
  await docker(['stop', '--time', '10', containerName]);
  const stoppedContainerState = await containerState();
  assert.equal(stoppedContainerState.status, 'exited');
  await faultNotificationClient?.end().catch(() => undefined);
  faultNotificationClient = undefined;
  assert.equal(
    interruptedTransactionNotifications.filter(({ eventId }) => eventId === commitFaultEventId)
      .length,
    0,
    'The interrupted transaction emitted a Configuration notification before commit.',
  );
  const requiredOutageUntil = outageEventAvailableAt.getTime() + 11_000;
  if (Date.now() < requiredOutageUntil) {
    await new Promise((resolvePromise) =>
      setTimeout(resolvePromise, requiredOutageUntil - Date.now()),
    );
  }
  const notificationConnection = connectNotificationListener(certUrl);
  await docker(['start', containerName]);
  const restartCommandDurationMs = Date.now() - restartStartedAt;
  await waitForPostgres(configuredUrl);
  notificationClient = await notificationConnection;
  await sql(
    certUrl,
    `DROP TRIGGER certification_delay_configuration_publish_trigger ON "control_outbox_events";
     DROP FUNCTION certification_delay_configuration_publish();`,
  );
  const interruptedState = await sql(
    certUrl,
    `SELECT "status" || '|' || "attempts"::text || '|' || COALESCE("publishedAt"::text, '')
     FROM "control_outbox_events"
     WHERE "id" = '${commitFaultRowId}'`,
  );
  assert.equal(
    interruptedState,
    'PROCESSING|1|',
    'The interrupted publish transaction did not roll back its PUBLISHED transition.',
  );
  const staleCommitFaultClaim = await sql(
    certUrl,
    `UPDATE "control_outbox_events"
     SET "claimedAt" = NOW() - INTERVAL '5 minutes'
     WHERE "id" = '${commitFaultRowId}' AND "status" = 'PROCESSING' AND "attempts" = 1
     RETURNING "id"`,
  );
  assert.equal(staleCommitFaultClaim, commitFaultRowId);
  probeState.stop = true;
  await probePromise;
  const restartedContainerState = await containerState();
  assert.equal(restartedContainerState.status, 'running');
  assert.notEqual(
    restartedContainerState.startedAt,
    initialContainerState.startedAt,
    'Container start timestamp did not change.',
  );

  const outboxRecoveryDeadline = Date.now() + 30_000;
  let recoveredOutboxAttempts;
  while (Date.now() < outboxRecoveryDeadline) {
    const state = await sql(
      certUrl,
      `SELECT "status" || '|' || "attempts"::text || '|' || COALESCE("lastErrorCode", '')
       FROM "control_outbox_events"
       WHERE "id" = '${outageEvent.id}'`,
    );
    const [status, attemptsRaw, lastErrorCode] = state.split('|');
    if (status === 'PUBLISHED' && lastErrorCode === '') {
      recoveredOutboxAttempts = Number(attemptsRaw);
      break;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  assert.ok(recoveredOutboxAttempts, 'The outage-spanning Configuration event was not published.');
  const notificationDeadline = Date.now() + 5_000;
  while (
    Date.now() < notificationDeadline &&
    !configurationNotifications.some(
      ({ eventId, attempt }) => eventId === outageEventId && attempt === recoveredOutboxAttempts,
    )
  ) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  assert.deepEqual(notificationErrors, [], 'The recovered outbox notification was invalid.');
  assert.ok(
    configurationNotifications.some(
      ({ eventId, attempt }) => eventId === outageEventId && attempt === recoveredOutboxAttempts,
    ),
    'The outage-spanning Configuration event did not emit a notification after recovery.',
  );

  const commitFaultRecoveryDeadline = Date.now() + 30_000;
  let commitFaultRecoveryAttempts;
  while (Date.now() < commitFaultRecoveryDeadline) {
    const state = await sql(
      certUrl,
      `SELECT "status" || '|' || "attempts"::text || '|' || COALESCE("lastErrorCode", '') || '|' || COALESCE("publishedAt"::text, '')
       FROM "control_outbox_events"
       WHERE "id" = '${commitFaultRowId}'`,
    );
    const [status, attemptsRaw, lastErrorCode, publishedAt] = state.split('|');
    if (status === 'PUBLISHED' && lastErrorCode === '' && publishedAt !== '') {
      commitFaultRecoveryAttempts = Number(attemptsRaw);
      break;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  assert.equal(
    commitFaultRecoveryAttempts,
    2,
    'The interrupted Configuration publish did not recover on attempt two.',
  );
  const commitFaultNotificationDeadline = Date.now() + 5_000;
  while (
    Date.now() < commitFaultNotificationDeadline &&
    !configurationNotifications.some(
      ({ eventId, attempt }) =>
        eventId === commitFaultEventId && attempt === commitFaultRecoveryAttempts,
    )
  ) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  assert.deepEqual(notificationErrors, [], 'A recovered outbox notification was invalid.');
  const committedFaultReceipts = configurationNotifications.filter(
    ({ eventId }) => eventId === commitFaultEventId,
  );
  assert.deepEqual(
    committedFaultReceipts.map(({ attempt }) => attempt),
    [2],
    'The interrupted transaction must emit exactly one receipt after the successful retry.',
  );

  const manifestAfterDatabaseRestart = await request(baseUrl, manifestPath, { token: authorToken });
  assert.equal(manifestAfterDatabaseRestart.checksum, published.checksum);
  const valuesAfterDatabaseRestart = await request(
    baseUrl,
    `/api/v1/configuration/extension-values/tenant-profile/${tenant.id}`,
    { token: authorToken },
  );
  assert.equal(valuesAfterDatabaseRestart.values['restart-marker'], markerBeforeRestart);
  assert.equal(valuesAfterDatabaseRestart.manifestChecksum, published.checksum);
  const markerAfterRestart = `after-restart-${randomBytes(8).toString('hex')}`;
  const savedAfterRestart = await request(
    baseUrl,
    `/api/v1/configuration/extension-values/tenant-profile/${tenant.id}`,
    {
      token: authorToken,
      method: 'POST',
      body: {
        publishedVersionId: published.id,
        expectedVersion: valuesAfterDatabaseRestart.version,
        values: { 'restart-marker': markerAfterRestart },
        reason: 'Prove write recovery after PostgreSQL restart',
        idempotencyKey: `restart-values-after-${randomBytes(12).toString('hex')}`,
      },
    },
  );
  assert.equal(savedAfterRestart.version, 2);

  const probeStatusCounts = probeState.samples.reduce((counts, sample) => {
    const key = sample.networkError ? 'networkError' : String(sample.status);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  assert.ok(probeState.samples.length > 0, 'No request was sampled during database restart.');
  const unavailableResponses = probeState.samples.filter(({ status }) => status === 503);
  const unexpectedResponses = probeState.samples.filter(
    ({ status, networkError }) => !networkError && status !== 200 && status !== 503,
  );
  assert.equal(
    unexpectedResponses.length,
    0,
    `Database outage produced unclassified HTTP statuses: ${JSON.stringify(probeStatusCounts)}`,
  );
  assert.ok(
    unavailableResponses.every(({ retryAfter }) => retryAfter === '1'),
    'Every transient 503 must include Retry-After.',
  );

  await stopApi(apiProcess);
  apiProcess = startApi(port, certUrl);
  await waitForHealth(apiProcess, baseUrl);
  const manifestAfterApplicationRestart = await request(baseUrl, manifestPath, {
    token: authorToken,
  });
  const valuesAfterApplicationRestart = await request(
    baseUrl,
    `/api/v1/configuration/extension-values/tenant-profile/${tenant.id}`,
    { token: authorToken },
  );
  assert.equal(manifestAfterApplicationRestart.checksum, published.checksum);
  assert.equal(valuesAfterApplicationRestart.values['restart-marker'], markerAfterRestart);
  assert.equal(valuesAfterApplicationRestart.version, 2);

  evidence = {
    recordedAt: new Date().toISOString(),
    environment: 'isolated-local-uat',
    certification: 'WI-OI-039-configuration-studio-database-restart',
    acceptanceStatus: 'LOCAL_DATABASE_RESTART_ONLY',
    releaseAcceptance: false,
    databaseEngine: serverVersion,
    migrationCount,
    restartTarget: {
      containerName,
      image: initialContainerState.image,
      configuredPort: Number(configuredPort),
      startTimestampChanged: true,
      restartCommandDurationMs,
    },
    probe: {
      sampleCount: probeState.samples.length,
      statusCounts: probeStatusCounts,
      successfulResponsesValidatedAgainstActiveChecksum: probeState.samples.filter(
        ({ status }) => status === 200,
      ).length,
      retryableUnavailableResponses: unavailableResponses.length,
      unexpectedHttpResponses: unexpectedResponses.length,
      rawSamplesPersisted: false,
    },
    persistedState: {
      activeManifestChecksumPreserved: true,
      preRestartValuePreserved: true,
      postRestartWriteVersion: savedAfterRestart.version,
      applicationRestartChecksumPreserved: true,
      applicationRestartValuePreserved: true,
    },
    outboxRecovery: {
      pendingEventWasDueWhileDatabaseStopped: true,
      publishedAfterDatabaseRestart: true,
      publishAttempts: recoveredOutboxAttempts,
      notificationReceivedAfterDatabaseRestart: true,
      rawEnvelopePersisted: false,
    },
    interruptedPublishRecovery: {
      publishTransactionPausedAfterNotificationQueued: transactionDelayObserved,
      interruptedTransactionReceiptCount: interruptedTransactionNotifications.filter(
        ({ eventId }) => eventId === commitFaultEventId,
      ).length,
      publishedAfterRecovery: true,
      publishAttempts: commitFaultRecoveryAttempts,
      committedReceiptCount: committedFaultReceipts.length,
      rawEnvelopePersisted: false,
    },
    outcomes: [
      'dedicated-local-postgresql16-container-target-verified',
      '35-forward-migrations-applied-to-generated-database',
      'active-manifest-and-extension-value-persisted-before-restart',
      'successful-in-flight-responses-never-returned-a-stale-checksum',
      'database-outage-responses-sanitized-as-retryable-503',
      'same-api-process-reconnected-after-full-postgresql-container-restart',
      'manifest-and-value-integrity-preserved-after-database-restart',
      'new-transactional-write-succeeded-after-database-restart',
      'manifest-and-updated-value-survived-subsequent-application-restart',
      'pending-configuration-event-published-and-notified-after-database-restart',
      'interrupted-publish-transaction-rolled-back-and-recovered-on-attempt-two',
    ],
    outcomeCount: 11,
    limitations: [
      'This restarts one local PostgreSQL container, not a managed-cloud service, customer host or storage layer.',
      'This does not prove WAL archiving, point-in-time recovery, replica promotion, host loss or approved RPO/RTO.',
      'Transient probe status counts characterize this run and are not an availability SLO.',
      'The outbox scenarios prove pending-event recovery and rollback/retry when PostgreSQL stops after notification enqueue but before the PUBLISHED commit; they do not certify an adopting consumer.',
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
  await notificationClient?.end().catch(() => undefined);
  await faultNotificationClient?.end().catch(() => undefined);
  await prisma?.$disconnect().catch(() => undefined);
  await ensureContainerRunning();
  await waitForPostgres(configuredUrl);
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
    assert.equal(retainedCount, 0, 'Database-restart certification cleanup was not verified.');
  }
}

assert.ok(evidence, 'Database-restart certification did not produce evidence.');
if (evidencePath) {
  const target = resolve(repositoryRoot, evidencePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}
console.log(JSON.stringify(evidence, null, 2));
