// WI-OI-064e/f live certification through the web BFF as a real platform administrator: create an isolated Demo
// Lab workspace, open it, generate synthetic data from its industry pack, drill down with catalogue metrics, prove
// non-demo workspaces are refused, reset, regenerate without duplicates, then delete (tenant and facts gone,
// audit kept). Creates `@gigalibs.invalid` users and run-scoped tenants; revokes sessions afterwards.
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

function cookieJar(response, previous = '') {
  const jar = new Map(previous.split('; ').filter(Boolean).map((pair) => [pair.split('=')[0], pair]));
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(';')[0];
    jar.set(pair.split('=')[0], pair);
  }
  return [...jar.values()].join('; ');
}

async function web(session, method, path, body, expected) {
  const response = await fetch(`${webUrl}${path}`, {
    method,
    headers: { Cookie: session.cookie, Origin: webUrl, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
  });
  const payload = await response.json().catch(() => null);
  if (expected !== undefined) assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(payload)}`);
  session.cookie = cookieJar(response, session.cookie);
  return payload;
}

async function user(label, { platformRole, tenantId, role } = {}) {
  const password = `Demo-${randomBytes(18).toString('base64url')}!`;
  const email = `wi-oi-064e.${label}.${run}@gigalibs.invalid`;
  const created = await prisma.user.create({ data: { email, name: `Demo ${label}`, status: 'ACTIVE', passwordHash: await hashPassword(password) } });
  userIds.push(created.id);
  if (platformRole) await prisma.platformRoleAssignment.create({ data: { userId: created.id, role: platformRole, reason: 'WI-OI-064e certification' } });
  if (tenantId) await prisma.tenantMember.create({ data: { userId: created.id, tenantId, role, status: 'ACTIVE' } });
  const response = await fetch(`${webUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: webUrl },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  });
  assert.equal(response.status, 200, `web login for ${label}: ${await response.text()}`);
  return { id: created.id, cookie: cookieJar(response) };
}

try {
  const admin = await user('platform-admin', { platformRole: 'PLATFORM_ADMIN' });
  const catalogues = await web(admin, 'GET', '/api/control/platform/demo-lab/catalogues', undefined, 200);
  assert.ok(catalogues.industries.some((pack) => pack.slug === 'qsr') && catalogues.countries.some((pack) => pack.code === 'jp'));

  const created = await web(admin, 'POST', '/api/control/platform/demo-lab/tenants', { industry: 'qsr', country: 'us', reason: `WI-OI-064e certification ${run}` }, 201);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: created.id }, select: { features: true, name: true } });
  assert.ok(tenant.features.includes('demo-lab'), 'demo workspace is labelled');
  assert.match(tenant.name, /^Demo Lab — /);
  const activations = await prisma.configurationActivation.findMany({ where: { tenantId: created.id, status: 'ACTIVE' }, select: { entityKey: true, surfaceKey: true } });
  assert.deepEqual(activations.map((row) => `${row.entityKey}/${row.surfaceKey}`).sort(), ['country-pack/us', 'industry-pack/qsr', 'metric-catalogue/operations']);

  const selected = await web(admin, 'POST', '/api/auth/select-tenant', { tenantId: created.id }, 200);
  assert.ok(!selected?.requiresMfa, 'demo workspace opens without MFA by default');

  const generated = await web(admin, 'POST', '/api/demo-lab/generate', { days: 30 }, 200);
  assert.equal(generated.facts, 24_000, '4 regions × 25 stores × 2 areas × 30 days × (3 + 2 per store) facts');

  const hours = await web(admin, 'POST', '/api/analytics/v1/places/metric-drilldown', {
    metric: { kind: 'AGGREGATE', key: 'labour_hours', label: 'Labour hours', unit: 'HOURS', factType: 'LABOUR_HOURS', aggregate: 'SUM' },
    under: '', from: generated.from, to: generated.to,
  }, 200);
  assert.deepEqual(hours.items.map((item) => item.code), ['REGION_01', 'REGION_02', 'REGION_03', 'REGION_04']);
  const expectedHours = await prisma.$queryRaw`SELECT round(SUM(quantity), 2)::float AS total FROM gigalibs_analytics.operational_facts WHERE tenant_id = ${created.id} AND fact_type = 'LABOUR_HOURS'`;
  assert.ok(Math.abs(hours.total.value - expectedHours[0].total) < 0.05, `estate hours ${hours.total.value} vs facts ${expectedHours[0].total}`);

  const store = await web(admin, 'POST', '/api/analytics/v1/places/metric-drilldown', {
    metric: { kind: 'RATIO', key: 'cost_per_labour_hour', label: 'Cost per labour hour', unit: 'CURRENCY', numerator: { factType: 'LABOUR_COST', aggregate: 'SUM' }, denominator: { factType: 'LABOUR_HOURS', aggregate: 'SUM' } },
    under: 'REGION_01.STORE_001', from: generated.from, to: generated.to,
  }, 200);
  assert.deepEqual(store.items.map((item) => item.code), ['AREA_1', 'AREA_2']);
  assert.ok(Math.abs(store.total.value - 16) < 0.01, `cost per labour hour ${store.total.value} should equal the pack rate 16`);

  // A workspace without the demo-lab label is refused.
  const ordinary = await prisma.tenant.create({
    data: { slug: `wi-oi-064e-plain-${run}`.slice(0, 63), name: 'WI-OI-064e plain', status: 'ACTIVE', region: 'local', features: ['analytics-studio'], settings: { create: { branding: {}, security: { enforceMfa: false }, localization: {}, features: {}, metadata: {} } } },
  });
  const plainAdmin = await user('plain-admin', { tenantId: ordinary.id, role: 'TENANT_ADMIN' });
  await web(plainAdmin, 'POST', '/api/demo-lab/generate', { days: 30 }, 404);

  const reset = await web(admin, 'POST', '/api/demo-lab/reset', {}, 200);
  assert.equal((await web(admin, 'GET', '/api/demo-lab/dataset', undefined, 200)).facts, 0, `reset ${JSON.stringify(reset)}`);
  assert.equal((await web(admin, 'POST', '/api/demo-lab/generate', { days: 30 }, 200)).facts, 24_000);
  assert.equal((await web(admin, 'GET', '/api/demo-lab/dataset', undefined, 200)).facts, 24_000, 'regeneration replaces rather than duplicates');
  const origins = await prisma.$queryRaw`SELECT DISTINCT origin FROM gigalibs_analytics.operational_facts WHERE tenant_id = ${created.id}`;
  assert.deepEqual(origins.map((row) => row.origin), ['SYNTHETIC']);

  const retired = await web(admin, 'POST', '/api/demo-lab/delete', {}, 200);
  assert.equal(retired.decommissioned, true);
  const closed = await prisma.tenant.findUniqueOrThrow({ where: { id: created.id }, select: { status: true } });
  assert.equal(closed.status, 'CANCELLED', 'demo workspace closed');
  assert.equal(await prisma.tenantMember.count({ where: { tenantId: created.id } }), 0, 'memberships removed');
  assert.equal(await prisma.session.count({ where: { tenantId: created.id, status: 'ACTIVE' } }), 0, 'sessions revoked');
  assert.equal(await prisma.tenantModuleEntitlement.count({ where: { tenantId: created.id, status: 'ENABLED' } }), 0, 'entitlements disabled');
  const leftover = await prisma.$queryRaw`SELECT count(*)::int AS facts FROM gigalibs_analytics.operational_facts WHERE tenant_id = ${created.id}`;
  assert.equal(leftover[0].facts, 0, 'synthetic facts purged');
  assert.equal(await prisma.auditLog.count({ where: { resource: 'demo-lab-tenant', resourceId: created.id, action: 'DELETE' } }), 1, 'decommission audited');
  const again = await user('platform-admin-2', { platformRole: 'PLATFORM_ADMIN' });
  const remaining = await web(again, 'GET', '/api/control/platform/demo-lab/tenants', undefined, 200);
  assert.ok(!remaining.items.some((item) => item.id === created.id), 'decommissioned workspace no longer listed');

  console.log(`WI-OI-064e Demo Lab verification passed for run ${run}: labelled workspace with three activated catalogues, 24,000 synthetic facts, estate and store drill-down (4 regions, cost per labour hour 16), non-demo workspace 404, reset to 0, regeneration without duplicates, decommission (closed, members removed, sessions revoked, entitlements disabled, facts purged, audit kept).`);
} finally {
  if (userIds.length) {
    await prisma.session.updateMany({ where: { userId: { in: userIds }, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
    await prisma.platformRoleAssignment.updateMany({ where: { userId: { in: userIds }, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
  }
  await prisma.$disconnect();
}
