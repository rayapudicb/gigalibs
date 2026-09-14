import assert from 'node:assert/strict';
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../../../../apps/playground-api/package.json', import.meta.url),
);
const { Pool } = require('pg');
const { decrypt, encrypt } = await import('../../../../../packages/crypto/dist/index.js');
const { generateTotpCode, generateTotpSecret } = await import(
  '../../../../../packages/auth-core/dist/index.js'
);
const { PayloadCryptoService, sourceEventAuthenticatedContext } = await import(
  '../../../../../apps/playground-api/dist/payload-crypto.service.js'
);

const databaseUrl = new URL(process.env.DATABASE_URL);
assert.equal(databaseUrl.hostname, '127.0.0.1');
assert.match(databaseUrl.pathname, /^\/gigalibs_key_rotation_cert_[a-f0-9]+$/);
const activeVersion = process.env.CONTROL_PAYLOAD_KEY_VERSION;
const activeKey = process.env.CONTROL_PAYLOAD_ENCRYPTION_KEY;
const previous = JSON.parse(process.env.CONTROL_PAYLOAD_PREVIOUS_KEYS_JSON ?? '{}');
const previousEntries = Object.entries(previous);
assert.equal(previousEntries.length, 1);
const [previousVersion, previousKey] = previousEntries[0];
assert.notEqual(activeVersion, previousVersion);

const db = new Pool({ connectionString: databaseUrl.toString(), max: 1 });
const api = `http://127.0.0.1:${process.env.API_PORT}/api/v1`;
const checks = [];

async function request(path, { method = 'GET', token, body, status = 200 } = {}) {
  const response = await fetch(`${api}${path}`, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, status, `${method} ${path} returned ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

try {
  const suffix = randomBytes(6).toString('hex');
  const email = `key-rotation-${suffix}@example.invalid`;
  const registered = await request('/auth/register', {
    method: 'POST',
    status: 201,
    body: {
      email,
      name: 'Isolated key rotation certification',
      password: randomBytes(32).toString('base64url'),
    },
  });
  const user = (await db.query('SELECT id FROM users WHERE email=$1', [email])).rows[0];
  assert.ok(user?.id);
  const tenantId = randomUUID();
  const settingsId = randomUUID();
  await db.query(
    `INSERT INTO tenants
      (id, slug, name, status, "isolationMode", region, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'ACTIVE', 'ROW_LEVEL_SECURITY', 'local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [tenantId, `key-rotation-${suffix}`, 'Key rotation certification'],
  );
  await db.query(
    `INSERT INTO tenant_members
      (id, role, status, permissions, "joinedAt", "updatedAt", "userId", "tenantId")
     VALUES ($1, 'TENANT_ADMIN', 'ACTIVE', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $2, $3)`,
    [randomUUID(), user.id, tenantId],
  );
  await db.query(
    `INSERT INTO tenant_settings
      (id, "tenantId", version, branding, security, localization, features, metadata,
       "updatedById", "createdAt", "updatedAt")
     VALUES ($1, $2, 1, '{}'::jsonb, '{"enforceMfa":true}'::jsonb, '{}'::jsonb,
       '{}'::jsonb, '{}'::jsonb, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [settingsId, tenantId, user.id],
  );
  const selected = await request('/auth/select-tenant', {
    method: 'POST',
    token: registered.accessToken,
    body: { tenantId },
  });
  assert.equal(selected.requiresMfa, true);

  const credentialId = randomUUID();
  const totpSecret = generateTotpSecret();
  const totpContext = `gigalibs:mfa-totp:v1:${credentialId}:${user.id}`;
  const oldTotpEnvelope = await encrypt(totpSecret, previousKey, totpContext);
  await db.query(
    `INSERT INTO totp_credentials
      (id, "secretEnvelope", "keyVersion", "verifiedAt", "userId", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [credentialId, oldTotpEnvelope, previousVersion, user.id],
  );
  await request('/auth/mfa/totp/verify', {
    method: 'POST',
    token: selected.accessToken,
    body: { code: generateTotpCode(totpSecret) },
  });
  const rotatedCredential = (
    await db.query('SELECT "secretEnvelope", "keyVersion" FROM totp_credentials WHERE id=$1', [
      credentialId,
    ])
  ).rows[0];
  assert.equal(rotatedCredential.keyVersion, activeVersion);
  assert.notEqual(rotatedCredential.secretEnvelope, oldTotpEnvelope);
  assert.equal(await decrypt(rotatedCredential.secretEnvelope, activeKey, totpContext), totpSecret);
  assert.equal(
    Number(
      (
        await db.query(
          `SELECT count(*) FROM audit_logs
           WHERE "tenantId"=$1 AND resource='mfa_totp_credential'
             AND metadata->>'keyRotated'='true' AND metadata->>'keyVersion'=$2`,
          [tenantId, activeVersion],
        )
      ).rows[0].count,
    ),
    1,
  );
  checks.push('A successful TOTP proof rewrapped an old-key credential with the active key');

  const configurationId = randomUUID();
  const oidcContext = `gigalibs:oidc-client:v1:${configurationId}:${tenantId}`;
  const clientSecret = randomBytes(36).toString('base64url');
  const oldOidcEnvelope = await encrypt(clientSecret, previousKey, oidcContext);
  await db.query(
    `INSERT INTO tenant_oidc_configurations
      (id, issuer, "clientId", "clientSecretEnvelope", "keyVersion", scopes, enabled,
       "allowJitProvisioning", "defaultRole", "configuredById", "tenantId", "createdAt", "updatedAt")
     VALUES ($1, 'https://identity.example.invalid', 'rotation-client', $2, $3,
       ARRAY['openid','email','profile'], false, false, 'MEMBER', $4, $5,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [configurationId, oldOidcEnvelope, previousVersion, user.id, tenantId],
  );
  const beforeOidc = (
    await db.query('SELECT "updatedAt" FROM tenant_oidc_configurations WHERE id=$1', [
      configurationId,
    ])
  ).rows[0];
  await request('/auth/oidc/config', {
    method: 'PUT',
    token: selected.accessToken,
    body: {
      issuer: 'https://identity.example.invalid',
      clientId: 'rotation-client',
      scopes: ['openid', 'email', 'profile'],
      enabled: false,
      allowJitProvisioning: false,
      defaultRole: 'MEMBER',
      expectedUpdatedAt: new Date(beforeOidc.updatedAt).toISOString(),
      reason: 'Rewrap OIDC client secret during controlled key rotation',
    },
  });
  const rotatedOidc = (
    await db.query(
      'SELECT "clientSecretEnvelope", "keyVersion" FROM tenant_oidc_configurations WHERE id=$1',
      [configurationId],
    )
  ).rows[0];
  assert.equal(rotatedOidc.keyVersion, activeVersion);
  assert.notEqual(rotatedOidc.clientSecretEnvelope, oldOidcEnvelope);
  assert.equal(
    await decrypt(rotatedOidc.clientSecretEnvelope, activeKey, oidcContext),
    clientSecret,
  );
  checks.push('An authorized OIDC configuration save rewrapped the old client secret');

  const payloadService = new PayloadCryptoService();
  const payload = { amount: 125.75, source: 'isolated-key-rotation-certification' };
  const payloadContext = sourceEventAuthenticatedContext(
    tenantId,
    randomUUID(),
    'rotation.test',
    1,
  );
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(previousKey, 'base64'), iv);
  cipher.setAAD(Buffer.from(payloadContext, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), 'utf8')),
    cipher.final(),
  ]);
  assert.deepEqual(
    payloadService.decrypt(
      { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: previousVersion },
      payloadContext,
    ),
    payload,
  );
  checks.push('A retained source payload remained decryptable through the bounded old-key ring');

  async function createCertifiedMember(label, role) {
    const memberPassword = randomBytes(32).toString('base64url');
    const memberEmail = `${label}-${suffix}@example.invalid`;
    const memberRegistration = await request('/auth/register', {
      method: 'POST',
      status: 201,
      body: { email: memberEmail, name: `Certification ${label}`, password: memberPassword },
    });
    const memberUser = (await db.query('SELECT id FROM users WHERE email=$1', [memberEmail]))
      .rows[0];
    const memberId = randomUUID();
    await db.query(
      `INSERT INTO tenant_members
        (id, role, status, permissions, "joinedAt", "updatedAt", "userId", "tenantId")
       VALUES ($1, $2::"MemberRole", 'ACTIVE', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3, $4)`,
      [memberId, role, memberUser.id, tenantId],
    );
    const memberSession = await request('/auth/select-tenant', {
      method: 'POST',
      token: memberRegistration.accessToken,
      body: { tenantId },
    });
    return {
      id: memberId,
      userId: memberUser.id,
      email: memberEmail,
      password: memberPassword,
      token: memberSession.accessToken,
    };
  }

  async function enrollAndVerify(member) {
    const enrollment = await request('/auth/mfa/totp/enroll', {
      method: 'POST',
      status: 201,
      token: member.token,
    });
    await request('/auth/mfa/totp/verify', {
      method: 'POST',
      token: member.token,
      body: { code: generateTotpCode(enrollment.secret) },
    });
  }

  const approver = await createCertifiedMember('recovery-approver', 'TENANT_ADMIN');
  const target = await createCertifiedMember('recovery-target', 'MEMBER');
  await enrollAndVerify(approver);
  await enrollAndVerify(target);
  const targetSessionBeforeApproval = (
    await db.query(
      `SELECT id FROM sessions
       WHERE "userId"=$1 AND "tenantId"=$2 AND status='ACTIVE'
       ORDER BY "createdAt" DESC LIMIT 1`,
      [target.userId, tenantId],
    )
  ).rows[0];

  const recoveryRequest = await request('/auth/mfa/assisted-recovery', {
    method: 'POST',
    status: 201,
    token: selected.accessToken,
    body: {
      targetMemberId: target.id,
      identityEvidenceReference: `CERT-${suffix}`,
      reason: 'Target reported loss of authenticator and recovery codes',
    },
  });
  assert.equal(recoveryRequest.status, 'REQUESTED');
  await request(`/auth/mfa/assisted-recovery/${recoveryRequest.id}/approve`, {
    method: 'POST',
    status: 403,
    token: selected.accessToken,
    body: { reason: 'Requester must not self-approve' },
  });
  const approvedRecovery = await request(
    `/auth/mfa/assisted-recovery/${recoveryRequest.id}/approve`,
    {
      method: 'POST',
      status: 201,
      token: approver.token,
      body: { reason: 'Second administrator verified the recorded identity evidence' },
    },
  );
  assert.equal(approvedRecovery.status, 'APPROVED');
  assert.equal(approvedRecovery.delivery, 'DISPLAY_ONCE');
  assert.match(approvedRecovery.grant, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(
    (await db.query('SELECT status FROM sessions WHERE id=$1', [targetSessionBeforeApproval.id]))
      .rows[0].status,
    'REVOKED',
  );

  const targetLogin = await request('/auth/login', {
    method: 'POST',
    token: undefined,
    body: { email: target.email, password: target.password },
  });
  assert.equal(targetLogin.requiresMfa, true);
  const consumedRecovery = await request('/auth/mfa/assisted-recovery/consume', {
    method: 'POST',
    status: 201,
    token: targetLogin.accessToken,
    body: { grant: approvedRecovery.grant },
  });
  assert.deepEqual(consumedRecovery, {
    recovered: true,
    enrollmentRequired: true,
    method: 'ASSISTED_RECOVERY',
  });
  const persistedRecovery = (
    await db.query(
      'SELECT status, "grantDigest", "consumedAt" FROM mfa_assisted_recoveries WHERE id=$1',
      [recoveryRequest.id],
    )
  ).rows[0];
  assert.equal(persistedRecovery.status, 'CONSUMED');
  assert.equal(persistedRecovery.grantDigest, null);
  assert.ok(persistedRecovery.consumedAt);
  assert.equal(
    Number(
      (await db.query('SELECT count(*) FROM totp_credentials WHERE "userId"=$1', [target.userId]))
        .rows[0].count,
    ),
    0,
  );
  await request('/auth/mfa/assisted-recovery/consume', {
    method: 'POST',
    status: 401,
    token: targetLogin.accessToken,
    body: { grant: approvedRecovery.grant },
  });
  const replacementEnrollment = await request('/auth/mfa/totp/enroll', {
    method: 'POST',
    status: 201,
    token: targetLogin.accessToken,
  });
  assert.match(replacementEnrollment.secret, /^[A-Z2-7]{32}$/);
  assert.equal(
    Number(
      (
        await db.query(
          `SELECT count(*) FROM audit_logs
           WHERE "tenantId"=$1
             AND (before::text LIKE $2 OR after::text LIKE $2 OR metadata::text LIKE $2)`,
          [tenantId, `%${approvedRecovery.grant}%`],
        )
      ).rows[0].count,
    ),
    0,
  );
  checks.push(
    'Two distinct MFA-verified tenant admins issued a one-time assisted-recovery grant; approval revoked target sessions, consumption erased old MFA credentials, replay failed and reenrollment became mandatory',
  );

  process.stdout.write(`${JSON.stringify({ passed: true, checks }, null, 2)}\n`);
} finally {
  await db.end();
}
