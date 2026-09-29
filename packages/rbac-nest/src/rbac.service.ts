import { isTenantPermissionCode } from '@gigalibs/contracts';
import { prisma } from '@gigalibs/db';
import { createDefaultRoleHierarchy } from '@gigalibs/rbac-core';
import { Injectable } from '@nestjs/common';

const baseRoleHierarchy = createDefaultRoleHierarchy();

export function resolveBaseRolePermissions(roles: readonly string[]): string[] {
  return baseRoleHierarchy.resolveUserPermissions([...roles]);
}

@Injectable()
export class RbacService {
  async getUserPermissions(
    userId?: string,
    tenantId?: string,
    // Retained for source compatibility; token roles cannot grant permissions.
    _fallbackRoles: string[] = [],
  ): Promise<string[]> {
    if (!userId || !tenantId) return [];

    if (tenantId) {
      const member = await prisma.tenantMember.findUnique({
        where: {
          userId_tenantId: {
            userId,
            tenantId,
          },
        },
        include: {
          user: { select: { status: true } },
          customRole: { select: { permissions: true } },
        },
      });

      if (member?.status === 'ACTIVE' && member.user.status === 'ACTIVE') {
        const customPermissions = member.permissions ?? [];
        const assignedRolePermissions = Array.isArray(member.customRole?.permissions)
          ? member.customRole.permissions.filter(isTenantPermissionCode)
          : [];
        const rolePermissions = resolveBaseRolePermissions([member.role]);
        return Array.from(
          new Set([...rolePermissions, ...assignedRolePermissions, ...customPermissions]),
        );
      }
    }

    return [];
  }
}
