import { moduleDefaultRoles } from '@gigalibs/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => {
  const mock: any = {
    tenantModuleEntitlement: { findMany: vi.fn() },
    customRole: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    customRoleInclusion: { findMany: vi.fn() },
    memberRoleAssignment: { findMany: vi.fn() },
    tenantMember: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  };
  mock.$transaction.mockImplementation(async (callback: any) => callback(mock));
  return mock;
});

vi.mock('@gigalibs/db', () => ({ prisma: prismaMock }));

import { TenancyService } from './tenancy.service.js';

const tenantId = 'tenant-1';
const viewer = { catalogKey: 'analytics-studio', key: 'analytics-viewer', name: 'Analytics viewer', description: 'Views.', permissions: ['analytics:read'] };
const steward = {
  catalogKey: 'analytics-studio',
  key: 'analytics-data-steward',
  name: 'Analytics data steward',
  description: 'Stewards.',
  permissions: ['analytics:read', 'analytics:models:publish'],
};
const cmms = { catalogKey: 'asset-maintenance', key: 'cmms-viewer', name: 'CMMS viewer', description: 'Views.', permissions: ['cmms:read'] };

// WI-OI-103e (ADR-0016 F16): manifest-declared default roles become built-in custom roles of entitled tenants.
describe('TenancyService.syncDefaultRoles', () => {
  const service = new TenancyService();

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.tenantModuleEntitlement.findMany.mockResolvedValue([{ moduleKey: 'analytics-studio' }]);
    prismaMock.customRole.findMany.mockResolvedValue([]);
    prismaMock.customRoleInclusion.findMany.mockResolvedValue([]);
    prismaMock.memberRoleAssignment.findMany.mockResolvedValue([]);
    prismaMock.tenantMember.findUnique.mockResolvedValue(null);
    prismaMock.customRole.create.mockImplementation(async ({ data }: any) => ({ id: `role-${data.name}` }));
  });

  it('creates the roles of entitled modules only, as built-in roles, and audits each as a system action', async () => {
    await service.syncDefaultRoles(tenantId, [viewer, steward, cmms]);
    expect(prismaMock.tenantModuleEntitlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId, status: 'ENABLED' }) }),
    );
    expect(prismaMock.customRole.create.mock.calls.map(([args]: any) => args.data)).toEqual([
      { tenantId, name: 'Analytics viewer', description: 'Views.', isSystem: true, permissions: ['analytics:read'] },
      { tenantId, name: 'Analytics data steward', description: 'Stewards.', isSystem: true, permissions: ['analytics:read', 'analytics:models:publish'] },
    ]);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'CREATE',
      resource: 'custom_role',
      userId: null,
      metadata: { source: 'module-manifest', catalogKey: 'analytics-studio', roleKey: 'analytics-viewer' },
    });
  });

  it('updates a built-in role that drifted from its manifest, leaves an equal one and a tenant-owned namesake alone', async () => {
    prismaMock.customRole.findMany.mockResolvedValue([
      { id: 'r-viewer', name: 'Analytics viewer', description: 'Views.', isSystem: true, permissions: ['analytics:read'] },
      { id: 'r-steward', name: 'Analytics data steward', description: 'Old.', isSystem: true, permissions: ['analytics:read'] },
    ]);
    await service.syncDefaultRoles(tenantId, [viewer, steward]);
    expect(prismaMock.customRole.create).not.toHaveBeenCalled();
    expect(prismaMock.customRole.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.customRole.update).toHaveBeenCalledWith({
      where: { id: 'r-steward' },
      data: { description: 'Stewards.', permissions: ['analytics:read', 'analytics:models:publish'] },
    });
    expect(prismaMock.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'UPDATE', resourceId: 'r-steward' });

    vi.clearAllMocks();
    prismaMock.tenantModuleEntitlement.findMany.mockResolvedValue([{ moduleKey: 'analytics-studio' }]);
    prismaMock.customRole.findMany.mockResolvedValue([
      { id: 'mine', name: 'Analytics viewer', description: 'Our own.', isSystem: false, permissions: ['analytics:export'] },
    ]);
    await service.syncDefaultRoles(tenantId, [viewer]);
    expect(prismaMock.customRole.update).not.toHaveBeenCalled();
    expect(prismaMock.customRole.create).not.toHaveBeenCalled();
  });

  it('does nothing for a tenant without the module, and tolerates a concurrent creation', async () => {
    prismaMock.tenantModuleEntitlement.findMany.mockResolvedValue([]);
    await service.syncDefaultRoles(tenantId, [viewer]);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();

    prismaMock.tenantModuleEntitlement.findMany.mockResolvedValue([{ moduleKey: 'analytics-studio' }]);
    prismaMock.customRole.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(service.syncDefaultRoles(tenantId, [viewer])).resolves.toBeUndefined();
    prismaMock.customRole.create.mockRejectedValueOnce(new Error('database down'));
    await expect(service.syncDefaultRoles(tenantId, [viewer])).rejects.toThrow('database down');
  });

  it('refuses updating a built-in role if an existing holder has explicit unit scope and new permissions are not scope-enforced', async () => {
    prismaMock.customRole.findMany.mockResolvedValue([
      { id: 'r-steward', name: 'Analytics data steward', description: 'Old.', isSystem: true, permissions: ['analytics:read'] },
    ]);
    // Member holds this role at UNITS
    prismaMock.memberRoleAssignment.findMany.mockResolvedValue([
      { userId: 'u-1', scope: 'UNITS', customRoleId: 'r-steward' },
    ]);
    // analytics:models:publish is checked by analytics-studio which is not in SCOPE_ENFORCING_MODULES
    await expect(service.syncDefaultRoles(tenantId, [steward])).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ROLE_SCOPE_NOT_ENFORCED' }),
    });
    expect(prismaMock.customRole.update).not.toHaveBeenCalled();
  });

  it('refuses updating a built-in role if an existing holder at units would gain control-plane permissions', async () => {
    prismaMock.customRole.findMany.mockResolvedValue([
      { id: 'r-viewer', name: 'Analytics viewer', description: 'Views.', isSystem: true, permissions: ['analytics:read'] },
    ]);
    prismaMock.memberRoleAssignment.findMany.mockResolvedValue([
      { userId: 'u-1', scope: 'UNITS', customRoleId: 'r-viewer' },
    ]);
    const driftedViewer = {
      ...viewer,
      permissions: ['analytics:read', 'users:create'], // users:create is control-plane
    };
    await expect(service.syncDefaultRoles(tenantId, [driftedViewer])).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ROLE_SCOPE_WORKSPACE_ONLY' }),
    });
    expect(prismaMock.customRole.update).not.toHaveBeenCalled();
  });

  it('ships the three Analytics roles of ADR-0016 F16 from the manifest', () => {
    const analytics = moduleDefaultRoles.filter((role) => role.catalogKey === 'analytics-studio');
    expect(analytics.map((role) => [role.name, [...role.permissions].sort()])).toEqual([
      ['Analytics viewer', ['analytics:read']],
      ['Analytics analyst', ['analytics:charts:write', 'analytics:dashboards:write', 'analytics:read', 'analytics:reports:write']],
      [
        'Analytics data steward',
        ['analytics:connectors:write', 'analytics:mappings:write', 'analytics:models:publish', 'analytics:models:write', 'analytics:read'],
      ],
    ]);
  });
});

