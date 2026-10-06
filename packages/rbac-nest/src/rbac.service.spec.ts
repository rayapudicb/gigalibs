import { beforeEach, describe, expect, it, vi } from 'vitest';

// WI-OI-120w (R2 slice 1), Security review L5: the control-plane guard's permissions come from the member's live role
// assignments at their own scope, with only tenant codes kept.
const prismaMock = vi.hoisted(() => ({
  tenantMember: { findUnique: vi.fn() },
  memberRoleAssignment: { findMany: vi.fn() },
}));
vi.mock('@gigalibs/db', () => ({ prisma: prismaMock }));

import { RbacService } from './rbac.service.js';

describe('RbacService.getUserPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.tenantMember.findUnique.mockResolvedValue({ role: 'MEMBER', status: 'ACTIVE', permissions: ['reports:read'], user: { status: 'ACTIVE' } });
  });

  it("unites the base role, direct grants and every live assignment's role, dropping platform and malformed codes", async () => {
    prismaMock.memberRoleAssignment.findMany.mockResolvedValue([
      { customRole: { name: 'Maintenance technician', permissions: ['cmms.work-orders.read', 'platform:tenants:write'] } },
      { customRole: { name: 'Workforce member', permissions: ['workforce.time.punch', 'Bad Code'] } },
    ]);
    const permissions = await new RbacService().getUserPermissions('user-1', 'tenant-1');
    expect(permissions).toEqual(expect.arrayContaining(['cmms.work-orders.read', 'workforce.time.punch', 'reports:read']));
    expect(permissions).not.toContain('platform:tenants:write');
    expect(permissions).not.toContain('Bad Code');
    expect(prismaMock.memberRoleAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1', userId: 'user-1', revokedAt: null, scope: 'MEMBER' } }),
    );
  });

  it('gives nothing to an inactive member, whatever roles they hold', async () => {
    prismaMock.tenantMember.findUnique.mockResolvedValue({ role: 'MEMBER', status: 'SUSPENDED', permissions: [], user: { status: 'ACTIVE' } });
    prismaMock.memberRoleAssignment.findMany.mockResolvedValue([{ customRole: { name: 'Planner', permissions: ['cmms:read'] } }]);
    expect(await new RbacService().getUserPermissions('user-1', 'tenant-1')).toEqual([]);
  });
});
