import { createHash, randomBytes } from 'node:crypto';
import type {
  AcceptTenantInviteDto,
  ChangeTenantStatusDto,
  CreateCustomRoleDto,
  CreateTenantDomainChallengeDto,
  CreateTenantDto,
  CreateTenantInviteDto,
  UpdateCustomRoleDto,
  UpdateTenantMemberDto,
} from '@gigalibs/contracts';
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
        if (
          member.role === 'TENANT_ADMIN' &&
          member.status === 'ACTIVE' &&
          (nextRole !== 'TENANT_ADMIN' || nextStatus !== 'ACTIVE')
        ) {
          const otherAdmins = await transaction.tenantMember.count({
            where: {
              tenantId,
              id: { not: member.id },
              role: 'TENANT_ADMIN',
              status: 'ACTIVE',
            },
          });
          if (otherAdmins === 0) {
            throw new ConflictException('The last active tenant administrator cannot be changed');
          }
        }

        const changed = await transaction.tenantMember.updateMany({
          where: { id: member.id, tenantId, updatedAt: member.updatedAt },
          data: { role: nextRole, status: nextStatus, customRoleId: nextCustomRoleId },
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
            joinedAt: true,
            updatedAt: true,
            user: { select: { id: true, email: true, name: true, status: true } },
            customRole: {
              select: { id: true, name: true, color: true, permissions: true },
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
            },
            after: {
              role: updated.role,
              status: updated.status,
              customRoleId: updated.customRole?.id ?? null,
            },
            metadata: { reason: dto.reason },
          },
        });
        return updated;
      },
      { isolationLevel: 'Serializable' },
    );
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
