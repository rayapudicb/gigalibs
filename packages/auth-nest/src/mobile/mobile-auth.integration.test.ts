import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// WI-OI-120cf: the mobile v1 BFF's sign-in, MFA, workspace, session, refresh and logout flows against PostgreSQL 16
// with every control-plane migration applied. Opt-in only, and only against a local database named mobile_bff_proof
// (never UAT on 5440, nor the shared test database on 5441). Each run seeds its own users and workspaces under a run
// id and keeps them, so a run's data can be read afterwards.

const proofUrl = process.env.MOBILE_BFF_TEST_DATABASE_URL;
if (proofUrl) {
  const parsed = new URL(proofUrl);
  if (
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    ['5440', '5441'].includes(parsed.port) ||
    parsed.pathname !== '/mobile_bff_proof'
  ) {
    throw new Error('Refusing the mobile BFF proof: only a local mobile_bff_proof database is allowed.');
  }
}

type Headers = Record<string, string>;
type TokenSet = { contractVersion: string; binding: string; accessToken: string; refreshToken: string; accessTokenExpiresAt: string };

const RUN = `m${Date.now().toString(36)}`;
const PROFILE = 'gigalibs-universal';
const PASSWORD = `Pw-${randomBytes(12).toString('base64url')}`;
const INSTALL = randomUUID();
const OTHER_INSTALL = randomUUID();

describe.skipIf(!proofUrl)('mobile v1 BFF flows on PostgreSQL (isolated)', () => {
  let db: typeof import('@gigalibs/db').prisma;
  let auth: import('../auth.service.js').AuthService;
  let controller: import('./mobile-auth.controller.js').MobileAuthController;
  let keys: import('./mobile-credentials.js').MobileKeys;
  let totp: typeof import('@gigalibs/auth-core');
  const tenants: Record<'north' | 'south' | 'secure', string> = { north: '', south: '', secure: '' };
  const users: Record<string, string> = {};
  let totpSecret = '';

  const email = (name: string) => `${name}.${RUN}@mobile-proof.test`;
  const headers = (extra: Headers = {}): Headers => ({ 'x-gigalibs-installation-id': INSTALL, ...extra });
  const bearer = (token: string, extra: Headers = {}) => headers({ authorization: `Bearer ${token}`, ...extra });
  const signIn = (name: string, extra: Record<string, unknown> = {}, requestHeaders = headers()) =>
    controller.password(
      { contractVersion: 'mobile-password-sign-in.v1', email: email(name), password: PASSWORD, appProfile: PROFILE, ...extra },
      requestHeaders,
    );
  const refresh = (refreshToken: string, installation = INSTALL) =>
    controller.refresh(
      { contractVersion: 'mobile-refresh-token.v1', refreshToken, appProfile: PROFILE },
      { 'x-gigalibs-installation-id': installation },
    ) as Promise<TokenSet>;
  async function refusal(work: Promise<unknown>): Promise<{ code: string; status: number }> {
    try {
      await work;
    } catch (error) {
      return (error as { getResponse(): { code: string; status: number } }).getResponse();
    }
    throw new Error('Expected a refusal.');
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = proofUrl!;
    process.env.JWT_ACCESS_SECRET = randomBytes(32).toString('hex');
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '30d';
    process.env.CONTROL_PAYLOAD_KEY_VERSION = 'v1';
    process.env.CONTROL_PAYLOAD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.MOBILE_APP_PROFILES = PROFILE;
    ({ prisma: db } = await import('@gigalibs/db'));
    const identity = await db.$queryRawUnsafe<Array<{ name: string }>>('SELECT current_database()::text AS name');
    if (identity[0]?.name !== 'mobile_bff_proof') throw new Error('Unexpected proof database identity.');
    totp = await import('@gigalibs/auth-core');
    const { encrypt } = await import('@gigalibs/crypto');
    const { AuthService } = await import('../auth.service.js');
    const { MobileAuthService } = await import('./mobile-auth.service.js');
    const { MobileAuthController } = await import('./mobile-auth.controller.js');
    const { MobileKeys } = await import('./mobile-credentials.js');
    auth = new AuthService();
    controller = new MobileAuthController(new MobileAuthService(auth));
    keys = new MobileKeys(process.env.JWT_ACCESS_SECRET);

    const passwordHash = await totp.hashPassword(PASSWORD);
    const tenant = async (key: keyof typeof tenants, status: 'ACTIVE' | 'TRIAL', enforceMfa: boolean) => {
      const created = await db.tenant.create({
        data: {
          slug: `${key}-${RUN}`,
          name: `${key[0]?.toUpperCase()}${key.slice(1)} Plant ${RUN}`,
          status,
          ...(status === 'TRIAL' ? { trialEndsAt: new Date(Date.now() + 7 * 86_400_000) } : {}),
          settings: { create: { branding: {}, security: { enforceMfa }, localization: {}, features: {}, metadata: {} } },
        },
      });
      tenants[key] = created.id;
    };
    await tenant('north', 'ACTIVE', false);
    await tenant('south', 'TRIAL', false);
    await tenant('secure', 'ACTIVE', true);
    const user = async (name: string, memberships: [keyof typeof tenants, 'MEMBER' | 'TENANT_ADMIN'][]) => {
      const created = await db.user.create({ data: { email: email(name), name: `Proof ${name}`, passwordHash, status: 'ACTIVE' } });
      users[name] = created.id;
      for (const [key, role] of memberships) await db.tenantMember.create({ data: { userId: created.id, tenantId: tenants[key], role } });
    };
    await user('solo', [['north', 'MEMBER']]);
    await user('multi', [['north', 'TENANT_ADMIN'], ['south', 'MEMBER']]);
    await user('none', []);
    await user('locked', [['north', 'MEMBER']]);
    await user('mfa', [['secure', 'MEMBER']]);
    await user('unenrolled', [['secure', 'MEMBER']]);
    await user('revoked', [['north', 'MEMBER']]);
    await user('changer', [['north', 'MEMBER']]);
    totpSecret = totp.generateTotpSecret();
    const credentialId = `totp-${RUN}`;
    await db.totpCredential.create({
      data: {
        id: credentialId,
        userId: users.mfa as string,
        keyVersion: 'v1',
        verifiedAt: new Date(),
        secretEnvelope: await encrypt(
          totpSecret,
          process.env.CONTROL_PAYLOAD_ENCRYPTION_KEY,
          `gigalibs:mfa-totp:v1:${credentialId}:${users.mfa}`,
        ),
      },
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('refuses a wrong password, an unknown account and then a locked one, without telling them apart', async () => {
    expect(await refusal(signIn('solo', { password: 'wrong-password' }))).toMatchObject({ code: 'MOBILE_INVALID_CREDENTIALS', status: 401 });
    expect(await refusal(signIn('nobody'))).toMatchObject({ code: 'MOBILE_INVALID_CREDENTIALS', status: 401 });
    for (let attempt = 0; attempt < 5; attempt += 1) await refusal(signIn('locked', { password: 'wrong-password' }));
    expect(await refusal(signIn('locked'))).toMatchObject({ code: 'MOBILE_ACCOUNT_LOCKED', status: 423 });
  });

  it('refuses an unknown app profile or contract version, a missing installation and an extra field', async () => {
    expect(await refusal(signIn('solo', { appProfile: 'someone-else' }))).toMatchObject({ code: 'MOBILE_CONTRACT_UNSUPPORTED', status: 426 });
    expect(await refusal(signIn('solo', { contractVersion: 'mobile-password-sign-in.v9' }))).toMatchObject({ code: 'MOBILE_CONTRACT_UNSUPPORTED' });
    expect(await refusal(signIn('solo', {}, {}))).toMatchObject({ code: 'MOBILE_REQUEST_INVALID', status: 400 });
    expect(await refusal(signIn('solo', { tenantId: tenants.south }))).toMatchObject({ code: 'MOBILE_REQUEST_INVALID' });
  });

  it('binds one eligible workspace at sign-in and answers its session v3', async () => {
    const tokens = (await signIn('solo')) as TokenSet;
    expect(tokens).toMatchObject({ contractVersion: 'mobile-token-set.v2', binding: 'TENANT_BOUND' });
    const { MobileSessionV3Schema, MobileTokenSetV2Schema } = await import('@gigalibs/contracts');
    expect(MobileTokenSetV2Schema.parse(tokens)).toEqual(tokens);
    const session = await controller.session(bearer(tokens.accessToken));
    expect(MobileSessionV3Schema.parse(session)).toEqual(session);
    expect(session).toMatchObject({
      tenant: { id: tenants.north },
      user: { id: users.solo, displayName: 'Proof solo' },
      persona: 'WORKFORCE_MEMBER',
      modules: [],
      sessionRevision: 1,
    });
    expect(session.assignments[0]?.scope).toEqual({ kind: 'MEMBER' });
  });

  it('refuses an account with no workspace', async () => {
    expect(await refusal(signIn('none'))).toMatchObject({ code: 'MOBILE_MEMBERSHIP_NONE', status: 403 });
  });

  it('keeps a pre-tenant sign-in out of the session until a workspace is chosen, and switches idempotently', async () => {
    const pre = (await signIn('multi')) as TokenSet;
    expect(pre.binding).toBe('PRE_TENANT');
    expect(await refusal(controller.session(bearer(pre.accessToken)))).toMatchObject({ code: 'MOBILE_SCOPE_DENIED', status: 403 });

    const page = await controller.memberships(bearer(pre.accessToken));
    expect(page.items.map((item) => item.tenantDisplayName).sort()).toEqual([`North Plant ${RUN}`, `South Plant ${RUN}`]);
    expect(JSON.stringify(page)).not.toContain(tenants.north);
    const south = page.items.find((item) => item.tenantDisplayName.startsWith('South')) as { selectionId: string };
    const north = page.items.find((item) => item.tenantDisplayName.startsWith('North')) as { selectionId: string };

    const key = randomUUID();
    const select = (selectionId: string, idempotencyKey = key, header = idempotencyKey, token = pre.accessToken) =>
      controller.switchWorkspace(
        { contractVersion: 'mobile-membership-selection.v1', selectionId, idempotencyKey },
        bearer(token, { 'idempotency-key': header }),
      ) as Promise<TokenSet>;
    expect(await refusal(select(south.selectionId, key, randomUUID()))).toMatchObject({ code: 'MOBILE_REQUEST_INVALID' });
    expect(await refusal(select(`${south.selectionId.slice(0, -2)}AA`))).toMatchObject({ code: 'MOBILE_SCOPE_DENIED' });

    const bound = await select(south.selectionId);
    expect(bound.binding).toBe('TENANT_BOUND');
    const again = await select(south.selectionId);
    expect(again.refreshToken).toBe(bound.refreshToken);
    expect(await refusal(select(north.selectionId))).toMatchObject({ code: 'MOBILE_IDEMPOTENCY_CONFLICT', status: 409 });

    // The pre-tenant bearer no longer speaks for the session; the bound one reads the chosen workspace.
    expect(await refusal(controller.memberships(bearer(pre.accessToken)))).toMatchObject({ code: 'MOBILE_AUTH_REQUIRED' });
    const session = await controller.session(bearer(bound.accessToken));
    expect(session).toMatchObject({ tenant: { id: tenants.south }, sessionRevision: 2, persona: 'WORKFORCE_MEMBER' });

    // A bound session may move to its other workspace; an expired choice is refused.
    const page2 = await controller.memberships(bearer(bound.accessToken));
    const north2 = page2.items.find((item) => item.tenantDisplayName.startsWith('North')) as { selectionId: string };
    const moved = await select(north2.selectionId, randomUUID(), undefined, bound.accessToken);
    const adminSession = await controller.session(bearer(moved.accessToken));
    expect(adminSession).toMatchObject({ tenant: { id: tenants.north }, persona: 'TENANT_ADMIN', sessionRevision: 3 });
    const claims = keys.verifyAccess(moved.accessToken);
    const expired = keys.seal('selection', { s: claims?.sid, m: 'any', i: INSTALL, p: PROFILE, e: Date.now() - 1_000 });
    expect(await refusal(select(expired, randomUUID(), undefined, moved.accessToken))).toMatchObject({ code: 'MOBILE_SELECTION_EXPIRED', status: 410 });
  });

  it('refuses a bearer from another installation', async () => {
    const tokens = (await signIn('solo')) as TokenSet;
    const elsewhere = { 'x-gigalibs-installation-id': OTHER_INSTALL, authorization: `Bearer ${tokens.accessToken}` };
    expect(await refusal(controller.session(elsewhere))).toMatchObject({ code: 'MOBILE_AUTH_REQUIRED' });
  });

  it('rotates the refresh token, and a reused one ends the session', async () => {
    const first = (await signIn('solo')) as TokenSet;
    const second = await refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.binding).toBe('TENANT_BOUND');
    await controller.session(bearer(second.accessToken));
    expect(await refusal(refresh(first.refreshToken))).toMatchObject({ code: 'MOBILE_AUTH_REQUIRED' });
    expect(await refusal(refresh(second.refreshToken))).toMatchObject({ code: 'MOBILE_AUTH_REQUIRED' });
    expect(await refusal(controller.session(bearer(second.accessToken)))).toMatchObject({ code: 'MOBILE_AUTH_REQUIRED' });
  });

  it('ends the session when its refresh token comes from another installation', async () => {
    const tokens = (await signIn('solo')) as TokenSet;
    expect(await refusal(refresh(tokens.refreshToken, OTHER_INSTALL))).toMatchObject({ code: 'MOBILE_AUTH_REQUIRED' });
    expect(await refusal(refresh(tokens.refreshToken))).toMatchObject({ code: 'MOBILE_AUTH_REQUIRED' });
  });

  it('never lets the web refresh use a mobile refresh token', async () => {
    const tokens = (await signIn('solo')) as TokenSet;
    await expect(auth.refresh(tokens.refreshToken)).rejects.toMatchObject({ status: 401 });
    await refresh(tokens.refreshToken);
  });

  it('asks for the authenticator before any token when a workspace requires MFA', async () => {
    expect(await refusal(signIn('unenrolled'))).toMatchObject({ code: 'MOBILE_MFA_ENROLLMENT_REQUIRED', status: 403 });
    const challenge = (await signIn('mfa')) as { contractVersion: string; challengeId: string; method: string };
    expect(challenge).toMatchObject({ contractVersion: 'mobile-mfa-challenge.v1', method: 'TOTP' });
    expect(challenge).not.toHaveProperty('accessToken');
    const verify = (code: string, installation = INSTALL, challengeId = challenge.challengeId) =>
      controller.verifyMfa(
        { contractVersion: 'mobile-mfa-verification.v1', appProfile: PROFILE, challengeId, code },
        { 'x-gigalibs-installation-id': installation },
      ) as Promise<TokenSet>;
    const right = totp.generateTotpCode(totpSecret);
    const wrong = right === '000000' ? '111111' : '000000';
    expect(await refusal(verify(wrong))).toMatchObject({ code: 'MOBILE_MFA_INVALID', status: 401 });
    const tokens = await verify(right);
    expect(tokens.binding).toBe('TENANT_BOUND');
    expect(await controller.session(bearer(tokens.accessToken))).toMatchObject({ tenant: { id: tenants.secure } });
    expect(await refusal(verify(right))).toMatchObject({ code: 'MOBILE_MFA_EXPIRED', status: 410 });

    const stolen = (await signIn('mfa')) as { challengeId: string };
    expect(await refusal(verify(right, OTHER_INSTALL, stolen.challengeId))).toMatchObject({ code: 'MOBILE_MFA_EXPIRED' });
    expect(await refusal(verify(right, INSTALL, stolen.challengeId))).toMatchObject({ code: 'MOBILE_MFA_EXPIRED' });
  });

  it('logs out: the bearer and the refresh token stop working', async () => {
    const tokens = (await signIn('solo')) as TokenSet;
    await controller.logout({ contractVersion: 'mobile-logout.v1' }, bearer(tokens.accessToken));
    expect(await refusal(controller.session(bearer(tokens.accessToken)))).toMatchObject({ code: 'MOBILE_AUTH_REQUIRED' });
    expect(await refusal(refresh(tokens.refreshToken))).toMatchObject({ code: 'MOBILE_AUTH_REQUIRED' });
  });

  it('ends access when the membership is suspended', async () => {
    const tokens = (await signIn('revoked')) as TokenSet;
    await db.tenantMember.update({
      where: { userId_tenantId: { userId: users.revoked as string, tenantId: tenants.north } },
      data: { status: 'SUSPENDED' },
    });
    expect(await refusal(controller.session(bearer(tokens.accessToken)))).toMatchObject({ code: 'MOBILE_MEMBERSHIP_REVOKED', status: 403 });
    expect(await refusal(refresh(tokens.refreshToken))).toMatchObject({ code: 'MOBILE_MEMBERSHIP_REVOKED' });
    expect(await refusal(signIn('revoked'))).toMatchObject({ code: 'MOBILE_MEMBERSHIP_NONE' });
  });

  it('refuses an app older than the deployment minimum, or one that does not say its version', async () => {
    const { MobileAuthService } = await import('./mobile-auth.service.js');
    const { MobileAuthController } = await import('./mobile-auth.controller.js');
    process.env.MOBILE_MIN_APP_VERSION = '1.2.0';
    const strict = new MobileAuthController(new MobileAuthService(auth));
    delete process.env.MOBILE_MIN_APP_VERSION;
    const body = { contractVersion: 'mobile-password-sign-in.v1', email: email('solo'), password: PASSWORD, appProfile: PROFILE };
    expect(await refusal(strict.password(body, headers({ 'x-gigalibs-app-version': '1.1.9' })))).toMatchObject({
      code: 'MOBILE_CONTRACT_UNSUPPORTED',
      status: 426,
    });
    expect(await refusal(strict.password(body, headers()))).toMatchObject({ code: 'MOBILE_CONTRACT_UNSUPPORTED' });
    const tokens = (await strict.password(body, headers({ 'x-gigalibs-app-version': '1.2.0' }))) as TokenSet;
    expect(await refusal(strict.session(bearer(tokens.accessToken, { 'x-gigalibs-app-version': '1.0.0' })))).toMatchObject({
      code: 'MOBILE_CONTRACT_UNSUPPORTED',
    });
    await strict.logout({ contractVersion: 'mobile-logout.v1' }, bearer(tokens.accessToken, { 'x-gigalibs-app-version': '1.0.0' }));
  });

  it('prunes spent mobile state and keeps what a live session still needs', async () => {
    const { pruneMobileAuthState } = await import('./mobile-retention.js');
    const live = (await signIn('solo')) as TokenSet;
    const renewed = await refresh(live.refreshToken);
    const ended = (await signIn('solo')) as TokenSet;
    const endedRenewed = await refresh(ended.refreshToken);
    await controller.logout({ contractVersion: 'mobile-logout.v1' }, bearer(endedRenewed.accessToken));
    const liveSid = keys.verifyAccess(renewed.accessToken)?.sid as string;
    const endedSid = keys.verifyAccess(endedRenewed.accessToken)?.sid as string;
    await db.mobileMfaChallenge.create({
      data: {
        challengeHash: 'a'.repeat(64),
        userId: users.solo as string,
        appProfile: PROFILE,
        installationId: INSTALL,
        expiresAt: new Date(Date.now() - 2 * 3_600_000),
      },
    });
    await pruneMobileAuthState();
    expect(await db.mobileMfaChallenge.count({ where: { challengeHash: 'a'.repeat(64) } })).toBe(0);
    expect(await db.mobileRetiredRefreshToken.count({ where: { sessionId: liveSid } })).toBe(1);
    expect(await db.mobileRetiredRefreshToken.count({ where: { sessionId: endedSid } })).toBe(0);
    expect(await db.mobileSwitchOutcome.count({ where: { expiresAt: { lt: new Date() } } })).toBe(0);
    // The live session's retired token still revokes it when presented again.
    expect(await refusal(refresh(live.refreshToken))).toMatchObject({ code: 'MOBILE_AUTH_REQUIRED' });
    expect(await refusal(refresh(renewed.refreshToken))).toMatchObject({ code: 'MOBILE_AUTH_REQUIRED' });
  });

  it('ends the mobile session when the password is changed on the web', async () => {
    const mobile = (await signIn('changer')) as TokenSet;
    const web = await auth.login({ email: email('changer'), password: PASSWORD });
    const sid = (JSON.parse(Buffer.from(web.accessToken.split('.')[1] ?? '', 'base64url').toString()) as { sid: string }).sid;
    await auth.changePassword(users.changer as string, sid, { currentPassword: PASSWORD, newPassword: `${PASSWORD}-next-1` });
    expect(await refusal(controller.session(bearer(mobile.accessToken)))).toMatchObject({ code: 'MOBILE_AUTH_REQUIRED' });
    expect(await refusal(refresh(mobile.refreshToken))).toMatchObject({ code: 'MOBILE_AUTH_REQUIRED' });
  });
});
