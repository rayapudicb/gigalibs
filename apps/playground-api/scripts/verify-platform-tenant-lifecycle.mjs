import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

try {
  process.loadEnvFile?.(resolve(repositoryRoot, '.env'));
} catch {}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const [{ prisma }, { hashPassword }] = await Promise.all([
  import('../../../packages/db/dist/index.js'),
  import('../../../packages/auth-core/dist/index.js'),
]);

const baseUrl = process.env.CONTROL_PLANE_TEST_URL?.trim();
if (!baseUrl) throw new Error('CONTROL_PLANE_TEST_URL is required');
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const platformEmail = `uat.lifecycle.owner.${suffix}@gigalibs.invalid`;
const tenantOwnerEmail = `uat.lifecycle.member.${suffix}@gigalibs.invalid`;
const platformPassword = `Owner-${randomBytes(18).toString('base64url')}!`;
const tenantPassword = `Member-${randomBytes(18).toString('base64url')}!`;
const tenantSlug = `uat-lifecycle-${suffix}`.slice(0, 63);
const correlationPrefix = `uat-lifecycle-${suffix}`;
const outcomes = [];
let platformUser;
let tenantOwner;
let tenantId;

async function request(path, { token, expected, correlation, ...init } = {}) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('X-Correlation-ID', correlation ?? `${correlationPrefix}-${outcomes.length}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const body = await response.json().catch(() => null);
  if (expected !== undefined) {
    assert.equal(response.status, expected, `${init.method ?? 'GET'} ${path}: ${JSON.stringify(body)}`);
  }
  return { status: response.status, body };
}

async function cleanup() {
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    if (tenantId) {
      await transaction.session.updateMany({
        where: { tenantId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now },
      });
      await transaction.tenant.updateMany({
        where: { id: tenantId },
        data: { status: 'CANCELLED' },
      });
    }
    const userIds = [platformUser?.id, tenantOwner?.id].filter(
      (value) => typeof value === 'string',
    );
    if (userIds.length > 0) {
      await transaction.session.updateMany({
        where: { userId: { in: userIds }, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now },
      });
      await transaction.platformRoleAssignment.updateMany({
        where: { userId: { in: userIds }, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now, reason: 'Certification completed' },
      });
      await transaction.user.updateMany({
        where: { id: { in: userIds } },
        data: { status: 'DEACTIVATED' },
      });
    }
  });
}

async function deactivateStaleCertificationRecords() {
  const [tenants, users] = await Promise.all([
    prisma.tenant.findMany({
      where: { slug: { startsWith: 'uat-lifecycle-' }, status: { not: 'CANCELLED' } },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: {
        email: { startsWith: 'uat.lifecycle.', endsWith: '@gigalibs.invalid' },
        status: { not: 'DEACTIVATED' },
      },
      select: { id: true },
    }),
  ]);
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    const tenantIds = tenants.map((tenant) => tenant.id);
    const userIds = users.map((user) => user.id);
    if (tenantIds.length > 0) {
      await transaction.session.updateMany({
        where: { tenantId: { in: tenantIds }, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now },
      });
      await transaction.tenant.updateMany({
        where: { id: { in: tenantIds } },
        data: { status: 'CANCELLED' },
      });
    }
    if (userIds.length > 0) {
      await transaction.session.updateMany({
        where: { userId: { in: userIds }, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now },
      });
      await transaction.platformRoleAssignment.updateMany({
        where: { userId: { in: userIds }, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now, reason: 'Stale certification cleanup' },
      });
      await transaction.user.updateMany({
        where: { id: { in: userIds } },
        data: { status: 'DEACTIVATED' },
      });
    }
  });
}

try {
  await deactivateStaleCertificationRecords();
  [platformUser, tenantOwner] = await prisma.$transaction([
    prisma.user.create({
      data: {
        email: platformEmail,
        name: 'UAT Lifecycle Platform Owner',
        status: 'ACTIVE',
        passwordHash: await hashPassword(platformPassword),
      },
    }),
    prisma.user.create({
      data: {
        email: tenantOwnerEmail,
        name: 'UAT Lifecycle Tenant Owner',
        status: 'ACTIVE',
        passwordHash: await hashPassword(tenantPassword),
      },
    }),
  ]);
  await prisma.platformRoleAssignment.create({
    data: {
      userId: platformUser.id,
      role: 'PLATFORM_OWNER',
      reason: 'Isolated tenant lifecycle certification',
    },
  });

  const platformLogin = await request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: platformEmail, password: platformPassword }),
    expected: 200,
  });
  const tenantLogin = await request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: tenantOwnerEmail, password: tenantPassword }),
    expected: 200,
  });
  const platformToken = platformLogin.body.accessToken;
  const catalog = await request('/api/v1/platform/catalog', {
    token: platformToken,
    expected: 200,
  });

  const created = await request('/api/v1/platform/tenants', {
    token: platformToken,
    method: 'POST',
    body: JSON.stringify({
      name: 'UAT Lifecycle Tenant',
      slug: tenantSlug,
      ownerEmail: tenantOwnerEmail,
      trialDays: 7,
      isolationMode: 'ROW_LEVEL_SECURITY',
      region: 'local',
      moduleKeys: ['tenant-access', 'personal-security'],
      reason: 'Isolated tenant creation certification',
    }),
    expected: 201,
  });
  tenantId = created.body.id;
  assert.equal(created.body.status, 'TRIAL');
  assert.equal(created.body.owner.user.id, tenantOwner.id);
  assert.equal(created.body.isolationBinding.status, 'REQUESTED');
  assert.equal(created.body.isolationBinding.effectiveMode, null);
  if (catalog.body.tenantBaseDomain) {
    assert.equal(created.body.subdomainBinding?.status, 'RESERVED');
  } else {
    assert.equal(created.body.subdomainBinding, null);
  }
  outcomes.push('tenant-created-atomically-with-trial-owner-entitlements-and-requests');

  const selected = await request('/api/v1/auth/select-tenant', {
    token: tenantLogin.body.accessToken,
    method: 'POST',
    body: JSON.stringify({ tenantId }),
    expected: 200,
  });
  const tenantToken = selected.body.accessToken;
  await request('/api/v1/auth/context', { token: tenantToken, expected: 200 });
  outcomes.push('tenant-owner-selected-active-trial');

  const originalTrialEnd = new Date(created.body.trialEndsAt).getTime();
  const extended = await request(`/api/v1/platform/tenants/${tenantId}/trial-extension`, {
    token: platformToken,
    method: 'POST',
    body: JSON.stringify({ days: 7, reason: 'Isolated trial extension certification' }),
    expected: 201,
  });
  assert.ok(new Date(extended.body.trialEndsAt).getTime() > originalTrialEnd);
  outcomes.push('trial-extension-persisted-and-audited');

  const entitlements = await request(`/api/v1/platform/tenants/${tenantId}/entitlements`, {
    token: platformToken,
    method: 'PUT',
    body: JSON.stringify({
      moduleKeys: ['tenant-access'],
      reason: 'Isolated entitlement reduction certification',
    }),
    expected: 200,
  });
  assert.deepEqual(
    entitlements.body.moduleEntitlements
      .filter((value) => value.status === 'ENABLED')
      .map((value) => value.moduleKey),
    ['tenant-access'],
  );
  const persistedFeatures = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { features: true },
  });
  assert.deepEqual(persistedFeatures?.features, ['tenant-access']);
  await request(`/api/v1/platform/tenants/${tenantId}/entitlements`, {
    token: platformToken,
    method: 'PUT',
    body: JSON.stringify({
      moduleKeys: ['workflow-definitions'],
      reason: 'Contained module rejection certification',
    }),
    expected: 400,
  });
  const afterRejectedEntitlement = await request(`/api/v1/platform/tenants/${tenantId}`, {
    token: platformToken,
    expected: 200,
  });
  assert.deepEqual(
    afterRejectedEntitlement.body.moduleEntitlements
      .filter((value) => value.status === 'ENABLED')
      .map((value) => value.moduleKey),
    ['tenant-access'],
  );
  outcomes.push('entitlements-allowlisted-and-contained-module-rejected-without-write');

  const isolation = await request(`/api/v1/platform/tenants/${tenantId}/isolation-requests`, {
    token: platformToken,
    method: 'POST',
    body: JSON.stringify({
      isolationMode: 'DEDICATED_DATABASE',
      region: 'us-east-1',
      reason: 'Isolated dedicated database request certification',
    }),
    expected: 201,
  });
  assert.equal(isolation.body.isolationBinding.status, 'REQUESTED');
  assert.equal(isolation.body.isolationBinding.effectiveMode, null);
  assert.equal(isolation.body.isolationBinding.bindingReference, null);
  outcomes.push('isolation-remained-requested-without-fabricated-provider-success');

  const suspended = await request(`/api/v1/platform/tenants/${tenantId}/status`, {
    token: platformToken,
    method: 'PATCH',
    body: JSON.stringify({ status: 'SUSPENDED', reason: 'Isolated suspension certification' }),
    expected: 200,
  });
  assert.equal(suspended.body.status, 'SUSPENDED');
  await request('/api/v1/auth/context', { token: tenantToken, expected: 401 });
  outcomes.push('tenant-suspension-revoked-active-tenant-sessions');

  const activated = await request(`/api/v1/platform/tenants/${tenantId}/status`, {
    token: platformToken,
    method: 'PATCH',
    body: JSON.stringify({
      status: 'ACTIVE',
      plan: 'UAT_CERTIFICATION',
      billingReference: 'uat-certification-reference',
      reason: 'Isolated activation certification',
    }),
    expected: 200,
  });
  assert.equal(activated.body.status, 'ACTIVE');
  assert.equal(activated.body.plan, 'UAT_CERTIFICATION');
  const relogin = await request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: tenantOwnerEmail, password: tenantPassword }),
    expected: 200,
  });
  await request('/api/v1/auth/context', { token: relogin.body.accessToken, expected: 200 });
  outcomes.push('explicit-reactivation-restored-new-login-without-restoring-old-session');

  const cancelled = await request(`/api/v1/platform/tenants/${tenantId}/status`, {
    token: platformToken,
    method: 'PATCH',
    body: JSON.stringify({ status: 'CANCELLED', reason: 'Isolated cancellation certification' }),
    expected: 200,
  });
  assert.equal(cancelled.body.status, 'CANCELLED');
  await request('/api/v1/auth/context', { token: relogin.body.accessToken, expected: 401 });
  await request(`/api/v1/platform/tenants/${tenantId}/trial-extension`, {
    token: platformToken,
    method: 'POST',
    body: JSON.stringify({ days: 7, reason: 'Cancelled tenant denial certification' }),
    expected: 409,
  });
  await request(`/api/v1/platform/tenants/${tenantId}/status`, {
    token: platformToken,
    method: 'PATCH',
    body: JSON.stringify({ status: 'ACTIVE', reason: 'Cancelled tenant restoration denial' }),
    expected: 409,
  });
  outcomes.push('cancellation-revoked-sessions-and-required-separate-restoration');

  const auditRows = await prisma.auditLog.findMany({
    where: { tenantId },
    select: { action: true, resource: true, before: true, after: true, metadata: true },
  });
  assert.ok(auditRows.length >= 7);
  const auditJson = JSON.stringify(auditRows);
  assert.equal(auditJson.includes(platformPassword), false);
  assert.equal(auditJson.includes(tenantPassword), false);
  assert.ok(auditRows.every((row) => row.metadata !== null));
  outcomes.push('lifecycle-decisions-retained-as-redacted-audit-evidence');

  const evidence = {
    recordedAt: new Date().toISOString(),
    environment: 'local-uat',
    database: 'PostgreSQL 16',
    activeCertificationRecordsRetained: false,
    appendOnlyAuditEvidenceRetained: true,
    rawCredentialsPersistedInEvidence: false,
    providerSuccessSimulated: false,
    outcomes,
    outcomeCount: outcomes.length,
  };
  const output = process.env.TENANT_LIFECYCLE_EVIDENCE_PATH?.trim();
  if (output) {
    await writeFile(resolve(repositoryRoot, output), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(evidence));
} finally {
  await cleanup().catch(() => undefined);
  await prisma.$disconnect();
}
