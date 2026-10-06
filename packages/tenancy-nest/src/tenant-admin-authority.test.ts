import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// WI-OI-120v: only an active workspace administrator may make someone a Tenant Admin, or change, suspend or remove one.
const prismaMock = vi.hoisted(() => {
  const mock: any = {
    tenantMember: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    customRole: { findFirst: vi.fn() },
    department: { findFirst: vi.fn() },
    tenantInvite: { updateMany: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    tenant: { findUnique: vi.fn() },
    session: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  };
  mock.$transaction.mockImplementation(async (cb: any) => cb(mock));
  mock.$queryRaw.mockResolvedValue([]);
  return mock;
});

vi.mock('@gigalibs/db', () => ({ prisma: prismaMock }));

import { TenancyService } from './tenancy.service.js';
import { assertTenantAdminAuthority } from './tenant-member-safety.js';

const tenantId = 'tenant-1';
const updatedAt = new Date('2026-10-06T10:00:00.000Z');
const member = (id: string, role: string, status = 'ACTIVE') => ({
  id,
  userId: `user-${id}`,
  role,
  status,
  customRoleId: null,
  departmentId: null,
  employmentType: null,
  spatialScopePlaceIds: [],
  updatedAt,
});
/** The actor's own membership, as the authority check reads it. */
const actorIs = (role: string, status = 'ACTIVE') => prismaMock.tenantMember.findUnique.mockResolvedValue({ role, status });

describe('assertTenantAdminAuthority', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lets ordinary changes through without reading the actor', async () => {
    await assertTenantAdminAuthority(prismaMock, tenantId, 'user-hr', { grantsAdmin: false, touchesAdmin: false });
    expect(prismaMock.tenantMember.findUnique).not.toHaveBeenCalled();
  });

  it('refuses a member, a suspended administrator or an outsider; allows an active administrator', async () => {
    for (const actor of [{ role: 'MANAGER', status: 'ACTIVE' }, { role: 'TENANT_ADMIN', status: 'SUSPENDED' }, null]) {
      prismaMock.tenantMember.findUnique.mockResolvedValueOnce(actor);
      await expect(assertTenantAdminAuthority(prismaMock, tenantId, 'user-x', { grantsAdmin: true, touchesAdmin: false })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    }
    actorIs('TENANT_ADMIN');
    await expect(assertTenantAdminAuthority(prismaMock, tenantId, 'user-admin', { grantsAdmin: true, touchesAdmin: true })).resolves.toBeUndefined();
  });
});

describe('TenancyService member and invitation changes', () => {
  const service = new TenancyService();
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.tenantMember.count.mockResolvedValue(1);
    prismaMock.tenantMember.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.tenantMember.findUniqueOrThrow.mockResolvedValue({ ...member('m-1', 'VIEWER'), joinedAt: updatedAt, user: { id: 'user-m-1', email: 'a@b.c', name: 'A' }, customRole: null });
    prismaMock.tenantInvite.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.tenantInvite.create.mockResolvedValue({ id: 'invite-1', email: 'new@b.c', role: 'MEMBER', expiresAt: updatedAt, createdAt: updatedAt });
  });
  const update = (target: ReturnType<typeof member>, actorId: string, changes: Record<string, unknown>) => {
    prismaMock.tenantMember.findFirst.mockResolvedValueOnce(target);
    return service.updateMember(tenantId, target.id, actorId, { expectedUpdatedAt: updatedAt.toISOString(), ...changes } as never);
  };

  it('refuses a users:update holder who makes anyone a Tenant Admin, themselves included', async () => {
    actorIs('MANAGER');
    await expect(update(member('m-1', 'MEMBER'), 'user-hr', { role: 'TENANT_ADMIN' })).rejects.toMatchObject({ response: { code: 'TENANT_ADMIN_ONLY' } });
    await expect(update(member('hr', 'MANAGER'), 'user-hr', { role: 'TENANT_ADMIN' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prismaMock.tenantMember.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a users:update holder who demotes or suspends a Tenant Admin', async () => {
    actorIs('MANAGER');
    await expect(update(member('admin', 'TENANT_ADMIN'), 'user-hr', { role: 'MEMBER' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(update(member('admin', 'TENANT_ADMIN'), 'user-hr', { status: 'SUSPENDED' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prismaMock.tenantMember.updateMany).not.toHaveBeenCalled();
  });

  it('still lets a users:update holder manage everyone else', async () => {
    actorIs('MANAGER');
    await update(member('m-1', 'MEMBER'), 'user-hr', { role: 'VIEWER' });
    expect(prismaMock.tenantMember.updateMany).toHaveBeenCalledOnce();
  });

  it('lets a Tenant Admin grant and change the role', async () => {
    actorIs('TENANT_ADMIN');
    await update(member('m-1', 'MEMBER'), 'user-admin', { role: 'TENANT_ADMIN' });
    await update(member('admin-2', 'TENANT_ADMIN'), 'user-admin', { role: 'MEMBER' });
    expect(prismaMock.tenantMember.updateMany).toHaveBeenCalledTimes(2);
  });

  it('refuses an invitation as Tenant Admin unless a Tenant Admin sends it', async () => {
    prismaMock.tenantMember.findFirst.mockResolvedValue(null); // no existing membership for the email
    actorIs('MANAGER');
    await expect(service.createInvite(tenantId, 'user-hr', { email: 'new@b.c', role: 'TENANT_ADMIN', expiresInHours: 72 } as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prismaMock.tenantInvite.create).not.toHaveBeenCalled();
    await service.createInvite(tenantId, 'user-hr', { email: 'new@b.c', role: 'MEMBER', expiresInHours: 72 } as never);
    actorIs('TENANT_ADMIN');
    await service.createInvite(tenantId, 'user-admin', { email: 'boss@b.c', role: 'TENANT_ADMIN', expiresInHours: 72 } as never);
    expect(prismaMock.tenantInvite.create).toHaveBeenCalledTimes(2);
  });

  it('accepts an invitation to be Tenant Admin only while its sender is an active administrator', async () => {
    prismaMock.tenantInvite.findUnique.mockResolvedValue({ id: 'invite-1', tenantId, email: 'boss@b.c', role: 'TENANT_ADMIN', invitedById: 'user-hr', tenant: {} });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-boss', email: 'boss@b.c', status: 'ACTIVE' });
    prismaMock.tenant.findUnique.mockResolvedValue({ id: tenantId, slug: 't', name: 'T', status: 'ACTIVE' });
    prismaMock.tenantMember.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ role: 'MANAGER', status: 'ACTIVE' });
    await expect(service.acceptInvite('user-boss', { token: 'x'.repeat(43) } as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prismaMock.tenantInvite.updateMany).not.toHaveBeenCalled();
  });
});
