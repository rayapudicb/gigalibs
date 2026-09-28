// WI-OI-038 browser-path certification: a real Tenant Admin login reaches CMMS only through the BFF-signed
// platform context with the tenant's canonical (cuid) id, and records land under that id — the prototype
// uuid-keyed schema could never accept it. A Member without cmms:* is refused, contained routes stay closed and
// cross-site writes are rejected. Creates a run-scoped `wi-oi-038-web-*` tenant with `@gigalibs.invalid` users;
// revokes their sessions afterwards.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

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
  const email = `wi-oi-038.web.${label}.${run}@gigalibs.invalid`;
  const user = await prisma.user.create({
    data: { email, name: `CMMS ${label}`, status: 'ACTIVE', passwordHash: await hashPassword(password) },
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

async function cmms(session, method, path, body, expected, origin = webUrl) {
  const response = await fetch(`${webUrl}/api/cmms/${path}`, {
    method,
    headers: {
      Cookie: session.cookie,
      Origin: origin,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
  });
  const payload = await response.json().catch(() => null);
  assert.equal(response.status, expected, `${method} /api/cmms/${path}: ${JSON.stringify(payload)}`);
  return payload;
}

try {
  const tenant = await prisma.tenant.create({
    data: {
      slug: `wi-oi-038-web-${run}`.slice(0, 63),
      name: 'WI-OI-038 CMMS web path',
      status: 'ACTIVE',
      region: 'local',
      features: ['asset-maintenance'],
      settings: { create: { branding: {}, security: { enforceMfa: false }, localization: {}, features: {}, metadata: {} } },
    },
  });
  const admin = await login(tenant.id, 'admin', 'TENANT_ADMIN');
  const member = await login(tenant.id, 'member', 'MEMBER');
  await prisma.tenantModuleEntitlement.create({
    data: {
      tenantId: tenant.id,
      moduleKey: 'asset-maintenance',
      status: 'ENABLED',
      source: 'PLATFORM_OVERRIDE',
      reason: 'WI-OI-038 web-path certification',
      updatedById: admin.user.id,
    },
  });

  const asset = await cmms(admin, 'POST', 'v1/assets', { assetTag: `WEB-${run}`, name: 'Web path pump' }, 201);
  assert.equal(asset.createdBy, admin.user.id, 'the acting user is the signed-context subject');
  const workOrder = await cmms(admin, 'POST', 'v1/work-orders', {
    requestKey: randomUUID(), type: 'REACTIVE', title: 'Web path work order', assetId: asset.id, tasks: [{ label: 'Inspect' }],
  }, 201);
  const started = await cmms(admin, 'POST', `v1/work-orders/${workOrder.id}/status`, { expectedVersion: workOrder.version, status: 'IN_PROGRESS' }, 200);
  const recorded = await cmms(admin, 'PATCH', `v1/work-orders/${workOrder.id}/tasks/${started.tasks[0].id}`, { expectedVersion: 1, status: 'DONE' }, 200);
  const completed = await cmms(admin, 'POST', `v1/work-orders/${workOrder.id}/status`, { expectedVersion: recorded.version, status: 'COMPLETED' }, 200);
  assert.equal(completed.status, 'COMPLETED');
  const overview = await cmms(admin, 'GET', 'v1/analytics/work-orders/overview', undefined, 200);
  assert.equal(overview.completedLast30Days, 1);

  const rows = await prisma.$queryRaw`SELECT tenant_id, created_by FROM gigalibs_cmms.work_orders WHERE id = ${workOrder.id}::uuid`;
  assert.deepEqual(rows, [{ tenant_id: tenant.id, created_by: admin.user.id }], 'records are keyed by the canonical tenant and user ids');

  await cmms(member, 'POST', 'v1/assets/search', {}, 403);
  await cmms(admin, 'GET', 'v1/workforce/resources', undefined, 404);
  await cmms(admin, 'POST', 'v1/vendors/search', {}, 404);
  await cmms(admin, 'POST', 'v1/assets', { assetTag: `XSITE-${run}`, name: 'x' }, 403, 'https://attacker.invalid');

  console.log(`WI-OI-038 CMMS web-path verification passed for run ${run}: Tenant Admin login → signed context → CMMS (asset, work order, task, completion, overview) keyed by canonical tenant ${tenant.id} and user ids; Member refused; contained routes 404; cross-site write refused.`);
} finally {
  if (userIds.length) {
    await prisma.session.updateMany({ where: { userId: { in: userIds }, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
  }
  await prisma.$disconnect();
}
