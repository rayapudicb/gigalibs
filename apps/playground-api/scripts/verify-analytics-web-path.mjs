// WI-OI-064a browser-path certification: real web logins reach Analytics only through the BFF-signed platform
// context, so the web signing key and the Analytics verification key must match and the user's real scopes
// apply. Creates a run-scoped `wi-oi-064-web-*` tenant with `@gigalibs.invalid` users; revokes their sessions.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const webUrl = process.env.WEB_TEST_URL;
if (!webUrl) throw new Error('WEB_TEST_URL is required');
const [{ prisma }, { hashPassword }] = await Promise.all([
  import('../../../packages/db/dist/index.js'),
  import('../../../packages/auth-core/dist/index.js'),
]);

const run = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const userIds = [];

async function login(tenantId, label, role) {
  const password = `Web-${randomBytes(18).toString('base64url')}!`;
  const email = `wi-oi-064.web.${label}.${run}@gigalibs.invalid`;
  const user = await prisma.user.create({
    data: { email, name: `Analytics ${label}`, status: 'ACTIVE', passwordHash: await hashPassword(password) },
  });
  userIds.push(user.id);
  await prisma.tenantMember.create({ data: { userId: user.id, tenantId, role, status: 'ACTIVE' } });
  const response = await fetch(`${webUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: webUrl },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  });
  assert.equal(response.status, 200, `web login for ${label}: ${await response.text()}`);
  return { user, cookie: response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ') };
}

async function analytics(session, method, path, expected) {
  const response = await fetch(`${webUrl}/api/analytics/${path}`, {
    method,
    headers: { Cookie: session.cookie, Origin: webUrl, Accept: 'application/json' },
    redirect: 'manual',
  });
  const body = await response.json().catch(() => null);
  assert.equal(response.status, expected, `${method} /api/analytics/${path}: ${JSON.stringify(body)}`);
  return body;
}

try {
  const tenant = await prisma.tenant.create({
    data: {
      slug: `wi-oi-064-web-${run}`.slice(0, 63),
      name: 'WI-OI-064 analytics web path',
      status: 'ACTIVE',
      region: 'local',
      features: ['analytics-studio'],
      settings: { create: { branding: {}, security: { enforceMfa: false }, localization: {}, features: {}, metadata: {} } },
    },
  });
  const admin = await login(tenant.id, 'admin', 'TENANT_ADMIN');
  const member = await login(tenant.id, 'member', 'MEMBER');
  await prisma.tenantModuleEntitlement.create({
    data: {
      tenantId: tenant.id,
      moduleKey: 'analytics-studio',
      status: 'ENABLED',
      source: 'PLATFORM_OVERRIDE',
      reason: 'WI-OI-064a web-path certification',
      updatedById: admin.user.id,
    },
  });

  assert.equal((await analytics(admin, 'GET', 'v1/setup/status', 200)).configured, false);
  await analytics(admin, 'POST', 'v1/setup', 201);
  const status = await analytics(admin, 'GET', 'v1/setup/status', 200);
  assert.equal(status.configured, true);
  assert.equal(status.tenantId, tenant.id, 'Analytics must see the canonical tenant id');
  await analytics(member, 'GET', 'v1/setup/status', 403);
  await analytics(admin, 'POST', 'oidc/dev/token', 404);

  console.log(`WI-OI-064a web-path verification passed for run ${run}: web login → signed context → Analytics for a Tenant Admin (read and setup, canonical tenant id), Member denied, development issuer route closed.`);
} finally {
  if (userIds.length) {
    await prisma.session.updateMany({ where: { userId: { in: userIds }, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
  }
  await prisma.$disconnect();
}
