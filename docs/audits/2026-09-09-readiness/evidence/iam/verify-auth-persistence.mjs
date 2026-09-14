import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../../../../apps/playground-api/package.json', import.meta.url),
);
const { Pool } = require('pg');
const { generateTotpCode } = await import('../../../../../packages/auth-core/dist/index.js');
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.match(url.pathname, /^\/gigalibs_iam_cert_[a-f0-9]+$/);
const db = new Pool({ connectionString: url.toString(), max: 1 });
const bff = 'http://127.0.0.1:5198';
const control = 'http://127.0.0.1:3339/api/v1';
const checks = [];
let completed = false;

function jar(response) {
  return response.headers
    .getSetCookie()
    .filter((value) => !/Max-Age=0/i.test(value))
    .map((value) => value.split(';', 1)[0])
    .join('; ');
}
function cookieValue(cookie, name) {
  return cookie
    .split('; ')
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
function decodeJwtPayload(token) {
  const encoded = token?.split('.')[1];
  assert.ok(encoded, 'Access cookie must contain a JWT payload');
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
}
async function request(
  base,
  path,
  { status = 200, cookie, token, body, method = 'GET', headers = {} } = {},
) {
  const response = await fetch(`${base}${path}`, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000),
    headers: {
      ...headers,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(
    response.status,
    status,
    `${method} ${path} status (response body intentionally not logged)`,
  );
  const raw = await response.text();
  return { response, data: raw ? JSON.parse(raw) : null };
}
try {
  await db.query("SET TIME ZONE 'Asia/Kolkata'");
  const expectedInstantColumns = new Set([
    'tenants.provisionedAt',
    'tenants.trialEndsAt',
    'tenants.createdAt',
    'tenants.updatedAt',
    'tenants.customDomainChallengeExpiresAt',
    'tenants.customDomainVerifiedAt',
    'tenants.customDomainVerificationLockedUntil',
    'tenant_settings.createdAt',
    'tenant_settings.updatedAt',
    'users.emailVerifiedAt',
    'users.phoneVerifiedAt',
    'users.lastLoginAt',
    'users.createdAt',
    'users.updatedAt',
    'sessions.expiresAt',
    'sessions.revokedAt',
    'sessions.mfaVerifiedAt',
    'sessions.createdAt',
    'passkeys.lastUsedAt',
    'passkeys.createdAt',
    'otps.expiresAt',
    'otps.usedAt',
    'otps.createdAt',
    'tenant_members.joinedAt',
    'tenant_members.updatedAt',
    'tenant_invites.expiresAt',
    'tenant_invites.acceptedAt',
    'tenant_invites.revokedAt',
    'tenant_invites.createdAt',
    'audit_logs.createdAt',
    'tenant_environments.expiresAt',
    'tenant_environments.createdAt',
    'tenant_environments.updatedAt',
    'custom_roles.createdAt',
    'custom_roles.updatedAt',
    'user_groups.createdAt',
    'user_groups.updatedAt',
    'totp_credentials.verifiedAt',
    'totp_credentials.lockedUntil',
    'totp_credentials.createdAt',
    'totp_credentials.updatedAt',
    'mfa_recovery_codes.usedAt',
    'mfa_recovery_codes.createdAt',
    'mfa_assisted_recoveries.expiresAt',
    'mfa_assisted_recoveries.approvedAt',
    'mfa_assisted_recoveries.consumedAt',
    'mfa_assisted_recoveries.rejectedAt',
    'mfa_assisted_recoveries.createdAt',
    'mfa_assisted_recoveries.updatedAt',
    'tenant_oidc_configurations.createdAt',
    'tenant_oidc_configurations.updatedAt',
    'oidc_login_transactions.expiresAt',
    'oidc_login_transactions.consumedAt',
    'oidc_login_transactions.createdAt',
    'external_identities.lastLoginAt',
    'external_identities.createdAt',
    'tenant_data_exports.snapshotStartedAt',
    'tenant_data_exports.completedAt',
    'tenant_data_exports.expiresAt',
    'tenant_data_exports.availableAt',
    'tenant_data_exports.claimedAt',
    'tenant_data_exports.archiveDeletedAt',
    'tenant_data_exports.createdAt',
    'tenant_data_exports.updatedAt',
  ]);
  const instantColumns = (
    await db.query(`
    SELECT table_name, column_name, data_type, datetime_precision
    FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'timestamp with time zone'
  `)
  ).rows;
  const actualInstantColumns = new Set(
    instantColumns.map((column) => `${column.table_name}.${column.column_name}`),
  );
  for (const column of expectedInstantColumns) {
    assert.ok(actualInstantColumns.has(column), `${column} must be timestamp with time zone`);
  }
  assert.ok(
    instantColumns
      .filter((column) => expectedInstantColumns.has(`${column.table_name}.${column.column_name}`))
      .every((column) => column.datetime_precision === 3),
  );
  checks.push(
    'All 64 IAM, MFA, OIDC, recovery, tenant-domain, export, tenant lifecycle and audit instants are millisecond-precision timestamptz columns',
  );

  const suffix = randomBytes(6).toString('hex');
  const email = `iam-persistence-${suffix}@example.invalid`;
  const password = randomBytes(32).toString('base64url');
  const registered = await request(bff, '/api/auth/register', {
    method: 'POST',
    status: 201,
    body: { name: 'Isolated IAM certification', email, password },
  });
  assert.equal(registered.data.authenticated, true);
  assert.equal(registered.data.requiresTenantSelection, true);
  assert.equal(registered.data.tenant, undefined);
  assert.equal(registered.data.accessToken, undefined);
  let cookie = jar(registered.response);
  const user = (
    await db.query('SELECT id, "passwordHash", status FROM users WHERE email=$1', [email])
  ).rows[0];
  assert.ok(user.id && user.passwordHash && user.passwordHash !== password);
  const persisted = (
    await db.query('SELECT id, "refreshToken", status FROM sessions WHERE "userId"=$1', [user.id])
  ).rows;
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].status, 'ACTIVE');
  assert.notEqual(persisted[0].refreshToken, cookieValue(cookie, 'gigalibs_refresh_token'));
  const createdClockSkewMs = Number(
    (
      await db.query(
        `
    SELECT abs(extract(epoch FROM ("createdAt" - CURRENT_TIMESTAMP)) * 1000) AS skew
    FROM sessions WHERE id=$1
  `,
        [persisted[0].id],
      )
    ).rows[0].skew,
  );
  assert.ok(
    createdClockSkewMs < 60_000,
    `Database session timestamp is shifted by ${createdClockSkewMs}ms`,
  );
  checks.push(
    'BFF registration persists a real user/password hash and hashed refresh session without fabricating a workspace',
  );
  const noTenant = await request(bff, '/api/auth/context', { cookie });
  assert.equal(noTenant.data.user.id, user.id);
  assert.equal(noTenant.data.tenant, null);
  checks.push('BFF session context reads the created DB identity without a default tenant');
  await request(bff, '/api/auth/login', {
    method: 'POST',
    status: 401,
    body: { email, password: 'incorrect' },
  });
  assert.equal(
    Number(
      (await db.query('SELECT count(*) FROM sessions WHERE "userId"=$1', [user.id])).rows[0].count,
    ),
    1,
  );
  checks.push('Incorrect password creates no additional session');

  const tenant = await request(control, '/tenants', {
    method: 'POST',
    status: 201,
    token: cookieValue(cookie, 'gigalibs_access_token'),
    body: {
      name: `Isolated IAM ${suffix}`,
      slug: `iam-cert-${suffix}`,
      plan: 'ENTERPRISE',
      isolationMode: 'ROW_LEVEL_SECURITY',
      region: 'ap-south-1',
    },
  });
  const selected = await request(bff, '/api/auth/select-tenant', {
    cookie,
    method: 'POST',
    body: { tenantId: tenant.data.id },
  });
  cookie = jar(selected.response);
  const selectedContext = await request(bff, '/api/auth/context', { cookie });
  assert.equal(selectedContext.data.tenant.id, tenant.data.id);
  assert.equal(selectedContext.data.tenant.status, 'TRIAL');
  assert.deepEqual(selectedContext.data.roles, ['TENANT_ADMIN']);
  const brokenPolicyTenantId = `iam-broken-policy-${suffix}`;
  await db.query(
    `INSERT INTO tenants (id, slug, name, status, region, "createdAt", "updatedAt")
     VALUES ($1, $1, 'Missing policy verification', 'ACTIVE', 'local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [brokenPolicyTenantId],
  );
  await db.query(
    `INSERT INTO tenant_members (id, role, status, "userId", "tenantId", "joinedAt", "updatedAt")
     VALUES ($1, 'VIEWER', 'ACTIVE', $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [`iam-broken-member-${suffix}`, user.id, brokenPolicyTenantId],
  );
  await request(bff, '/api/auth/select-tenant', {
    cookie,
    method: 'POST',
    status: 403,
    body: { tenantId: brokenPolicyTenantId },
  });
  assert.equal(
    (await request(bff, '/api/auth/context', { cookie })).data.tenant.id,
    tenant.data.id,
  );
  await db.query('DELETE FROM tenants WHERE id=$1', [brokenPolicyTenantId]);
  checks.push('Tenant selection and current membership use the canonical persisted workspace');

  const settingsPage = await fetch(`${bff}/settings`, {
    headers: { Cookie: cookie },
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000),
  });
  assert.equal(settingsPage.status, 200);
  const settingsHtml = await settingsPage.text();
  assert.match(settingsHtml, /Verified organization domain/);
  assert.doesNotMatch(settingsHtml, /CAPABILITY_UNAVAILABLE|Capability unavailable/);
  checks.push(
    'The authenticated tenant administration route resolves its settings implementation instead of the unavailable-capability screen',
  );

  await request(control, '/tenants/current/domain/challenge', {
    method: 'POST',
    status: 400,
    token: cookieValue(cookie, 'gigalibs_access_token'),
    body: { domain: 'tenant.local', reason: 'Invalid domain boundary verification' },
  });
  const domainChallenge = await request(control, '/tenants/current/domain/challenge', {
    method: 'POST',
    status: 201,
    token: cookieValue(cookie, 'gigalibs_access_token'),
    body: {
      domain: `iam-cert-${suffix}.openai.com`,
      reason: 'Isolated DNS ownership verification',
    },
  });
  assert.equal(domainChallenge.data.status, 'PENDING');
  assert.match(
    domainChallenge.data.verificationValue,
    /^gigalibs-domain-verification=[A-Za-z0-9_-]{43}$/,
  );
  const storedDomain = (
    await db.query(
      `SELECT "customDomain", "customDomainChallengeDomain", "customDomainVerificationDigest", "customDomainVerifiedAt"
       FROM tenants WHERE id=$1`,
      [tenant.data.id],
    )
  ).rows[0];
  assert.equal(storedDomain.customDomain, null);
  assert.equal(storedDomain.customDomainChallengeDomain, domainChallenge.data.domain);
  assert.equal(
    storedDomain.customDomainVerificationDigest,
    createHash('sha256').update(domainChallenge.data.verificationValue).digest('hex'),
  );
  assert.notEqual(
    storedDomain.customDomainVerificationDigest,
    domainChallenge.data.verificationValue,
  );
  assert.equal(storedDomain.customDomainVerifiedAt, null);
  const listedDomain = await request(control, '/tenants/current/domain', {
    token: cookieValue(cookie, 'gigalibs_access_token'),
  });
  assert.equal(listedDomain.data.status, 'PENDING');
  assert.equal(Object.hasOwn(listedDomain.data, 'verificationValue'), false);
  const tenantListWithChallenge = await request(control, '/tenants', {
    token: cookieValue(cookie, 'gigalibs_access_token'),
  });
  const listedTenantWithChallenge = tenantListWithChallenge.data.find(
    (item) => item.id === tenant.data.id,
  );
  assert.ok(listedTenantWithChallenge);
  assert.equal(Object.hasOwn(listedTenantWithChallenge, 'customDomainVerificationDigest'), false);
  await request(control, '/tenants/current/domain/verify', {
    method: 'POST',
    status: 409,
    token: cookieValue(cookie, 'gigalibs_access_token'),
    body: { reason: 'Real DNS mismatch verification' },
  });
  assert.equal(
    Number(
      (
        await db.query('SELECT "customDomainVerificationAttempts" FROM tenants WHERE id=$1', [
          tenant.data.id,
        ])
      ).rows[0].customDomainVerificationAttempts,
    ),
    1,
  );
  assert.equal(
    Number(
      (
        await db.query(
          `SELECT count(*) FROM audit_logs
           WHERE "tenantId"=$1 AND (
             before::text LIKE $2 OR after::text LIKE $2 OR metadata::text LIKE $2
           )`,
          [tenant.data.id, `%${domainChallenge.data.verificationValue}%`],
        )
      ).rows[0].count,
    ),
    0,
  );
  const removedDomain = await request(
    control,
    `/tenants/current/domain?reason=${encodeURIComponent('Remove isolated DNS challenge')}`,
    { method: 'DELETE', token: cookieValue(cookie, 'gigalibs_access_token') },
  );
  assert.equal(removedDomain.data.status, 'NOT_CONFIGURED');
  checks.push(
    'Tenant domain challenge uses real persistence and DNS verification, rejects private names and unmatched TXT data, never stores or relists the raw challenge, audits failure and supports revocation',
  );

  const concurrentInviteEmail = `iam-concurrent-invite-${suffix}@example.invalid`;
  const concurrentInvites = await Promise.all(
    [0, 1].map(() =>
      fetch(`${control}/tenants/current/invitations`, {
        method: 'POST',
        signal: AbortSignal.timeout(60_000),
        headers: {
          Authorization: `Bearer ${cookieValue(cookie, 'gigalibs_access_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: concurrentInviteEmail, role: 'VIEWER', expiresInHours: 24 }),
      }),
    ),
  );
  assert.deepEqual(
    concurrentInvites.map((response) => response.status),
    [201, 201],
  );
  const concurrentInviteBodies = await Promise.all(
    concurrentInvites.map((response) => response.json()),
  );
  const activeConcurrentInvites = (
    await db.query(
      `
    SELECT id, token FROM tenant_invites
    WHERE "tenantId"=$1 AND lower(email)=lower($2) AND "acceptedAt" IS NULL AND "revokedAt" IS NULL
  `,
      [tenant.data.id, concurrentInviteEmail],
    )
  ).rows;
  assert.equal(activeConcurrentInvites.length, 1);
  assert.ok(
    concurrentInviteBodies.some(
      (invite) =>
        createHash('sha256').update(invite.token).digest('hex') ===
        activeConcurrentInvites[0].token,
    ),
  );

  const invitedEmail = `iam-invited-${suffix}@example.invalid`;
  const invitedPassword = randomBytes(32).toString('base64url');
  const invitedRegistration = await request(bff, '/api/auth/register', {
    method: 'POST',
    status: 201,
    body: { name: 'Invited IAM member', email: invitedEmail, password: invitedPassword },
  });
  let invitedCookie = jar(invitedRegistration.response);
  const invitation = await request(control, '/tenants/current/invitations', {
    method: 'POST',
    token: cookieValue(cookie, 'gigalibs_access_token'),
    status: 201,
    body: { email: invitedEmail, role: 'MEMBER', expiresInHours: 24 },
  });
  assert.equal(invitation.data.delivery, 'MANUAL_SECURE_LINK');
  assert.ok(invitation.data.token);
  const storedInvite = (
    await db.query('SELECT token FROM tenant_invites WHERE id=$1', [invitation.data.id])
  ).rows[0];
  assert.equal(
    storedInvite.token,
    createHash('sha256').update(invitation.data.token).digest('hex'),
  );
  assert.notEqual(storedInvite.token, invitation.data.token);
  const invitations = await request(control, '/tenants/current/invitations', {
    token: cookieValue(cookie, 'gigalibs_access_token'),
  });
  assert.equal(
    invitations.data.some((item) => Object.hasOwn(item, 'token')),
    false,
  );
  const acceptedInvitation = await request(control, '/tenants/invitations/accept', {
    method: 'POST',
    status: 201,
    token: cookieValue(invitedCookie, 'gigalibs_access_token'),
    body: { token: invitation.data.token },
  });
  assert.equal(acceptedInvitation.data.membership.role, 'MEMBER');
  await request(control, '/tenants/invitations/accept', {
    method: 'POST',
    status: 409,
    token: cookieValue(invitedCookie, 'gigalibs_access_token'),
    body: { token: invitation.data.token },
  });
  const invitedSelection = await request(bff, '/api/auth/select-tenant', {
    method: 'POST',
    cookie: invitedCookie,
    body: { tenantId: tenant.data.id },
  });
  invitedCookie = jar(invitedSelection.response);
  const members = await request(control, '/tenants/current/members', {
    token: cookieValue(cookie, 'gigalibs_access_token'),
  });
  const invitedMember = members.data.find((item) => item.user.email === invitedEmail);
  const ownerMember = members.data.find((item) => item.user.id === user.id);
  assert.ok(invitedMember?.id && ownerMember?.id);
  const roleChanged = await request(control, `/tenants/current/members/${invitedMember.id}`, {
    method: 'PATCH',
    token: cookieValue(cookie, 'gigalibs_access_token'),
    body: {
      role: 'VIEWER',
      expectedUpdatedAt: invitedMember.updatedAt,
      reason: 'Least privilege verification',
    },
  });
  assert.equal(roleChanged.data.role, 'VIEWER');
  await request(control, `/tenants/current/members/${invitedMember.id}`, {
    method: 'PATCH',
    status: 409,
    token: cookieValue(cookie, 'gigalibs_access_token'),
    body: {
      role: 'MANAGER',
      expectedUpdatedAt: invitedMember.updatedAt,
      reason: 'Stale update must fail',
    },
  });
  await request(control, '/tenants/current/roles', {
    method: 'POST',
    status: 400,
    token: cookieValue(cookie, 'gigalibs_access_token'),
    body: { name: 'Invalid platform role', permissions: ['platform:admin'] },
  });
  const customRole = await request(control, '/tenants/current/roles', {
    method: 'POST',
    status: 201,
    token: cookieValue(cookie, 'gigalibs_access_token'),
    body: {
      name: `Exception reviewer ${suffix}`,
      description: 'Isolated custom-role verification',
      permissions: ['settings:read', 'users:read'],
    },
  });
  assert.deepEqual(customRole.data.permissions, ['settings:read', 'users:read']);
  const assignedCustomRole = await request(
    control,
    `/tenants/current/members/${invitedMember.id}`,
    {
      method: 'PATCH',
      token: cookieValue(cookie, 'gigalibs_access_token'),
      body: {
        customRoleId: customRole.data.id,
        expectedUpdatedAt: roleChanged.data.updatedAt,
        reason: 'Custom role assignment verification',
      },
    },
  );
  assert.equal(assignedCustomRole.data.customRole.id, customRole.data.id);
  await request(control, '/settings', {
    token: cookieValue(invitedCookie, 'gigalibs_access_token'),
  });
  const customRoles = await request(control, '/tenants/current/roles', {
    token: cookieValue(cookie, 'gigalibs_access_token'),
  });
  const listedCustomRole = customRoles.data.find((role) => role.id === customRole.data.id);
  assert.equal(listedCustomRole._count.members, 1);
  const updatedCustomRole = await request(control, `/tenants/current/roles/${customRole.data.id}`, {
    method: 'PATCH',
    token: cookieValue(cookie, 'gigalibs_access_token'),
    body: {
      permissions: ['settings:read', 'settings:update', 'users:read'],
      expectedUpdatedAt: customRole.data.updatedAt,
      reason: 'Custom role permission update verification',
    },
  });
  assert.ok(updatedCustomRole.data.permissions.includes('settings:update'));
  await request(control, `/tenants/current/roles/${customRole.data.id}`, {
    method: 'PATCH',
    status: 409,
    token: cookieValue(cookie, 'gigalibs_access_token'),
    body: {
      permissions: ['settings:read'],
      expectedUpdatedAt: customRole.data.updatedAt,
      reason: 'Stale role update must fail',
    },
  });
  await request(
    control,
    `/tenants/current/roles/${customRole.data.id}?reason=${encodeURIComponent('Assigned role delete must fail')}`,
    { method: 'DELETE', status: 409, token: cookieValue(cookie, 'gigalibs_access_token') },
  );
  const unassignedCustomRole = await request(
    control,
    `/tenants/current/members/${invitedMember.id}`,
    {
      method: 'PATCH',
      token: cookieValue(cookie, 'gigalibs_access_token'),
      body: {
        customRoleId: null,
        expectedUpdatedAt: assignedCustomRole.data.updatedAt,
        reason: 'Custom role removal verification',
      },
    },
  );
  await request(control, '/settings', {
    status: 403,
    token: cookieValue(invitedCookie, 'gigalibs_access_token'),
  });
  const deletedCustomRole = await request(
    control,
    `/tenants/current/roles/${customRole.data.id}?reason=${encodeURIComponent('Custom role deletion verification')}`,
    { method: 'DELETE', token: cookieValue(cookie, 'gigalibs_access_token') },
  );
  assert.deepEqual(deletedCustomRole.data, { id: customRole.data.id, deleted: true });
  await request(control, `/tenants/current/members/${ownerMember.id}`, {
    method: 'PATCH',
    status: 409,
    token: cookieValue(cookie, 'gigalibs_access_token'),
    body: {
      role: 'VIEWER',
      expectedUpdatedAt: ownerMember.updatedAt,
      reason: 'Last administrator protection verification',
    },
  });
  const suspended = await request(control, `/tenants/current/members/${invitedMember.id}`, {
    method: 'PATCH',
    token: cookieValue(cookie, 'gigalibs_access_token'),
    body: {
      status: 'SUSPENDED',
      expectedUpdatedAt: unassignedCustomRole.data.updatedAt,
      reason: 'Membership suspension verification',
    },
  });
  assert.equal(suspended.data.status, 'SUSPENDED');
  await request(bff, '/api/auth/context', { cookie: invitedCookie, status: 401 });
  const invitedSessionId = decodeJwtPayload(
    cookieValue(invitedCookie, 'gigalibs_access_token'),
  ).sid;
  assert.equal(
    (await db.query('SELECT status FROM sessions WHERE id=$1', [invitedSessionId])).rows[0].status,
    'REVOKED',
  );

  const revokedInvitation = await request(control, '/tenants/current/invitations', {
    method: 'POST',
    token: cookieValue(cookie, 'gigalibs_access_token'),
    status: 201,
    body: { email: `iam-revoked-${suffix}@example.invalid`, role: 'VIEWER', expiresInHours: 24 },
  });
  const concurrentRevocations = await Promise.all(
    [0, 1].map(() =>
      fetch(`${control}/tenants/current/invitations/${revokedInvitation.data.id}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(60_000),
        headers: { Authorization: `Bearer ${cookieValue(cookie, 'gigalibs_access_token')}` },
      }),
    ),
  );
  assert.deepEqual(
    concurrentRevocations.map((response) => response.status),
    [200, 200],
  );
  const revocationAuditCount = Number(
    (
      await db.query(
        `
    SELECT count(*) FROM audit_logs
    WHERE "tenantId"=$1 AND resource='tenant_invite' AND "resourceId"=$2 AND action='STATUS_CHANGE'
  `,
        [tenant.data.id, revokedInvitation.data.id],
      )
    ).rows[0].count,
  );
  assert.equal(revocationAuditCount, 1);
  assert.ok(
    (
      await db.query(
        `
    SELECT count(*)::int AS count FROM audit_logs
    WHERE "tenantId"=$1 AND resource IN ('tenant_invite', 'tenant_member')
  `,
        [tenant.data.id],
      )
    ).rows[0].count >= 5,
  );
  checks.push(
    'Invitation acceptance, hashed secrets, concurrent replacement/revocation, custom-role CRUD and live permission assignment, role change, stale conflicts, last-admin protection, suspension/session revocation and audit persist end to end',
  );

  const settingsBeforeMfa = await request(control, '/settings', {
    token: cookieValue(cookie, 'gigalibs_access_token'),
  });
  assert.equal(settingsBeforeMfa.data.security.enforceMfa, false);
  const mfaPolicy = await request(control, '/settings', {
    method: 'PATCH',
    token: cookieValue(cookie, 'gigalibs_access_token'),
    body: {
      expectedVersion: settingsBeforeMfa.data.version,
      security: { enforceMfa: true },
      changeReason: 'Isolated mandatory MFA verification',
    },
  });
  assert.equal(mfaPolicy.data.security.enforceMfa, true);
  await request(control, '/settings', {
    token: cookieValue(cookie, 'gigalibs_access_token'),
    status: 403,
  });
  const pendingMfaContext = await request(bff, '/api/auth/context', { cookie });
  assert.deepEqual(pendingMfaContext.data.mfa, {
    required: true,
    enrolled: false,
    verified: false,
    recoveryCodesRemaining: 0,
  });
  await request(bff, '/api/auth/mfa/recovery/generate', {
    method: 'POST',
    status: 403,
    cookie,
    body: { reason: 'Must not bypass pending MFA' },
  });
  assert.equal(
    Number(
      (await db.query('SELECT count(*) FROM mfa_recovery_codes WHERE "userId"=$1', [user.id]))
        .rows[0].count,
    ),
    0,
  );
  const mfaRedirect = await fetch(`${bff}/settings`, {
    headers: { Cookie: cookie },
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000),
  });
  assert.equal(mfaRedirect.status, 307);
  assert.equal(new URL(mfaRedirect.headers.get('location'), bff).pathname, '/mfa');

  const enrollment = await request(control, '/auth/mfa/totp/enroll', {
    method: 'POST',
    status: 201,
    token: cookieValue(cookie, 'gigalibs_access_token'),
  });
  assert.equal(enrollment.data.method, 'TOTP');
  assert.match(enrollment.data.secret, /^[A-Z2-7]{32}$/);
  assert.match(enrollment.data.uri, /^otpauth:\/\/totp\//);
  const storedCredential = (
    await db.query(
      'SELECT "secretEnvelope", "keyVersion", "verifiedAt" FROM totp_credentials WHERE "userId"=$1',
      [user.id],
    )
  ).rows[0];
  assert.ok(storedCredential.secretEnvelope.startsWith('v1.'));
  assert.notEqual(storedCredential.secretEnvelope, enrollment.data.secret);
  assert.equal(storedCredential.verifiedAt, null);
  const auditContainsSecret = Number(
    (
      await db.query(
        `SELECT count(*) FROM audit_logs WHERE "tenantId"=$1 AND (before::text LIKE $2 OR after::text LIKE $2 OR metadata::text LIKE $2)`,
        [tenant.data.id, `%${enrollment.data.secret}%`],
      )
    ).rows[0].count,
  );
  assert.equal(auditContainsSecret, 0);

  const totpCode = generateTotpCode(enrollment.data.secret);
  await request(control, '/auth/mfa/totp/verify', {
    method: 'POST',
    token: cookieValue(cookie, 'gigalibs_access_token'),
    body: { code: totpCode },
  });
  const verifiedMfaContext = await request(bff, '/api/auth/context', { cookie });
  assert.deepEqual(verifiedMfaContext.data.mfa, {
    required: true,
    enrolled: true,
    verified: true,
    recoveryCodesRemaining: 0,
  });
  let recoverySet = await request(bff, '/api/auth/mfa/recovery/generate', {
    method: 'POST',
    status: 201,
    cookie,
    body: { reason: 'Isolated recovery credential verification' },
  });
  assert.equal(recoverySet.data.delivery, 'DISPLAY_ONCE');
  assert.equal(recoverySet.data.count, 10);
  assert.equal(new Set(recoverySet.data.codes).size, 10);
  for (const recoveryCode of recoverySet.data.codes) {
    assert.match(recoveryCode, /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){4}$/);
  }
  const storedRecoveryCodes = (
    await db.query(
      'SELECT id, "codeDigest", "usedAt" FROM mfa_recovery_codes WHERE "userId"=$1 ORDER BY id',
      [user.id],
    )
  ).rows;
  assert.equal(storedRecoveryCodes.length, 10);
  assert.ok(storedRecoveryCodes.every((record) => /^[a-f0-9]{64}$/.test(record.codeDigest)));
  assert.ok(storedRecoveryCodes.every((record) => record.usedAt === null));
  for (const recoveryCode of recoverySet.data.codes) {
    const normalized = recoveryCode.replaceAll('-', '');
    const digest = createHash('sha256')
      .update(`gigalibs:mfa-recovery:v1:${user.id}:${normalized}`)
      .digest('hex');
    assert.ok(storedRecoveryCodes.some((record) => record.codeDigest === digest));
    assert.equal(
      Number(
        (
          await db.query(
            `SELECT count(*) FROM audit_logs WHERE "tenantId"=$1
             AND (before::text LIKE $2 OR after::text LIKE $2 OR metadata::text LIKE $2)`,
            [tenant.data.id, `%${recoveryCode}%`],
          )
        ).rows[0].count,
      ),
      0,
    );
  }
  const revokedRecoveryCode = recoverySet.data.codes[0];
  const firstRecoveryDigest = storedRecoveryCodes[0].codeDigest;
  const rotatedRecoverySet = await request(bff, '/api/auth/mfa/recovery/generate', {
    method: 'POST',
    status: 201,
    cookie,
    body: { reason: 'Isolated recovery credential rotation' },
  });
  assert.equal(rotatedRecoverySet.data.replacedExisting, true);
  assert.equal(rotatedRecoverySet.data.count, 10);
  assert.equal(
    Number(
      (
        await db.query(
          'SELECT count(*) FROM mfa_recovery_codes WHERE "userId"=$1 AND "codeDigest"=$2',
          [user.id, firstRecoveryDigest],
        )
      ).rows[0].count,
    ),
    0,
  );
  recoverySet = rotatedRecoverySet;
  assert.equal(
    (await request(bff, '/api/auth/context', { cookie })).data.mfa.recoveryCodesRemaining,
    10,
  );
  const sessionId = decodeJwtPayload(cookieValue(cookie, 'gigalibs_access_token')).sid;
  await db.query('UPDATE sessions SET "mfaVerifiedAt"=NULL WHERE id=$1', [sessionId]);
  await request(bff, '/api/auth/mfa/recovery/verify', {
    method: 'POST',
    status: 401,
    cookie,
    body: { code: revokedRecoveryCode },
  });
  const recovered = await request(bff, '/api/auth/mfa/recovery/verify', {
    method: 'POST',
    cookie,
    body: { code: recoverySet.data.codes[0] },
  });
  assert.equal(recovered.data.method, 'RECOVERY_CODE');
  assert.equal(recovered.data.recoveryCodesRemaining, 9);
  assert.ok(
    (
      await db.query(
        'SELECT "usedAt" FROM mfa_recovery_codes WHERE "userId"=$1 AND "codeDigest"=$2',
        [
          user.id,
          createHash('sha256')
            .update(
              `gigalibs:mfa-recovery:v1:${user.id}:${recoverySet.data.codes[0].replaceAll('-', '')}`,
            )
            .digest('hex'),
        ],
      )
    ).rows[0].usedAt,
  );
  await db.query('UPDATE sessions SET "mfaVerifiedAt"=NULL WHERE id=$1', [sessionId]);
  await request(bff, '/api/auth/mfa/recovery/verify', {
    method: 'POST',
    status: 401,
    cookie,
    body: { code: recoverySet.data.codes[0] },
  });
  assert.equal(
    Number(
      (await db.query('SELECT "failedAttempts" FROM totp_credentials WHERE "userId"=$1', [user.id]))
        .rows[0].failedAttempts,
    ),
    1,
  );
  await db.query('UPDATE sessions SET "mfaVerifiedAt"=CURRENT_TIMESTAMP WHERE id=$1', [sessionId]);
  checks.push(
    'MFA recovery codes require prior MFA, are generated and rotated through the BFF, revoke the prior set, persist only user-bound digests, never appear in audit plaintext, atomically consume once, report a DB count and reject replay through the shared lockout counter',
  );
  await request(control, '/settings', {
    token: cookieValue(cookie, 'gigalibs_access_token'),
  });
  await request(control, '/auth/mfa/totp/verify', {
    method: 'POST',
    status: 401,
    token: cookieValue(cookie, 'gigalibs_access_token'),
    body: { code: totpCode },
  });
  const invalidTotpCode = totpCode === '000000' ? '999999' : '000000';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await request(control, '/auth/mfa/totp/verify', {
      method: 'POST',
      status: 401,
      token: cookieValue(cookie, 'gigalibs_access_token'),
      body: { code: invalidTotpCode },
    });
  }
  await request(control, '/auth/mfa/totp/verify', {
    method: 'POST',
    status: 429,
    token: cookieValue(cookie, 'gigalibs_access_token'),
    body: { code: invalidTotpCode },
  });
  const lockedCredential = (
    await db.query(
      'SELECT "verifiedAt", "lastUsedStep", "failedAttempts", "lockedUntil" FROM totp_credentials WHERE "userId"=$1',
      [user.id],
    )
  ).rows[0];
  assert.ok(lockedCredential.verifiedAt);
  assert.ok(lockedCredential.lastUsedStep !== null);
  assert.equal(lockedCredential.failedAttempts, 5);
  assert.ok(new Date(lockedCredential.lockedUntil) > new Date());
  checks.push(
    'Persisted tenant MFA policy blocks unverified sessions; fresh TOTP enrollment uses encrypted secret storage, verifies once, rejects replay, applies bounded lockout and writes no raw secret to audit',
  );

  await request(bff, '/api/auth/select-tenant', {
    cookie,
    method: 'POST',
    status: 403,
    body: { tenantId: 'IAM-NONEXISTENT' },
  });
  const otherTenant = (
    await db.query('SELECT id FROM tenants WHERE id<>$1 LIMIT 1', [tenant.data.id])
  ).rows[0];
  assert.ok(
    otherTenant,
    'The preceding control-plane certification must create a separate test workspace',
  );
  await request(bff, '/api/auth/select-tenant', {
    cookie,
    method: 'POST',
    status: 403,
    body: { tenantId: otherTenant.id },
  });
  await request(control, '/settings', {
    token: cookieValue(cookie, 'gigalibs_access_token'),
    status: 403,
    headers: { 'X-Tenant-ID': otherTenant.id },
  });
  checks.push(
    'An existing foreign tenant is denied for both workspace selection and tenant-header override',
  );
  const unavailable = await request(bff, '/api/analytics/action', {
    cookie,
    method: 'POST',
    status: 404,
    body: {
      tenantId: tenant.data.id,
      entityCode: 'IAM-NONEXISTENT',
      actionType: 'HOLD_PAYMENT_DISPUTE',
    },
  });
  assert.equal(unavailable.data.title, 'Unsupported Analytics route.');
  checks.push('Even an authenticated tenant admin cannot invoke the removed fabricated financial action path');
  await db.query('UPDATE tenant_members SET role=$1 WHERE "userId"=$2 AND "tenantId"=$3', [
    'VIEWER',
    user.id,
    tenant.data.id,
  ]);
  const downgraded = await request(bff, '/api/auth/context', { cookie });
  assert.deepEqual(downgraded.data.roles, ['VIEWER']);
  checks.push(
    'BFF context reads a role downgrade from the DB rather than trusting stale token roles',
  );
  await request(control, '/settings', {
    token: cookieValue(cookie, 'gigalibs_access_token'),
    status: 403,
  });
  const authorization = await request(control, '/authorization/context', {
    token: cookieValue(cookie, 'gigalibs_access_token'),
  });
  assert.deepEqual(authorization.data.roles, ['VIEWER']);
  assert.equal(authorization.data.permissions.includes('settings:*'), false);
  checks.push(
    'An existing admin token loses privileged endpoint access immediately after a persisted downgrade',
  );
  await db.query('UPDATE tenant_members SET status=$1 WHERE "userId"=$2 AND "tenantId"=$3', [
    'SUSPENDED',
    user.id,
    tenant.data.id,
  ]);
  await request(bff, '/api/auth/context', { cookie, status: 403 });
  checks.push('Suspended membership is denied immediately at the BFF context boundary');
  await db.query('UPDATE tenant_members SET status=$1 WHERE "userId"=$2 AND "tenantId"=$3', [
    'ACTIVE',
    user.id,
    tenant.data.id,
  ]);
  await db.query('UPDATE users SET status=$1 WHERE id=$2', ['SUSPENDED', user.id]);
  await request(bff, '/api/auth/login', { method: 'POST', status: 401, body: { email, password } });
  await request(control, '/authorization/context', {
    token: cookieValue(cookie, 'gigalibs_access_token'),
    status: 401,
  });
  await request(control, '/auth/refresh', {
    method: 'POST',
    status: 401,
    body: { refreshToken: cookieValue(cookie, 'gigalibs_refresh_token') },
  });
  assert.equal(
    Number(
      (await db.query('SELECT count(*) FROM sessions WHERE "userId"=$1', [user.id])).rows[0].count,
    ),
    1,
  );
  checks.push('Suspended users cannot log in, use an existing session, or refresh credentials');
  await db.query('UPDATE users SET status=$1 WHERE id=$2', ['ACTIVE', user.id]);
  const accessPayloadBeforeExpiry = decodeJwtPayload(cookieValue(cookie, 'gigalibs_access_token'));
  assert.equal(
    accessPayloadBeforeExpiry.sid,
    persisted[0].id,
    'The tested access token must identify the session being expired',
  );
  assert.equal(
    accessPayloadBeforeExpiry.sub,
    user.id,
    'The tested access token must identify the persisted user',
  );
  const expired = (
    await db.query(
      'UPDATE sessions SET "expiresAt"=CURRENT_TIMESTAMP - interval \'1 minute\' WHERE id=$1 RETURNING id, "expiresAt"',
      [persisted[0].id],
    )
  ).rows[0];
  assert.equal(expired.id, persisted[0].id);
  assert.ok(new Date(expired.expiresAt) < new Date());
  await request(control, '/auth/context', {
    token: cookieValue(cookie, 'gigalibs_access_token'),
    status: 401,
  });
  await request(control, '/auth/refresh', {
    method: 'POST',
    status: 401,
    body: { refreshToken: cookieValue(cookie, 'gigalibs_refresh_token') },
  });
  await request(bff, '/api/auth/context', { cookie, status: 401 });
  const loggedInAgain = await request(bff, '/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  cookie = jar(loggedInAgain.response);
  const activeSession = (await request(bff, '/api/auth/context', { cookie })).data.session.id;
  assert.notEqual(activeSession, persisted[0].id);
  checks.push(
    'Expired DB sessions cannot be used or refreshed; a new valid login creates a distinct session',
  );
  const oldRefresh = cookieValue(cookie, 'gigalibs_refresh_token');
  const renewed = await request(bff, '/api/auth/refresh', { cookie, method: 'POST' });
  cookie = jar(renewed.response);
  assert.notEqual(cookieValue(cookie, 'gigalibs_refresh_token'), oldRefresh);
  await request(control, '/auth/refresh', {
    method: 'POST',
    status: 401,
    body: { refreshToken: oldRefresh },
  });
  checks.push('Refresh rotates persisted credentials and rejects replay of the previous token');
  const concurrent = await Promise.all(
    [0, 1].map(() =>
      fetch(`${control}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: cookieValue(cookie, 'gigalibs_refresh_token') }),
        signal: AbortSignal.timeout(60_000),
      }),
    ),
  );
  assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 401]);
  const winner = await concurrent.find((response) => response.status === 200).json();
  cookie = `gigalibs_access_token=${winner.accessToken}; gigalibs_refresh_token=${winner.refreshToken}`;
  checks.push('Concurrent reuse of a refresh token has exactly one successful database rotation');
  await request(bff, '/api/auth/logout', { cookie, method: 'POST' });
  assert.equal(
    (await db.query('SELECT status FROM sessions WHERE id=$1', [activeSession])).rows[0].status,
    'REVOKED',
  );
  await request(bff, '/api/auth/context', { cookie, status: 401 });
  checks.push('Logout revokes the DB session and subsequent use of the old cookies fails');
  completed = true;
} finally {
  await db.end();
  writeFileSync(
    new URL('./auth-persistence-results.json', import.meta.url),
    `${JSON.stringify(
      {
        passed: completed,
        checks,
        context:
          'Fresh isolated PostgreSQL 14.20 database; real NestJS, Next.js development BFF and DNS resolver lookup; no HTTP mocks',
        limitations:
          'Does not certify PostgreSQL 16, positive proof in an operator-owned DNS zone, browser concurrency across replicas, SSO/email providers, production data provenance, human UAT or deployment',
      },
      null,
      2,
    )}\n`,
  );
  console.log(JSON.stringify({ checks: checks.length, passed: completed }));
}
