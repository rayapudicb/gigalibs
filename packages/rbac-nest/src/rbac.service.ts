import { prisma } from '@gigalibs/db';
import { RoleHierarchy } from '@gigalibs/rbac-core';
import { Injectable } from '@nestjs/common';

@Injectable()
export class RbacService {
  private hierarchy = new RoleHierarchy();

  constructor() {
    this.initDefaultRoles();
  }

  private initDefaultRoles() {
    this.hierarchy.registerRoles([
      {
        name: 'SUPER_ADMIN',
        permissions: ['*'],
      },
      {
        name: 'TENANT_ADMIN',
        permissions: [
          'tenant:*',
          'users:*',
          'billing:*',
          'roles:*',
          'invites:*',
          'settings:*',
          'audit:*',
          'workflows:*',
          'runs:*',
          'connections:*',
          'contracts:*',
          'events:*',
          'ap:*',
          'actions:*',
          'exceptions:*',
          'value:*',
          'retention:*',
        ],
      },
      {
        name: 'MANAGER',
        permissions: [
          'users:read',
          'reports:*',
          'workflows:*',
          'comments:*',
          'connections:read',
          'connections:test',
          'connections:profile',
          'contracts:read',
          'events:read',
          'ap:read',
          'ap:evaluate',
          'actions:read',
          'actions:approve',
          'exceptions:read',
          'exceptions:assign',
          'exceptions:recover',
          'exceptions:resolve',
          'value:read',
          'value:verify',
          'retention:read',
        ],
        inherits: ['MEMBER'],
      },
      {
        name: 'MEMBER',
        permissions: ['users:read', 'chat:*', 'comments:create', 'profile:*'],
        inherits: ['VIEWER'],
      },
      {
        name: 'VIEWER',
        permissions: ['dashboard:read', 'content:read'],
      },
    ]);
  }

  async getUserPermissions(
    userId?: string,
    tenantId?: string,
    fallbackRoles: string[] = [],
  ): Promise<string[]> {
    if (!userId) return [];

    let roles = fallbackRoles;

    if (tenantId) {
      const member = await prisma.tenantMember.findUnique({
        where: {
          userId_tenantId: {
            userId,
            tenantId,
          },
        },
      });

      if (member) {
        roles = [member.role, ...fallbackRoles];
        const customPermissions = member.permissions ?? [];
        const rolePermissions = this.hierarchy.resolveUserPermissions(roles);
        return Array.from(new Set([...rolePermissions, ...customPermissions]));
      }
    }

    return this.hierarchy.resolveUserPermissions(roles);
  }
}
