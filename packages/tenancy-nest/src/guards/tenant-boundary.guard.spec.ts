import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('@gigalibs/db', () => ({ prisma: { tenantMember: { findUnique: db.findUnique } } }));

let TenantBoundaryGuard: typeof import('./tenant-boundary.guard.js').TenantBoundaryGuard;

beforeAll(async () => {
  installMetadataShim();
  ({ TenantBoundaryGuard } = await import('./tenant-boundary.guard.js'));
});

describe('TenantBoundaryGuard', () => {
  beforeEach(() => db.findUnique.mockReset());

  it('does not require a tenant for explicitly public routes', async () => {
    const request = { headers: {} };
    const { context, handler } = executionContext(request);
    metadataReflect().defineMetadata('isPublic', true, handler);

    await expect(new TenantBoundaryGuard().canActivate(context)).resolves.toBe(true);
    expect(db.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an identifier outside the authenticated tenant boundary', async () => {
    db.findUnique.mockResolvedValue(activeMembership('ACTIVE'));
    const request = {
      headers: { 'x-tenant-id': 'another-tenant' },
      user: { sub: 'user-test', tid: 'tenant-test' },
    };

    await expect(
      new TenantBoundaryGuard().canActivate(executionContext(request).context),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('selects only the tenant fields required to enforce the boundary', async () => {
    db.findUnique.mockResolvedValue(activeMembership('ACTIVE'));
    const request = { headers: {}, user: { sub: 'user-test', tid: 'tenant-test' } };

    await expect(
      new TenantBoundaryGuard().canActivate(executionContext(request).context),
    ).resolves.toBe(true);
    expect(db.findUnique).toHaveBeenCalledWith({
      where: {
        userId_tenantId: {
          userId: 'user-test',
          tenantId: 'tenant-test',
        },
      },
      select: {
        status: true,
        tenant: {
          select: {
            id: true,
            slug: true,
            status: true,
            features: true,
            plan: true,
            trialEndsAt: true,
          },
        },
      },
    });
  });

  it('permits provisioning only on a route with explicit status metadata', async () => {
    db.findUnique.mockResolvedValue(activeMembership('PROVISIONING'));
    const request = { headers: {}, user: { sub: 'user-test', tid: 'tenant-test' } };
    const { context, handler } = executionContext(request);
    metadataReflect().defineMetadata('allowedTenantStatuses', ['ACTIVE', 'PROVISIONING'], handler);

    await expect(new TenantBoundaryGuard().canActivate(context)).resolves.toBe(true);
    expect(request).toHaveProperty('tenant.tenantId', 'tenant-test');
  });

  it('rejects provisioning tenants by default', async () => {
    db.findUnique.mockResolvedValue(activeMembership('PROVISIONING'));
    const request = { headers: {}, user: { sub: 'user-test', tid: 'tenant-test' } };

    await expect(
      new TenantBoundaryGuard().canActivate(executionContext(request).context),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permits trial tenants for normal tenant-bound routes', async () => {
    db.findUnique.mockResolvedValue(activeMembership('TRIAL'));
    const request = { headers: {}, user: { sub: 'user-test', tid: 'tenant-test' } };

    await expect(
      new TenantBoundaryGuard().canActivate(executionContext(request).context),
    ).resolves.toBe(true);
  });

  it('rejects an expired trial for normal tenant-bound routes', async () => {
    db.findUnique.mockResolvedValue({
      ...activeMembership('TRIAL'),
      tenant: { ...activeMembership('TRIAL').tenant, trialEndsAt: new Date(Date.now() - 1_000) },
    });
    const request = { headers: {}, user: { sub: 'user-test', tid: 'tenant-test' } };

    await expect(
      new TenantBoundaryGuard().canActivate(executionContext(request).context),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('skips tenant membership checks for user-scoped tenant discovery', async () => {
    const request = {
      headers: {},
      user: { sub: 'user-test', tid: 'stale-tenant' },
    };
    const { context, handler } = executionContext(request);
    metadataReflect().defineMetadata('skipTenantBoundary', true, handler);

    await expect(new TenantBoundaryGuard().canActivate(context)).resolves.toBe(true);
    expect(db.findUnique).not.toHaveBeenCalled();
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

function activeMembership(tenantStatus: 'ACTIVE' | 'PROVISIONING' | 'TRIAL') {
  return {
    status: 'ACTIVE',
    tenant: {
      id: 'tenant-test',
      slug: 'tenant-test-slug',
      status: tenantStatus,
      features: ['workflows'],
      plan: 'enterprise',
      trialEndsAt: tenantStatus === 'TRIAL' ? new Date(Date.now() + 24 * 60 * 60 * 1_000) : null,
    },
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
