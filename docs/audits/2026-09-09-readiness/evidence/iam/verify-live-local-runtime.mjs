import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(new URL('../../../../../apps/playground-api/package.json', import.meta.url));
const { Pool } = require('pg');
const db = new Pool({ connectionString: 'postgresql://gigalibs_dev_runtime@127.0.0.1:5432/gigalibs_dev_runtime' });
const bff = 'http://127.0.0.1:5180';
const control = 'http://127.0.0.1:3333/api/v1';
const suffix = randomBytes(6).toString('hex');
const email = `live-runtime-verification-${suffix}@example.invalid`;
const password = randomBytes(32).toString('base64url');
let userId;
let tenantId;
const checks = [];
let passed = false;

function cookieJar(response) {
  return response.headers.getSetCookie()
    .filter((value) => !/Max-Age=0/i.test(value))
    .map((value) => value.split(';', 1)[0])
    .join('; ');
}

function cookieValue(cookie, name) {
  return cookie.split('; ').find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function request(base, path, { method = 'GET', status = 200, cookie, token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, status, `${method} ${path}`);
  const raw = await response.text();
  return { response, data: raw ? JSON.parse(raw) : null };
}

try {
  await request(control, '/ready');
  checks.push('control plane readiness reaches the migrated PostgreSQL database');

  const registered = await request(bff, '/api/auth/register', {
    method: 'POST',
    status: 201,
    body: { name: 'Local runtime verification [TEST]', email, password },
  });
  let cookie = cookieJar(registered.response);
  const user = (await db.query('SELECT id, "passwordHash" FROM users WHERE email=$1', [email])).rows[0];
  assert.ok(user?.id && user.passwordHash && user.passwordHash !== password);
  userId = user.id;
  await db.query('UPDATE users SET metadata=$2::jsonb WHERE id=$1', [
    userId,
    JSON.stringify({ testData: true, purpose: 'live-local-runtime-verification', excludedFromBusinessReporting: true }),
  ]);
  checks.push('registration writes a hashed user and active session through the live BFF');

  const initialContext = await request(bff, '/api/auth/context', { cookie });
  assert.equal(initialContext.data.tenant, null);
  checks.push('a new real identity starts without an invented tenant');

  const created = await request(control, '/tenants', {
    method: 'POST',
    status: 201,
    token: cookieValue(cookie, 'gigalibs_access_token'),
    body: {
      name: `Local runtime verification [TEST] ${suffix}`,
      slug: `live-runtime-test-${suffix}`,
      plan: 'FREE',
      isolationMode: 'ROW_LEVEL_SECURITY',
      region: 'local',
    },
  });
  tenantId = created.data.id;
  const selected = await request(bff, '/api/auth/select-tenant', {
    method: 'POST', cookie, body: { tenantId },
  });
  cookie = cookieJar(selected.response);
  await request(control, '/tenants/current/status', {
    method: 'PATCH',
    token: cookieValue(cookie, 'gigalibs_access_token'),
    body: { status: 'ACTIVE', reason: 'Local runtime verification' },
  });
  const selectedContext = await request(bff, '/api/auth/context', { cookie });
  assert.equal(selectedContext.data.tenant.id, tenantId);
  assert.deepEqual(selectedContext.data.roles, ['TENANT_ADMIN']);
  checks.push('tenant creation, owner membership, selection and RBAC context persist end to end');

  await request(bff, '/api/auth/logout', { method: 'POST', cookie, status: 200 });
  await request(bff, '/api/auth/context', { cookie, status: 401 });
  checks.push('logout revokes the live database session');
  passed = true;
} finally {
  await db.end();
  writeFileSync(new URL('./live-local-runtime-results.json', import.meta.url), `${JSON.stringify({
    passed,
    checks,
    services: ['Next.js BFF on 5180', 'NestJS control plane on 3333', 'PostgreSQL 14.20 on 5432'],
    data: 'Attributable [TEST] records retained because canonical audit records are append-only; identity metadata excludes them from business reporting',
    limits: 'No execution plane, external provider, human UAT or production deployment',
  }, null, 2)}\n`);
}

console.log(JSON.stringify({ passed, checks: checks.length }));
