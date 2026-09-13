import { spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

const root = resolve(import.meta.dirname, '../../../../..');
const containerName = `gigalibs-ar-e2e-${process.pid}`;
const issuer = 'http://127.0.0.1:3502';
const webBaseUrl = 'http://127.0.0.1:3401';
const apiBaseUrl = 'http://127.0.0.1:3400';
const eventReceiverUrl = 'http://127.0.0.1:3503/events';
const tenantId = '90000000-0000-4000-8000-000000000001';
const clientId = 'gigalibs-ar-e2e-client';
const clientSecret = 'test-only-oidc-secret-at-least-32-characters';
const eventSecret = 'test-only-event-secret-at-least-32-characters';
const runtimePassword = 'test_only_runtime_password';
const workerPassword = 'test_only_worker_password';
const children = new Set();
const authorizationCodes = new Map();
const refreshTokens = new Map();
const receivedEvents = [];
let apiProcess;
let shuttingDown = false;

const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
const publicJwk = await exportJWK(publicKey);
Object.assign(publicJwk, { kid: 'ar-e2e-key', alg: 'RS256', use: 'sig' });

const identityServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', issuer);
  if (request.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
    return json(response, 200, {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['openid', 'profile', 'offline_access', 'gigalibs-ar'],
    });
  }
  if (request.method === 'GET' && url.pathname === '/jwks')
    return json(response, 200, { keys: [publicJwk] });
  if (request.method === 'GET' && url.pathname === '/authorize') {
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');
    const nonce = url.searchParams.get('nonce');
    const challenge = url.searchParams.get('code_challenge');
    if (
      url.searchParams.get('client_id') !== clientId ||
      redirectUri !== `${webBaseUrl}/auth/callback` ||
      !state ||
      !nonce ||
      !challenge ||
      url.searchParams.get('code_challenge_method') !== 'S256'
    )
      return json(response, 400, { error: 'invalid_request' });
    const code = randomUUID();
    authorizationCodes.set(code, { redirectUri, nonce, challenge });
    const callback = new URL(redirectUri);
    callback.searchParams.set('code', code);
    callback.searchParams.set('state', state);
    response.writeHead(302, { location: callback.toString(), 'cache-control': 'no-store' });
    return response.end();
  }
  if (request.method === 'POST' && url.pathname === '/token') {
    const form = new URLSearchParams(await readBody(request));
    if (form.get('client_id') !== clientId || form.get('client_secret') !== clientSecret) {
      console.error('[test-idp] invalid client authentication', {
        clientIdMatched: form.get('client_id') === clientId,
        clientSecretMatched: form.get('client_secret') === clientSecret,
      });
      return json(response, 401, { error: 'invalid_client' });
    }
    if (form.get('grant_type') === 'authorization_code') {
      const code = form.get('code');
      const record = authorizationCodes.get(code);
      const verifier = form.get('code_verifier');
      const redirectMatched = form.get('redirect_uri') === record?.redirectUri;
      const verifierMatched = Boolean(
        verifier &&
          record &&
          createHash('sha256').update(verifier).digest('base64url') === record.challenge,
      );
      if (!record || !redirectMatched || !verifier || !verifierMatched) {
        console.error('[test-idp] invalid authorization grant', {
          codeFound: Boolean(record),
          redirectMatched,
          redirectUri: form.get('redirect_uri'),
          expectedRedirectUri: record?.redirectUri,
          verifierPresent: Boolean(verifier),
          verifierMatched,
        });
        return json(response, 400, { error: 'invalid_grant' });
      }
      authorizationCodes.delete(code);
      const refreshToken = randomUUID();
      refreshTokens.set(refreshToken, true);
      return json(response, 200, await tokenResponse(record.nonce, refreshToken));
    }
    if (
      form.get('grant_type') === 'refresh_token' &&
      refreshTokens.has(form.get('refresh_token'))
    ) {
      return json(response, 200, await tokenResponse(undefined, form.get('refresh_token'), false));
    }
    return json(response, 400, { error: 'unsupported_grant_type' });
  }
  return json(response, 404, { error: 'not_found' });
});

const receiverServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:3503');
  if (request.method === 'POST' && url.pathname === '/events') {
    const body = await readBody(request);
    const signature = request.headers['x-gigalibs-signature'];
    if (!validEventSignature(String(signature ?? ''), body))
      return json(response, 401, { error: 'invalid_signature' });
    receivedEvents.push(JSON.parse(body));
    response.writeHead(204);
    return response.end();
  }
  if (request.method === 'GET' && url.pathname === '/__events')
    return json(response, 200, { items: receivedEvents });
  if (request.method === 'POST' && url.pathname === '/__control/restart-api') {
    await restartApi();
    return json(response, 200, { ready: true });
  }
  if (request.method === 'POST' && url.pathname === '/__control/shutdown') {
    json(response, 202, { stopping: true });
    setTimeout(() => void cleanup().finally(() => process.exit(0)), 0);
    return;
  }
  return json(response, 404, { error: 'not_found' });
});

try {
  await listen(identityServer, 3502);
  await listen(receiverServer, 3503);
  run('docker', [
    'run',
    '--rm',
    '-d',
    '--name',
    containerName,
    '--label',
    'io.gigalibs.test-suite=ar-e2e',
    '-e',
    'POSTGRES_PASSWORD=test_only_admin_password',
    '-p',
    '127.0.0.1:35432:5432',
    'postgres:16-alpine',
  ]);
  await retry(
    async () =>
      run('docker', [
        'exec',
        containerName,
        'psql',
        '-XAtqc',
        'SELECT 1',
        '-U',
        'postgres',
        '-d',
        'postgres',
      ]),
    30_000,
  );
  for (const migration of ['000001_ar_foundation.up.sql', '000002_ar_outbox_delivery.up.sql']) {
    const sql = readFileSync(resolve(root, 'modules/accounts-receivable/db/migrations', migration));
    await retry(
      async () =>
        run(
          'docker',
          [
            'exec',
            '-i',
            containerName,
            'psql',
            '-v',
            'ON_ERROR_STOP=1',
            '-U',
            'postgres',
            '-d',
            'postgres',
          ],
          sql,
        ),
      30_000,
    );
  }
  for (const verification of [
    '000001_ar_foundation.verify.sql',
    '000001_ar_foundation.integration.sql',
    '000002_ar_outbox_delivery.verify.sql',
    '000002_ar_outbox_delivery.integration.sql',
  ]) {
    const sql = readFileSync(resolve(root, 'modules/accounts-receivable/db/verification', verification));
    run(
      'docker',
      [
        'exec',
        '-i',
        containerName,
        'psql',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'postgres',
      ],
      sql,
    );
  }
  run(
    'docker',
    [
      'exec',
      '-i',
      containerName,
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
    ],
    Buffer.from(`
      CREATE ROLE ar_e2e_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE ar_e2e_worker LOGIN PASSWORD '${workerPassword}' NOSUPERUSER NOBYPASSRLS;
      GRANT gigalibs_ar_api_runtime TO ar_e2e_runtime;
      GRANT gigalibs_ar_outbox_worker TO ar_e2e_worker;
    `),
  );
  apiProcess = startApi();
  await retry(() => fetchOk(`${apiBaseUrl}/health/ready`), 30_000);
  startWeb();
  await retry(() => fetchOk(`${webBaseUrl}/auth/signed-out`), 45_000);
  startWorker();
  console.info('[ar-e2e] environment ready');
} catch (error) {
  console.error('[ar-e2e] startup failed', error);
  await cleanup();
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => void cleanup().finally(() => process.exit(0)));
}

async function tokenResponse(nonce, refreshToken, includeIdToken = true) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const accessToken = await new SignJWT({
    tenant_id: tenantId,
    permissions: [
      'ar.settings.manage',
      'ar.customers.read',
      'ar.customers.write',
      'ar.invoices.read',
      'ar.invoices.write',
      'ar.invoices.issue',
    ],
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'ar-e2e-key' })
    .setIssuer(issuer)
    .setAudience('gigalibs-ar')
    .setSubject('test-only-finance-user')
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 300)
    .sign(privateKey);
  const result = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 300,
    refresh_token: refreshToken,
    scope: 'openid profile offline_access gigalibs-ar',
  };
  if (includeIdToken) {
    result.id_token = await new SignJWT({ nonce })
      .setProtectedHeader({ alg: 'RS256', kid: 'ar-e2e-key' })
      .setIssuer(issuer)
      .setAudience(clientId)
      .setSubject('test-only-finance-user')
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 300)
      .sign(privateKey);
  }
  return result;
}

function startApi() {
  return start(
    'api',
    'node',
    [resolve(root, 'modules/accounts-receivable/apps/api/dist/main.js')],
    root,
    {
      NODE_ENV: 'test',
      AR_API_HOST: '127.0.0.1',
      AR_API_PORT: '3400',
      AR_CORS_ORIGINS: webBaseUrl,
      AR_DATABASE_URL: `postgresql://ar_e2e_runtime:${runtimePassword}@127.0.0.1:35432/postgres`,
      AR_DATABASE_POOL_SIZE: '10',
      AR_OIDC_ISSUER: issuer,
      AR_OIDC_AUDIENCE: 'gigalibs-ar',
      AR_OIDC_JWKS_URI: `${issuer}/jwks`,
      AR_OIDC_ALGORITHMS: 'RS256',
      AR_OIDC_TENANT_CLAIM: 'tenant_id',
      AR_OIDC_PERMISSIONS_CLAIM: 'permissions',
      AR_ALLOW_INSECURE_OIDC: 'true',
    },
  );
}

function startWeb() {
  const webApp = resolve(root, 'modules/accounts-receivable/apps/web');
  return start(
    'web',
    'node',
    [
      resolve(webApp, 'node_modules/next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3401',
    ],
    webApp,
    {
      NODE_ENV: 'test',
      HOSTNAME: '127.0.0.1',
      PORT: '3401',
      AR_WEB_BASE_URL: webBaseUrl,
      AR_API_BASE_URL: apiBaseUrl,
      AR_WEB_OIDC_ISSUER: issuer,
      AR_WEB_OIDC_CLIENT_ID: clientId,
      AR_WEB_OIDC_CLIENT_SECRET: clientSecret,
      AR_WEB_OIDC_SCOPE: 'openid profile offline_access gigalibs-ar',
      AR_WEB_SESSION_SECRET: Buffer.alloc(32, 7).toString('base64'),
      AR_WEB_ALLOW_INSECURE_HTTP: 'true',
    },
  );
}

function startWorker() {
  return start(
    'worker',
    'node',
    [resolve(root, 'modules/accounts-receivable/apps/worker/dist/main.js')],
    root,
    {
      NODE_ENV: 'test',
      AR_WORKER_DATABASE_URL: `postgresql://ar_e2e_worker:${workerPassword}@127.0.0.1:35432/postgres`,
      AR_EVENT_WEBHOOK_URL: eventReceiverUrl,
      AR_EVENT_WEBHOOK_SECRET: eventSecret,
      AR_WORKER_ID: 'test-only-worker-1',
      AR_WORKER_POLL_INTERVAL_MS: '100',
      AR_WORKER_HTTP_TIMEOUT_MS: '2000',
      AR_WORKER_LEASE_SECONDS: '10',
      AR_WORKER_MAX_ATTEMPTS: '3',
      AR_WORKER_ALLOW_INSECURE_HTTP: 'true',
    },
  );
}

async function restartApi() {
  if (apiProcess) await stopChild(apiProcess);
  apiProcess = startApi();
  await retry(() => fetchOk(`${apiBaseUrl}/health/ready`), 30_000);
}

function start(label, command, args, cwd, environment) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...environment },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  child.stdout.on('data', (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  child.once('exit', () => children.delete(child));
  return child;
}

function run(command, args, input) {
  const result = spawnSync(command, args, { cwd: root, input, encoding: 'utf8' });
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

async function cleanup() {
  if (shuttingDown) return;
  shuttingDown = true;
  await Promise.all([...children].map(stopChild));
  await Promise.all([close(identityServer), close(receiverServer)]);
  spawnSync('docker', ['stop', '--time', '3', containerName], { cwd: root, stdio: 'ignore' });
}

function stopChild(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolvePromise) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolvePromise();
    });
    child.kill('SIGTERM');
  });
}

function validEventSignature(signature, body) {
  const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(signature);
  if (!match) return false;
  const expected = createHmac('sha256', eventSecret).update(`${match[1]}.${body}`).digest('hex');
  return match[2] === expected;
}

function readBody(request) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) reject(new Error('request too large'));
      else chunks.push(chunk);
    });
    request.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

function listen(server, port) {
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolvePromise);
  });
}

function close(server) {
  return new Promise((resolvePromise) => server.close(() => resolvePromise()));
}

async function retry(operation, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
  }
  throw lastError ?? new Error('operation timed out');
}

async function fetchOk(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
}
