// WI-OI-065 browser-path certification: a real Tenant Admin login manages job profiles, positions and engagements
// through the BFF-signed Workforce context (workforce:* from the role), keyed by the canonical tenant id; a Member
// is refused and unknown engagement actions are not routed. Creates a run-scoped `wi-oi-065-web-*` tenant with
// `@gigalibs.invalid` users; revokes their sessions afterwards.
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
const code = run.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
const userIds = [];

async function login(tenantId, label, role) {
  const password = `Web-${randomBytes(18).toString('base64url')}!`;
  const email = `wi-oi-065.web.${label}.${run}@gigalibs.invalid`;
  const user = await prisma.user.create({ data: { email, name: `Jobs ${label}`, status: 'ACTIVE', passwordHash: await hashPassword(password) } });
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

async function workforce(session, method, path, body, expected) {
  const response = await fetch(`${webUrl}/api/workforce/${path}`, {
    method,
    headers: { Cookie: session.cookie, Origin: webUrl, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
  });
  const payload = await response.json().catch(() => null);
  assert.equal(response.status, expected, `${method} /api/workforce/${path}: ${JSON.stringify(payload)}`);
  return payload;
}

try {
  const tenant = await prisma.tenant.create({
    data: {
      slug: `wi-oi-065-web-${run}`.slice(0, 63),
      name: 'WI-OI-065 jobs web path',
      status: 'ACTIVE',
      region: 'local',
      features: ['gigaops'],
      settings: { create: { branding: {}, security: { enforceMfa: false }, localization: {}, features: {}, metadata: {} } },
    },
  });
  const admin = await login(tenant.id, 'admin', 'TENANT_ADMIN');
  const member = await login(tenant.id, 'member', 'MEMBER');
  await prisma.tenantModuleEntitlement.create({
    data: { tenantId: tenant.id, moduleKey: 'gigaops', status: 'ENABLED', source: 'PLATFORM_OVERRIDE', reason: 'WI-OI-065 web-path certification', updatedById: admin.user.id },
  });

  const person = await workforce(admin, 'POST', 'v1/resources', { referenceCode: `WEB-${code}`, displayName: 'Web path person', resourceType: 'HUMAN' }, 201);
  const profile = await workforce(admin, 'POST', 'v1/job-profiles', { code: `WEB-${code}`, effectiveFrom: '2026-01-01', title: 'Web path role', workerCategory: 'EMPLOYEE' }, 201);
  const position = await workforce(admin, 'POST', 'v1/positions', { code: `WEB-${code}`, jobProfileId: profile.id, effectiveFrom: '2026-01-01' }, 201);
  const engaged = await workforce(admin, 'POST', 'v1/engagements', { resourceId: person.id, positionId: position.id, engagementType: 'EMPLOYEE', startDate: '2026-02-01' }, 201);
  assert.equal(engaged.engagements[0].resourceName, 'Web path person');
  const list = await workforce(admin, 'GET', 'v1/positions?asOf=2026-10-01', undefined, 200);
  assert.equal(list.items.find((item) => item.id === position.id)?.incumbent?.resourceId, person.id);
  const rows = await prisma.$queryRaw`SELECT tenant_id, created_by FROM gigalibs_workforce.positions WHERE id = ${position.id}::uuid`;
  assert.deepEqual(rows, [{ tenant_id: tenant.id, created_by: admin.user.id }], 'records are keyed by the canonical tenant and user ids');

  await workforce(member, 'GET', 'v1/positions', undefined, 403);
  await workforce(admin, 'POST', `v1/engagements/${engaged.engagements[0].id}/delete`, {}, 404);

  console.log(`WI-OI-065 jobs web-path verification passed for run ${run}: Tenant Admin login → signed context → Workforce (person, job profile, position, engagement, as-of incumbent) keyed by canonical tenant ${tenant.id}; Member refused; unknown action not routed.`);
} finally {
  if (userIds.length) {
    await prisma.session.updateMany({ where: { userId: { in: userIds }, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
  }
  await prisma.$disconnect();
}
