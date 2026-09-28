import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_ROLES_KEY } from './decorators/require-platform-roles.decorator.js';
import { PlatformAuthorityGuard } from './guards/platform-authority.guard.js';

// Mock prisma database client
vi.mock('@gigalibs/db', () => ({
  prisma: {
    platformRoleAssignment: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '@gigalibs/db';

function createMockContext(userId?: string, requiredRoles?: string[]) {
  const request: { user?: { sub?: string }; platformRoles?: string[] } = {};
  if (userId) {
    request.user = { sub: userId };
  }

  const handler = () => {};
  if (requiredRoles) {
    Reflect.defineMetadata(PLATFORM_ROLES_KEY, requiredRoles, handler);
  }

  return {
    context: {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => handler,
      getClass: () => class TestController {},
    } as any,
    request,
  };
}

describe('PlatformAuthorityGuard', () => {
  let guard: PlatformAuthorityGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new PlatformAuthorityGuard();
  });

  it('rejects an unauthenticated request without a user subject', async () => {
    const { context } = createMockContext(undefined);
    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('Authenticated platform identity is required'),
    );
  });

  it('rejects a tenant administrator without platform role assignments', async () => {
    const { context } = createMockContext('user_tenant_admin_123');
    vi.mocked(prisma.platformRoleAssignment.findMany).mockResolvedValueOnce([]);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('Global platform authority is required'),
    );
    expect(prisma.platformRoleAssignment.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_tenant_admin_123',
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      select: { role: true },
    });
  });

  it('rejects a user when their platform role does not satisfy the required role (e.g. PLATFORM_AUDITOR calling PLATFORM_OWNER endpoint)', async () => {
    const { context } = createMockContext('user_auditor_456', ['PLATFORM_OWNER']);
    vi.mocked(prisma.platformRoleAssignment.findMany).mockResolvedValueOnce([
      { role: 'PLATFORM_AUDITOR' } as any,
    ]);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('Global platform authority is required'),
    );
  });

  it('rejects a user with PLATFORM_ADMIN when PLATFORM_OWNER is strictly required', async () => {
    const { context } = createMockContext('user_admin_789', ['PLATFORM_OWNER']);
    vi.mocked(prisma.platformRoleAssignment.findMany).mockResolvedValueOnce([
      { role: 'PLATFORM_ADMIN' } as any,
    ]);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('Global platform authority is required'),
    );
  });

  it('allows access when user possesses an active required platform role', async () => {
    const { context, request } = createMockContext('user_owner_999', ['PLATFORM_OWNER']);
    vi.mocked(prisma.platformRoleAssignment.findMany).mockResolvedValueOnce([
      { role: 'PLATFORM_OWNER' } as any,
    ]);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(request.platformRoles).toEqual(['PLATFORM_OWNER']);
  });

  it('allows access to generic platform endpoints when user possesses any platform role', async () => {
    const { context, request } = createMockContext('user_admin_555'); // Default: any platform role
    vi.mocked(prisma.platformRoleAssignment.findMany).mockResolvedValueOnce([
      { role: 'PLATFORM_ADMIN' } as any,
    ]);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(request.platformRoles).toEqual(['PLATFORM_ADMIN']);
  });
});
