import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@gigalibs/db', () => ({
  prisma: { platformRoleAssignment: { findMany: db.findMany } },
}));

let PlatformAuthorityGuard: typeof import('./platform-authority.guard.js').PlatformAuthorityGuard;

beforeAll(async () => {
  installMetadataShim();
  ({ PlatformAuthorityGuard } = await import('./platform-authority.guard.js'));
});

describe('PlatformAuthorityGuard', () => {
  beforeEach(() => db.findMany.mockReset());

  it('rejects a tenant SUPER_ADMIN without a global platform assignment', async () => {
    db.findMany.mockResolvedValue([]);
    const request = { user: { sub: 'user-1', roles: ['SUPER_ADMIN'] } };
    await expect(
      new PlatformAuthorityGuard().canActivate(executionContext(request).context),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('loads active platform authority from persistence', async () => {
    db.findMany.mockResolvedValue([{ role: 'PLATFORM_ADMIN' }]);
    const request: { user: { sub: string }; platformRoles?: string[] } = {
      user: { sub: 'user-1' },
    };
    await expect(
      new PlatformAuthorityGuard().canActivate(executionContext(request).context),
    ).resolves.toBe(true);
    expect(request.platformRoles).toEqual(['PLATFORM_ADMIN']);
    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', status: 'ACTIVE' }),
      }),
    );
  });

  it('enforces a route-specific platform role', async () => {
    db.findMany.mockResolvedValue([{ role: 'PLATFORM_AUDITOR' }]);
    const request = { user: { sub: 'user-1' } };
    const { context, handler } = executionContext(request);
    metadataReflect().defineMetadata('requiredPlatformRoles', ['PLATFORM_OWNER'], handler);
    await expect(new PlatformAuthorityGuard().canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

function executionContext(request: object): { context: ExecutionContext; handler: () => void } {
  const handler = () => undefined;
  class Controller {}
  return {
    handler,
    context: {
      getHandler: () => handler,
      getClass: () => Controller,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

type MetadataReflect = typeof Reflect & {
  defineMetadata: (key: string, value: unknown, target: object) => void;
  getMetadata: (key: string, target: object) => unknown;
};

function metadataReflect(): MetadataReflect {
  return Reflect as MetadataReflect;
}

function installMetadataShim(): void {
  const metadata = new WeakMap<object, Map<string, unknown>>();
  const reflection = metadataReflect();
  reflection.defineMetadata = (key, value, target) => {
    const values = metadata.get(target) ?? new Map<string, unknown>();
    values.set(key, value);
    metadata.set(target, values);
  };
  reflection.getMetadata = (key, target) => metadata.get(target)?.get(key);
}
