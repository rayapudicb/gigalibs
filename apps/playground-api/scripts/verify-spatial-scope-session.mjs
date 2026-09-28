// WI-OI-063b live control-plane certification: real logins through the running API prove the session's
// spatial scope, the admin opt-in switch and place assignment, their audit records, and the permission
// denials. Creates run-scoped `wi-oi-063-scope-*` tenants and `@gigalibs.invalid` users; revokes their sessions.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const baseUrl = process.env.CONTROL_PLANE_TEST_URL;
if (!baseUrl) throw new Error('CONTROL_PLANE_TEST_URL is required');
const [{ prisma }, { hashPassword }] = await Promise.all([
  import('../../../packages/db/dist/index.js'),
  import('../../../packages/auth-core/dist/index.js'),
]);

const run = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const placeA = randomUUID();
const placeB = randomUUID();
const userIds = [];

async function request(path, { token, expected, ...init } = {}) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const body = await response.json().catch(() => null);
  if (expected !== undefined) {
    assert.equal(response.status, expected, `${init.method ?? 'GET'} ${path}: ${JSON.stringify(body)}`);
  }
  return { status: response.status, body };
}

async function tenant(label, features) {
  return prisma.tenant.create({
    data: {
      slug: `wi-oi-063-scope-${label}-${run}`.slice(0, 63),
      name: `WI-OI-063 scope ${label}`,
      status: 'ACTIVE',
      region: 'local',
      features,
      settings: { create: { branding: {}, security: { enforceMfa: false }, localization: {}, features: {}, metadata: {} } },
    },
  });
}

async function member(tenantId, label, role, spatialScopePlaceIds) {
  const password = `Scope-${randomBytes(18).toString('base64url')}!`;
  const email = `wi-oi-063.scope.${label}.${run}@gigalibs.invalid`;
  const user = await prisma.user.create({
    data: { email, name: `Scope ${label}`, status: 'ACTIVE', passwordHash: await hashPassword(password) },
  });
  userIds.push(user.id);
  const membership = await prisma.tenantMember.create({
    data: { userId: user.id, tenantId, role, status: 'ACTIVE', spatialScopePlaceIds },
  });
  const login = await request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }), expected: 200 });
  return { membershipId: membership.id, token: login.body.accessToken };
}

const scopeOf = async (token) => (await request('/api/v1/auth/context', { token, expected: 200 })).body.spatialScope;

try {
  const opted = await tenant('opted', ['spatial-scoping']);
  const flat = await tenant('flat', []);
  const admin = await member(opted.id, 'admin', 'TENANT_ADMIN', [placeA]);
  const scoped = await member(opted.id, 'scoped', 'MEMBER', [placeA]);
  const empty = await member(opted.id, 'empty', 'MEMBER', []);
  const unscoped = await member(flat.id, 'flat', 'MEMBER', [placeA]);

  assert.deepEqual(await scopeOf(admin.token), { mode: 'UNBOUNDED' }, 'tenant admin stays unbounded');
  assert.deepEqual(await scopeOf(scoped.token), { mode: 'SCOPED_PLACES', placeIds: [placeA] }, 'member gets assigned places');
  assert.deepEqual(await scopeOf(empty.token), { mode: 'SCOPED_PLACES', placeIds: [] }, 'unassigned member fails closed');
  assert.deepEqual(await scopeOf(unscoped.token), { mode: 'UNBOUNDED' }, 'tenant without opt-in stays unbounded');

  // Administrator assigns a place through the versioned member update; the next session read reflects it.
  const current = await prisma.tenantMember.findUniqueOrThrow({ where: { id: empty.membershipId } });
  await request(`/api/v1/tenants/current/members/${empty.membershipId}`, {
    token: admin.token,
    method: 'PATCH',
    body: JSON.stringify({ expectedUpdatedAt: current.updatedAt.toISOString(), spatialScopePlaceIds: [placeB], reason: 'WI-OI-063 scope certification' }),
    expected: 200,
  });
  assert.deepEqual(await scopeOf(empty.token), { mode: 'SCOPED_PLACES', placeIds: [placeB] }, 'assignment reaches the session');
  const assignAudit = await prisma.auditLog.findFirst({
    where: { tenantId: opted.id, action: 'PERMISSION_CHANGE', resourceId: empty.membershipId },
    orderBy: { createdAt: 'desc' },
  });
  assert.deepEqual(assignAudit?.before?.spatialScopePlaceIds, [], 'assignment audit records before');
  assert.deepEqual(assignAudit?.after?.spatialScopePlaceIds, [placeB], 'assignment audit records after');

  // Invalid and unauthorized changes are refused.
  const fresh = await prisma.tenantMember.findUniqueOrThrow({ where: { id: empty.membershipId } });
  await request(`/api/v1/tenants/current/members/${empty.membershipId}`, {
    token: admin.token,
    method: 'PATCH',
    body: JSON.stringify({ expectedUpdatedAt: fresh.updatedAt.toISOString(), spatialScopePlaceIds: ['APAC.BLR_01'], reason: 'invalid path' }),
    expected: 400,
  });
  const memberSelfAssign = await request(`/api/v1/tenants/current/members/${scoped.membershipId}`, {
    token: scoped.token,
    method: 'PATCH',
    body: JSON.stringify({ expectedUpdatedAt: fresh.updatedAt.toISOString(), spatialScopePlaceIds: [], reason: 'widen myself' }),
  });
  assert.equal(memberSelfAssign.status, 403, 'a member cannot change spatial scope');
  const memberToggle = await request('/api/v1/tenants/current/organization/settings', {
    token: scoped.token, method: 'PATCH', body: JSON.stringify({ spatialScopingEnabled: false }),
  });
  assert.equal(memberToggle.status, 403, 'a member cannot turn spatial scoping off');

  // Administrator turns scoping off: members become unbounded again, with a before/after audit.
  const off = await request('/api/v1/tenants/current/organization/settings', {
    token: admin.token, method: 'PATCH', body: JSON.stringify({ spatialScopingEnabled: false }), expected: 200,
  });
  assert.equal(off.body.spatialScopingEnabled, false);
  assert.deepEqual(await scopeOf(scoped.token), { mode: 'UNBOUNDED' }, 'opt-out reaches the session');
  const settingsAudit = await prisma.auditLog.findFirst({
    where: { tenantId: opted.id, action: 'SETTINGS_CHANGE' }, orderBy: { createdAt: 'desc' },
  });
  assert.equal(settingsAudit?.before?.spatialScopingEnabled, true);
  assert.equal(settingsAudit?.after?.spatialScopingEnabled, false);

  console.log(`WI-OI-063 session scope probe passed for run ${run}: admin unbounded, member scoped, empty scope fails closed, no opt-in unbounded, audited assignment reaches the session, invalid ids 400, member self-change and toggle 403, audited opt-out.`);
} finally {
  if (userIds.length) {
    await prisma.session.updateMany({ where: { userId: { in: userIds }, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
  }
  await prisma.$disconnect();
}
