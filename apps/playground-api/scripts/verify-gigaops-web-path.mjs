// Browser-path certification for the P6–P8 screens' BFF paths (WI-OI-068 to WI-OI-071) against the web image:
// real logins, BFF-signed contexts, the live punch geofence composition against a real Geospatial boundary, time,
// pay and CMMS staffing through the web, and refusals (member, relay inbox, unknown routes). Creates a run-scoped
// `gigaops-web-*` tenant with `@gigalibs.invalid` users and revokes their sessions afterwards.
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
const code = run.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
const userIds = [];

async function login(tenantId, label, role) {
  const password = `Web-${randomBytes(18).toString('base64url')}!`;
  const email = `gigaops-web.${label}.${run}@gigalibs.invalid`;
  const user = await prisma.user.create({ data: { email, name: `GigaOps ${label}`, status: 'ACTIVE', passwordHash: await hashPassword(password) } });
  userIds.push(user.id);
  await prisma.tenantMember.create({ data: { userId: user.id, tenantId, role, status: 'ACTIVE' } });
  const response = await fetch(`${webUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: webUrl },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  });
  assert.equal(response.status, 200, `web login for ${label}: ${await response.text()}`);
  return { user, email, password, cookie: response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ') };
}

async function bff(session, upstream, method, path, body, expected) {
  const response = await fetch(`${webUrl}/api/${upstream}/${path}`, {
    method,
    headers: { Cookie: session.cookie, Origin: webUrl, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
  });
  const payload = await response.json().catch(() => null);
  assert.equal(response.status, expected, `${method} /api/${upstream}/${path}: ${JSON.stringify(payload)}`);
  return payload;
}

async function eventually(label, check, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${label}: not reached within ${timeoutMs} ms`);
}

const ago = (seconds) => new Date(Date.now() - seconds * 1000).toISOString();

try {
  const tenant = await prisma.tenant.create({
    data: {
      slug: `gigaops-web-${run}`.slice(0, 63),
      name: 'GigaOps P6–P8 web path',
      status: 'ACTIVE',
      region: 'local',
      features: ['gigaops', 'asset-maintenance', 'geospatial-studio'],
      settings: { create: { branding: {}, security: { enforceMfa: false }, localization: {}, features: {}, metadata: {} } },
    },
  });
  const admin = await login(tenant.id, 'admin', 'TENANT_ADMIN');
  const member = await login(tenant.id, 'member', 'MEMBER');
  for (const moduleKey of ['gigaops', 'asset-maintenance', 'geospatial-studio']) {
    await prisma.tenantModuleEntitlement.create({
      data: { tenantId: tenant.id, moduleKey, status: 'ENABLED', source: 'PLATFORM_OVERRIDE', reason: 'GigaOps P6–P8 web-path certification', updatedById: admin.user.id },
    });
  }

  // A real site with a boundary (≈111 m square at 12.9716, 77.5946).
  const siteType = await bff(admin, 'maps', 'POST', 'v1/node-types', { code: `SITE_${code}`.slice(0, 63), label: 'Site' }, 201);
  const site = await bff(admin, 'maps', 'POST', 'v1/nodes', {
    code: `YARD_${code}`.slice(0, 63), displayName: `Yard ${run}`, nodeTypeId: siteType.id,
    latitude: 12.9721, longitude: 77.5951,
    boundary: { type: 'Polygon', coordinates: [[[77.5946, 12.9716], [77.5956, 12.9716], [77.5956, 12.9726], [77.5946, 12.9726], [77.5946, 12.9716]]] },
  }, 201);

  // Time: the BFF discards client evidence and composes the fence from the boundary as the same user.
  await bff(admin, 'workforce', 'POST', 'v1/resources', { referenceCode: `WEB-${code}`, displayName: `Web worker ${run}`, resourceType: 'HUMAN', platformUserId: admin.user.id }, 201);
  const inside = await bff(admin, 'workforce', 'POST', 'v1/punches', {
    deviceId: `web-${code}`, deviceEventId: randomUUID(), kind: 'CLOCK_IN', occurredAt: ago(60), timeZone: 'Asia/Kolkata', siteRef: site.id,
    location: { latitude: 12.9721, longitude: 77.5951, accuracyMeters: 10 },
    geofence: { result: 'OUTSIDE', placeRef: site.id, distanceToEdgeMeters: 999, reason: 'forged' },
  }, 201);
  assert.equal(inside.geofence, 'INSIDE', 'a forged client verdict is replaced by the BFF evaluation');
  const outside = await bff(admin, 'workforce', 'POST', 'v1/punches', {
    deviceId: `web-${code}`, deviceEventId: randomUUID(), kind: 'CLOCK_OUT', occurredAt: ago(30), timeZone: 'Asia/Kolkata', siteRef: site.id,
    location: { latitude: 12.9721, longitude: 77.5990, accuracyMeters: 10 },
    geofence: { result: 'INSIDE', placeRef: site.id, distanceToEdgeMeters: 0, reason: null },
  }, 201);
  assert.equal(outside.geofence, 'OUTSIDE');
  assert.deepEqual(outside.exceptions, ['OUT_OF_FENCE']);
  assert.ok(outside.distanceToEdgeMeters > 300 && outside.distanceToEdgeMeters < 400, `distance ${outside.distanceToEdgeMeters}`);
  const monday = (() => {
    const day = new Date(`${inside.workDate}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    return day.toISOString().slice(0, 10);
  })();
  const preview = await bff(admin, 'workforce', 'GET', `v1/timesheets/preview?periodStart=${monday}`, undefined, 200);
  assert.equal(preview.openExceptions, 1);
  const exceptions = await bff(admin, 'workforce', 'GET', 'v1/time-exceptions?status=OPEN', undefined, 200);
  assert.equal(exceptions.items[0].kind, 'OUT_OF_FENCE');

  // Pay: packs and the reference-pack flag reach the screen; an empty week is refused by the service.
  const packs = await bff(admin, 'workforce', 'GET', 'v1/pay-packs', undefined, 200);
  assert.deepEqual(packs.items.map((pack) => pack.code).sort(), ['IN-48', 'US-CA-OT']);
  assert.equal(typeof packs.referencePacksEnabled, 'boolean');
  const empty = await bff(admin, 'workforce', 'POST', 'v1/pay-runs', { requestKey: randomUUID(), periodStart: '2026-01-05' }, 409);
  assert.equal(empty.message?.code ?? empty.code, 'WORKFORCE_PAY_RUN_EMPTY');

  // CMMS staffing through the web, answered by Workforce through the relays.
  const workOrder = await bff(admin, 'cmms', 'POST', 'v1/work-orders', { requestKey: randomUUID(), type: 'REACTIVE', title: `Web staffing ${run}`, siteRef: site.id }, 201);
  const requested = await bff(admin, 'cmms', 'POST', `v1/work-orders/${workOrder.id}/staffing`, { startsAt: '2026-12-01T08:00:00Z', endsAt: '2026-12-01T12:00:00Z', headcount: 1, capabilityCodes: [] }, 200);
  assert.equal(requested.staffing.status, 'REQUESTED');
  await eventually('staffing accepted through the relays', async () => (await bff(admin, 'cmms', 'GET', `v1/work-orders/${workOrder.id}`, undefined, 200)).staffing?.status === 'ACCEPTED');

  // Refusals.
  await bff(member, 'workforce', 'POST', 'v1/punches', { deviceId: 'x', deviceEventId: randomUUID(), kind: 'CLOCK_IN', occurredAt: ago(5), timeZone: 'UTC' }, 403);
  await bff(member, 'workforce', 'GET', 'v1/pay-runs', undefined, 403);
  await bff(member, 'cmms', 'POST', `v1/work-orders/${workOrder.id}/staffing`, { startsAt: '2026-12-01T08:00:00Z', endsAt: '2026-12-01T12:00:00Z' }, 403);
  for (const [upstream, path] of [['cmms', 'internal/v1/inbox'], ['workforce', 'internal/v1/inbox'], ['workforce', 'v1/pay-runs/x/delete']]) {
    await bff(admin, upstream, 'POST', path, {}, 404);
  }
  const crossSite = await fetch(`${webUrl}/api/workforce/punches`, {
    method: 'POST',
    headers: { Cookie: admin.cookie, Origin: 'https://attacker.invalid', 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(crossSite.status, 403);

  process.stdout.write(`${JSON.stringify({ email: admin.email, password: admin.password, tenantId: tenant.id, siteId: site.id, workOrderId: workOrder.id, run })}\n`);
  console.error(`GigaOps P6–P8 web-path verification passed for run ${run}: real Tenant Admin login → BFF-signed Workforce, CMMS and Geospatial contexts; live punch geofence composed by the BFF from a real boundary (forged INSIDE/OUTSIDE verdicts replaced: inside, and outside at ${Math.round(outside.distanceToEdgeMeters)} m with an OUT_OF_FENCE exception); timesheet preview and exception inbox; pay packs with the reference-pack flag and an empty week refused; CMMS staffing through the web accepted by Workforce through the relays; Member refused (punch, pay, staffing); relay inboxes and unknown routes not routed; cross-site mutation refused.`);
} finally {
  if (userIds.length && process.env.KEEP_SESSIONS !== 'true') {
    await prisma.session.updateMany({ where: { userId: { in: userIds }, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
  }
  await prisma.$disconnect();
}
