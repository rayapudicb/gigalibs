import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../../apps/playground-api/package.json', import.meta.url));
const { Pool } = require('pg');
const databaseUrl = new URL(process.env.DATABASE_URL);
assert.equal(databaseUrl.hostname, '127.0.0.1');
assert.match(databaseUrl.pathname, /^\/gigalibs_iam_cert_[a-f0-9]+$/);
const db = new Pool({ connectionString: databaseUrl.toString(), max: 1 });
const control = 'http://127.0.0.1:3339/api/v1';
const bff = 'http://127.0.0.1:5198';
const provider = 'http://127.0.0.1:5449';
const checks = [];

async function request(base, path, { method = 'GET', token, body, status = 200 } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, status, `${method} ${path} returned ${response.status}`);
  const text = await response.text();
  return { response, data: text ? JSON.parse(text) : null };
}

async function browserFlow(expectedRedirect = '/modules') {
  const start = await fetch(`${bff}/api/auth/oidc/start?tenant=${tenantSlug}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000),
  });
  assert.equal(start.status, 307);
  const authorizationUrl = start.headers.get('location');
  assert.ok(authorizationUrl);
  const authorizationTarget = new URL(authorizationUrl);
  if (authorizationTarget.pathname !== '/authorize') {
    const direct = await fetch(`${control}/auth/oidc/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantSlug }),
      signal: AbortSignal.timeout(60_000),
    });
    const directPayload = await direct.json().catch(() => null);
    const safeReason =
      directPayload && typeof directPayload === 'object'
        ? String(directPayload.code ?? directPayload.message ?? directPayload.statusCode ?? 'none')
        : 'none';
    throw new Error(
      `OIDC BFF start returned ${authorizationTarget.pathname} (${authorizationTarget.searchParams.get('ssoError') ?? 'no-code'}); direct control status ${direct.status} (${safeReason})`,
    );
  }
  assert.equal(authorizationTarget.origin, provider);
  const state = authorizationTarget.searchParams.get('state');
  assert.ok(state);
  const authorization = await fetch(authorizationUrl, {
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000),
  });
  assert.equal(authorization.status, 302);
  const callbackUrl = authorization.headers.get('location');
  assert.ok(callbackUrl?.startsWith(`${bff}/api/auth/oidc/callback?`));
  const callback = await fetch(callbackUrl, {
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000),
  });
  assert.equal(callback.status, 307);
  assert.equal(new URL(callback.headers.get('location')).pathname, expectedRedirect);
  return { state, callbackUrl, callback };
}

async function linkFlow(token, reason) {
  const started = await request(control, '/auth/oidc/link/start', {
    method: 'POST',
    token,
    body: { reason },
  });
  const authorizationUrl = started.data.authorizationUrl;
  assert.ok(authorizationUrl);
  const authorizationTarget = new URL(authorizationUrl);
  assert.equal(authorizationTarget.origin, provider);
  assert.equal(authorizationTarget.pathname, '/authorize');
  const state = authorizationTarget.searchParams.get('state');
  assert.ok(state);
  const authorization = await fetch(authorizationUrl, {
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000),
  });
  assert.equal(authorization.status, 302);
  const callbackUrl = authorization.headers.get('location');
  const callback = await fetch(callbackUrl, {
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000),
  });
  assert.equal(callback.status, 307);
  assert.equal(new URL(callback.headers.get('location')).pathname, '/settings/profile');
  assert.equal(new URL(callback.headers.get('location')).searchParams.get('identityLinked'), '1');
  return { state, callbackUrl };
}

const suffix = randomBytes(6).toString('hex');
const domain = `oidc-${suffix}.example`;
const tenantSlug = `oidc-cert-${suffix}`;
const adminEmail = `admin-${suffix}@${domain}`;
const adminPassword = randomBytes(32).toString('base64url');
const clientSecret = process.env.OIDC_CERT_CLIENT_SECRET;
assert.ok(adminEmail.endsWith(`@${domain}`));
assert.ok(clientSecret);

try {
  const registered = await request(control, '/auth/register', {
    method: 'POST',
    status: 201,
    body: {
      name: 'OIDC certification administrator',
      email: adminEmail,
      password: adminPassword,
    },
  });
  const tenant = await request(control, '/tenants', {
    method: 'POST',
    status: 201,
    token: registered.data.accessToken,
    body: {
      name: 'Isolated OIDC certification tenant',
      slug: tenantSlug,
      plan: 'ENTERPRISE',
      isolationMode: 'ROW_LEVEL_SECURITY',
      region: 'ap-south-1',
    },
  });
  const selected = await request(control, '/auth/select-tenant', {
    method: 'POST',
    token: registered.data.accessToken,
    body: { tenantId: tenant.data.id },
  });
  await db.query(
    `UPDATE tenants SET status='ACTIVE', plan='ENTERPRISE', "trialEndsAt"=NULL,
      "customDomain"=$1, "customDomainVerifiedAt"=CURRENT_TIMESTAMP,
      "customDomainChallengeDomain"=$1 WHERE id=$2`,
    [domain, tenant.data.id],
  );

  await request(control, '/auth/oidc/config', {
    method: 'PUT',
    token: selected.data.accessToken,
    body: {
      issuer: provider,
      clientId: 'gigalibs-iam-cert-client',
      clientSecret,
      scopes: ['openid', 'email', 'profile'],
      enabled: true,
      allowJitProvisioning: true,
      defaultRole: 'VIEWER',
      expectedUpdatedAt: null,
      reason: 'Enable isolated OIDC certification provider',
    },
  });
  const storedConfig = (
    await db.query(
      `SELECT id, "clientSecretEnvelope", enabled, "allowJitProvisioning"
       FROM tenant_oidc_configurations WHERE "tenantId"=$1`,
      [tenant.data.id],
    )
  ).rows[0];
  assert.ok(storedConfig.clientSecretEnvelope.startsWith('v1.'));
  assert.ok(!storedConfig.clientSecretEnvelope.includes(clientSecret));
  assert.equal(storedConfig.enabled, true);
  checks.push('Tenant OIDC configuration is permission-protected, live-discovered and stores only an authenticated client-secret envelope');

  await request(provider, '/certification/identity', {
    method: 'POST',
    body: { sub: 'cert-admin-subject', email: adminEmail, name: 'OIDC Certification Admin' },
  });
  const adminFlow = await browserFlow();
  const stateRow = (
    await db.query(
      `SELECT "stateDigest", "codeVerifierEnvelope", "consumedAt" FROM oidc_login_transactions
       WHERE "tenantId"=$1 ORDER BY "createdAt" DESC LIMIT 1`,
      [tenant.data.id],
    )
  ).rows[0];
  assert.notEqual(stateRow.stateDigest, adminFlow.state);
  assert.ok(stateRow.codeVerifierEnvelope.startsWith('v1.'));
  assert.ok(stateRow.consumedAt);
  const adminIdentity = (
    await db.query(
      `SELECT ei.subject, u.email, tm.role
       FROM external_identities ei JOIN users u ON u.id=ei."userId"
       JOIN tenant_members tm ON tm."userId"=u.id AND tm."tenantId"=$1
       WHERE ei.subject='cert-admin-subject'`,
      [tenant.data.id],
    )
  ).rows[0];
  assert.equal(adminIdentity.email, adminEmail);
  assert.equal(adminIdentity.role, 'TENANT_ADMIN');
  assert.match(adminFlow.callback.headers.get('set-cookie') ?? '', /gigalibs_access_token=/);
  checks.push('Authorization Code plus PKCE validates signed ID-token claims, consumes hashed state once, links an existing member and creates real session cookies');

  const listed = await request(control, '/auth/external-identities', {
    token: selected.data.accessToken,
  });
  assert.equal(listed.data.localPasswordConfigured, true);
  assert.equal(listed.data.provider.enabled, true);
  const listedIdentity = listed.data.identities.find((identity) => identity.status === 'ACTIVE');
  assert.ok(listedIdentity);
  const disconnected = await request(control, `/auth/external-identities/${listedIdentity.id}/revoke`, {
    method: 'POST',
    token: selected.data.accessToken,
    body: {
      expectedUpdatedAt: listedIdentity.updatedAt,
      currentPassword: adminPassword,
      reason: 'Isolated explicit disconnect certification',
    },
  });
  assert.ok(disconnected.data.otherSessionsRevoked >= 1);
  const revokedIdentity = (
    await db.query(
      `SELECT status, "revokedAt", "statusReason" FROM external_identities WHERE id=$1`,
      [listedIdentity.id],
    )
  ).rows[0];
  assert.equal(revokedIdentity.status, 'REVOKED');
  assert.ok(revokedIdentity.revokedAt);
  assert.equal(revokedIdentity.statusReason, 'Isolated explicit disconnect certification');
  checks.push('Authenticated self-service disconnect requires the current local password, retains the binding lifecycle and revokes other sessions');

  const linkReason = 'Isolated explicit proof-based account link certification';
  const linkedFlow = await linkFlow(selected.data.accessToken, linkReason);
  const adminUser = (await db.query('SELECT id FROM users WHERE email=$1', [adminEmail])).rows[0];
  const linkTransaction = (
    await db.query(
      `SELECT purpose, "linkUserId", "linkReason", "stateDigest", "consumedAt"
       FROM oidc_login_transactions WHERE "tenantId"=$1 AND purpose='LINK'
       ORDER BY "createdAt" DESC LIMIT 1`,
      [tenant.data.id],
    )
  ).rows[0];
  assert.equal(linkTransaction.purpose, 'LINK');
  assert.equal(linkTransaction.linkUserId, adminUser.id);
  assert.equal(linkTransaction.linkReason, linkReason);
  assert.notEqual(linkTransaction.stateDigest, linkedFlow.state);
  assert.ok(linkTransaction.consumedAt);
  const relinkedIdentity = (
    await db.query(
      `SELECT status, "revokedAt", "statusReason", "userId" FROM external_identities WHERE id=$1`,
      [listedIdentity.id],
    )
  ).rows[0];
  assert.equal(relinkedIdentity.status, 'ACTIVE');
  assert.equal(relinkedIdentity.revokedAt, null);
  assert.equal(relinkedIdentity.statusReason, null);
  assert.equal(relinkedIdentity.userId, adminUser.id);
  checks.push('Explicit account linking persists a distinct expiring intent, revalidates the signed provider proof and can reactivate only the same user binding');

  const replay = await fetch(adminFlow.callbackUrl, { redirect: 'manual' });
  assert.equal(replay.status, 307);
  assert.equal(new URL(replay.headers.get('location')).searchParams.get('ssoError'), 'rejected');
  checks.push('OIDC callback replay is rejected after the database transaction is consumed');

  const jitEmail = `jit-${suffix}@${domain}`;
  await request(provider, '/certification/identity', {
    method: 'POST',
    body: { sub: `jit-${suffix}`, email: jitEmail, name: 'OIDC JIT Certification User' },
  });
  const jitFlow = await browserFlow();
  assert.match(jitFlow.callback.headers.get('set-cookie') ?? '', /gigalibs_refresh_token=/);
  const jitUser = (
    await db.query(
      `SELECT u.status, u."emailVerifiedAt", tm.role, tm.status AS membership_status
       FROM users u JOIN tenant_members tm ON tm."userId"=u.id
       WHERE u.email=$1 AND tm."tenantId"=$2`,
      [jitEmail, tenant.data.id],
    )
  ).rows[0];
  assert.equal(jitUser.status, 'ACTIVE');
  assert.ok(jitUser.emailVerifiedAt);
  assert.equal(jitUser.role, 'VIEWER');
  assert.equal(jitUser.membership_status, 'ACTIVE');
  checks.push('JIT provisions a real user and tenant membership only at the configured low-privilege role for the exact verified domain');

  const outsideEmail = `outside-${suffix}@outside.example`;
  await request(provider, '/certification/identity', {
    method: 'POST',
    body: { sub: `outside-${suffix}`, email: outsideEmail, name: 'Rejected OIDC User' },
  });
  const outsideStart = await fetch(`${bff}/api/auth/oidc/start?tenant=${tenantSlug}`, { redirect: 'manual' });
  const outsideAuthorization = await fetch(outsideStart.headers.get('location'), { redirect: 'manual' });
  const outsideCallback = await fetch(outsideAuthorization.headers.get('location'), { redirect: 'manual' });
  assert.equal(new URL(outsideCallback.headers.get('location')).searchParams.get('ssoError'), 'rejected');
  assert.equal(Number((await db.query('SELECT count(*) FROM users WHERE email=$1', [outsideEmail])).rows[0].count), 0);
  checks.push('JIT rejects a verified provider email outside the tenant DNS trust boundary and persists no user');

  writeFileSync(
    new URL('./oidc-persistence-results.json', import.meta.url),
    `${JSON.stringify({ source: 'Isolated real PostgreSQL, NestJS, Next.js and signed OIDC provider', checks, passed: true }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ checks: checks.length, passed: true }));
} finally {
  await db.end();
}
