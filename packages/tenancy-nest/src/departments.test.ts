import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => {
  const mock: any = {
    department: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    tenantMember: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  };
  mock.$transaction.mockImplementation(async (cb: any) => cb(mock));
  return mock;
});

vi.mock('@gigalibs/db', () => ({
  prisma: prismaMock,
}));

import { TenancyService } from './tenancy.service.js';

describe('TenancyService - Departments & Hierarchy', () => {
  const service = new TenancyService();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const userId = '00000000-0000-0000-0000-000000000002';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listDepartments', () => {
    it('returns departments for the tenant', async () => {
      const mockDepts = [
        { id: 'dept-1', name: 'Engineering', code: 'ENG', parentId: null, _count: { members: 5, children: 1 } },
        { id: 'dept-2', name: 'Frontend', code: 'ENG-FE', parentId: 'dept-1', _count: { members: 3, children: 0 } },
      ];
      prismaMock.department.findMany.mockResolvedValue(mockDepts);

      const result = await service.listDepartments(tenantId);
      expect(result).toEqual(mockDepts);
      expect(prismaMock.department.findMany).toHaveBeenCalledWith({
        where: { tenantId },
        orderBy: [{ name: 'asc' }],
        include: expect.any(Object),
      });
    });
  });

  describe('createDepartment', () => {
    it('creates a department successfully and records audit log', async () => {
      prismaMock.department.findUnique.mockResolvedValue(null);
      prismaMock.department.create.mockResolvedValue({
        id: 'dept-new',
        tenantId,
        name: 'Operations',
        code: 'OPS',
        parentId: null,
      });

      const result = await service.createDepartment(tenantId, userId, {
        name: 'Operations',
        code: 'OPS',
      });

      expect(result.id).toBe('dept-new');
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'CREATE',
          resource: 'department',
          resourceId: 'dept-new',
        }),
      });
    });

    it('rejects duplicate code within same tenant with ConflictException', async () => {
      prismaMock.department.findUnique.mockResolvedValue({ id: 'existing-dept' });

      await expect(
        service.createDepartment(tenantId, userId, {
          name: 'Duplicate Ops',
          code: 'OPS',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updateDepartment - cycle detection', () => {
    it('rejects self-parenting with BadRequestException', async () => {
      prismaMock.department.findFirst.mockResolvedValue({
        id: 'dept-1',
        tenantId,
        code: 'ENG',
      });

      await expect(
        service.updateDepartment(tenantId, 'dept-1', userId, {
          parentId: 'dept-1',
        }),
      ).rejects.toThrow('A department cannot be its own parent');
    });

    it('rejects cyclic hierarchy when parent is a descendant', async () => {
      prismaMock.department.findFirst
        .mockResolvedValueOnce({ id: 'dept-1', tenantId, code: 'ENG' }) // target department
        .mockResolvedValueOnce({ id: 'dept-3', tenantId, code: 'SUB' }) // proposed parent
        // Ancestor lookup: dept-3 -> parent dept-2 -> parent dept-1 (cycle!)
        .mockResolvedValueOnce({ parentId: 'dept-2' })
        .mockResolvedValueOnce({ parentId: 'dept-1' });

      await expect(
        service.updateDepartment(tenantId, 'dept-1', userId, {
          parentId: 'dept-3',
        }),
      ).rejects.toThrow('Cyclic department hierarchy is not allowed');
    });
  });

  describe('deleteDepartment', () => {
    it('rejects deletion when department has child departments', async () => {
      prismaMock.department.findFirst.mockResolvedValue({
        id: 'dept-1',
        name: 'Parent',
        code: 'PAR',
        _count: { children: 2, members: 0 },
      });

      await expect(service.deleteDepartment(tenantId, 'dept-1', userId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects deletion when department has assigned members', async () => {
      prismaMock.department.findFirst.mockResolvedValue({
        id: 'dept-1',
        name: 'Team',
        code: 'TM',
        _count: { children: 0, members: 4 },
      });

      await expect(service.deleteDepartment(tenantId, 'dept-1', userId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('deletes department cleanly when empty', async () => {
      prismaMock.department.findFirst.mockResolvedValue({
        id: 'dept-1',
        name: 'Empty Team',
        code: 'EMP',
        _count: { children: 0, members: 0 },
      });
      prismaMock.department.delete.mockResolvedValue({ id: 'dept-1' });

      const res = await service.deleteDepartment(tenantId, 'dept-1', userId);
      expect(res.deleted).toBe(true);
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DELETE',
          resource: 'department',
          resourceId: 'dept-1',
        }),
      });
    });
  });

  describe('updateOrganizationSettings', () => {
    it('enables organization hierarchy and updates features array', async () => {
      prismaMock.tenant.findUniqueOrThrow.mockResolvedValue({
        id: tenantId,
        features: ['asset-maintenance'],
      });

      const res = await service.updateOrganizationSettings(tenantId, userId, {
        hierarchyEnabled: true,
      });

      expect(res.hierarchyEnabled).toBe(true);
      expect(prismaMock.tenant.update).toHaveBeenCalledWith({
        where: { id: tenantId },
        data: { features: ['asset-maintenance', 'organization-hierarchy'] },
      });
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'SETTINGS_CHANGE',
          resource: 'tenant_settings',
          resourceId: tenantId,
          before: { hierarchyEnabled: false, spatialScopingEnabled: false },
          after: { hierarchyEnabled: true, spatialScopingEnabled: false },
        }),
      });
    });

    it('turns on spatial scoping without changing the hierarchy setting', async () => {
      prismaMock.tenant.findUniqueOrThrow.mockResolvedValue({
        id: tenantId,
        features: ['asset-maintenance', 'organization-hierarchy'],
      });

      const res = await service.updateOrganizationSettings(tenantId, userId, {
        spatialScopingEnabled: true,
      });

      expect(res).toEqual({ hierarchyEnabled: true, spatialScopingEnabled: true });
      expect(prismaMock.tenant.update).toHaveBeenCalledWith({
        where: { id: tenantId },
        data: { features: ['asset-maintenance', 'organization-hierarchy', 'spatial-scoping'] },
      });
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'SETTINGS_CHANGE',
          before: { hierarchyEnabled: true, spatialScopingEnabled: false },
          after: { hierarchyEnabled: true, spatialScopingEnabled: true },
        }),
      });
    });

    it('disables organization hierarchy and removes feature flag', async () => {
      prismaMock.tenant.findUniqueOrThrow.mockResolvedValue({
        id: tenantId,
        features: ['asset-maintenance', 'organization-hierarchy'],
      });

      const res = await service.updateOrganizationSettings(tenantId, userId, {
        hierarchyEnabled: false,
      });

      expect(res.hierarchyEnabled).toBe(false);
      expect(prismaMock.tenant.update).toHaveBeenCalledWith({
        where: { id: tenantId },
        data: { features: ['asset-maintenance'] },
      });
    });
  });
});
