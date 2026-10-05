import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma, type MemberRole, type Prisma, UserStatus } from '@gigalibs/db';
import { AuditService } from '@gigalibs/audit-nest';
import { isTenantPermissionCode, TenantMemberRoleSchema } from '@gigalibs/contracts';
import { PermissionEvaluator } from '@gigalibs/rbac-core';
import { resolveBaseRolePermissions } from '@gigalibs/rbac-nest';
import { assertTenantAdministratorRetained } from '@gigalibs/tenancy-nest';
import { parseScim, scimMembershipChanges, ScimPatchSchema, ScimUserCreateSchema } from './scim.validation.js';
export type { ScimPatchInput, ScimUserCreateInput } from './scim.validation.js';

@Injectable()
export class ScimService {
  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

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
    this.requireScope(params.tenantId);
    const startIndex = Math.max(1, params.startIndex || 1);
    const count = Math.min(100, Math.max(1, params.count || 20));
    const skip = startIndex - 1;

    let emailFilter: string | undefined;
    if (params.filter) {
      const match = params.filter.match(/^userName\s+eq\s+"([^"\r\n]{1,254})"$/i);
      if (!match) throw new BadRequestException('Only userName eq "email" is supported as a SCIM filter.');
      emailFilter = match[1];
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
    this.requireScope(tenantId);
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

  async createUser(body: unknown, tenantId: string, operatorId: string) {
    const input = parseScim(ScimUserCreateSchema, body);
    const email = input.userName;

    const displayName =
      input.displayName ||
      (input.name?.givenName && input.name?.familyName
        ? `${input.name.givenName} ${input.name.familyName}`
        : email.split('@')[0]);

    const role = input.roles?.[0]?.value ?? 'MEMBER';
    const status = input.active === false ? 'SUSPENDED' : 'ACTIVE';

    const user = await this.mutate(tenantId, operatorId, 'users:create', async (tx) => {
      let existingUser = await tx.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (existingUser) {
        const existingMembership = await tx.tenantMember.findUnique({
          where: { userId_tenantId: { userId: existingUser.id, tenantId } },
        });
        // A create permission must never become an implicit update/elevation path.
        if (existingMembership) throw new ConflictException('SCIM user already exists in this tenant; use PATCH with update permission.');
        if (input.externalId) throw new ConflictException('Tenant-scoped externalId mapping for an existing identity is not supported.');
      }
      if (!existingUser) {
        existingUser = await tx.user.create({
          data: {
            email: email.toLowerCase(),
            name: displayName || email.split('@')[0] || 'SCIM User',
            // SCIM active controls this tenant membership, not the global identity.
            status: UserStatus.ACTIVE,
            metadata: {
              scimExternalId: input.externalId,
              scimTenantId: tenantId,
              familyName: input.name?.familyName,
              givenName: input.name?.givenName,
              provisionedVia: 'SCIM_2_0',
            },
          },
        });
      }

      const membership = await tx.tenantMember.create({
        data: {
          tenantId,
          userId: existingUser.id,
          role,
          status,
        },
      });

      await this.auditService.log({
        tx, tenantId, userId: operatorId, chainScope: 'scim', action: 'PROVISION',
        resource: 'scim.user', resourceId: existingUser.id, after: { role, status },
      });

      return {
        ...existingUser,
        memberships: [membership],
      };
    });

    return this.formatScimUser(user, tenantId);
  }

  async patchUser(id: string, body: unknown, tenantId: string, operatorId: string) {
    // Validate the complete batch before applying any operation.
    const changes = scimMembershipChanges(parseScim(ScimPatchSchema, body));
    const updated = await this.mutate(tenantId, operatorId, 'users:update', async (tx) => {
      const member = await tx.tenantMember.findUnique({ where: { userId_tenantId: { userId: id, tenantId } } });
      if (!member) throw new NotFoundException('SCIM user was not found');
      const next = { role: changes.role ?? member.role, status: changes.active === undefined ? member.status : changes.active ? 'ACTIVE' as const : 'SUSPENDED' as const };
      await assertTenantAdministratorRetained(tx, tenantId, member, next);
      if (next.role !== member.role || next.status !== member.status) {
        await tx.tenantMember.update({ where: { id: member.id }, data: next });
        await this.revokeSessions(tx, tenantId, id);
        await this.auditService.log({
          tx, tenantId, userId: operatorId, chainScope: 'scim', action: 'PERMISSION_CHANGE',
          resource: 'scim.user', resourceId: id,
          before: { role: member.role, status: member.status }, after: next,
        });
      }
      return tx.user.findUniqueOrThrow({ where: { id }, include: { memberships: { where: { tenantId } } } });
    });
    return this.formatScimUser(updated, tenantId);
  }

  async deleteUser(id: string, tenantId: string, operatorId: string) {
    await this.mutate(tenantId, operatorId, 'users:delete', async (tx) => {
      const member = await tx.tenantMember.findUnique({ where: { userId_tenantId: { userId: id, tenantId } } });
      if (!member) throw new NotFoundException('SCIM user was not found');
      await assertTenantAdministratorRetained(tx, tenantId, member, null);
      await this.revokeSessions(tx, tenantId, id);
      await tx.tenantMember.delete({ where: { id: member.id } });
      await this.auditService.log({
        tx, tenantId, userId: operatorId, chainScope: 'scim', action: 'DELETE',
        resource: 'scim.user', resourceId: id, before: { role: member.role, status: member.status },
      });
    });
  }

  async listGroups(tenantId: string) {
    this.requireScope(tenantId);
    const roles = TenantMemberRoleSchema.options;

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
      memberships: Array<{ role: MemberRole; status: string; updatedAt?: Date }>;
    },
    tenantId: string,
  ) {
    const membership = user.memberships[0];
    const metaObj = (user.metadata as Record<string, unknown>) || {};
    const isActive = membership?.status === 'ACTIVE';

    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: user.id,
      externalId: metaObj.scimTenantId === tenantId ? metaObj.scimExternalId : undefined,
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
        lastModified: (membership?.updatedAt ?? user.updatedAt).toISOString(),
        location: `/api/v1/scim/v2/Users/${user.id}`,
      },
    };
  }

  private requireScope(tenantId: string) {
    if (!tenantId) throw new ForbiddenException('A verified tenant is required for SCIM.');
  }

  private revokeSessions(tx: Prisma.TransactionClient, tenantId: string, userId: string) {
    return tx.session.updateMany({
      where: { userId, tenantId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() },
    });
  }

  private async mutate<T>(tenantId: string, actorId: string, permission: string, effect: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    this.requireScope(tenantId);
    if (!actorId) throw new ForbiddenException('A verified actor is required for SCIM.');
    try {
      return await prisma.$transaction(async (tx) => {
        // Same lock as tenant administration: last-admin checks and changes serialize across both entry points.
        await tx.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
        // Recheck authority after acquiring the lock; another administrator may have revoked the actor meanwhile.
        const actor = await tx.tenantMember.findUnique({
          where: { userId_tenantId: { userId: actorId, tenantId } },
          include: { user: { select: { status: true } }, customRole: { select: { permissions: true } } },
        });
        if (!actor || actor.status !== 'ACTIVE' || actor.user.status !== 'ACTIVE') throw new ForbiddenException('SCIM actor membership is inactive.');
        const custom = Array.isArray(actor.customRole?.permissions) ? actor.customRole.permissions.filter(isTenantPermissionCode) : [];
        const permissions = [...resolveBaseRolePermissions([actor.role]), ...actor.permissions, ...custom];
        if (!PermissionEvaluator.hasAllPermissions(permissions, [permission], { tenantId, userId: actorId })) throw new ForbiddenException('Insufficient SCIM permission.');
        return effect(tx);
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (code === 'P2034' || code === 'P2002') throw new ConflictException('SCIM membership changed concurrently; reload before retrying.');
      throw error;
    }
  }
}
