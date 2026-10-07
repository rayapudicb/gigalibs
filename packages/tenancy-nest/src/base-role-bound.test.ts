import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// WI-OI-120x: someone who is not a Tenant Admin gives no base role beyond what they hold, and does not change their own
// role, department or places.
const prismaMock = vi.hoisted(() => {
  const mock: any = {
    tenantMember: { findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    memberRoleAssignment: { findMany: vi.fn() },
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
  return mock;
});

vi.mock('@gigalibs/db', () => ({ prisma: prismaMock }));

import { TenancyService } from './tenancy.service.js';

const tenantId = 'tenant-1';
const updatedAt = new Date('2026-10-07T10:00:00.000Z');
const member = (id: string, role: string, status = 'ACTIVE') => ({
  id,
  userId: `user-${id}`,
  role,
  status,
  permissions: [] as string[],
  departmentId: null,
  employmentType: null,
  spatialScopePlaceIds: [] as string[],
  updatedAt,
});
// The memberships the checks read, by user: a Member holding `users:update` and `invites:create` directly, and an admin.
const memberships: Record<string, { role: string; status: string; permissions?: string[] }> = {
  'user-lead': { role: 'MEMBER', status: 'ACTIVE', permissions: ['users:update', 'invites:create'] },
  'user-admin': { role: 'TENANT_ADMIN', status: 'ACTIVE' },
};

describe('base roles and own access (WI-OI-120x)', () => {
  const service = new TenancyService();
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock));
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.tenantMember.findUnique.mockImplementation(
      async ({ where }: { where: { userId_tenantId: { userId: string } } }) => memberships[where.userId_tenantId.userId] ?? null,
    );
    prismaMock.memberRoleAssignment.findMany.mockResolvedValue([]);
    prismaMock.tenantMember.count.mockResolvedValue(1);
    prismaMock.tenantMember.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.tenantMember.findUniqueOrThrow.mockResolvedValue({ ...member('m-1', 'VIEWER'), joinedAt: updatedAt, user: { id: 'user-m-1', email: 'a@b.c', name: 'A', status: 'ACTIVE' }, customRole: null, department: null });
    prismaMock.department.findFirst.mockResolvedValue({ id: 'dept-1' });
    prismaMock.tenantInvite.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.tenantInvite.create.mockResolvedValue({ id: 'invite-1', email: 'new@b.c', role: 'MEMBER', expiresAt: updatedAt, createdAt: updatedAt });
  });
  const update = (target: ReturnType<typeof member>, actorId: string, changes: Record<string, unknown>) => {
    prismaMock.tenantMember.findFirst.mockResolvedValueOnce(target);
    return service.updateMember(tenantId, target.id, actorId, { expectedUpdatedAt: updatedAt.toISOString(), reason: 'Team change', ...changes } as never);
  };

  it('refuses a base role beyond what a non-admin holds; allows one within it, and any lowering', async () => {
    await expect(update(member('m-1', 'VIEWER'), 'user-lead', { role: 'MANAGER' })).rejects.toMatchObject({
      response: { code: 'GRANT_BEYOND_OWN', missing: expect.arrayContaining(['workflows:*', 'spend:approve']) },
    });
    await update(member('m-1', 'VIEWER'), 'user-lead', { role: 'MEMBER' });
    await update(member('m-2', 'MANAGER'), 'user-lead', { role: 'VIEWER' });
    expect(prismaMock.tenantMember.updateMany).toHaveBeenCalledTimes(2);
  });

  it("refuses a non-admin changing their own role, department or places; their employment type is theirs", async () => {
    for (const changes of [{ role: 'VIEWER' }, { departmentId: 'dept-1' }, { spatialScopePlaceIds: ['place-1'] }])
      await expect(update(member('lead', 'MEMBER'), 'user-lead', changes)).rejects.toMatchObject({ response: { code: 'SELF_ACCESS_CHANGE' } });
    await update(member('lead', 'MEMBER'), 'user-lead', { employmentType: 'CONTRACTOR' });
    expect(prismaMock.tenantMember.updateMany).toHaveBeenCalledOnce();
  });

  it('lets a Tenant Admin give any base role and change their own access', async () => {
    await update(member('m-1', 'VIEWER'), 'user-admin', { role: 'MANAGER' });
    await update(member('admin', 'TENANT_ADMIN'), 'user-admin', { spatialScopePlaceIds: ['place-1'] });
    expect(prismaMock.tenantMember.updateMany).toHaveBeenCalledTimes(2);
  });

  it('bounds bringing a suspended member back as a new grant (review M2)', async () => {
    await expect(update(member('m-3', 'MANAGER', 'SUSPENDED'), 'user-lead', { status: 'ACTIVE' })).rejects.toMatchObject({
      response: { code: 'GRANT_BEYOND_OWN', missing: expect.arrayContaining(['workflows:*']) },
    });
    await expect(update({ ...member('m-4', 'VIEWER', 'SUSPENDED'), permissions: ['finance:read'] }, 'user-lead', { status: 'ACTIVE' })).rejects.toMatchObject({
      response: { code: 'GRANT_BEYOND_OWN', missing: ['finance:read'] },
    });
    await update(member('m-5', 'VIEWER', 'SUSPENDED'), 'user-lead', { status: 'ACTIVE' });
    await update(member('m-3', 'MANAGER', 'SUSPENDED'), 'user-admin', { status: 'ACTIVE' });
    expect(prismaMock.tenantMember.updateMany).toHaveBeenCalledTimes(2);
  });

  it('protects a Super Admin member as a Tenant Admin is (review L3)', async () => {
    for (const changes of [{ role: 'MANAGER' }, { status: 'SUSPENDED' }])
      await expect(update(member('super', 'SUPER_ADMIN'), 'user-lead', changes)).rejects.toMatchObject({ response: { code: 'TENANT_ADMIN_ONLY' } });
    expect(prismaMock.tenantMember.updateMany).not.toHaveBeenCalled();
  });

  it('refuses an invitation to a base role beyond what its sender holds', async () => {
    prismaMock.tenantMember.findFirst.mockResolvedValue(null); // no membership for the email yet
    await expect(service.createInvite(tenantId, 'user-lead', { email: 'new@b.c', role: 'MANAGER', expiresInHours: 72 } as never)).rejects.toMatchObject({
      response: { code: 'GRANT_BEYOND_OWN' },
    });
    await service.createInvite(tenantId, 'user-lead', { email: 'new@b.c', role: 'MEMBER', expiresInHours: 72 } as never);
    expect(prismaMock.tenantInvite.create).toHaveBeenCalledOnce();
  });

  it('refuses accepting an invitation whose sender no longer holds what it gives', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-new', email: 'new@b.c', status: 'ACTIVE' });
    prismaMock.tenant.findUnique.mockResolvedValue({ id: tenantId, slug: 't', name: 'T', status: 'ACTIVE' });
    const accept = (role: string, invitedById: string) => {
      prismaMock.tenantInvite.findUnique.mockResolvedValueOnce({ id: 'invite-1', tenantId, email: 'new@b.c', role, invitedById, tenant: {} });
      return service.acceptInvite('user-new', { token: 'x'.repeat(43) } as never);
    };
    await expect(accept('MANAGER', 'user-lead')).rejects.toMatchObject({ response: { code: 'INVITATION_NO_LONGER_VALID' } });
    await expect(accept('VIEWER', 'user-gone')).rejects.toMatchObject({ response: { code: 'INVITATION_NO_LONGER_VALID' } });
    expect(prismaMock.tenantInvite.updateMany).not.toHaveBeenCalled();
    // An administrator's invitation passes the bound; here it has expired, so acceptance stops at the next step.
    await expect(accept('MANAGER', 'user-admin')).rejects.toBeInstanceOf(ConflictException);
    expect(prismaMock.tenantInvite.updateMany).toHaveBeenCalledOnce();
  });
});
