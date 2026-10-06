import { isTenantPermissionCode } from '@gigalibs/contracts';
import { memberScopeRoles } from './member-role-assignments.js';
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
        include: { user: { select: { status: true } } },
      });

      if (member?.status === 'ACTIVE' && member.user.status === 'ACTIVE') {
        // As the session does (auth.service.ts): only tenant permission codes, never a platform code.
        const customPermissions = (member.permissions ?? []).filter(isTenantPermissionCode);
        // WI-OI-120w (R2 slice 1): the member's roles come from their live role assignments.
        const assignedRolePermissions = (await memberScopeRoles(prisma, tenantId, userId)).permissions;
        const rolePermissions = resolveBaseRolePermissions([member.role]);
        return Array.from(
          new Set([...rolePermissions, ...assignedRolePermissions, ...customPermissions]),
        );
      }
    }

    return [];
  }
}
