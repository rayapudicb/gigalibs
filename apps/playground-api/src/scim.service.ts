import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma, MemberRole, UserStatus } from '@gigalibs/db';
import { AuditService } from '@gigalibs/audit-nest';

export interface ScimUserCreateInput {
  schemas?: string[];
  externalId?: string;
  userName: string;
  name?: {
    formatted?: string;
    familyName?: string;
    givenName?: string;
  };
  displayName?: string;
  emails?: Array<{ value: string; type?: string; primary?: boolean }>;
  active?: boolean;
  roles?: Array<{ value: string; primary?: boolean }>;
}

export interface ScimPatchOperation {
  op: 'add' | 'remove' | 'replace';
  path?: string;
  value?: unknown;
}

export interface ScimPatchInput {
  schemas?: string[];
  Operations: ScimPatchOperation[];
}

@Injectable()
export class ScimService {
  constructor(private readonly auditService: AuditService) {}

  getServiceProviderConfig() {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      documentationUri: 'https://gigalibs.io/docs/scim',
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 100 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        {
          name: 'OAuth Bearer Token',
          description: 'Authentication scheme using the OAuth Bearer Token Standard',
          specUri: 'http://www.rfc-editor.org/info/rfc6750',
          type: 'oauthbearertoken',
          primary: true,
        },
      ],
    };
  }

  getResourceTypes() {
    return [
      {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
        id: 'User',
        name: 'User',
        endpoint: '/Users',
        description: 'User Account',
        schema: 'urn:ietf:params:scim:schemas:core:2.0:User',
      },
      {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
        id: 'Group',
        name: 'Group',
        endpoint: '/Groups',
        description: 'Group / Role Membership',
        schema: 'urn:ietf:params:scim:schemas:core:2.0:Group',
      },
    ];
  }

  getSchemas() {
    return [
      {
        id: 'urn:ietf:params:scim:schemas:core:2.0:User',
        name: 'User',
        description: 'Core SCIM User schema',
      },
      {
        id: 'urn:ietf:params:scim:schemas:core:2.0:Group',
        name: 'Group',
        description: 'Core SCIM Group schema',
      },
    ];
  }

  async listUsers(params: {
    tenantId: string;
    filter?: string | undefined;
    startIndex?: number | undefined;
    count?: number | undefined;
  }) {
    const startIndex = Math.max(1, params.startIndex || 1);
    const count = Math.min(100, Math.max(1, params.count || 20));
    const skip = startIndex - 1;

    let emailFilter: string | undefined;
    if (params.filter) {
      const match = params.filter.match(/userName\s+eq\s+["']([^"']+)["']/i);
      if (match) {
        emailFilter = match[1];
      }
    }

    const whereCondition = {
      memberships: {
        some: { tenantId: params.tenantId },
      },
      ...(emailFilter ? { email: { equals: emailFilter, mode: 'insensitive' as const } } : {}),
    };

    const [totalResults, users] = await Promise.all([
      prisma.user.count({ where: whereCondition }),
      prisma.user.findMany({
        where: whereCondition,
        include: {
          memberships: {
            where: { tenantId: params.tenantId },
          },
        },
        skip,
        take: count,
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const resources = users.map((u) => this.formatScimUser(u, params.tenantId));

    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults,
      startIndex,
      itemsPerPage: count,
      Resources: resources,
    };
  }

  async getUser(id: string, tenantId: string) {
    const user = await prisma.user.findFirst({
      where: {
        id,
        memberships: {
          some: { tenantId },
        },
      },
      include: {
        memberships: {
          where: { tenantId },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`SCIM User '${id}' not found`);
    }

    return this.formatScimUser(user, tenantId);
  }

  async createUser(input: ScimUserCreateInput, tenantId: string, operatorId?: string) {
    const email = input.emails?.[0]?.value || input.userName;
    if (!email) {
      throw new ConflictException('SCIM User requires userName or emails[0].value');
    }

    const displayName =
      input.displayName ||
      (input.name?.givenName && input.name?.familyName
        ? `${input.name.givenName} ${input.name.familyName}`
        : email.split('@')[0]);

    const role = (input.roles?.[0]?.value as MemberRole) || 'MEMBER';
    const status = input.active === false ? 'SUSPENDED' : 'ACTIVE';

    const user = await prisma.$transaction(async (tx) => {
      let existingUser = await tx.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!existingUser) {
        existingUser = await tx.user.create({
          data: {
            email: email.toLowerCase(),
            name: displayName || email.split('@')[0] || 'SCIM User',
            status: status === 'ACTIVE' ? UserStatus.ACTIVE : UserStatus.SUSPENDED,
            metadata: {
              scimExternalId: input.externalId,
              familyName: input.name?.familyName,
              givenName: input.name?.givenName,
              provisionedVia: 'SCIM_2_0',
            },
          },
        });
      }

      // Upsert tenant membership
      const membership = await tx.tenantMember.upsert({
        where: {
          userId_tenantId: {
            userId: existingUser.id,
            tenantId,
          },
        },
        update: {
          role,
          status,
        },
        create: {
          tenantId,
          userId: existingUser.id,
          role,
          status,
        },
      });

      return {
        ...existingUser,
        memberships: [membership],
      };
    });

    await this.auditService.log({
      tenantId,
      action: 'PROVISION',
      resource: 'scim.user',
      resourceId: user.id,
      after: {
        email: user.email,
        externalId: input.externalId,
        role,
        status,
      },
      ...(operatorId ? { userId: operatorId } : {}),
    });

    return this.formatScimUser(user, tenantId);
  }

  async patchUser(id: string, input: ScimPatchInput, tenantId: string, operatorId?: string) {
    const user = await prisma.user.findFirst({
      where: {
        id,
        memberships: { some: { tenantId } },
      },
      include: {
        memberships: { where: { tenantId } },
      },
    });

    if (!user) {
      throw new NotFoundException(`SCIM User '${id}' not found`);
    }

    let activeState: boolean | undefined;
    let newRole: MemberRole | undefined;

    for (const op of input.Operations) {
      if (op.op.toLowerCase() === 'replace' || op.op.toLowerCase() === 'add') {
        if (op.path === 'active' || op.path === undefined && typeof op.value === 'object' && op.value !== null && 'active' in (op.value as Record<string, unknown>)) {
          const val = op.path === 'active' ? op.value : (op.value as Record<string, unknown>).active;
          activeState = val === true || val === 'true';
        }
        if (op.path === 'roles' || (typeof op.value === 'object' && op.value !== null && 'roles' in (op.value as Record<string, unknown>))) {
          const rolesVal = op.path === 'roles' ? op.value : (op.value as Record<string, unknown>).roles;
          if (Array.isArray(rolesVal) && rolesVal[0]?.value) {
            newRole = rolesVal[0].value as MemberRole;
          }
        }
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (activeState !== undefined) {
        await tx.tenantMember.updateMany({
          where: { tenantId, userId: id },
          data: { status: activeState ? 'ACTIVE' : 'SUSPENDED' },
        });
        if (!activeState) {
          // Deprovision: Revoke active sessions
          await tx.session.updateMany({
            where: { userId: id, tenantId },
            data: { status: 'REVOKED' },
          });
        }
      }

      if (newRole !== undefined) {
        await tx.tenantMember.updateMany({
          where: { tenantId, userId: id },
          data: { role: newRole },
        });
      }

      return tx.user.findUnique({
        where: { id },
        include: { memberships: { where: { tenantId } } },
      });
    });

    if (!updated) {
      throw new NotFoundException(`SCIM User '${id}' not found after update`);
    }

    await this.auditService.log({
      tenantId,
      action: activeState === false ? 'STATUS_CHANGE' : 'PERMISSION_CHANGE',
      resource: 'scim.user',
      resourceId: id,
      before: {
        active: user.memberships[0]?.status === 'ACTIVE',
        role: user.memberships[0]?.role,
      },
      after: {
        active: activeState,
        role: newRole,
      },
      ...(operatorId ? { userId: operatorId } : {}),
    });

    return this.formatScimUser(updated, tenantId);
  }

  async deleteUser(id: string, tenantId: string, operatorId?: string) {
    const membership = await prisma.tenantMember.findFirst({
      where: { tenantId, userId: id },
    });

    if (!membership) {
      throw new NotFoundException(`SCIM User '${id}' membership in tenant '${tenantId}' not found`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { userId: id, tenantId },
        data: { status: 'REVOKED' },
      });
      await tx.tenantMember.deleteMany({
        where: { tenantId, userId: id },
      });
    });

    await this.auditService.log({
      tenantId,
      action: 'DELETE',
      resource: 'scim.user',
      resourceId: id,
      ...(operatorId ? { userId: operatorId } : {}),
    });
  }

  async listGroups(tenantId: string) {
    const roles: MemberRole[] = [
      'SUPER_ADMIN',
      'TENANT_ADMIN',
      'MANAGER',
      'MEMBER',
      'VIEWER',
      'GUEST',
    ];

    const memberships = await prisma.tenantMember.findMany({
      where: { tenantId, status: 'ACTIVE' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const groups = roles.map((role) => {
      const members = memberships
        .filter((m) => m.role === role)
        .map((m) => ({
          value: m.user.id,
          $ref: `/api/v1/scim/v2/Users/${m.user.id}`,
          display: m.user.name || m.user.email,
        }));

      return {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        id: `role-${role.toLowerCase()}`,
        displayName: role,
        members,
        meta: {
          resourceType: 'Group',
          location: `/api/v1/scim/v2/Groups/role-${role.toLowerCase()}`,
        },
      };
    });

    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: groups.length,
      startIndex: 1,
      itemsPerPage: groups.length,
      Resources: groups,
    };
  }

  private formatScimUser(
    user: {
      id: string;
      email: string;
      name: string | null;
      metadata: unknown;
      createdAt: Date;
      updatedAt: Date;
      memberships: Array<{ role: MemberRole; status: string }>;
    },
    _tenantId?: string,
  ) {
    const membership = user.memberships[0];
    const metaObj = (user.metadata as Record<string, unknown>) || {};
    const isActive = membership?.status === 'ACTIVE';

    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: user.id,
      externalId: (metaObj.scimExternalId as string) || undefined,
      userName: user.email,
      name: {
        formatted: user.name || user.email,
        familyName: (metaObj.familyName as string) || '',
        givenName: (metaObj.givenName as string) || user.name || '',
      },
      displayName: user.name || user.email,
      emails: [
        {
          value: user.email,
          type: 'work',
          primary: true,
        },
      ],
      active: isActive,
      roles: membership
        ? [
            {
              value: membership.role,
              primary: true,
            },
          ]
        : [],
      meta: {
        resourceType: 'User',
        created: user.createdAt.toISOString(),
        lastModified: user.updatedAt.toISOString(),
        location: `/api/v1/scim/v2/Users/${user.id}`,
      },
    };
  }
}
