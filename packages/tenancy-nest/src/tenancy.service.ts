import { createHash, randomBytes } from 'node:crypto';
import type {
  AcceptTenantInviteDto,
  AssignMemberRoleDto,
  BulkDelegatedInviteDto,
  BulkDelegatedGrantDto,
  BulkInviteIdsDto,
  BulkOffboardMembersDto,
  RevokeMemberRoleDto,
  ChangeTenantStatusDto,
  CreateCustomRoleDto,
  CreateDepartmentDto,
  CreateTenantDomainChallengeDto,
  CreateTenantDto,
  CreateTenantInviteDto,
  TenantInvitePreviewV1,
  UpdateCustomRoleDto,
  UpdateDepartmentDto,
  UpdateTenantMemberDto,
  UpdateTenantOrganizationSettingsDto,
} from '@gigalibs/contracts';
import {
  CONTROL_PLANE_PERMISSIONS,
  DUTY_CONFLICT_SETS,
  delegationBounds,
  dutyConflicts,
  holdsPermission,
  MAX_MEMBER_ROLE_ASSIGNMENTS,
  type ModuleDefaultRole,
  moduleDefaultRoles,
  uncataloguedAdditions,
  validateBulkPeopleAdd,
  validateBulkPeopleGrant,
  inviteStatus,
  type DirectoryGroupMapping,
  type HeldDirectoryAssignment,
  type SetDirectoryGroupMappingDto,
  type SyncMemberGroupsDto,
  planDirectoryReconcile,
  resolveGroupRoleGrants,
} from '@gigalibs/contracts';
import { primaryVersionInForce } from '@gigalibs/auth-nest';
import { type Prisma, prisma } from '@gigalibs/db';
import { recordEntitlementsChanged } from './entitlement-events.js';
import { PlatformSettingsEngine } from '@gigalibs/platform-settings';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  domainVerificationDigest,
  domainVerificationRecordName,
  normalizeTenantDomain,
  resolveDomainVerification,
} from './domain-verification.js';
import { tenantSubdomain, trialModuleKeys } from './platform-module-catalog.js';
import {
  assertBaseRoleWithinOwn,
  assertGrantWithinOwn,
  assertNotOwnAccess,
  assertReactivationWithinOwn,
  isWorkspaceAdministrator,
  ownAuthority,
} from './grant-bound.js';
import { memberRoleGrants } from '@gigalibs/rbac-nest';
import { assertInclusionsValid, expandRole, loadRoleGraph, rolesIncluding, withRole } from './role-graph.js';
import { authorizeDelegatedPeopleAdd, invitedRoleAssignments, loadPeopleAdminScope } from './people-admin.js';
import { assertNoDutyConflict, assertScopeEnforced, assertScopesConsistent, resolveRoleScope } from './role-scopes.js';
import { assertTenantAdminAuthority, assertTenantAdministratorRetained } from './tenant-member-safety.js';

@Injectable()
export class TenancyService {
  private readonly logger = new Logger(TenancyService.name);
  async createTenant(dto: CreateTenantDto, ownerUserId: string) {
    const [existing, activeTrial] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: dto.slug }, select: { id: true } }),
      prisma.tenantMember.findFirst({
        where: {
          userId: ownerUserId,
          status: 'ACTIVE',
          role: { in: ['SUPER_ADMIN', 'TENANT_ADMIN'] },
          tenant: { status: 'TRIAL', trialEndsAt: { gt: new Date() } },
        },
        select: { tenant: { select: { id: true, name: true } } },
      }),
    ]);

    if (existing) {
      throw new BadRequestException(`Tenant with slug '${dto.slug}' already exists`);
    }

    if (activeTrial) {
      throw new ConflictException(
        `This account already owns an active trial workspace: ${activeTrial.tenant.name}`,
      );
    }

    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
    const hostname = tenantSubdomain(dto.slug);

    return prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          plan: 'TRIAL',
          status: 'TRIAL',
          trialEndsAt,
          provisionedAt: new Date(),
          features: trialModuleKeys,
          isolationMode: dto.isolationMode,
          region: dto.region,
        },
        select: publicTenantSelection,
      });

      await tx.tenantMember.create({
        data: {
          tenantId: tenant.id,
          userId: ownerUserId,
          role: 'TENANT_ADMIN',
          status: 'ACTIVE',
        },
      });

      const defaults = PlatformSettingsEngine.createDefaults(tenant.id);
      await tx.tenantSettings.create({
        data: {
          tenantId: tenant.id,
          version: defaults.version,
          branding: defaults.branding as Prisma.InputJsonValue,
          security: defaults.security as Prisma.InputJsonValue,
          localization: defaults.localization as Prisma.InputJsonValue,
          features: defaults.features as Prisma.InputJsonValue,
          metadata: defaults.metadata as Prisma.InputJsonValue,
          updatedById: ownerUserId,
        },
      });

      await tx.tenantModuleEntitlement.createMany({
        data: trialModuleKeys.map((moduleKey) => ({
          tenantId: tenant.id,
          moduleKey,
          status: 'ENABLED',
          source: 'TRIAL',
          endsAt: trialEndsAt,
          reason: 'Self-service seven-day trial',
          updatedById: ownerUserId,
        })),
      });
      // The trial modules' windows are activated from this event, as for any later change of modules (WI-OI-120f).
      await recordEntitlementsChanged(tx, tenant.id, trialModuleKeys);

      await tx.tenantIsolationBinding.create({
        data: {
          tenantId: tenant.id,
          requestedMode: dto.isolationMode,
          status: 'REQUESTED',
          region: dto.region,
          requestedById: ownerUserId,
          reason: 'Self-service seven-day trial',
        },
      });

      if (hostname) {
        await tx.tenantSubdomainBinding.create({
          data: {
            tenantId: tenant.id,
            hostname,
            status: 'RESERVED',
            requestedById: ownerUserId,
            reason: 'Self-service seven-day trial',
          },
        });
      }

      await tx.auditLog.create({
        data: {
          action: 'PROVISION',
          resource: 'tenant',
          resourceId: tenant.id,
          userId: ownerUserId,
          tenantId: tenant.id,
          after: {
            name: tenant.name,
            slug: tenant.slug,
            status: tenant.status,
            trialEndsAt,
            moduleKeys: trialModuleKeys,
            isolationMode: tenant.isolationMode,
            region: tenant.region,
            subdomain: hostname,
          },
          metadata: {
            provisioningState: 'CONTROL_PLANE_READY',
            isolationState: 'REQUESTED',
            subdomainState: hostname ? 'RESERVED' : 'BASE_DOMAIN_NOT_CONFIGURED',
          },
        },
      });

      return tenant;
    });
  }

  async listForUser(userId: string) {
    const memberships = await prisma.tenantMember.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { tenant: { select: publicTenantSelection } },
      orderBy: { joinedAt: 'desc' },
    });
    return memberships.map((membership) => ({
      ...membership.tenant,
      membershipRole: membership.role,
    }));
  }

  async getTenantById(tenantId: string) {
    return prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        ...publicTenantSelection,
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true },
            },
          },
        },
      },
    });
  }

  async getTenantForUser(tenantId: string, userId: string) {
    const membership = await prisma.tenantMember.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      include: { tenant: { select: publicTenantSelection } },
    });
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException('You are not an active member of this tenant.');
    }
    return { ...membership.tenant, membershipRole: membership.role };
  }

  async changeStatus(tenantId: string, userId: string, dto: ChangeTenantStatusDto) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      const tenant = await transaction.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundException(`Tenant '${tenantId}' was not found.`);

      const updated = await transaction.tenant.update({
        where: { id: tenantId },
        data: {
          status: dto.status,
          provisionedAt:
            dto.status === 'ACTIVE' && !tenant.provisionedAt ? new Date() : tenant.provisionedAt,
        },
        select: publicTenantSelection,
      });

      await transaction.auditLog.create({
        data: {
          action: 'STATUS_CHANGE',
          resource: 'tenant',
          resourceId: tenantId,
          userId,
          tenantId,
          before: { status: tenant.status },
          after: { status: updated.status },
          ...(dto.reason !== undefined ? { metadata: { reason: dto.reason } } : {}),
        },
      });
      return updated;
    });
  }

  async getDomainStatus(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: domainStatusSelection,
    });
    if (!tenant) throw new NotFoundException(`Tenant '${tenantId}' was not found.`);
    return presentDomainStatus(tenant);
  }

  async createDomainChallenge(
    tenantId: string,
    userId: string,
    dto: CreateTenantDomainChallengeDto,
  ) {
    let domain: string;
    try {
      domain = normalizeTenantDomain(dto.domain);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid domain');
    }
    const verificationValue = `gigalibs-domain-verification=${randomBytes(32).toString('base64url')}`;
    const digest = domainVerificationDigest(verificationValue);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);

    const updated = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      const tenant = await transaction.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundException(`Tenant '${tenantId}' was not found.`);
      const next = await transaction.tenant.update({
        where: { id: tenantId },
        data: {
          customDomainChallengeDomain: domain,
          customDomainVerificationDigest: digest,
          customDomainChallengeExpiresAt: expiresAt,
          customDomainVerificationAttempts: 0,
          customDomainVerificationLockedUntil: null,
        },
        select: domainStatusSelection,
      });
      await transaction.auditLog.create({
        data: {
          action: 'UPDATE',
          resource: 'tenant_domain',
          resourceId: tenantId,
          userId,
          tenantId,
          before: {
            activeDomain: tenant.customDomain,
            pendingDomain: tenant.customDomainChallengeDomain,
          },
          after: { domain, challengeExpiresAt: expiresAt },
          metadata: { reason: dto.reason, verificationMethod: 'DNS_TXT' },
        },
      });
      return next;
    });

    return { ...presentDomainStatus(updated), verificationValue };
  }

  async verifyDomain(tenantId: string, userId: string, reason: string) {
    const now = new Date();
    const challenge = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { ...domainStatusSelection, customDomainVerificationDigest: true },
    });
    if (!challenge) throw new NotFoundException(`Tenant '${tenantId}' was not found.`);
    if (!challenge.customDomainChallengeDomain || !challenge.customDomainVerificationDigest) {
      throw new ConflictException('Create a domain verification challenge first');
    }
    if (
      !challenge.customDomainChallengeExpiresAt ||
      challenge.customDomainChallengeExpiresAt <= now
    ) {
      throw new ConflictException('The domain verification challenge has expired');
    }
    if (
      challenge.customDomainVerificationLockedUntil &&
      challenge.customDomainVerificationLockedUntil > now
    ) {
      throw new HttpException(
        'Domain verification is temporarily locked',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let matched: boolean;
    try {
      matched = await resolveDomainVerification(
        domainVerificationRecordName(challenge.customDomainChallengeDomain),
        challenge.customDomainVerificationDigest,
      );
    } catch {
      throw new ServiceUnavailableException({
        code: 'DNS_VERIFICATION_UNAVAILABLE',
        message: 'The DNS result could not be obtained. Retry later.',
      });
    }

    const outcome = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      const current = await transaction.tenant.findUnique({ where: { id: tenantId } });
      if (!current) throw new NotFoundException(`Tenant '${tenantId}' was not found.`);
      if (
        current.customDomainChallengeDomain !== challenge.customDomainChallengeDomain ||
        current.customDomainVerificationDigest !== challenge.customDomainVerificationDigest
      ) {
        throw new ConflictException('The domain challenge changed; reload before retrying');
      }
      if (
        current.customDomainVerificationLockedUntil &&
        current.customDomainVerificationLockedUntil > new Date()
      ) {
        throw new HttpException(
          'Domain verification is temporarily locked',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (
        !current.customDomainChallengeExpiresAt ||
        current.customDomainChallengeExpiresAt <= new Date()
      ) {
        throw new ConflictException('The domain verification challenge has expired');
      }

      if (!matched) {
        const attempts = current.customDomainVerificationAttempts + 1;
        const lockedUntil = attempts >= 10 ? new Date(Date.now() + 15 * 60 * 1_000) : null;
        const failed = await transaction.tenant.update({
          where: { id: tenantId },
          data: {
            customDomainVerificationAttempts: attempts >= 10 ? 0 : attempts,
            customDomainVerificationLockedUntil: lockedUntil,
          },
          select: domainStatusSelection,
        });
        await transaction.auditLog.create({
          data: {
            action: 'STATUS_CHANGE',
            resource: 'tenant_domain',
            resourceId: tenantId,
            userId,
            tenantId,
            before: { verified: false },
            after: { verified: false, attemptMatched: false, lockedUntil },
            metadata: { reason, verificationMethod: 'DNS_TXT' },
          },
        });
        return { matched: false as const, status: presentDomainStatus(failed) };
      }

      const verifiedAt = new Date();
      let verified: DomainStatusRecord;
      try {
        verified = await transaction.tenant.update({
          where: { id: tenantId },
          data: {
            customDomain: current.customDomainChallengeDomain,
            customDomainVerifiedAt: verifiedAt,
            customDomainChallengeDomain: null,
            customDomainVerificationDigest: null,
            customDomainChallengeExpiresAt: null,
            customDomainVerificationAttempts: 0,
            customDomainVerificationLockedUntil: null,
          },
          select: domainStatusSelection,
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ConflictException('This domain is already verified by another tenant');
        }
        throw error;
      }
      await transaction.auditLog.create({
        data: {
          action: 'STATUS_CHANGE',
          resource: 'tenant_domain',
          resourceId: tenantId,
          userId,
          tenantId,
          before: { verified: false },
          after: { verified: true, verifiedAt },
          metadata: { reason, verificationMethod: 'DNS_TXT' },
        },
      });
      return { matched: true as const, status: presentDomainStatus(verified) };
    });

    if (!outcome.matched) {
      throw new ConflictException({
        code: 'DOMAIN_VERIFICATION_MISMATCH',
        message: 'The required DNS TXT value was not observed.',
        ...outcome.status,
      });
    }
    return outcome.status;
  }

  async revokeDomain(tenantId: string, userId: string, reason: string) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      const tenant = await transaction.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundException(`Tenant '${tenantId}' was not found.`);
      if (!tenant.customDomain && !tenant.customDomainChallengeDomain) {
        throw new ConflictException('No tenant domain is configured');
      }
      await transaction.tenant.update({
        where: { id: tenantId },
        data: {
          customDomain: null,
          customDomainChallengeDomain: null,
          customDomainVerificationDigest: null,
          customDomainChallengeExpiresAt: null,
          customDomainVerifiedAt: null,
          customDomainVerificationAttempts: 0,
          customDomainVerificationLockedUntil: null,
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'DELETE',
          resource: 'tenant_domain',
          resourceId: tenantId,
          userId,
          tenantId,
          before: {
            activeDomain: tenant.customDomain,
            pendingDomain: tenant.customDomainChallengeDomain,
            verifiedAt: tenant.customDomainVerifiedAt,
          },
          metadata: { reason },
        },
      });
      return { domain: null, recordName: null, status: 'NOT_CONFIGURED' as const };
    });
  }

  async listMembers(tenantId: string) {
    return prisma.tenantMember.findMany({
      where: { tenantId },
      orderBy: [{ status: 'asc' }, { joinedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        role: true,
        status: true,
        permissions: true,
        joinedAt: true,
        updatedAt: true,
        departmentId: true,
        employmentType: true,
        spatialScopePlaceIds: true,
        department: {
          select: { id: true, name: true, code: true },
        },
        user: {
          select: { id: true, email: true, name: true, avatarUrl: true, status: true },
        },
        customRole: {
          select: { id: true, name: true, color: true, permissions: true },
        },
        // WI-OI-120w (R2 slice 2a): the roles the member holds, oldest first. Who granted each and why stay in the audit
        // log: every member may read this list (Security review of 2a, L3).
        roleAssignments: {
          where: { revokedAt: null },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            customRoleId: true,
            scope: true,
            unitIds: true,
            placeIds: true,
            createdAt: true,
            customRole: { select: { name: true, color: true } },
          },
        },
      },
    });
  }

  /**
   * WI-OI-120w (R2 slice 2a, ADR-0034): gives a member one more role, held at their own scope. A role of another
   * workspace, a role already held, and a role given to oneself by anyone but a Tenant Admin are refused. The reason is
   * kept on the assignment and in the audit log; the member's next request has the role.
   */
  async assignMemberRole(tenantId: string, memberId: string, actorId: string, dto: AssignMemberRoleDto) {
    const reason = requireReason(dto.reason);
    return roleChangeConflicts(() => prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
        const member = await this.memberForRoleChange(transaction, tenantId, memberId, actorId);
        const role = await transaction.customRole.findFirst({ where: { id: dto.customRoleId, tenantId }, select: { id: true, name: true, permissions: true } });
        if (!role) throw new BadRequestException({ code: 'ROLE_NOT_IN_WORKSPACE', message: 'That role does not belong to this workspace.' });
        // WI-OI-120w (R2 slice 2c): giving a role gives everything it includes too.
        const rolePermissions = expandRole(await loadRoleGraph(transaction, tenantId), role.id);
        await assertGrantWithinOwn(transaction, tenantId, actorId, rolePermissions);
        // WI-OI-120w (R2 slice 2b): a role at an explicit scope is given by a Tenant Admin, at a valid scope, and never so
        // that a module still reading one scope would receive this person's access from two.
        const requested = dto.scope ?? { kind: 'MEMBER' as const };
        if (requested.kind !== 'MEMBER' && !(await ownAuthority(transaction, tenantId, actorId)).administrator)
          throw new ForbiddenException({ code: 'ROLE_SCOPE_ADMIN_ONLY', message: 'Only a workspace administrator gives a role for a chosen scope.' });
        const scope = await resolveRoleScope(transaction, tenantId, requested, rolePermissions);
        // One live assignment per role: to change where it applies, take it away and give it again.
        const held = await transaction.memberRoleAssignment.findFirst({
          where: { tenantId, userId: member.userId, customRoleId: role.id, revokedAt: null },
          select: { id: true },
        });
        if (held) throw new ConflictException({ code: 'ROLE_ALREADY_HELD', message: `${role.name} is already held by this member.` });
        await assertScopesConsistent(transaction, tenantId, member.userId, { add: { permissions: rolePermissions, scope } });
        // WI-OI-120hp (R3): refuse a grant that leaves the member holding both sides of a separated duty, unless accepted.
        await assertNoDutyConflict(transaction, tenantId, member.userId, rolePermissions);
        // WI-OI-120w (R2 slice 3): every role travels in the member's signed context, which stays small.
        if ((await transaction.memberRoleAssignment.count({ where: { tenantId, userId: member.userId, revokedAt: null } })) >= MAX_MEMBER_ROLE_ASSIGNMENTS)
          throw new ConflictException({
            code: 'ROLE_LIMIT',
            message: `A member holds at most ${MAX_MEMBER_ROLE_ASSIGNMENTS} roles; take one away before adding another.`,
          });
        const assignment = await transaction.memberRoleAssignment.create({
          data: {
            tenantId,
            userId: member.userId,
            customRoleId: role.id,
            scope: scope.scope,
            unitIds: scope.unitIds,
            placeIds: scope.placeIds,
            reason,
            grantedById: actorId,
          },
          select: { id: true, customRoleId: true, scope: true, unitIds: true, placeIds: true, reason: true, grantedById: true, createdAt: true },
        });
        await this.followOldestRole(transaction, tenantId, member, actorId, reason);
        await transaction.auditLog.create({
          data: {
            action: 'PERMISSION_CHANGE',
            resource: 'member_role_assignment',
            resourceId: assignment.id,
            userId: actorId,
            tenantId,
            after: { memberId: member.id, customRoleId: role.id, roleName: role.name, scope: scope.scope, unitIds: scope.unitIds, placeIds: scope.placeIds },
            metadata: { reason },
          },
        });
        return { ...assignment, roleName: role.name, createdAt: assignment.createdAt.toISOString() };
      },
      { isolationLevel: 'Serializable' },
    ));
  }

  /** WI-OI-120w (R2 slice 2a): takes one role away from a member; their other roles stay. The history is kept. */
  async revokeMemberRole(tenantId: string, memberId: string, assignmentId: string, actorId: string, dto: RevokeMemberRoleDto) {
    const reason = requireReason(dto.reason);
    return roleChangeConflicts(() => prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
        const member = await this.memberForRoleChange(transaction, tenantId, memberId, actorId);
        const assignment = await transaction.memberRoleAssignment.findFirst({
          where: { id: assignmentId, tenantId, userId: member.userId, revokedAt: null },
          select: { id: true, customRoleId: true, scope: true, customRole: { select: { name: true } } },
        });
        if (!assignment) throw new NotFoundException({ code: 'ROLE_ASSIGNMENT_NOT_FOUND', message: 'This member does not hold that role.' });
        await transaction.memberRoleAssignment.update({
          where: { id: assignment.id },
          data: { revokedAt: new Date(), revokedById: actorId, revokeReason: reason },
        });
        await this.followOldestRole(transaction, tenantId, member, actorId, reason);
        await transaction.auditLog.create({
          data: {
            action: 'PERMISSION_CHANGE',
            resource: 'member_role_assignment',
            resourceId: assignment.id,
            userId: actorId,
            tenantId,
            before: { memberId: member.id, customRoleId: assignment.customRoleId, roleName: assignment.customRole.name, scope: assignment.scope },
            metadata: { reason },
          },
        });
        return { id: assignment.id, revoked: true };
      },
      { isolationLevel: 'Serializable' },
    ));
  }

  /**
   * The member whose roles change. Giving oneself a role is refused unless the actor is a Tenant Admin, and only a
   * Tenant Admin changes a Tenant Admin's roles (WI-OI-120v; Security review of 2a, M1).
   */
  // WI-OI-120hp (R3): an administrator records that a member may hold both sides of a named duty-conflict set (a
  // compensating control). A live acceptance lets assertNoDutyConflict pass for that set; revoking it re-blocks.
  async acceptDutyConflict(tenantId: string, memberId: string, actorId: string, dto: { conflictSetId: string; reason: string }) {
    const reason = requireReason(dto.reason);
    if (!DUTY_CONFLICT_SETS.some((set) => set.id === dto.conflictSetId))
      throw new BadRequestException({ code: 'DUTY_CONFLICT_UNKNOWN', message: 'That duty-conflict set does not exist.' });
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      const member = await this.memberForRoleChange(transaction, tenantId, memberId, actorId);
      const held = await transaction.dutyConflictAcceptance.findFirst({
        where: { tenantId, userId: member.userId, conflictSetId: dto.conflictSetId, revokedAt: null },
        select: { id: true },
      });
      if (held) throw new ConflictException({ code: 'DUTY_CONFLICT_ALREADY_ACCEPTED', message: 'That conflict is already accepted for this member.' });
      const acceptance = await transaction.dutyConflictAcceptance.create({
        data: { tenantId, userId: member.userId, conflictSetId: dto.conflictSetId, reason, acceptedById: actorId },
        select: { id: true, conflictSetId: true, createdAt: true },
      });
      await transaction.auditLog.create({
        data: {
          action: 'PERMISSION_CHANGE',
          resource: 'duty_conflict_acceptance',
          resourceId: acceptance.id,
          userId: actorId,
          tenantId,
          after: { memberId: member.id, conflictSetId: dto.conflictSetId },
          metadata: { reason },
        },
      });
      return { ...acceptance, createdAt: acceptance.createdAt.toISOString() };
    });
  }

  async revokeDutyConflictAcceptance(tenantId: string, memberId: string, acceptanceId: string, actorId: string, dto: { reason: string }) {
    const reason = requireReason(dto.reason);
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      const member = await this.memberForRoleChange(transaction, tenantId, memberId, actorId);
      const updated = await transaction.dutyConflictAcceptance.updateMany({
        where: { id: acceptanceId, tenantId, userId: member.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedById: actorId, revokeReason: reason },
      });
      if (updated.count === 0) throw new NotFoundException('Acceptance was not found or is already revoked.');
      await transaction.auditLog.create({
        data: { action: 'PERMISSION_CHANGE', resource: 'duty_conflict_acceptance', resourceId: acceptanceId, userId: actorId, tenantId, metadata: { reason, revoked: true } },
      });
      return { id: acceptanceId, revoked: true };
    });
  }

  // WI-OI-120hq (R4): a role-holder delegates a role they hold to another member for a bounded time. v1 delegates at
  // workspace scope (the delegator must hold the role's permissions at their own/workspace scope via
  // assertGrantWithinOwn); unit/place-scoped delegation is a later refinement. The delegation rides the signed context
  // as an ordinary assignment, live only within [effectiveFrom, effectiveTo); revoking it (or its lapse) stops it
  // being minted. Immediate revocation across live sessions (auth_version bump) is a later refinement.
  async delegateRole(
    tenantId: string,
    delegatorUserId: string,
    dto: { toMemberId: string; customRoleId: string; effectiveFrom: string; effectiveTo: string; reason: string },
  ) {
    const reason = requireReason(dto.reason);
    const bounds = delegationBounds(dto.effectiveFrom, dto.effectiveTo, new Date(), 90);
    if (!bounds.ok) throw new BadRequestException({ code: bounds.code, message: bounds.message });
    return roleChangeConflicts(() =>
      prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
        const delegate = await transaction.tenantMember.findFirst({ where: { id: dto.toMemberId, tenantId }, select: { id: true, userId: true, status: true } });
        if (!delegate || delegate.status !== 'ACTIVE') throw new NotFoundException('Tenant member was not found');
        if (delegate.userId === delegatorUserId) throw new BadRequestException({ code: 'DELEGATION_TO_SELF', message: 'You cannot delegate a role to yourself.' });
        const role = await transaction.customRole.findFirst({ where: { id: dto.customRoleId, tenantId }, select: { id: true, name: true } });
        if (!role) throw new BadRequestException({ code: 'ROLE_NOT_IN_WORKSPACE', message: 'That role does not belong to this workspace.' });
        const rolePermissions = expandRole(await loadRoleGraph(transaction, tenantId), role.id);
        // The delegator may delegate only permissions they themselves hold at their own or the workspace scope.
        await assertGrantWithinOwn(transaction, tenantId, delegatorUserId, rolePermissions);
        // The delegation must not leave the delegate holding both sides of a separated duty (R3).
        await assertNoDutyConflict(transaction, tenantId, delegate.userId, rolePermissions);
        const held = await transaction.memberRoleAssignment.findFirst({ where: { tenantId, userId: delegate.userId, customRoleId: role.id, revokedAt: null }, select: { id: true } });
        if (held) throw new ConflictException({ code: 'ROLE_ALREADY_HELD', message: `${role.name} is already held by this member.` });
        if ((await transaction.memberRoleAssignment.count({ where: { tenantId, userId: delegate.userId, revokedAt: null } })) >= MAX_MEMBER_ROLE_ASSIGNMENTS)
          throw new ConflictException({ code: 'ROLE_LIMIT', message: `A member holds at most ${MAX_MEMBER_ROLE_ASSIGNMENTS} roles; take one away before adding another.` });
        const assignment = await transaction.memberRoleAssignment.create({
          data: {
            tenantId,
            userId: delegate.userId,
            customRoleId: role.id,
            scope: 'WORKSPACE',
            reason,
            grantedById: delegatorUserId,
            delegatedById: delegatorUserId,
            effectiveFrom: new Date(dto.effectiveFrom),
            effectiveTo: new Date(dto.effectiveTo),
          },
          select: { id: true, createdAt: true },
        });
        await transaction.auditLog.create({
          data: {
            action: 'PERMISSION_CHANGE',
            resource: 'role_delegation',
            resourceId: assignment.id,
            userId: delegatorUserId,
            tenantId,
            after: { memberId: delegate.id, customRoleId: role.id, roleName: role.name, effectiveFrom: dto.effectiveFrom, effectiveTo: dto.effectiveTo },
            metadata: { reason },
          },
        });
        return { id: assignment.id, roleName: role.name, effectiveFrom: dto.effectiveFrom, effectiveTo: dto.effectiveTo };
      }),
    );
  }

  async revokeDelegation(tenantId: string, delegationId: string, actorUserId: string, dto: { reason: string }) {
    const reason = requireReason(dto.reason);
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      const delegation = await transaction.memberRoleAssignment.findFirst({
        where: { id: delegationId, tenantId, revokedAt: null, NOT: { delegatedById: null } },
        select: { id: true, delegatedById: true },
      });
      if (!delegation) throw new NotFoundException('Delegation was not found or is already revoked.');
      if (delegation.delegatedById !== actorUserId && !(await ownAuthority(transaction, tenantId, actorUserId)).administrator)
        throw new ForbiddenException({ code: 'DELEGATION_REVOKE_FORBIDDEN', message: 'Only the person who delegated it, or an administrator, can revoke it.' });
      await transaction.memberRoleAssignment.update({ where: { id: delegationId }, data: { revokedAt: new Date(), revokedById: actorUserId, revokeReason: reason } });
      await transaction.auditLog.create({
        data: { action: 'PERMISSION_CHANGE', resource: 'role_delegation', resourceId: delegationId, userId: actorUserId, tenantId, metadata: { reason, revoked: true } },
      });
      return { id: delegationId, revoked: true };
    });
  }

  // WI-OI-120p slice 4 (R13): a delegated head invites a person into one of their units with allowed roles. No email
  // is sent — the one-time link (raw token) is returned once, like createInvite. The carried roles are authorized here
  // (within the head's people:manage units, on the unit's allowance, held by the head, SoD-clean) and granted scoped
  // to the unit on acceptance.
  async delegatedInvite(
    tenantId: string,
    headUserId: string,
    dto: { email: string; unitId: string; customRoleIds: readonly string[]; expiresInHours: number },
  ) {
    const email = dto.email.trim().toLowerCase();
    return roleChangeConflicts(() =>
      prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
        // The units where the head holds people:manage, from their live assignments.
        const headUnits = await this.peopleUnits(transaction, tenantId, headUserId, ['people:manage']);
        const authorized = await authorizeDelegatedPeopleAdd(transaction, tenantId, headUserId, headUnits, {
          unit: dto.unitId,
          roleIds: dto.customRoleIds,
        });
        if (!authorized.ok) throw new ForbiddenException({ code: authorized.code, message: authorized.message });
        // The carried roles must not give one person both sides of a separated duty (R3).
        const graph = await loadRoleGraph(transaction, tenantId);
        const carriedPermissions = [...new Set(dto.customRoleIds.flatMap((roleId) => expandRole(graph, roleId)))];
        const conflicts = dutyConflicts(carriedPermissions);
        if (conflicts.length > 0)
          throw new ConflictException({
            code: 'DUTY_CONFLICT',
            message: `These roles would give one person both sides of a separated duty. ${conflicts.map((set) => set.reason).join(' ')}`,
            conflicts: conflicts.map((set) => set.id),
          });
        return this.writeDelegatedInvite(transaction, tenantId, headUserId, {
          email,
          unitId: dto.unitId,
          customRoleIds: dto.customRoleIds,
          expiresInHours: dto.expiresInHours,
        });
      }),
    );
  }

  // The create half of a delegated invite, shared by the single (delegatedInvite) and bulk (bulkDelegatedInvite) paths:
  // it refuses an existing membership, revokes any prior pending invite for the email, writes a single-use invite with
  // the token stored as a hash, audits it, and returns the raw token once. Authorization (unit/role/SoD) happens before
  // this is reached; a throw here rolls back the surrounding transaction, so in a bulk batch one failure undoes all.
  private async writeDelegatedInvite(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    headUserId: string,
    row: { email: string; unitId: string; customRoleIds: readonly string[]; expiresInHours: number },
  ): Promise<{ id: string; email: string; expiresAt: string; token: string }> {
    const email = row.email.trim().toLowerCase();
    const existingMember = await transaction.tenantMember.findFirst({
      where: { tenantId, user: { email: { equals: email, mode: 'insensitive' } } },
      select: { id: true },
    });
    if (existingMember) throw new ConflictException('A membership for this email already exists in the tenant');
    await transaction.tenantInvite.updateMany({
      where: { tenantId, email: { equals: email, mode: 'insensitive' }, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const rawToken = randomBytes(32).toString('base64url');
    const created = await transaction.tenantInvite.create({
      data: {
        tenantId,
        email,
        role: 'MEMBER',
        token: this.hashInviteToken(rawToken),
        expiresAt: new Date(Date.now() + row.expiresInHours * 60 * 60 * 1_000),
        invitedById: headUserId,
        customRoleIds: [...row.customRoleIds],
        unitId: row.unitId,
      },
      select: { id: true, email: true, expiresAt: true },
    });
    await transaction.auditLog.create({
      data: {
        action: 'PERMISSION_CHANGE',
        resource: 'tenant_invite',
        resourceId: created.id,
        userId: headUserId,
        tenantId,
        after: { email, unitId: row.unitId, customRoleIds: [...row.customRoleIds], delegated: true },
        metadata: { delivery: 'MANUAL_SECURE_LINK', tokenStoredAsHash: true },
      },
    });
    return { id: created.id, email: created.email, expiresAt: created.expiresAt.toISOString(), token: rawToken };
  }

  // The units where a member holds one of the given people permissions at UNITS scope — the reach of a delegated head:
  // people:manage for writes (invite/add/resend/revoke), people:read for the tracker.
  private async peopleUnits(
    db: Parameters<typeof memberRoleGrants>[0],
    tenantId: string,
    userId: string,
    permissions: readonly string[],
  ): Promise<string[]> {
    const { assignments } = await memberRoleGrants(db, tenantId, userId);
    return [
      ...new Set(
        assignments
          .filter((assignment) => assignment.scope === 'UNITS' && permissions.some((permission) => holdsPermission(assignment.permissions, permission)))
          .flatMap((assignment) => assignment.unitIds),
      ),
    ];
  }

  // WI-OI-120p slice 5 (R14, bulk add): a delegated head invites many people at once (CSV or a pasted list). Every row
  // is checked against the delegated rule and for separation of duties before anything is created; the batch is
  // all-or-nothing, so a single bad row returns the full list of errors and creates nothing. On success each invite is
  // written in one transaction and its one-time link is returned once for download (no email, same as the single path).
  async bulkDelegatedInvite(tenantId: string, headUserId: string, dto: BulkDelegatedInviteDto) {
    return roleChangeConflicts(() =>
      prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
        const headUnits = await this.peopleUnits(transaction, tenantId, headUserId, ['people:manage']);
        const scope = await loadPeopleAdminScope(transaction, tenantId, headUserId, headUnits);

        const rows = dto.rows.map((row) => ({ ...row, email: row.email.trim().toLowerCase() }));
        // Which of the batch emails already belong to a member — a clean up-front message; writeDelegatedInvite still
        // guards each create case-insensitively, so a race or a missed case variant rolls the whole batch back.
        const candidates = [...new Set(dto.rows.flatMap((row) => [row.email.trim(), row.email.trim().toLowerCase()]))];
        const members = await transaction.tenantMember.findMany({
          where: { tenantId, user: { email: { in: candidates } } },
          select: { user: { select: { email: true } } },
        });
        const existingEmails = new Set(members.map((member) => member.user.email.trim().toLowerCase()));

        const validation = validateBulkPeopleAdd(rows, scope, existingEmails);
        // Separation of duties (R3) is per row: the roles one person carries must not give both sides of a split duty.
        const graph = await loadRoleGraph(transaction, tenantId);
        const sodErrors = rows.flatMap((row, index) => {
          const permissions = [...new Set(row.roleIds.flatMap((roleId) => expandRole(graph, roleId)))];
          const conflicts = dutyConflicts(permissions);
          return conflicts.length === 0
            ? []
            : [{ index, email: row.email, code: 'DUTY_CONFLICT', message: conflicts.map((set) => set.reason).join(' ') }];
        });
        const errors = [...validation.errors, ...sodErrors].sort((a, b) => a.index - b.index);
        if (errors.length > 0)
          throw new BadRequestException({ code: 'BULK_VALIDATION_FAILED', message: `${errors.length} of ${rows.length} rows cannot be added; nothing was created.`, errors });

        const invites = [];
        for (const row of rows)
          invites.push(
            await this.writeDelegatedInvite(transaction, tenantId, headUserId, {
              email: row.email,
              unitId: row.unit,
              customRoleIds: row.roleIds,
              expiresInHours: dto.expiresInHours,
            }),
          );
        return { count: invites.length, invites };
      }),
    );
  }

  // WI-OI-120p slice 7 (R14, delegated grant): a delegated head grants allowed unit-scoped roles to EXISTING members
  // (people already in the workspace), the direct complement of the delegated invite. Every row is checked against the
  // delegated rule and separation of duties before anything is written; the batch is all-or-nothing. Each role is
  // granted scoped to the row's unit through resolveRoleScope, so it must be unit-scope-enforcing (R5 allow-list) and a
  // version in force — the same checks assignMemberRole applies, authorized here by the delegated rule instead of an
  // administrator. A role a member already holds is skipped.
  async bulkDelegatedGrant(tenantId: string, headUserId: string, dto: BulkDelegatedGrantDto) {
    return roleChangeConflicts(() =>
      prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
        const headUnits = await this.peopleUnits(transaction, tenantId, headUserId, ['people:manage']);
        const scope = await loadPeopleAdminScope(transaction, tenantId, headUserId, headUnits);
        const rows = dto.rows.map((row) => ({ ...row, email: row.email.trim().toLowerCase() }));

        const candidates = [...new Set(dto.rows.flatMap((row) => [row.email.trim(), row.email.trim().toLowerCase()]))];
        const members = await transaction.tenantMember.findMany({
          where: { tenantId, user: { email: { in: candidates } } },
          select: { id: true, userId: true, user: { select: { email: true } } },
        });
        const memberByEmail = new Map(members.map((member) => [member.user.email.trim().toLowerCase(), member]));
        const memberEmails = new Set(memberByEmail.keys());

        const validation = validateBulkPeopleGrant(rows, scope, memberEmails);
        const graph = await loadRoleGraph(transaction, tenantId);
        const sodErrors = rows.flatMap((row, index) => {
          const permissions = [...new Set(row.roleIds.flatMap((roleId) => expandRole(graph, roleId)))];
          const conflicts = dutyConflicts(permissions);
          return conflicts.length === 0
            ? []
            : [{ index, email: row.email, code: 'DUTY_CONFLICT', message: conflicts.map((set) => set.reason).join(' ') }];
        });
        const errors = [...validation.errors, ...sodErrors].sort((a, b) => a.index - b.index);
        if (errors.length > 0)
          throw new BadRequestException({ code: 'BULK_VALIDATION_FAILED', message: `${errors.length} of ${rows.length} rows cannot be granted; nothing was changed.`, errors });

        let granted = 0;
        const skipped: { email: string; roleId: string }[] = [];
        for (const row of rows) {
          const member = memberByEmail.get(row.email);
          if (!member) continue; // unreachable: validateBulkPeopleGrant already rejected non-members.
          for (const roleId of [...new Set(row.roleIds)]) {
            const held = await transaction.memberRoleAssignment.findFirst({
              where: { tenantId, userId: member.userId, customRoleId: roleId, revokedAt: null },
              select: { id: true },
            });
            if (held) {
              skipped.push({ email: row.email, roleId });
              continue;
            }
            const rolePermissions = expandRole(graph, roleId);
            const resolved = await resolveRoleScope(transaction, tenantId, { kind: 'UNITS', unitIds: [row.unit] }, rolePermissions);
            await assertScopesConsistent(transaction, tenantId, member.userId, { add: { permissions: rolePermissions, scope: resolved } });
            await assertNoDutyConflict(transaction, tenantId, member.userId, rolePermissions);
            if ((await transaction.memberRoleAssignment.count({ where: { tenantId, userId: member.userId, revokedAt: null } })) >= MAX_MEMBER_ROLE_ASSIGNMENTS)
              throw new ConflictException({ code: 'ROLE_LIMIT', message: `A member holds at most ${MAX_MEMBER_ROLE_ASSIGNMENTS} roles; take one away before adding another.` });
            const assignment = await transaction.memberRoleAssignment.create({
              data: {
                tenantId,
                userId: member.userId,
                customRoleId: roleId,
                scope: resolved.scope,
                unitIds: resolved.unitIds,
                placeIds: resolved.placeIds,
                reason: 'Delegated unit grant',
                grantedById: headUserId,
              },
              select: { id: true },
            });
            await transaction.auditLog.create({
              data: {
                action: 'PERMISSION_CHANGE',
                resource: 'member_role_assignment',
                resourceId: assignment.id,
                userId: headUserId,
                tenantId,
                after: { memberId: member.id, customRoleId: roleId, scope: resolved.scope, unitIds: resolved.unitIds, delegated: true },
                metadata: { delegatedGrant: true },
              },
            });
            granted += 1;
          }
        }
        return { granted, skipped };
      }),
    );
  }

  // WI-OI-120p slice 5 (R14, join tracker): the delegated invitations a head can see — those into the units they
  // manage (people:read or people:manage) — each with its single derived status, so a head can watch who has joined.
  // No tokens are returned here; a head regenerates a link with resend.
  async listDelegatedInvites(tenantId: string, headUserId: string) {
    const units = await this.peopleUnits(prisma, tenantId, headUserId, ['people:read', 'people:manage']);
    if (units.length === 0) return { invites: [] };
    const rows = await prisma.tenantInvite.findMany({
      where: { tenantId, unitId: { in: units } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        email: true,
        unitId: true,
        customRoleIds: true,
        createdAt: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        invitedById: true,
      },
    });
    const now = new Date();
    return {
      invites: rows.map((row) => ({
        id: row.id,
        email: row.email,
        unitId: row.unitId,
        customRoleIds: row.customRoleIds,
        invitedById: row.invitedById,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        acceptedAt: row.acceptedAt?.toISOString() ?? null,
        status: inviteStatus(row, now),
      })),
    };
  }

  // WI-OI-120p slice 5 (R14): a head revokes many pending invitations at once. Only still-pending invites into units
  // the head manages are touched; ids that are accepted, already revoked, or outside the head's units are skipped (not
  // an error). Returns how many were revoked.
  async bulkRevokeDelegatedInvites(tenantId: string, headUserId: string, dto: BulkInviteIdsDto) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      const units = await this.peopleUnits(transaction, tenantId, headUserId, ['people:manage']);
      if (units.length === 0) return { revoked: 0, ids: [] as string[] };
      const targets = await transaction.tenantInvite.findMany({
        where: { tenantId, id: { in: dto.inviteIds }, unitId: { in: units }, acceptedAt: null, revokedAt: null },
        select: { id: true },
      });
      const ids = targets.map((target) => target.id);
      if (ids.length === 0) return { revoked: 0, ids };
      await transaction.tenantInvite.updateMany({ where: { id: { in: ids } }, data: { revokedAt: new Date() } });
      await transaction.auditLog.create({
        data: {
          action: 'PERMISSION_CHANGE',
          resource: 'tenant_invite',
          resourceId: ids[0] ?? headUserId,
          userId: headUserId,
          tenantId,
          after: { revoked: ids, delegated: true },
          metadata: { bulk: true },
        },
      });
      return { revoked: ids.length, ids };
    });
  }

  // WI-OI-120p slice 5 (R14): a head regenerates one-time links for many pending invitations at once (the earlier link
  // was never delivered by email). Each target is re-authorized as if freshly invited — the head must still manage the
  // unit, and still hold and be allowed the carried roles, SoD-clean — so a resend cannot outlive the head's authority.
  // The batch is all-or-nothing; each rotated invite keeps its id and returns a fresh link once.
  async bulkResendDelegatedInvites(tenantId: string, headUserId: string, dto: BulkInviteIdsDto) {
    return roleChangeConflicts(() =>
      prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
        const headUnits = await this.peopleUnits(transaction, tenantId, headUserId, ['people:manage']);
        const scope = await loadPeopleAdminScope(transaction, tenantId, headUserId, headUnits);
        const targets =
          headUnits.length === 0
            ? []
            : await transaction.tenantInvite.findMany({
                where: { tenantId, id: { in: dto.inviteIds }, unitId: { in: headUnits }, acceptedAt: null, revokedAt: null },
                select: { id: true, email: true, unitId: true, customRoleIds: true },
              });
        if (targets.length === 0) return { count: 0, invites: [] as { id: string; email: string; token: string }[] };

        const rows = targets.map((target) => ({ email: target.email, unit: target.unitId ?? '', roleIds: target.customRoleIds }));
        const validation = validateBulkPeopleAdd(rows, scope, new Set());
        const graph = await loadRoleGraph(transaction, tenantId);
        const sodErrors = rows.flatMap((row, index) => {
          const permissions = [...new Set(row.roleIds.flatMap((roleId) => expandRole(graph, roleId)))];
          const conflicts = dutyConflicts(permissions);
          return conflicts.length === 0 ? [] : [{ index, email: row.email, code: 'DUTY_CONFLICT', message: conflicts.map((set) => set.reason).join(' ') }];
        });
        const errors = [...validation.errors, ...sodErrors].sort((a, b) => a.index - b.index);
        if (errors.length > 0)
          throw new BadRequestException({ code: 'BULK_VALIDATION_FAILED', message: `${errors.length} invitation(s) can no longer be resent; nothing was changed.`, errors });

        const invites: { id: string; email: string; token: string }[] = [];
        for (const target of targets) {
          const rawToken = randomBytes(32).toString('base64url');
          await transaction.tenantInvite.update({
            where: { id: target.id },
            data: { token: this.hashInviteToken(rawToken), expiresAt: new Date(Date.now() + dto.expiresInHours * 60 * 60 * 1_000), revokedAt: null },
          });
          invites.push({ id: target.id, email: target.email, token: rawToken });
        }
        await transaction.auditLog.create({
          data: {
            action: 'PERMISSION_CHANGE',
            resource: 'tenant_invite',
            resourceId: targets[0]?.id ?? headUserId,
            userId: headUserId,
            tenantId,
            after: { resent: invites.map((invite) => invite.id), delegated: true },
            metadata: { bulk: true, delivery: 'MANUAL_SECURE_LINK', tokenStoredAsHash: true },
          },
        });
        return { count: invites.length, invites };
      }),
    );
  }

  // WI-OI-120p slice 7 (R14, bulk offboarding): an administrator suspends many members at once — suspension gates off
  // their access while keeping their roles for a bounded reactivation. The whole batch runs under one tenant lock and
  // is all-or-nothing: an unknown id, or a suspension that would leave no workspace administrator, rolls it all back.
  // The actor's own membership and already-suspended members are skipped. Roles are not touched (status is the gate).
  async bulkOffboardMembers(tenantId: string, actorId: string, dto: BulkOffboardMembersDto) {
    const reason = requireReason(dto.reason);
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      if (!(await ownAuthority(transaction, tenantId, actorId)).administrator)
        throw new ForbiddenException({ code: 'OFFBOARD_ADMIN_ONLY', message: 'Only a workspace administrator offboards members.' });
      const ids = [...new Set(dto.memberIds)];
      const members = await transaction.tenantMember.findMany({
        where: { id: { in: ids }, tenantId },
        select: { id: true, userId: true, role: true, status: true },
      });
      const found = new Set(members.map((member) => member.id));
      const missing = ids.filter((id) => !found.has(id));
      if (missing.length > 0)
        throw new BadRequestException({ code: 'OFFBOARD_UNKNOWN_MEMBER', message: 'Some members do not belong to this workspace; nothing was changed.', missing });

      const offboarded: string[] = [];
      for (const member of members) {
        if (member.userId === actorId) continue; // never offboard yourself
        if (member.status === 'SUSPENDED') continue; // idempotent
        // A Super Admin / Tenant Admin target is protected exactly as updateMember protects it.
        await assertTenantAdminAuthority(transaction, tenantId, actorId, { grantsAdmin: false, touchesAdmin: isWorkspaceAdministrator(member.role) });
        // The last workspace administrator can never be suspended.
        await assertTenantAdministratorRetained(transaction, tenantId, member, { role: member.role, status: 'SUSPENDED' });
        await transaction.tenantMember.update({ where: { id: member.id }, data: { status: 'SUSPENDED' } });
        await transaction.auditLog.create({
          data: {
            action: 'PERMISSION_CHANGE',
            resource: 'tenant_member',
            resourceId: member.id,
            userId: actorId,
            tenantId,
            after: { status: 'SUSPENDED', offboarded: true },
            metadata: { reason, bulk: true },
          },
        });
        offboarded.push(member.id);
      }
      return { offboarded: offboarded.length, ids: offboarded };
    });
  }

  // WI-OI-120p slice 3 (R13): a Tenant Admin sets, per unit, which custom roles a delegated head may assign there.
  async setDepartmentRoleAllowance(tenantId: string, actorId: string, dto: { unitId: string; customRoleId: string; reason: string }) {
    const reason = requireReason(dto.reason);
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      if (!(await ownAuthority(transaction, tenantId, actorId)).administrator)
        throw new ForbiddenException({ code: 'DEPARTMENT_ALLOWANCE_ADMIN_ONLY', message: 'Only a workspace administrator sets department role allowances.' });
      const role = await transaction.customRole.findFirst({ where: { id: dto.customRoleId, tenantId }, select: { id: true } });
      if (!role) throw new BadRequestException({ code: 'ROLE_NOT_IN_WORKSPACE', message: 'That role does not belong to this workspace.' });
      const existing = await transaction.departmentRoleAllowance.findFirst({
        where: { tenantId, unitId: dto.unitId, customRoleId: dto.customRoleId },
        select: { id: true },
      });
      if (existing) return { id: existing.id, created: false };
      const allowance = await transaction.departmentRoleAllowance.create({
        data: { tenantId, unitId: dto.unitId, customRoleId: dto.customRoleId, createdById: actorId },
        select: { id: true },
      });
      await transaction.auditLog.create({
        data: {
          action: 'PERMISSION_CHANGE',
          resource: 'department_role_allowance',
          resourceId: allowance.id,
          userId: actorId,
          tenantId,
          after: { unitId: dto.unitId, customRoleId: dto.customRoleId },
          metadata: { reason },
        },
      });
      return { id: allowance.id, created: true };
    });
  }

  async removeDepartmentRoleAllowance(tenantId: string, actorId: string, allowanceId: string, dto: { reason: string }) {
    const reason = requireReason(dto.reason);
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      if (!(await ownAuthority(transaction, tenantId, actorId)).administrator)
        throw new ForbiddenException({ code: 'DEPARTMENT_ALLOWANCE_ADMIN_ONLY', message: 'Only a workspace administrator changes department role allowances.' });
      const deleted = await transaction.departmentRoleAllowance.deleteMany({ where: { id: allowanceId, tenantId } });
      if (deleted.count === 0) throw new NotFoundException('Department role allowance was not found.');
      await transaction.auditLog.create({
        data: { action: 'PERMISSION_CHANGE', resource: 'department_role_allowance', resourceId: allowanceId, userId: actorId, tenantId, metadata: { reason, removed: true } },
      });
      return { id: allowanceId, removed: true };
    });
  }

  async listDepartmentRoleAllowances(tenantId: string, unitId?: string) {
    return prisma.departmentRoleAllowance.findMany({
      where: { tenantId, ...(unitId ? { unitId } : {}) },
      select: { id: true, unitId: true, customRoleId: true, createdAt: true },
      orderBy: [{ unitId: 'asc' }, { customRoleId: 'asc' }],
    });
  }

  // WI-OI-120 (R15): a Tenant Admin maps a directory (IdP) group to a scoped custom role. Reconcile then grants that
  // role to whoever the IdP reports in the group. The role is validated at set time; the scope (WORKSPACE or UNITS) is
  // enforced for real when the grant is applied, through the same assignment engine Settings → Team uses.
  async setDirectoryGroupMapping(tenantId: string, actorId: string, dto: SetDirectoryGroupMappingDto) {
    const reason = requireReason(dto.reason);
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      if (!(await ownAuthority(transaction, tenantId, actorId)).administrator)
        throw new ForbiddenException({ code: 'DIRECTORY_MAPPING_ADMIN_ONLY', message: 'Only a workspace administrator maps directory groups to roles.' });
      const role = await transaction.customRole.findFirst({ where: { id: dto.customRoleId, tenantId }, select: { id: true } });
      if (!role) throw new BadRequestException({ code: 'ROLE_NOT_IN_WORKSPACE', message: 'That role does not belong to this workspace.' });
      const mapping = await transaction.scimGroupRoleMapping.upsert({
        where: { tenantId_externalGroupId_customRoleId: { tenantId, externalGroupId: dto.externalGroupId, customRoleId: dto.customRoleId } },
        create: { tenantId, externalGroupId: dto.externalGroupId, customRoleId: dto.customRoleId, scope: dto.scope, unitIds: dto.unitIds, createdById: actorId },
        update: { scope: dto.scope, unitIds: dto.unitIds },
        select: { id: true },
      });
      await transaction.auditLog.create({
        data: {
          action: 'PERMISSION_CHANGE',
          resource: 'scim_group_role_mapping',
          resourceId: mapping.id,
          userId: actorId,
          tenantId,
          after: { externalGroupId: dto.externalGroupId, customRoleId: dto.customRoleId, scope: dto.scope, unitIds: dto.unitIds },
          metadata: { reason },
        },
      });
      return { id: mapping.id };
    });
  }

  async listDirectoryGroupMappings(tenantId: string) {
    return prisma.scimGroupRoleMapping.findMany({
      where: { tenantId },
      select: { id: true, externalGroupId: true, customRoleId: true, scope: true, unitIds: true, createdAt: true },
      orderBy: [{ externalGroupId: 'asc' }, { customRoleId: 'asc' }],
    });
  }

  async removeDirectoryGroupMapping(tenantId: string, actorId: string, mappingId: string, dto: { reason: string }) {
    const reason = requireReason(dto.reason);
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      if (!(await ownAuthority(transaction, tenantId, actorId)).administrator)
        throw new ForbiddenException({ code: 'DIRECTORY_MAPPING_ADMIN_ONLY', message: 'Only a workspace administrator changes directory group mappings.' });
      const deleted = await transaction.scimGroupRoleMapping.deleteMany({ where: { id: mappingId, tenantId } });
      if (deleted.count === 0) throw new NotFoundException('Directory group mapping was not found.');
      await transaction.auditLog.create({
        data: { action: 'PERMISSION_CHANGE', resource: 'scim_group_role_mapping', resourceId: mappingId, userId: actorId, tenantId, metadata: { reason, removed: true } },
      });
      return { id: mappingId, removed: true };
    });
  }

  // WI-OI-120 (R15): reconcile a member's directory-sourced role assignments with their current group membership (as
  // the IdP reports it, over SCIM). Roles the mappings now require are granted; directory-sourced roles no longer
  // required are revoked. Manual grants (any assignment not marked directory-sourced) are never touched. All-or-nothing;
  // each grant goes through resolveRoleScope + the scope/duty/limit invariants, so a mapping can only grant what a
  // Tenant Admin could grant by hand.
  async reconcileMemberDirectoryGroups(tenantId: string, actorId: string, dto: SyncMemberGroupsDto) {
    const DIRECTORY_SYNC = 'directory-sync';
    return roleChangeConflicts(() =>
      prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
        if (!(await ownAuthority(transaction, tenantId, actorId)).administrator)
          throw new ForbiddenException({ code: 'DIRECTORY_SYNC_ADMIN_ONLY', message: 'Only a workspace administrator or the directory connector reconciles group membership.' });
        const email = dto.email.trim().toLowerCase();
        const member = await transaction.tenantMember.findFirst({
          where: { tenantId, user: { email: { equals: email, mode: 'insensitive' } } },
          select: { id: true, userId: true },
        });
        if (!member) throw new NotFoundException('No member with that email in this workspace; provision the person first.');

        const mappingRows = await transaction.scimGroupRoleMapping.findMany({
          where: { tenantId },
          select: { externalGroupId: true, customRoleId: true, scope: true, unitIds: true },
        });
        const mappings: DirectoryGroupMapping[] = mappingRows
          .filter((row) => row.scope === 'WORKSPACE' || row.scope === 'UNITS')
          .map((row) => ({ externalGroupId: row.externalGroupId, customRoleId: row.customRoleId, scope: row.scope as 'WORKSPACE' | 'UNITS', unitIds: row.unitIds }));
        const desired = resolveGroupRoleGrants(dto.groupIds, mappings);

        const heldRows = await transaction.memberRoleAssignment.findMany({
          where: { tenantId, userId: member.userId, grantedById: DIRECTORY_SYNC, revokedAt: null, scope: { in: ['WORKSPACE', 'UNITS'] } },
          select: { id: true, customRoleId: true, scope: true, unitIds: true },
        });
        const held: HeldDirectoryAssignment[] = heldRows.map((row) => ({ assignmentId: row.id, customRoleId: row.customRoleId, scope: row.scope as 'WORKSPACE' | 'UNITS', unitIds: row.unitIds }));

        const plan = planDirectoryReconcile(desired, held);

        if (plan.toRevoke.length > 0)
          await transaction.memberRoleAssignment.updateMany({
            where: { id: { in: [...plan.toRevoke] }, tenantId },
            data: { revokedAt: new Date(), revokedById: DIRECTORY_SYNC, revokeReason: 'Directory group membership removed' },
          });

        const graph = await loadRoleGraph(transaction, tenantId);
        for (const want of plan.toGrant) {
          const rolePermissions = expandRole(graph, want.customRoleId);
          const resolved =
            want.scope === 'WORKSPACE'
              ? await resolveRoleScope(transaction, tenantId, { kind: 'WORKSPACE' }, rolePermissions)
              : await resolveRoleScope(transaction, tenantId, { kind: 'UNITS', unitIds: [...want.unitIds] }, rolePermissions);
          await assertScopesConsistent(transaction, tenantId, member.userId, { add: { permissions: rolePermissions, scope: resolved } });
          await assertNoDutyConflict(transaction, tenantId, member.userId, rolePermissions);
          if ((await transaction.memberRoleAssignment.count({ where: { tenantId, userId: member.userId, revokedAt: null } })) >= MAX_MEMBER_ROLE_ASSIGNMENTS)
            throw new ConflictException({ code: 'ROLE_LIMIT', message: `A member holds at most ${MAX_MEMBER_ROLE_ASSIGNMENTS} roles; take one away before adding another.` });
          const assignment = await transaction.memberRoleAssignment.create({
            data: { tenantId, userId: member.userId, customRoleId: want.customRoleId, scope: resolved.scope, unitIds: resolved.unitIds, placeIds: resolved.placeIds, reason: 'Directory group membership', grantedById: DIRECTORY_SYNC },
            select: { id: true },
          });
          await transaction.auditLog.create({
            data: { action: 'PERMISSION_CHANGE', resource: 'member_role_assignment', resourceId: assignment.id, userId: actorId, tenantId, after: { memberId: member.id, customRoleId: want.customRoleId, scope: resolved.scope, unitIds: resolved.unitIds, directory: true }, metadata: { directorySync: true } },
          });
        }
        return { email, granted: plan.toGrant.length, revoked: plan.toRevoke.length };
      }),
    );
  }

  private async memberForRoleChange(transaction: Prisma.TransactionClient, tenantId: string, memberId: string, actorId: string) {
    const member = await transaction.tenantMember.findFirst({
      where: { id: memberId, tenantId },
      select: { id: true, userId: true, role: true, customRoleId: true },
    });
    if (!member) throw new NotFoundException('Tenant member was not found');
    await assertTenantAdminAuthority(transaction, tenantId, actorId, { grantsAdmin: false, touchesAdmin: isWorkspaceAdministrator(member.role) });
    if (member.userId === actorId) {
      const actor = await transaction.tenantMember.findUnique({ where: { userId_tenantId: { userId: actorId, tenantId } }, select: { role: true, status: true } });
      if (!(actor?.status === 'ACTIVE' && (actor.role === 'TENANT_ADMIN' || actor.role === 'SUPER_ADMIN')))
        throw new ForbiddenException({ code: 'ROLE_SELF_ASSIGNMENT', message: 'You cannot change your own roles; ask another administrator.' });
    }
    return member;
  }

  /**
   * Keeps `customRoleId` on the member's oldest live role, for display and for an earlier release. The trigger then
   * finds the assignments already in step, and records this actor and reason if it acts.
   */
  private async followOldestRole(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    member: { id: string; userId: string; customRoleId: string | null },
    actorId: string,
    reason: string,
  ) {
    const oldest = await transaction.memberRoleAssignment.findFirst({
      where: { tenantId, userId: member.userId, scope: 'MEMBER', revokedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { customRoleId: true },
    });
    const next = oldest?.customRoleId ?? null;
    if (next === member.customRoleId) return;
    await transaction.$queryRaw`SELECT set_config('app.role_change_actor', ${actorId}, true), set_config('app.role_change_reason', ${reason}, true)`;
    await transaction.tenantMember.update({ where: { id: member.id }, data: { customRoleId: next } });
  }

  async listCustomRoles(tenantId: string) {
    await this.syncDefaultRoles(tenantId);
    return prisma.customRole.findMany({
      where: { tenantId },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        isSystem: true,
        permissions: true,
        createdAt: true,
        updatedAt: true,
        includes: { select: { includedRoleId: true } },
        _count: { select: ROLE_HOLDERS },
      },
    }).then((roles) => roles.map((role) => ({ ...withHolderCount(role), includes: role.includes.map((inclusion) => inclusion.includedRoleId) })));
  }

  /**
   * WI-OI-103e (ADR-0016 F16): the default roles that module manifests declare become built-in custom roles of each
   * tenant entitled to the module, kept equal to the manifest. A tenant's own role with the same name is left alone.
   * Idempotent; runs before roles are listed, so the member screen always offers them.
   */
  async syncDefaultRoles(tenantId: string, declared: readonly ModuleDefaultRole[] = moduleDefaultRoles): Promise<void> {
    if (declared.length === 0) return;
    const now = new Date();
    const entitlements = await prisma.tenantModuleEntitlement.findMany({
      where: { tenantId, status: 'ENABLED', startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      select: { moduleKey: true },
    });
    const entitled = new Set(entitlements.map((entitlement) => entitlement.moduleKey));
    const wanted = declared.filter((role) => entitled.has(role.catalogKey));
    if (wanted.length === 0) return;
    try {
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
        const existing = await transaction.customRole.findMany({
          where: { tenantId, name: { in: wanted.map((role) => role.name) } },
          select: { id: true, name: true, description: true, isSystem: true, permissions: true },
        });
        for (const role of wanted) {
          const current = existing.find((candidate) => candidate.name === role.name);
          const permissions = [...role.permissions];
          const metadata = { source: 'module-manifest', catalogKey: role.catalogKey, roleKey: role.key };
          if (!current) {
            const created = await transaction.customRole.create({
              data: { tenantId, name: role.name, description: role.description, isSystem: true, permissions },
              select: { id: true },
            });
            await transaction.auditLog.create({
              data: {
                action: 'CREATE',
                resource: 'custom_role',
                resourceId: created.id,
                userId: null,
                tenantId,
                after: { name: role.name, description: role.description, permissions, isSystem: true },
                metadata,
              },
            });
            continue;
          }
          if (!current.isSystem) continue;
          const same =
            current.description === role.description &&
            JSON.stringify(current.permissions) === JSON.stringify(permissions);
          if (same) continue;

          // WI-OI-120ac: protect current holders against unverified explicit scope widening before updating manifest role
          const before = await loadRoleGraph(transaction, tenantId);
          const after = withRole(before, current.id, { permissions });
          const addedTo = (id: string) => {
            const was = new Set(expandRole(before, id));
            return expandRole(after, id).filter((code) => !was.has(code));
          };
          const affected = [current.id, ...rolesIncluding(after, current.id)]
            .map((id) => ({ id, added: addedTo(id) }))
            .filter((entry) => entry.added.length > 0);
          if (affected.length > 0) {
            const holders = await transaction.memberRoleAssignment.findMany({
              where: { tenantId, customRoleId: { in: affected.map((entry) => entry.id) }, revokedAt: null },
              select: { userId: true, scope: true, customRoleId: true },
            });
            try {
              for (const holder of holders) {
                const added = affected.find((entry) => entry.id === holder.customRoleId)?.added ?? [];
                if (holder.scope === 'UNITS' || holder.scope === 'PLACES') {
                  const controlPlane = CONTROL_PLANE_PERMISSIONS.filter((code) => holdsPermission(added, code));
                  if (controlPlane.length > 0)
                    throw new UnprocessableEntityException({
                      code: 'ROLE_SCOPE_WORKSPACE_ONLY',
                      message: `A role held at units or places cannot gain workspace permissions (${controlPlane.slice(0, 5).join(', ')}).`,
                    });
                  assertScopeEnforced(added, holder.scope === 'UNITS' ? 'units' : 'places');
                }
                await assertScopesConsistent(transaction, tenantId, holder.userId, { graph: after });
              }
            } catch (refusal) {
              if (!(refusal instanceof HttpException)) throw refusal;
              // WI-OI-120be (W1 review A, L4): a refused update leaves that one role as it was and the sync goes on, so
              // one holder's scope cannot stop the other roles or the workspace's roles screen.
              const code = (refusal.getResponse() as { code?: string }).code ?? refusal.name;
              this.logger.warn(`Built-in role "${role.name}" in tenant ${tenantId} was not updated (${code}): ${refusal.message}`);
              // W1-A review: it still loses the codes the manifest dropped, since removing a code never widens access.
              const held = Array.isArray(current.permissions) ? current.permissions : [];
              const kept = held.filter((code): code is string => typeof code === 'string' && permissions.includes(code));
              if (kept.length === held.length) continue;
              await transaction.customRole.update({ where: { id: current.id }, data: { permissions: kept } });
              await transaction.auditLog.create({
                data: {
                  action: 'UPDATE',
                  resource: 'custom_role',
                  resourceId: current.id,
                  userId: null,
                  tenantId,
                  before: { permissions: current.permissions as Prisma.InputJsonValue },
                  after: { permissions: kept },
                  metadata: { ...metadata, narrowedOnly: true },
                },
              });
              continue;
            }
          }

          await transaction.customRole.update({
            where: { id: current.id },
            data: { description: role.description, permissions },
          });
          await transaction.auditLog.create({
            data: {
              action: 'UPDATE',
              resource: 'custom_role',
              resourceId: current.id,
              userId: null,
              tenantId,
              before: { description: current.description, permissions: current.permissions as Prisma.InputJsonValue },
              after: { description: role.description, permissions },
              metadata,
            },
          });
        }
      });
    } catch (error) {
      // A concurrent request created the same role first; its transaction already did the work.
      if (!isUniqueConstraintError(error)) throw error;
    }
  }

  async createCustomRole(tenantId: string, createdById: string, dto: CreateCustomRoleDto) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      const existing = await transaction.customRole.findUnique({
        where: { tenantId_name: { tenantId, name: dto.name } },
        select: { id: true },
      });
      if (existing) throw new ConflictException('A custom role with this name already exists');

      const role = await transaction.customRole.create({
        data: {
          tenantId,
          name: dto.name,
          description: dto.description ?? null,
          color: dto.color,
          permissions: dto.permissions,
        },
        select: {
          id: true,
          name: true,
          description: true,
          color: true,
          isSystem: true,
          permissions: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      // WI-OI-120w (R2 slice 2c): the roles it includes, checked like any edit of the graph. A new role has no holders.
      const includes = dto.includes ?? [];
      if (includes.length > 0) {
        assertInclusionsValid(withRole(await loadRoleGraph(transaction, tenantId), role.id, { includes }), role.id);
        await transaction.customRoleInclusion.createMany({
          data: includes.map((includedRoleId) => ({ tenantId, roleId: role.id, includedRoleId, createdById })),
        });
      }
      await transaction.auditLog.create({
        data: {
          action: 'CREATE',
          resource: 'custom_role',
          resourceId: role.id,
          userId: createdById,
          tenantId,
          after: {
            name: role.name,
            description: role.description,
            color: role.color,
            permissions: role.permissions,
            includes,
          },
        },
      });
      return { ...role, includes, _count: { members: 0 } };
    });
  }

  async updateCustomRole(
    tenantId: string,
    roleId: string,
    changedById: string,
    dto: UpdateCustomRoleDto,
  ) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      const role = await transaction.customRole.findFirst({
        where: { id: roleId, tenantId },
      });
      if (!role) throw new NotFoundException('Custom role was not found');
      if (role.isSystem) throw new ConflictException('System roles cannot be modified');
      if (role.updatedAt.getTime() !== new Date(dto.expectedUpdatedAt).getTime()) {
        throw new ConflictException('Custom role changed; reload before retrying');
      }
      if (dto.name && dto.name !== role.name) {
        const duplicate = await transaction.customRole.findUnique({
          where: { tenantId_name: { tenantId, name: dto.name } },
          select: { id: true },
        });
        if (duplicate) throw new ConflictException('A custom role with this name already exists');
      }
      // WI-OI-120q (R1): a role keeps what it holds; it may not gain a permission no screen or service checks.
      if (dto.permissions !== undefined) {
        const previous = Array.isArray(role.permissions) ? (role.permissions as unknown[]) : [];
        const unknown = uncataloguedAdditions(previous, dto.permissions);
        if (unknown.length > 0) {
          throw new BadRequestException({
            code: 'ROLE_PERMISSION_UNKNOWN',
            message: `No screen or service checks ${unknown.join(', ')}; choose from the permission list.`,
          });
        }
      }
      // WI-OI-120w (grant bound, R2 slices 2b and 2c): what the role newly grants, by its own permissions or through the
      // roles it includes, reaches everyone holding it and every role that includes it. The editor must hold it; each
      // holder's scopes must stay consistent; a holder at units or places may gain only what is enforced there.
      // Removing permissions or inclusions is never blocked (review M2).
      let previousIncludes: string[] = [];
      if (dto.permissions !== undefined || dto.includes !== undefined) {
        const before = await loadRoleGraph(transaction, tenantId);
        previousIncludes = [...(before.includes.get(role.id) ?? [])];
        const after = withRole(before, role.id, {
          ...(dto.permissions !== undefined ? { permissions: dto.permissions } : {}),
          ...(dto.includes !== undefined ? { includes: dto.includes } : {}),
        });
        if (dto.includes !== undefined) assertInclusionsValid(after, role.id);
        const addedTo = (id: string) => {
          const held = new Set(expandRole(before, id));
          return expandRole(after, id).filter((code) => !held.has(code));
        };
        await assertGrantWithinOwn(transaction, tenantId, changedById, addedTo(role.id));
        const affected = [role.id, ...rolesIncluding(after, role.id)]
          .map((id) => ({ id, added: addedTo(id) }))
          .filter((entry) => entry.added.length > 0);
        if (affected.length > 0) {
          const holders = await transaction.memberRoleAssignment.findMany({
            where: { tenantId, customRoleId: { in: affected.map((entry) => entry.id) }, revokedAt: null },
            select: { userId: true, scope: true, customRoleId: true },
          });
          for (const holder of holders) {
            const added = affected.find((entry) => entry.id === holder.customRoleId)?.added ?? [];
            if (holder.scope === 'UNITS' || holder.scope === 'PLACES') {
              const controlPlane = CONTROL_PLANE_PERMISSIONS.filter((code) => holdsPermission(added, code));
              if (controlPlane.length > 0)
                throw new UnprocessableEntityException({
                  code: 'ROLE_SCOPE_WORKSPACE_ONLY',
                  message: `A role held at units or places cannot gain workspace permissions (${controlPlane.slice(0, 5).join(', ')}).`,
                });
              assertScopeEnforced(added, holder.scope === 'UNITS' ? 'units' : 'places');
            }
            await assertScopesConsistent(transaction, tenantId, holder.userId, { graph: after });
          }
        }
      }

      const changed = await transaction.customRole.updateMany({
        where: { id: role.id, tenantId, updatedAt: role.updatedAt, isSystem: false },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
          ...(dto.permissions !== undefined ? { permissions: dto.permissions } : {}),
          ...(dto.includes !== undefined ? { updatedAt: new Date() } : {}),
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Custom role changed; reload before retrying');
      }
      if (dto.includes !== undefined) {
        await transaction.customRoleInclusion.deleteMany({ where: { tenantId, roleId: role.id, includedRoleId: { notIn: dto.includes } } });
        const fresh = dto.includes.filter((id) => !previousIncludes.includes(id));
        if (fresh.length > 0)
          await transaction.customRoleInclusion.createMany({
            data: fresh.map((includedRoleId) => ({ tenantId, roleId: role.id, includedRoleId, createdById: changedById })),
          });
      }
      const updated = await transaction.customRole.findUniqueOrThrow({
        where: { id: role.id },
        select: {
          id: true,
          name: true,
          description: true,
          color: true,
          isSystem: true,
          permissions: true,
          createdAt: true,
          updatedAt: true,
          includes: { select: { includedRoleId: true } },
          _count: { select: ROLE_HOLDERS },
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'UPDATE',
          resource: 'custom_role',
          resourceId: role.id,
          userId: changedById,
          tenantId,
          before: {
            name: role.name,
            description: role.description,
            color: role.color,
            permissions: role.permissions,
            includes: previousIncludes,
          },
          after: {
            name: updated.name,
            description: updated.description,
            color: updated.color,
            permissions: updated.permissions,
            includes: updated.includes.map((inclusion) => inclusion.includedRoleId),
          },
          metadata: { reason: dto.reason },
        },
      });
      return { ...withHolderCount(updated), includes: updated.includes.map((inclusion) => inclusion.includedRoleId) };
    });
  }

  async deleteCustomRole(tenantId: string, roleId: string, deletedById: string, reason: string) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      const role = await transaction.customRole.findFirst({
        where: { id: roleId, tenantId },
        include: { _count: { select: { members: true, ...ROLE_HOLDERS } } },
      });
      if (!role) throw new NotFoundException('Custom role was not found');
      if (role.isSystem) throw new ConflictException('System roles cannot be deleted');
      // A role held only as someone's second role is in use too (Security review of 2a, L2).
      // WI-OI-120w (R2 slice 2c): a role other roles include stays until it is taken out of them.
      const including = await transaction.customRoleInclusion.findMany({
        where: { tenantId, includedRoleId: role.id },
        select: { role: { select: { name: true } } },
      });
      if (including.length > 0)
        throw new ConflictException({
          code: 'ROLE_INCLUDED',
          message: `${role.name} is included by ${including.map((inclusion) => inclusion.role.name).join(', ')}; take it out of them first.`,
        });
      if (role._count.members > 0 || role._count.assignments > 0) {
        throw new ConflictException('Remove this custom role from all members before deleting it');
      }
      // WI-OI-120w (slice 2c review, I1): the roles it includes go with it (cascade), so they are kept in the entry too.
      const includes = (await transaction.customRoleInclusion.findMany({ where: { tenantId, roleId: role.id }, select: { includedRoleId: true } })).map(
        (inclusion) => inclusion.includedRoleId,
      );
      // WI-OI-120w review (L1): the role's assignment history goes with it, so it is kept in the audit entry first.
      const assignments = await transaction.memberRoleAssignment.findMany({
        where: { tenantId, customRoleId: role.id },
        select: { userId: true, scope: true, grantedById: true, createdAt: true, revokedAt: true, revokedById: true, revokeReason: true },
        orderBy: { createdAt: 'asc' },
      });
      await transaction.customRole.delete({ where: { id: role.id } });
      await transaction.auditLog.create({
        data: {
          action: 'DELETE',
          resource: 'custom_role',
          resourceId: role.id,
          userId: deletedById,
          tenantId,
          before: {
            name: role.name,
            description: role.description,
            color: role.color,
            permissions: role.permissions,
            includes,
            assignments: assignments.map((assignment) => ({
              ...assignment,
              createdAt: assignment.createdAt.toISOString(),
              revokedAt: assignment.revokedAt?.toISOString() ?? null,
            })),
          },
          metadata: { reason },
        },
      });
      return { id: role.id, deleted: true };
    });
  }

  async listInvites(tenantId: string) {
    return prisma.tenantInvite.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        invitedById: true,
        createdAt: true,
      },
    });
  }

  async createInvite(tenantId: string, invitedById: string, dto: CreateTenantInviteDto) {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + dto.expiresInHours * 60 * 60 * 1_000);
    const invitation = await prisma.$transaction(async (transaction) => {
      // One tenant row is the serialization point for membership lifecycle decisions.
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      const existingMember = await transaction.tenantMember.findFirst({
        where: {
          tenantId,
          user: { email: { equals: dto.email, mode: 'insensitive' } },
        },
        select: { id: true },
      });
      if (existingMember) {
        throw new ConflictException('A membership for this email already exists in the tenant');
      }
      await assertTenantAdminAuthority(transaction, tenantId, invitedById, { grantsAdmin: dto.role === 'TENANT_ADMIN', touchesAdmin: false });
      // WI-OI-120x: an invitation gives its role's permissions; someone not a Tenant Admin gives only what they hold.
      await assertBaseRoleWithinOwn(transaction, tenantId, invitedById, null, dto.role);

      await transaction.tenantInvite.updateMany({
        where: {
          tenantId,
          email: { equals: dto.email, mode: 'insensitive' },
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      const created = await transaction.tenantInvite.create({
        data: {
          tenantId,
          email: dto.email,
          role: dto.role,
          token: tokenHash,
          expiresAt,
          invitedById,
        },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          createdAt: true,
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'INVITE',
          resource: 'tenant_invite',
          resourceId: created.id,
          userId: invitedById,
          tenantId,
          after: {
            email: created.email,
            role: created.role,
            expiresAt: created.expiresAt.toISOString(),
          },
          metadata: { delivery: 'MANUAL_SECURE_LINK', tokenStoredAsHash: true },
        },
      });
      return created;
    });

    return {
      ...invitation,
      token: rawToken,
      delivery: 'MANUAL_SECURE_LINK' as const,
    };
  }

  async revokeInvite(tenantId: string, inviteId: string, revokedById: string) {
    return prisma.$transaction(async (transaction) => {
      const invitation = await transaction.tenantInvite.findFirst({
        where: { id: inviteId, tenantId },
        select: { id: true, email: true, role: true, acceptedAt: true, revokedAt: true },
      });
      if (!invitation) throw new NotFoundException('Invitation was not found');
      if (invitation.acceptedAt)
        throw new ConflictException('Accepted invitation cannot be revoked');
      if (invitation.revokedAt) return { ...invitation, status: 'REVOKED' as const };

      const revokedAt = new Date();
      const revoked = await transaction.tenantInvite.updateMany({
        where: { id: inviteId, tenantId, acceptedAt: null, revokedAt: null },
        data: { revokedAt },
      });
      if (revoked.count !== 1) {
        const current = await transaction.tenantInvite.findFirst({
          where: { id: inviteId, tenantId },
          select: { id: true, email: true, role: true, acceptedAt: true, revokedAt: true },
        });
        if (!current) throw new NotFoundException('Invitation was not found');
        if (current.acceptedAt)
          throw new ConflictException('Accepted invitation cannot be revoked');
        return { ...current, status: 'REVOKED' as const };
      }
      const updated = await transaction.tenantInvite.findUniqueOrThrow({
        where: { id: inviteId },
        select: { id: true, email: true, role: true, acceptedAt: true, revokedAt: true },
      });
      await transaction.auditLog.create({
        data: {
          action: 'STATUS_CHANGE',
          resource: 'tenant_invite',
          resourceId: inviteId,
          userId: revokedById,
          tenantId,
          before: { revokedAt: null },
          after: { revokedAt: revokedAt.toISOString() },
        },
      });
      return { ...updated, status: 'REVOKED' as const };
    });
  }

  /**
   * WI-OI-120ba: what an invitation is for, shown to the invited person before they accept it. The checks are the
   * same as accepting, in the same order, with the same answers. A person who is not the invitee learns nothing, and
   * nothing is written. Accepting checks everything again, including the sender's authority.
   */
  async previewInvite(userId: string, dto: AcceptTenantInviteDto): Promise<TenantInvitePreviewV1> {
    const invitation = await prisma.tenantInvite.findUnique({
      where: { token: this.hashInviteToken(dto.token) },
      include: { tenant: { select: { name: true, status: true } } },
    });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, status: true } });
    if (!invitation || !user || user.status !== 'ACTIVE' || invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new BadRequestException('Invitation is invalid for this user');
    }
    if (!['ACTIVE', 'PROVISIONING', 'TRIAL'].includes(invitation.tenant.status)) {
      throw new ConflictException('Tenant is not accepting memberships');
    }
    const existingMember = await prisma.tenantMember.findUnique({
      where: { userId_tenantId: { userId, tenantId: invitation.tenantId } },
      select: { id: true },
    });
    if (existingMember) throw new ConflictException('A tenant membership already exists');
    if (invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
      throw new ConflictException('Invitation is expired, revoked, or already accepted');
    }
    const sender = await prisma.user.findUnique({ where: { id: invitation.invitedById }, select: { name: true } });
    return {
      workspaceName: invitation.tenant.name,
      role: invitation.role,
      invitedBy: sender?.name?.trim() || null,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async acceptInvite(userId: string, dto: AcceptTenantInviteDto) {
    const tokenHash = this.hashInviteToken(dto.token);
    return prisma.$transaction(
      async (transaction) => {
        const invitation = await transaction.tenantInvite.findUnique({
          where: { token: tokenHash },
          include: { tenant: { select: { id: true, slug: true, name: true, status: true } } },
        });
        const user = await transaction.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, status: true },
        });
        if (
          !invitation ||
          !user ||
          user.status !== 'ACTIVE' ||
          invitation.email.toLowerCase() !== user.email.toLowerCase()
        ) {
          throw new BadRequestException('Invitation is invalid for this user');
        }
        await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${invitation.tenantId} FOR UPDATE`;
        const tenant = await transaction.tenant.findUnique({
          where: { id: invitation.tenantId },
          select: { id: true, slug: true, name: true, status: true },
        });
        if (!tenant || !['ACTIVE', 'PROVISIONING', 'TRIAL'].includes(tenant.status)) {
          throw new ConflictException('Tenant is not accepting memberships');
        }

        const existingMember = await transaction.tenantMember.findUnique({
          where: { userId_tenantId: { userId, tenantId: invitation.tenantId } },
        });
        if (existingMember) throw new ConflictException('A tenant membership already exists');
        // WI-OI-120v: an invitation to be a Tenant Admin counts only while its sender is an active administrator, so one
        // sent before that rule (or by someone since demoted) cannot make anyone an administrator.
        if (invitation.role === 'TENANT_ADMIN') {
          await assertTenantAdminAuthority(transaction, invitation.tenantId, invitation.invitedById, { grantsAdmin: true, touchesAdmin: false });
        }
        // WI-OI-120x: likewise the sender must still hold what the invited role gives, which also covers invitations
        // sent before the bound. The refusal is told to the person accepting.
        await assertBaseRoleWithinOwn(transaction, invitation.tenantId, invitation.invitedById, null, invitation.role).catch(
          (error: unknown) => {
            if (error instanceof ForbiddenException)
              throw new ForbiddenException({
                code: 'INVITATION_NO_LONGER_VALID',
                message: 'This invitation is no longer valid: its sender can no longer give this role. Ask for a new invitation.',
              });
            throw error;
          },
        );

        const acceptedAt = new Date();
        const accepted = await transaction.tenantInvite.updateMany({
          where: {
            id: invitation.id,
            token: tokenHash,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: acceptedAt },
          },
          data: { acceptedAt },
        });
        if (accepted.count !== 1) {
          throw new ConflictException('Invitation is expired, revoked, or already accepted');
        }

        const membership = await transaction.tenantMember.create({
          data: {
            tenantId: invitation.tenantId,
            userId,
            role: invitation.role,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            tenantId: true,
            userId: true,
            role: true,
            status: true,
            joinedAt: true,
          },
        });
        await transaction.auditLog.create({
          data: {
            action: 'STATUS_CHANGE',
            resource: 'tenant_invite',
            resourceId: invitation.id,
            userId,
            tenantId: invitation.tenantId,
            before: { acceptedAt: null },
            after: { acceptedAt: acceptedAt.toISOString(), membershipId: membership.id },
          },
        });
        // WI-OI-120p slice 4 (R13): a delegated invitation grants its carried custom roles at its unit on acceptance
        // (authorized at create-time by delegatedInvite). An ordinary base-role invite carries none and grants nothing.
        for (const grant of invitedRoleAssignments(invitation)) {
          await transaction.memberRoleAssignment.create({
            data: {
              tenantId: invitation.tenantId,
              userId,
              customRoleId: grant.customRoleId,
              scope: grant.scope,
              unitIds: [...grant.unitIds],
              reason: 'Accepted delegated invitation',
              grantedById: invitation.invitedById,
            },
          });
        }
        return { tenant, membership };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async updateMember(
    tenantId: string,
    memberId: string,
    changedById: string,
    dto: UpdateTenantMemberDto,
  ) {
    return prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
        const member = await transaction.tenantMember.findFirst({
          where: { id: memberId, tenantId },
          select: {
            id: true,
            userId: true,
            role: true,
            status: true,
            permissions: true,
            departmentId: true,
            employmentType: true,
            spatialScopePlaceIds: true,
            updatedAt: true,
          },
        });
        if (!member) throw new NotFoundException('Tenant member was not found');
        if (member.updatedAt.getTime() !== new Date(dto.expectedUpdatedAt).getTime()) {
          throw new ConflictException('Tenant member changed; reload before retrying');
        }

        const nextRole = dto.role ?? member.role;
        const nextStatus = dto.status ?? member.status;

        if (dto.departmentId !== undefined && dto.departmentId !== member.departmentId)
          await assertDepartmentsEditable(transaction, tenantId);
        const nextDepartmentId =
          dto.departmentId !== undefined ? dto.departmentId : member.departmentId;
        if (nextDepartmentId) {
          const department = await transaction.department.findFirst({
            where: { id: nextDepartmentId, tenantId },
            select: { id: true },
          });
          if (!department)
            throw new BadRequestException('Department does not belong to this tenant');
        }

        const nextEmploymentType =
          dto.employmentType !== undefined ? dto.employmentType : member.employmentType;
        const nextSpatialScopePlaceIds = dto.spatialScopePlaceIds ?? member.spatialScopePlaceIds;

        await assertTenantAdminAuthority(transaction, tenantId, changedById, {
          grantsAdmin: nextRole === 'TENANT_ADMIN' && member.role !== 'TENANT_ADMIN',
          // WI-OI-120x (review L3): a Super Admin member is protected as a Tenant Admin is.
          touchesAdmin: isWorkspaceAdministrator(member.role),
        });
        // WI-OI-120x: nobody but a Tenant Admin changes their own role, department or places, or gives a base role
        // beyond what they hold.
        const placesChanged =
          dto.spatialScopePlaceIds !== undefined &&
          [...dto.spatialScopePlaceIds].sort().join('\n') !== [...member.spatialScopePlaceIds].sort().join('\n');
        if (nextRole !== member.role || nextDepartmentId !== member.departmentId || placesChanged)
          await assertNotOwnAccess(transaction, tenantId, changedById, member.userId);
        await assertBaseRoleWithinOwn(transaction, tenantId, changedById, member.role, nextRole);
        // WI-OI-120w (R2 slice 2b): a new base role must not give a module this person's access at a second scope.
        if (nextRole !== member.role) await assertScopesConsistent(transaction, tenantId, member.userId, { baseRole: nextRole });
        // WI-OI-120x (review M2): bringing a suspended member back is bounded as a new grant.
        if (member.status !== 'ACTIVE' && nextStatus === 'ACTIVE')
          await assertReactivationWithinOwn(transaction, tenantId, changedById, { userId: member.userId, role: nextRole, permissions: member.permissions });
        await assertTenantAdministratorRetained(transaction, tenantId, member, { role: nextRole, status: nextStatus });

        // WI-OI-120w (Security review of 2a, M2): roles are not changed here. They are given and taken away through
        // role assignments (`assignMemberRole`, `revokeMemberRole`), behind `roles:assign`.

        const changed = await transaction.tenantMember.updateMany({
          where: { id: member.id, tenantId, updatedAt: member.updatedAt },
          data: {
            role: nextRole,
            status: nextStatus,
            departmentId: nextDepartmentId,
            employmentType: nextEmploymentType,
            spatialScopePlaceIds: [...nextSpatialScopePlaceIds],
          },
        });
        if (changed.count !== 1) {
          throw new ConflictException('Tenant member changed; reload before retrying');
        }
        const updated = await transaction.tenantMember.findUniqueOrThrow({
          where: { id: member.id },
          select: {
            id: true,
            role: true,
            status: true,
            departmentId: true,
            employmentType: true,
            spatialScopePlaceIds: true,
            joinedAt: true,
            updatedAt: true,
            user: { select: { id: true, email: true, name: true, status: true } },
            customRole: {
              select: { id: true, name: true, color: true, permissions: true },
            },
            department: {
              select: { id: true, name: true, code: true },
            },
          },
        });
        if (nextStatus === 'SUSPENDED') {
          await transaction.session.updateMany({
            where: { userId: member.userId, tenantId, status: 'ACTIVE' },
            data: { status: 'REVOKED', revokedAt: new Date() },
          });
        }
        await transaction.auditLog.create({
          data: {
            action: 'PERMISSION_CHANGE',
            resource: 'tenant_member',
            resourceId: member.id,
            userId: changedById,
            tenantId,
            before: {
              role: member.role,
              status: member.status,
              departmentId: member.departmentId,
              employmentType: member.employmentType,
              spatialScopePlaceIds: member.spatialScopePlaceIds,
            },
            after: {
              role: updated.role,
              status: updated.status,
              departmentId: updated.departmentId,
              employmentType: updated.employmentType,
              spatialScopePlaceIds: updated.spatialScopePlaceIds,
            },
            metadata: { reason: dto.reason },
          },
        });
        return updated;
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async listDepartments(tenantId: string) {
    return prisma.department.findMany({
      where: { tenantId },
      orderBy: [{ name: 'asc' }],
      include: {
        parent: {
          select: { id: true, name: true, code: true },
        },
        manager: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { members: true, children: true },
        },
      },
    });
  }

  async createDepartment(tenantId: string, createdById: string, dto: CreateDepartmentDto) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      await assertDepartmentsEditable(transaction, tenantId);
      const existing = await transaction.department.findUnique({
        where: { tenantId_code: { tenantId, code: dto.code } },
      });
      if (existing) {
        throw new ConflictException(`A department with code '${dto.code}' already exists`);
      }

      if (dto.parentId) {
        const parent = await transaction.department.findFirst({
          where: { id: dto.parentId, tenantId, isActive: true },
        });
        if (!parent) {
          throw new BadRequestException('Active parent department not found in this tenant');
        }
        let parentId: string | null = parent.id;
        let depth = 1;
        while (parentId) {
          if (depth >= 10) {
            throw new BadRequestException('Department hierarchy cannot exceed 10 levels');
          }
          const ancestor: { parentId: string | null } | null =
            await transaction.department.findFirst({
              where: { id: parentId, tenantId },
              select: { parentId: true },
            });
          parentId = ancestor?.parentId ?? null;
          depth += 1;
        }
      }

      if (dto.managerId) {
        const manager = await transaction.tenantMember.findFirst({
          where: { userId: dto.managerId, tenantId, status: 'ACTIVE' },
        });
        if (!manager) {
          throw new BadRequestException('Manager must be an active member of this tenant');
        }
      }

      const created = await transaction.department.create({
        data: {
          tenantId,
          name: dto.name,
          code: dto.code,
          parentId: dto.parentId ?? null,
          managerId: dto.managerId ?? null,
          spendingLimit:
            dto.spendingLimit !== undefined && dto.spendingLimit !== null
              ? dto.spendingLimit
              : null,
        },
        include: {
          parent: { select: { id: true, name: true, code: true } },
          manager: { select: { id: true, name: true, email: true } },
          _count: { select: { members: true, children: true } },
        },
      });

      await transaction.auditLog.create({
        data: {
          action: 'CREATE',
          resource: 'department',
          resourceId: created.id,
          userId: createdById,
          tenantId,
          after: { name: created.name, code: created.code, parentId: created.parentId },
        },
      });

      return created;
    });
  }

  async updateDepartment(
    tenantId: string,
    departmentId: string,
    updatedById: string,
    dto: UpdateDepartmentDto,
  ) {
    return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      await assertDepartmentsEditable(transaction, tenantId);
    const department = await transaction.department.findFirst({
      where: { id: departmentId, tenantId },
    });
    if (!department) {
      throw new NotFoundException('Department not found in this tenant');
    }

    if (dto.code && dto.code !== department.code) {
      const existing = await transaction.department.findUnique({
        where: { tenantId_code: { tenantId, code: dto.code } },
      });
      if (existing) {
        throw new ConflictException(`A department with code '${dto.code}' already exists`);
      }
    }

    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === departmentId) {
        throw new BadRequestException('A department cannot be its own parent');
      }

      const parent = await transaction.department.findFirst({
        where: { id: dto.parentId, tenantId, isActive: true },
      });
      if (!parent) {
        throw new BadRequestException('Parent department not found in this tenant');
      }

      let currentParentId: string | null = dto.parentId;
      const visited = new Set<string>([departmentId]);
      let depth = 1;
      while (currentParentId) {
        if (visited.has(currentParentId)) {
          throw new BadRequestException('Cyclic department hierarchy is not allowed');
        }
        visited.add(currentParentId);
        if (depth >= 10) {
          throw new BadRequestException('Department hierarchy cannot exceed 10 levels');
        }
        const ancestor: { parentId: string | null } | null =
          await transaction.department.findFirst({
            where: { id: currentParentId, tenantId },
            select: { parentId: true },
          });
        currentParentId = ancestor?.parentId ?? null;
        depth += 1;
      }
    }

    if (dto.managerId) {
      const manager = await transaction.tenantMember.findFirst({
        where: { userId: dto.managerId, tenantId, status: 'ACTIVE' },
      });
      if (!manager) {
        throw new BadRequestException('Manager must be an active member of this tenant');
      }
    }

    const updated = await transaction.department.update({
      where: { id: departmentId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
        ...(dto.spendingLimit !== undefined
          ? { spendingLimit: dto.spendingLimit !== null ? dto.spendingLimit : null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: {
        parent: { select: { id: true, name: true, code: true } },
        manager: { select: { id: true, name: true, email: true } },
        _count: { select: { members: true, children: true } },
      },
    });

    await transaction.auditLog.create({
      data: {
        action: 'UPDATE',
        resource: 'department',
        resourceId: updated.id,
        userId: updatedById,
        tenantId,
        before: {
          name: department.name,
          code: department.code,
          parentId: department.parentId,
          isActive: department.isActive,
        },
        after: {
          name: updated.name,
          code: updated.code,
          parentId: updated.parentId,
          isActive: updated.isActive,
        },
      },
    });

    return updated;
    });
  }

  async deleteDepartment(tenantId: string, departmentId: string, deletedById: string) {
    return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      await assertDepartmentsEditable(transaction, tenantId);
    const department = await transaction.department.findFirst({
      where: { id: departmentId, tenantId },
      include: {
        _count: { select: { children: true, members: true } },
      },
    });
    if (!department) {
      throw new NotFoundException('Department not found in this tenant');
    }

    if (department._count.children > 0) {
      throw new ConflictException(
        `Cannot delete department with ${department._count.children} child department(s). Reassign or delete child departments first.`,
      );
    }

    if (department._count.members > 0) {
      throw new ConflictException(
        `Cannot delete department with ${department._count.members} assigned member(s). Reassign members first.`,
      );
    }

    await transaction.department.delete({
      where: { id: departmentId },
    });

    await transaction.auditLog.create({
      data: {
        action: 'DELETE',
        resource: 'department',
        resourceId: departmentId,
        userId: deletedById,
        tenantId,
        before: {
          name: department.name,
          code: department.code,
        },
      },
    });

    return { deleted: true, id: departmentId };
    });
  }

  async getOrganizationSettings(tenantId: string) {
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { features: true },
    });
    return {
      hierarchyEnabled: tenant.features.includes('organization-hierarchy'),
      spatialScopingEnabled: tenant.features.includes('spatial-scoping'),
    };
  }

  async updateOrganizationSettings(
    tenantId: string,
    updatedById: string,
    dto: UpdateTenantOrganizationSettingsDto,
  ) {
    return prisma.$transaction(async (transaction) => {
      const tenant = await transaction.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { id: true, features: true },
      });
      const featureSet = new Set(tenant.features);
      const before = {
        hierarchyEnabled: featureSet.has('organization-hierarchy'),
        spatialScopingEnabled: featureSet.has('spatial-scoping'),
      };
      const toggle = (feature: string, enabled: boolean | undefined) => {
        if (enabled === true) featureSet.add(feature);
        if (enabled === false) featureSet.delete(feature);
      };
      toggle('organization-hierarchy', dto.hierarchyEnabled);
      toggle('spatial-scoping', dto.spatialScopingEnabled);
      const after = {
        hierarchyEnabled: featureSet.has('organization-hierarchy'),
        spatialScopingEnabled: featureSet.has('spatial-scoping'),
      };
      await transaction.tenant.update({
        where: { id: tenantId },
        data: { features: Array.from(featureSet) },
      });

      await transaction.auditLog.create({
        data: {
          action: 'SETTINGS_CHANGE',
          resource: 'tenant_settings',
          resourceId: tenantId,
          userId: updatedById,
          tenantId,
          before,
          after,
        },
      });

      return after;
    });
  }

  private hashInviteToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}

const domainStatusSelection = {
  customDomain: true,
  customDomainChallengeDomain: true,
  customDomainChallengeExpiresAt: true,
  customDomainVerifiedAt: true,
  customDomainVerificationAttempts: true,
  customDomainVerificationLockedUntil: true,
} as const;

const publicTenantSelection = {
  id: true,
  slug: true,
  name: true,
  status: true,
  isolationMode: true,
  region: true,
  customDomain: true,
  customDomainVerifiedAt: true,
  provisionedAt: true,
  branding: true,
  features: true,
  plan: true,
  trialEndsAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type DomainStatusRecord = {
  customDomain: string | null;
  customDomainChallengeDomain: string | null;
  customDomainChallengeExpiresAt: Date | null;
  customDomainVerifiedAt: Date | null;
  customDomainVerificationAttempts: number;
  customDomainVerificationLockedUntil: Date | null;
};

function presentDomainStatus(domain: DomainStatusRecord) {
  const now = Date.now();
  return {
    activeDomain: domain.customDomain,
    activeDomainVerifiedAt: domain.customDomainVerifiedAt,
    domain: domain.customDomainChallengeDomain ?? domain.customDomain,
    recordName: domain.customDomainChallengeDomain
      ? domainVerificationRecordName(domain.customDomainChallengeDomain)
      : null,
    status: domain.customDomainChallengeDomain
      ? domain.customDomainVerificationLockedUntil &&
        domain.customDomainVerificationLockedUntil.getTime() > now
        ? ('LOCKED' as const)
        : domain.customDomainChallengeExpiresAt
          ? domain.customDomainChallengeExpiresAt.getTime() > now
            ? ('PENDING' as const)
            : ('EXPIRED' as const)
          : ('UNVERIFIED' as const)
      : domain.customDomainVerifiedAt
        ? ('VERIFIED' as const)
        : ('NOT_CONFIGURED' as const),
    verifiedAt: domain.customDomainChallengeDomain ? null : domain.customDomainVerifiedAt,
    challengeExpiresAt: domain.customDomainChallengeExpiresAt,
    verificationAttempts: domain.customDomainVerificationAttempts,
    lockedUntil: domain.customDomainVerificationLockedUntil,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002';
}

/** WI-OI-109e1: once the primary tree has a version in force, units and grants are the one authority (ADR-0018 §4). */
async function assertDepartmentsEditable(db: Pick<typeof prisma, '$queryRaw'>, tenantId: string): Promise<void> {
  if (await primaryVersionInForce(db, tenantId))
    throw new ConflictException(
      "Departments are read-only: this workspace's organization is managed in Settings › Organization (units and access).",
    );
}

/**
 * A role change's reason, counted in characters as the database counts it. A reason outside 3 to 500 characters is
 * refused, never replaced (Security review of 2a, Info).
 */
function requireReason(value: string | undefined): string {
  const reason = (value ?? '').trim();
  const characters = [...reason].length;
  if (characters < 3 || characters > 500)
    throw new BadRequestException({ code: 'ROLE_CHANGE_REASON', message: 'Give a reason of 3 to 500 characters.' });
  return reason;
}

/** Two role changes for one workspace at once: the later is told to reload, never shown a server error. */
async function roleChangeConflicts<T>(change: () => Promise<T>): Promise<T> {
  try {
    return await change();
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (code === 'P2034' || code === 'P2002')
      throw new ConflictException({ code: 'ROLES_CHANGED', message: 'Roles changed at the same time; reload before retrying.' });
    throw error;
  }
}

/** The members holding a role: live role assignments, which include roles held besides the oldest (2a, L2). */
const ROLE_HOLDERS = { assignments: { where: { revokedAt: null } } } as const;

function withHolderCount<T extends { _count: { assignments: number } }>(role: T) {
  const { _count, ...rest } = role;
  return { ...rest, _count: { members: _count.assignments } };
}
