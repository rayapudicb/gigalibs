import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const [{ prisma }, { hashPassword }] = await Promise.all([
  import('../../../packages/db/dist/index.js'),
  import('../../../packages/auth-core/dist/index.js'),
]);

const baseUrl = process.env.CONTROL_PLANE_TEST_URL;
if (!baseUrl) throw new Error('CONTROL_PLANE_TEST_URL is required');
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const ownerEmail = `uat.platform-owner.${suffix}@gigalibs.invalid`;
const targetEmail = `uat.identity.${suffix}@gigalibs.invalid`;
const ownerPassword = `Owner-${randomBytes(18).toString('base64url')}!`;
const firstPassword = `Initial-${randomBytes(18).toString('base64url')}!`;
const secondPassword = `Changed-${randomBytes(18).toString('base64url')}!`;
const finalPassword = `Recovered-${randomBytes(18).toString('base64url')}!`;
const outcomes = [];
let owner;
let target;
let identityTenant;

async function deactivateCertificationIdentities(userIds, event) {
  if (userIds.length === 0) return;
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    await transaction.session.updateMany({
      where: { userId: { in: userIds }, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: now },
    });
    await transaction.platformRoleAssignment.updateMany({
      where: { userId: { in: userIds }, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: now, reason: event },
    });
    await transaction.user.updateMany({
      where: { id: { in: userIds } },
      data: { status: 'DEACTIVATED' },
    });
    for (const userId of userIds) {
      await transaction.auditLog.create({
        data: {
          action: 'STATUS_CHANGE',
          resource: 'uat_identity_certification',
          resourceId: userId,
          after: { status: 'DEACTIVATED' },
          metadata: { event, sessionsRevoked: true, platformRolesRevoked: true },
        },
      });
    }
  });
}

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

try {
  const staleCertificationUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { startsWith: 'uat.platform-owner.', endsWith: '@gigalibs.invalid' } },
        { email: { startsWith: 'uat.identity.', endsWith: '@gigalibs.invalid' } },
      ],
      status: { not: 'DEACTIVATED' },
    },
    select: { id: true },
  });
  await deactivateCertificationIdentities(
    staleCertificationUsers.map((user) => user.id),
    'STALE_CERTIFICATION_CLEANUP',
  );
  [owner, target] = await prisma.$transaction([
    prisma.user.create({
      data: {
        email: ownerEmail,
        name: 'UAT Platform Owner',
        status: 'ACTIVE',
        passwordHash: await hashPassword(ownerPassword),
      },
    }),
    prisma.user.create({
      data: {
        email: targetEmail,
        name: 'UAT Identity Subject',
        status: 'ACTIVE',
        passwordHash: await hashPassword(firstPassword),
      },
    }),
  ]);
  await prisma.platformRoleAssignment.create({
    data: {
      userId: owner.id,
      role: 'PLATFORM_OWNER',
      reason: 'Isolated local identity certification',
    },
  });
  identityTenant = await prisma.tenant.create({
    data: {
      slug: `uat-identity-${suffix}`.slice(0, 63),
      name: 'UAT External Identity Tenant',
      status: 'ACTIVE',
      region: 'local',
      oidcConfiguration: {
        create: {
          issuer: 'https://uat-issuer.gigalibs.invalid',
          clientId: 'uat-client',
          clientSecretEnvelope: 'isolated-test-envelope',
          keyVersion: 'isolated-test-key',
          enabled: true,
          configuredById: owner.id,
        },
      },
    },
    include: { oidcConfiguration: { select: { id: true } } },
  });
  await prisma.externalIdentity.create({
    data: {
      issuer: 'https://uat-issuer.gigalibs.invalid',
      subject: `uat-subject-${suffix}`,
      userId: target.id,
      configurationId: identityTenant.oidcConfiguration.id,
      lastLoginAt: new Date(),
    },
  });

  const ownerLogin = await request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
    expected: 200,
  });
  const targetLoginOne = await request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: targetEmail, password: firstPassword }),
    expected: 200,
  });
  const targetLoginTwo = await request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: targetEmail, password: firstPassword }),
    expected: 200,
  });
  const ownerToken = ownerLogin.body.accessToken;
  const targetTokenOne = targetLoginOne.body.accessToken;
  const targetTokenTwo = targetLoginTwo.body.accessToken;

  const profile = await request('/api/v1/auth/profile', { token: targetTokenOne, expected: 200 });
  const changedProfile = await request('/api/v1/auth/profile', {
    token: targetTokenOne,
    method: 'PATCH',
    body: JSON.stringify({
      name: 'UAT Identity Subject Updated',
      phone: `+1555${String(Date.now()).slice(-7)}`,
      expectedUpdatedAt: profile.body.updatedAt,
    }),
    expected: 200,
  });
  assert.equal(changedProfile.body.name, 'UAT Identity Subject Updated');
  outcomes.push('profile-persisted-with-optimistic-version');

  await request('/api/v1/auth/change-password', {
    token: targetTokenOne,
    method: 'POST',
    body: JSON.stringify({ newPassword: secondPassword }),
    expected: 400,
  });
  await request('/api/v1/auth/change-password', {
    token: targetTokenOne,
    method: 'POST',
    body: JSON.stringify({ currentPassword: 'wrong-password', newPassword: secondPassword }),
    expected: 401,
  });
  await request('/api/v1/auth/change-password', {
    token: targetTokenOne,
    method: 'POST',
    body: JSON.stringify({ currentPassword: firstPassword, newPassword: secondPassword }),
    expected: 200,
  });
  await request('/api/v1/auth/context', { token: targetTokenTwo, expected: 401 });
  await request('/api/v1/auth/context', { token: targetTokenOne, expected: 200 });
  outcomes.push('password-change-required-current-and-revoked-other-sessions');

  const directory = await request(`/api/v1/platform/users?search=${encodeURIComponent(targetEmail)}&limit=10`, {
    token: ownerToken,
    expected: 200,
  });
  assert.equal(directory.body.total, 1);
  assert.equal(directory.body.data[0].email, targetEmail);
  assert.equal('passwordHash' in directory.body.data[0], false);
  outcomes.push('platform-directory-safe-projection');

  const granted = await request(`/api/v1/platform/users/${target.id}/platform-role`, {
    token: ownerToken,
    method: 'PUT',
    body: JSON.stringify({
      role: 'PLATFORM_AUDITOR',
      enabled: true,
      expiresAt: null,
      expectedUpdatedAt: null,
      reason: 'Isolated local role grant certification',
    }),
    expected: 200,
  });
  const assignment = granted.body.platformRoleAssignments.find(
    (value) => value.role === 'PLATFORM_AUDITOR',
  );
  assert.equal(assignment.status, 'ACTIVE');
  await request(`/api/v1/platform/users/${target.id}/platform-role`, {
    token: ownerToken,
    method: 'PUT',
    body: JSON.stringify({
      role: 'PLATFORM_AUDITOR',
      enabled: false,
      expiresAt: null,
      expectedUpdatedAt: assignment.updatedAt,
      reason: 'Isolated local role revoke certification',
    }),
    expected: 200,
  });
  outcomes.push('platform-role-grant-and-revoke');

  const issued = await request(`/api/v1/platform/users/${target.id}/password-reset`, {
    token: ownerToken,
    method: 'POST',
    body: JSON.stringify({
      expiresInMinutes: 30,
      reason: 'Isolated local assisted password recovery certification',
    }),
    expected: 201,
  });
  assert.equal(issued.body.delivery, 'DISPLAY_ONCE');
  const digest = createHash('sha256').update(issued.body.token, 'utf8').digest('hex');
  const stored = await prisma.passwordResetCredential.findUnique({ where: { tokenDigest: digest } });
  assert.ok(stored);
  assert.notEqual(stored.tokenDigest, issued.body.token);
  const relatedAudit = await prisma.auditLog.findMany({
    where: {
      OR: [
        { resourceId: target.id },
        { metadata: { path: ['subjectUserId'], equals: target.id } },
      ],
    },
    select: { before: true, after: true, metadata: true },
  });
  assert.equal(JSON.stringify(relatedAudit).includes(issued.body.token), false);
  outcomes.push('password-recovery-digest-only-and-audit-redacted');

  await request('/api/v1/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token: issued.body.token, password: finalPassword }),
    expected: 200,
  });
  await request('/api/v1/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token: issued.body.token, password: finalPassword }),
    expected: 401,
  });
  await request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: targetEmail, password: secondPassword }),
    expected: 401,
  });
  const recoveredLogin = await request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: targetEmail, password: finalPassword }),
    expected: 200,
  });
  outcomes.push('password-recovery-one-time-and-new-login');

  const currentUser = await request(`/api/v1/platform/users/${target.id}`, {
    token: ownerToken,
    expected: 200,
  });
  const suspended = await request(`/api/v1/platform/users/${target.id}/status`, {
    token: ownerToken,
    method: 'PATCH',
    body: JSON.stringify({
      status: 'SUSPENDED',
      expectedUpdatedAt: currentUser.body.updatedAt,
      reason: 'Isolated local suspension certification',
    }),
    expected: 200,
  });
  await request('/api/v1/auth/context', {
    token: recoveredLogin.body.accessToken,
    expected: 401,
  });
  await request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: targetEmail, password: finalPassword }),
    expected: 401,
  });
  await request(`/api/v1/platform/users/${target.id}/status`, {
    token: ownerToken,
    method: 'PATCH',
    body: JSON.stringify({
      status: 'ACTIVE',
      expectedUpdatedAt: suspended.body.updatedAt,
      reason: 'Isolated local reactivation certification',
    }),
    expected: 200,
  });
  const reactivatedLogin = await request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: targetEmail, password: finalPassword }),
    expected: 200,
  });
  outcomes.push('user-suspension-revoked-sessions-and-reactivation-restored-login');

  const afterReactivation = await request(`/api/v1/platform/users/${target.id}`, {
    token: ownerToken,
    expected: 200,
  });
  const revokedBinding = afterReactivation.body.externalIdentities[0];
  assert.equal(revokedBinding.status, 'REVOKED');
  assert.equal('subject' in revokedBinding, false);
  const rebound = await request(
    `/api/v1/platform/users/${target.id}/external-identities/${revokedBinding.id}`,
    {
      token: ownerToken,
      method: 'PUT',
      body: JSON.stringify({
        enabled: true,
        expectedUpdatedAt: revokedBinding.updatedAt,
        reason: 'Isolated local external identity reactivation certification',
      }),
      expected: 200,
    },
  );
  const activeBinding = rebound.body.externalIdentities[0];
  assert.equal(activeBinding.status, 'ACTIVE');
  outcomes.push('user-deprovisioning-revoked-external-identity-until-explicit-reactivation');

  const revoked = await request(
    `/api/v1/platform/users/${target.id}/external-identities/${activeBinding.id}`,
    {
      token: ownerToken,
      method: 'PUT',
      body: JSON.stringify({
        enabled: false,
        expectedUpdatedAt: activeBinding.updatedAt,
        reason: 'Isolated local external identity revocation certification',
      }),
      expected: 200,
    },
  );
  assert.equal(revoked.body.externalIdentities[0].status, 'REVOKED');
  await request('/api/v1/auth/context', {
    token: reactivatedLogin.body.accessToken,
    expected: 401,
  });
  const lifecycleAudit = await prisma.auditLog.findFirst({
    where: {
      resource: 'external_identity',
      resourceId: activeBinding.id,
      metadata: { path: ['event'], equals: 'BINDING_REVOKED' },
    },
  });
  assert.ok(lifecycleAudit);
  outcomes.push('external-identity-revocation-revoked-sessions-and-wrote-audit');

  const evidence = {
    recordedAt: new Date().toISOString(),
    environment: 'local-uat',
    database: 'PostgreSQL',
    outcomes,
    outcomeCount: outcomes.length,
    rawCredentialsPersistedInEvidence: false,
  };
  const output = process.env.IDENTITY_EVIDENCE_PATH;
  if (output) await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(evidence));
} finally {
  if (identityTenant?.id) {
    await prisma.tenant
      .update({ where: { id: identityTenant.id }, data: { status: 'CANCELLED' } })
      .catch(() => undefined);
    await prisma.tenantOidcConfiguration
      .updateMany({ where: { tenantId: identityTenant.id }, data: { enabled: false } })
      .catch(() => undefined);
  }
  await deactivateCertificationIdentities(
    [target?.id, owner?.id].filter((value) => typeof value === 'string'),
    'CERTIFICATION_COMPLETED',
  );
  await prisma.$disconnect();
}
