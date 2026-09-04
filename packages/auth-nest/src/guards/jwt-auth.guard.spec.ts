import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({ verifyJwt: vi.fn(), findFirst: vi.fn() }));
vi.mock('@gigalibs/auth-core', () => ({ verifyJwt: dependencies.verifyJwt }));
vi.mock('@gigalibs/db', () => ({ prisma: { session: { findFirst: dependencies.findFirst } } }));

let JwtAuthGuard: typeof import('./jwt-auth.guard.js').JwtAuthGuard;

beforeAll(async () => {
  installMetadataShim();
  ({ JwtAuthGuard } = await import('./jwt-auth.guard.js'));
});

describe('JwtAuthGuard', () => {
  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'unit-test-access-secret-at-least-32-characters';
    dependencies.verifyJwt.mockReset();
    dependencies.findFirst.mockReset();
  });

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

  it('attaches claims only when token and server-side tenant session agree', async () => {
    const payload = {
      sub: 'user-test',
      tid: 'tenant-test',
      sid: 'session-test',
      roles: ['MEMBER'],
    };
    dependencies.verifyJwt.mockReturnValue(payload);
    dependencies.findFirst.mockResolvedValue({ tenantId: 'tenant-test' });
    const request = { headers: { authorization: 'Bearer signed-token' } };
    const guard = new JwtAuthGuard(new Reflector());

    await expect(guard.canActivate(executionContext(request).context)).resolves.toBe(true);
    expect(request).toHaveProperty('user', payload);
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
