import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  verifyJwt: vi.fn(),
  findFirst: vi.fn(),
  findMember: vi.fn(),
}));
vi.mock('@gigalibs/auth-core', () => ({ verifyJwt: dependencies.verifyJwt }));
vi.mock('@gigalibs/db', () => ({
  prisma: {
    session: { findFirst: dependencies.findFirst },
    tenantMember: { findUnique: dependencies.findMember },
  },
}));

let JwtAuthGuard: typeof import('./jwt-auth.guard.js').JwtAuthGuard;

beforeAll(async () => {
  installMetadataShim();
  ({ JwtAuthGuard } = await import('./jwt-auth.guard.js'));
});

describe('JwtAuthGuard', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', 'unit-test-access-secret-at-least-32-characters');
    dependencies.verifyJwt.mockReset();
    dependencies.findFirst.mockReset();
    dependencies.findMember.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('rejects a request without a bearer token', async () => {
    const guard = new JwtAuthGuard(new Reflector());
    await expect(
      guard.canActivate(executionContext({ headers: {} }).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a valid token when its server-side session is revoked or absent', async () => {
    dependencies.verifyJwt.mockReturnValue({
      sub: 'user-test',
      tid: 'tenant-test',
      sid: 'session-test',
      roles: [],
    });
    dependencies.findFirst.mockResolvedValue(null);
    const guard = new JwtAuthGuard(new Reflector());

    await expect(
      guard.canActivate(
        executionContext({ headers: { authorization: 'Bearer signed-token' } }).context,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches current membership roles even when the valid token contains a previous higher role', async () => {
    const payload = {
      sub: 'user-test',
      tid: 'tenant-test',
      sid: 'session-test',
      roles: ['TENANT_ADMIN'],
    };
    dependencies.verifyJwt.mockReturnValue(payload);
    dependencies.findFirst.mockResolvedValue(activeTenantSession(false));
    dependencies.findMember.mockResolvedValue({ role: 'VIEWER', status: 'ACTIVE' });
    const request = { headers: { authorization: 'Bearer signed-token' } };
    const guard = new JwtAuthGuard(new Reflector());

    await expect(guard.canActivate(executionContext(request).context)).resolves.toBe(true);
    expect(request).toHaveProperty('user', { ...payload, roles: ['VIEWER'] });
  });

  it.each(['SUSPENDED', 'DEACTIVATED', 'PENDING_VERIFICATION'])(
    'rejects a session belonging to a %s user',
    async (status) => {
      dependencies.verifyJwt.mockReturnValue({
        sub: 'user-test',
        tid: 'tenant-test',
        sid: 'session-test',
        roles: ['SUPER_ADMIN'],
      });
      dependencies.findFirst.mockResolvedValue({ tenantId: 'tenant-test', user: { status } });
      const guard = new JwtAuthGuard(new Reflector());
      await expect(
        guard.canActivate(
          executionContext({ headers: { authorization: 'Bearer signed-token' } }).context,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(dependencies.findMember).not.toHaveBeenCalled();
    },
  );

  it('grants no global role from a token without a selected DB tenant', async () => {
    dependencies.verifyJwt.mockReturnValue({
      sub: 'user-test',
      sid: 'session-test',
      roles: ['SUPER_ADMIN'],
    });
    dependencies.findFirst.mockResolvedValue({ tenantId: null, user: { status: 'ACTIVE' } });
    const request = { headers: { authorization: 'Bearer signed-token' } };
    await new JwtAuthGuard(new Reflector()).canActivate(executionContext(request).context);
    expect(request).toHaveProperty('user.roles', []);
    expect(dependencies.findMember).not.toHaveBeenCalled();
  });

  it('rejects a token whose tenant differs from its persisted session', async () => {
    dependencies.verifyJwt.mockReturnValue({
      sub: 'user-test',
      tid: 'other-tenant',
      sid: 'session-test',
      roles: ['SUPER_ADMIN'],
    });
    dependencies.findFirst.mockResolvedValue({
      tenantId: 'tenant-test',
      user: { status: 'ACTIVE' },
    });
    await expect(
      new JwtAuthGuard(new Reflector()).canActivate(
        executionContext({ headers: { authorization: 'Bearer signed-token' } }).context,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('blocks a tenant request when persisted policy requires MFA and the session is unverified', async () => {
    dependencies.verifyJwt.mockReturnValue({
      sub: 'user-test',
      tid: 'tenant-test',
      sid: 'session-test',
      roles: ['TENANT_ADMIN'],
    });
    dependencies.findFirst.mockResolvedValue(activeTenantSession(true));
    const guard = new JwtAuthGuard(new Reflector());

    await expect(
      guard.canActivate(
        executionContext({ headers: { authorization: 'Bearer signed-token' } }).context,
      ),
    ).rejects.toMatchObject({ response: { code: 'MFA_REQUIRED' } });
    expect(dependencies.findMember).not.toHaveBeenCalled();
  });

  it('allows only an explicitly marked MFA completion route while verification is pending', async () => {
    dependencies.verifyJwt.mockReturnValue({
      sub: 'user-test',
      tid: 'tenant-test',
      sid: 'session-test',
      roles: [],
    });
    dependencies.findFirst.mockResolvedValue(activeTenantSession(true));
    dependencies.findMember.mockResolvedValue({ role: 'MEMBER', status: 'ACTIVE' });
    const request = { headers: { authorization: 'Bearer signed-token' } };
    const target = executionContext(request);
    Reflect.defineMetadata('allowMfaPending', true, target.handler);

    await expect(new JwtAuthGuard(new Reflector()).canActivate(target.context)).resolves.toBe(true);
    expect(request).toHaveProperty('user.roles', ['MEMBER']);
  });

  it('rejects a malformed authorization header instead of throwing an internal type error', async () => {
    await expect(
      new JwtAuthGuard(new Reflector()).canActivate(
        executionContext({ headers: { authorization: ['Bearer invalid'] } }).context,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(dependencies.verifyJwt).not.toHaveBeenCalled();
  });
});

function executionContext(request: object): { context: ExecutionContext; handler: () => void } {
  const handler = () => undefined;
  class Controller {}
  const context = {
    getHandler: () => handler,
    getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, handler };
}

function activeTenantSession(enforceMfa: boolean) {
  return {
    tenantId: 'tenant-test',
    mfaVerifiedAt: null,
    user: { status: 'ACTIVE' },
    tenant: { settings: { security: { enforceMfa } } },
  };
}

type MetadataReflect = typeof Reflect & {
  defineMetadata: (key: string, value: unknown, target: object) => void;
  getMetadata: (key: string, target: object) => unknown;
};

function installMetadataShim(): void {
  const metadata = new WeakMap<object, Map<string, unknown>>();
  const reflection = Reflect as MetadataReflect;
  reflection.defineMetadata = (key, value, target) => {
    const values = metadata.get(target) ?? new Map<string, unknown>();
    values.set(key, value);
    metadata.set(target, values);
  };
  reflection.getMetadata = (key, target) => metadata.get(target)?.get(key);
}
