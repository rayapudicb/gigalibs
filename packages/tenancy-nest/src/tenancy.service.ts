import { createHash, randomBytes } from 'node:crypto';
import type {
  AcceptTenantInviteDto,
  ChangeTenantStatusDto,
  CreateCustomRoleDto,
  CreateDepartmentDto,
  CreateTenantDomainChallengeDto,
  CreateTenantDto,
  CreateTenantInviteDto,
  UpdateCustomRoleDto,
  UpdateDepartmentDto,
  UpdateTenantMemberDto,
  UpdateTenantOrganizationSettingsDto,
} from '@gigalibs/contracts';
import { type ModuleDefaultRole, moduleDefaultRoles } from '@gigalibs/contracts';
import { primaryVersionInForce } from '@gigalibs/auth-nest';
import { type Prisma, prisma } from '@gigalibs/db';
import { PlatformSettingsEngine } from '@gigalibs/platform-settings';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  domainVerificationDigest,
  domainVerificationRecordName,
  normalizeTenantDomain,
  resolveDomainVerification,
} from './domain-verification.js';
import { tenantSubdomain, trialModuleKeys } from './platform-module-catalog.js';
import { assertTenantAdministratorRetained } from './tenant-member-safety.js';

@Injectable()
export class TenancyService {
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
      },
    });
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
        _count: { select: { members: true } },
      },
    });
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
          },
        },
      });
      return { ...role, _count: { members: 0 } };
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

      const changed = await transaction.customRole.updateMany({
        where: { id: role.id, tenantId, updatedAt: role.updatedAt, isSystem: false },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
          ...(dto.permissions !== undefined ? { permissions: dto.permissions } : {}),
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Custom role changed; reload before retrying');
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
          _count: { select: { members: true } },
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
          },
          after: {
            name: updated.name,
            description: updated.description,
            color: updated.color,
            permissions: updated.permissions,
          },
          metadata: { reason: dto.reason },
        },
      });
      return updated;
    });
  }

  async deleteCustomRole(tenantId: string, roleId: string, deletedById: string, reason: string) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
      const role = await transaction.customRole.findFirst({
        where: { id: roleId, tenantId },
        include: { _count: { select: { members: true } } },
      });
      if (!role) throw new NotFoundException('Custom role was not found');
      if (role.isSystem) throw new ConflictException('System roles cannot be deleted');
      if (role._count.members > 0) {
        throw new ConflictException('Remove this custom role from all members before deleting it');
      }
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
            customRoleId: true,
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
        const nextCustomRoleId =
          dto.customRoleId !== undefined ? dto.customRoleId : member.customRoleId;
        if (nextCustomRoleId) {
          const customRole = await transaction.customRole.findFirst({
            where: { id: nextCustomRoleId, tenantId },
            select: { id: true },
          });
          if (!customRole)
            throw new BadRequestException('Custom role does not belong to this tenant');
        }

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

        await assertTenantAdministratorRetained(transaction, tenantId, member, { role: nextRole, status: nextStatus });

        const changed = await transaction.tenantMember.updateMany({
          where: { id: member.id, tenantId, updatedAt: member.updatedAt },
          data: {
            role: nextRole,
            status: nextStatus,
            customRoleId: nextCustomRoleId,
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
              customRoleId: member.customRoleId,
              departmentId: member.departmentId,
              employmentType: member.employmentType,
              spatialScopePlaceIds: member.spatialScopePlaceIds,
            },
            after: {
              role: updated.role,
              status: updated.status,
              customRoleId: updated.customRole?.id ?? null,
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
