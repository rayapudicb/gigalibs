import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// WI-OI-120cf: the mobile v1 routes through the API's real HTTP pipeline: the `api/v1` prefix, the three global guards
// the API runs (the web JWT guard, the tenant boundary and RBAC), its exception filter and JSON body parsing. Opt-in
// only, against a local database named mobile_bff_proof (never UAT on 5440, nor the shared test database on 5441).
// Each run seeds its own users and workspaces under a run id and keeps them.

const proofUrl = process.env.MOBILE_BFF_TEST_DATABASE_URL;
if (proofUrl) {
  const parsed = new URL(proofUrl);
  if (
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    ['5440', '5441'].includes(parsed.port) ||
    parsed.pathname !== '/mobile_bff_proof'
  ) {
    throw new Error('Refusing the mobile BFF HTTP proof: only a local mobile_bff_proof database is allowed.');
  }
}

describe.skipIf(!proofUrl)('mobile v1 routes over HTTP (isolated)', () => {
  let app: INestApplication;
  let db: typeof import('@gigalibs/db').prisma;
  let base: string;
  const run = `h${Date.now().toString(36)}`;
  const password = `Pw-${randomBytes(12).toString('base64url')}`;
  const installation = randomUUID();
  const tenantIds: string[] = [];
  const prior = {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN,
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN,
    CONTROL_PAYLOAD_KEY_VERSION: process.env.CONTROL_PAYLOAD_KEY_VERSION,
    CONTROL_PAYLOAD_ENCRYPTION_KEY: process.env.CONTROL_PAYLOAD_ENCRYPTION_KEY,
    MOBILE_APP_PROFILES: process.env.MOBILE_APP_PROFILES,
  };
  const email = (name: string) => `${name}.${run}@mobile-proof.test`;
  const call = (path: string, init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}) =>
    fetch(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-gigalibs-installation-id': installation,
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...init.headers,
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  const signIn = (name: string) =>
    call('/mobile/auth/password', {
      method: 'POST',
      body: { contractVersion: 'mobile-password-sign-in.v1', email: email(name), password, appProfile: 'gigalibs-universal' },
    });

  beforeAll(async () => {
    process.env.DATABASE_URL = proofUrl!;
    process.env.JWT_ACCESS_SECRET = randomBytes(32).toString('hex');
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '30d';
    process.env.CONTROL_PAYLOAD_KEY_VERSION = 'v1';
    process.env.CONTROL_PAYLOAD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.MOBILE_APP_PROFILES = 'gigalibs-universal';
    ({ prisma: db } = await import('@gigalibs/db'));
    const identity = await db.$queryRawUnsafe<Array<{ name: string }>>('SELECT current_database()::text AS name');
    if (identity[0]?.name !== 'mobile_bff_proof') throw new Error('Unexpected proof database identity.');
    const { hashPassword } = await import('@gigalibs/auth-core');
    const { NestFactory, Reflector } = await import('@nestjs/core');
    const { AuthController, AuthService, JwtAuthGuard, MfaAssistedRecoveryService, MobileAuthController, MobileAuthService, OidcService } =
      await import('@gigalibs/auth-nest');
    const { TenantBoundaryGuard } = await import('@gigalibs/tenancy-nest');
    const { RbacGuard, RbacService } = await import('@gigalibs/rbac-nest');
    const { DatabaseAvailabilityFilter } = await import('./database-availability.filter.js');

    const passwordHash = await hashPassword(password);
    for (const name of ['north', 'south']) {
      const tenant = await db.tenant.create({
        data: {
          slug: `${name}-${run}`,
          name: `${name} ${run}`,
          status: 'ACTIVE',
          settings: { create: { branding: {}, security: { enforceMfa: false }, localization: {}, features: {}, metadata: {} } },
        },
      });
      tenantIds.push(tenant.id);
    }
    const solo = await db.user.create({ data: { email: email('solo'), name: 'HTTP solo', passwordHash, status: 'ACTIVE' } });
    await db.tenantMember.create({ data: { userId: solo.id, tenantId: tenantIds[0] as string, role: 'MEMBER' } });
    const multi = await db.user.create({ data: { email: email('multi'), name: 'HTTP multi', passwordHash, status: 'ACTIVE' } });
    for (const tenantId of tenantIds) await db.tenantMember.create({ data: { userId: multi.id, tenantId, role: 'MEMBER' } });

    const auth = new AuthService();
    class ProofModule {}
    app = await NestFactory.create(
      {
        module: ProofModule,
        controllers: [AuthController, MobileAuthController],
        providers: [
          { provide: AuthService, useValue: auth },
          { provide: MobileAuthService, useValue: new MobileAuthService(auth) },
          { provide: OidcService, useValue: {} },
          { provide: MfaAssistedRecoveryService, useValue: {} },
        ],
      },
      { logger: false },
    );
    const reflector = new Reflector();
    app.useGlobalGuards(new JwtAuthGuard(reflector), new TenantBoundaryGuard(), new RbacGuard(reflector, new RbacService()));
    app.useGlobalFilters(new DatabaseAvailabilityFilter());
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1`;
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    for (const [name, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('signs in past the web guards and reads the session v3 with the mobile bearer', async () => {
    const signedIn = await signIn('solo');
    expect(signedIn.status).toBe(200);
    expect(signedIn.headers.get('cache-control')).toBe('no-store');
    const tokens = (await signedIn.json()) as { binding: string; accessToken: string };
    expect(tokens.binding).toBe('TENANT_BOUND');
    const session = await call('/mobile/session', { token: tokens.accessToken });
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ contractVersion: 'mobile-session.v3', tenant: { id: tenantIds[0] } });
  });

  it('answers refusals as mobile problems with their own status', async () => {
    const wrong = await call('/mobile/auth/password', {
      method: 'POST',
      body: { contractVersion: 'mobile-password-sign-in.v1', email: email('solo'), password: 'wrong', appProfile: 'gigalibs-universal' },
    });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({
      type: 'about:blank',
      title: 'The email or password is not right.',
      status: 401,
      code: 'MOBILE_INVALID_CREDENTIALS',
    });
    const noBearer = await call('/mobile/session', { headers: { 'x-correlation-id': 'corr-http-0001' } });
    expect(noBearer.status).toBe(401);
    expect(await noBearer.json()).toMatchObject({ code: 'MOBILE_AUTH_REQUIRED', correlationId: 'corr-http-0001' });
    const unparsed = await fetch(`${base}/mobile/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-gigalibs-installation-id': installation },
      body: '{not json',
    });
    expect(unparsed.status).toBeGreaterThanOrEqual(400);
    expect(unparsed.status).toBeLessThan(500);
  });

  it('keeps the two token kinds apart: the web refuses a mobile bearer, mobile refuses a web bearer', async () => {
    const mobile = (await (await signIn('solo')).json()) as { accessToken: string };
    expect((await call('/auth/context', { token: mobile.accessToken })).status).toBe(401);
    const web = await call('/auth/login', { method: 'POST', body: { email: email('solo'), password } });
    expect(web.status).toBeLessThan(300);
    const webTokens = (await web.json()) as { accessToken: string };
    expect((await call('/auth/context', { token: webTokens.accessToken })).status).toBe(200);
    expect(await (await call('/mobile/session', { token: webTokens.accessToken })).json()).toMatchObject({ code: 'MOBILE_AUTH_REQUIRED' });
  });

  it('chooses a workspace with an idempotent switch, and logs out with no content', async () => {
    const pre = (await (await signIn('multi')).json()) as { binding: string; accessToken: string };
    expect(pre.binding).toBe('PRE_TENANT');
    const page = (await (await call('/mobile/memberships', { token: pre.accessToken })).json()) as { items: { selectionId: string }[] };
    expect(page.items).toHaveLength(2);
    const key = randomUUID();
    const body = { contractVersion: 'mobile-membership-selection.v1', selectionId: page.items[0]?.selectionId, idempotencyKey: key };
    const first = await call('/mobile/session/switch', { method: 'POST', body, token: pre.accessToken, headers: { 'Idempotency-Key': key } });
    expect(first.status).toBe(200);
    const bound = (await first.json()) as { binding: string; accessToken: string; refreshToken: string };
    const again = (await (
      await call('/mobile/session/switch', { method: 'POST', body, token: pre.accessToken, headers: { 'Idempotency-Key': key } })
    ).json()) as { refreshToken: string };
    expect(again.refreshToken).toBe(bound.refreshToken);
    const out = await call('/mobile/auth/logout', { method: 'POST', body: { contractVersion: 'mobile-logout.v1' }, token: bound.accessToken });
    expect(out.status).toBe(204);
    expect((await call('/mobile/session', { token: bound.accessToken })).status).toBe(401);
  });
});
