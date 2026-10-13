import { createHash, randomBytes } from 'node:crypto';
import type {
  PlatformCreateTenantDto,
  PlatformEntitlementUpdateDto,
  PlatformExternalIdentityMutationDto,
  PlatformIsolationRequestDto,
  PlatformIssuePasswordResetDto,
  PlatformRoleMutationDto,
  PlatformTenantStatusChangeDto,
  PlatformTrialExtensionDto,
  PlatformUserQueryDto,
  PlatformUserStatusChangeDto,
} from '@gigalibs/contracts';
import { type Prisma, prisma } from '@gigalibs/db';
import { recordEntitlementsChanged } from './entitlement-events.js';
import { PlatformSettingsEngine } from '@gigalibs/platform-settings';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  assertEligibleModuleKeys,
  configuredTenantBaseDomain,
  platformModuleCatalog,
  tenantSubdomain,
  trialModuleKeys,
} from './platform-module-catalog.js';

@Injectable()
export class PlatformAdministrationService {
  getCatalog() {
    return {
      modules: platformModuleCatalog,
      tenantBaseDomain: configuredTenantBaseDomain(),
      policy: {
        selfServiceTrialDays: 7,
        trialIncludes: 'ALL_TRIAL_ELIGIBLE_MODULES',
        automaticPaymentConversion: false,
        dedicatedDatabaseProvisioning: false,
        domainActivation: false,
      },
    };
  }

  async listTenants() {
    const tenants = await prisma.tenant.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: platformTenantSelection,
    });
    return tenants.map(presentPlatformTenant);
  }

  async getTenant(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: platformTenantSelection,
    });
    if (!tenant) throw new NotFoundException(`Tenant '${tenantId}' was not found.`);
    return presentPlatformTenant(tenant);
  }

  async listUsers(query: PlatformUserQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit,
        select: platformUserSelection,
      }),
      prisma.user.count({ where }),
    ]);
    return { data: users.map(presentPlatformUser), total, limit: query.limit };
  }

  async getUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: platformUserSelection,
    });
    if (!user) throw new NotFoundException(`User '${userId}' was not found.`);
    return presentPlatformUser(user);
  }

  async changeUserStatus(
    userId: string,
    dto: PlatformUserStatusChangeDto,
    actorUserId: string,
  ) {
    if (userId === actorUserId && dto.status !== 'ACTIVE') {
      throw new ConflictException('Use another platform owner to suspend or deactivate this account.');
    }
    await prisma.$transaction(async (transaction) => {
      await lockUser(transaction, userId);
      const user = await transaction.user.findUnique({
        where: { id: userId },
        include: { platformRoleAssignments: true },
      });
      if (!user) throw new NotFoundException(`User '${userId}' was not found.`);
      if (user.updatedAt.getTime() !== new Date(dto.expectedUpdatedAt).getTime()) {
        throw new ConflictException('User changed since it was loaded. Reload and try again.');
      }
      await this.requireOwnerForOperatorTarget(transaction, actorUserId, user.platformRoleAssignments);
      if (dto.status !== 'ACTIVE') {
        await this.assertAnotherActiveOwner(transaction, userId, user.platformRoleAssignments);
      }
      const updated = await transaction.user.update({
        where: { id: userId },
        data: { status: dto.status },
      });
      if (dto.status !== 'ACTIVE') {
        const now = new Date();
        await transaction.session.updateMany({
          where: { userId, status: 'ACTIVE' },
          data: { status: 'REVOKED', revokedAt: now },
        });
        await transaction.externalIdentity.updateMany({
          where: { userId, status: 'ACTIVE' },
          data: { status: 'REVOKED', revokedAt: now, statusReason: dto.reason },
        });
      }
      await transaction.auditLog.create({
        data: {
          action: 'STATUS_CHANGE',
          resource: 'platform_user',
          resourceId: userId,
          userId: actorUserId,
          before: { status: user.status },
          after: { status: updated.status },
          metadata: {
            reason: dto.reason,
            sessionsRevoked: dto.status !== 'ACTIVE',
            externalIdentitiesRevoked: dto.status !== 'ACTIVE',
          },
        },
      });
    });
    return this.getUser(userId);
  }

  async mutatePlatformRole(
    userId: string,
    dto: PlatformRoleMutationDto,
    actorUserId: string,
  ) {
    await prisma.$transaction(async (transaction) => {
      await lockUser(transaction, userId);
      const user = await transaction.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException(`User '${userId}' was not found.`);
      if (dto.enabled && user.status !== 'ACTIVE') {
        throw new ConflictException('Platform authority can be granted only to an active user.');
      }
      const current = await transaction.platformRoleAssignment.findUnique({
        where: { userId_role: { userId, role: dto.role } },
      });
      if (current && !dto.expectedUpdatedAt) {
        throw new ConflictException('Reload the current role assignment before changing it.');
      }
      if (
        current &&
        current.updatedAt.getTime() !== new Date(dto.expectedUpdatedAt as string).getTime()
      ) {
        throw new ConflictException('Role assignment changed since it was loaded.');
      }
      const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
      if (dto.enabled && expiresAt && expiresAt <= new Date()) {
        throw new BadRequestException('Role expiry must be in the future.');
      }
      if (!dto.enabled && dto.role === 'PLATFORM_OWNER' && current?.status === 'ACTIVE') {
        await this.assertAnotherActiveOwner(transaction, userId, [current]);
      }
      const assignment = dto.enabled
        ? await transaction.platformRoleAssignment.upsert({
            where: { userId_role: { userId, role: dto.role } },
            create: {
              userId,
              role: dto.role,
              reason: dto.reason,
              expiresAt,
              grantedById: actorUserId,
            },
            update: {
              status: 'ACTIVE',
              reason: dto.reason,
              expiresAt,
              revokedAt: null,
              grantedById: actorUserId,
            },
          })
        : current
          ? await transaction.platformRoleAssignment.update({
              where: { id: current.id },
              data: { status: 'REVOKED', revokedAt: new Date(), reason: dto.reason },
            })
          : null;
      if (!assignment) throw new NotFoundException(`The ${dto.role} assignment does not exist.`);
      await transaction.auditLog.create({
        data: {
          action: 'PERMISSION_CHANGE',
          resource: 'platform_role_assignment',
          resourceId: assignment.id,
          userId: actorUserId,
          ...(current
            ? { before: { role: current.role, status: current.status, expiresAt: current.expiresAt } }
            : {}),
          after: {
            role: assignment.role,
            status: assignment.status,
            expiresAt: assignment.expiresAt,
          },
          metadata: { reason: dto.reason, subjectUserId: userId },
        },
      });
    });
    return this.getUser(userId);
  }

  async issuePasswordReset(
    userId: string,
    dto: PlatformIssuePasswordResetDto,
    actorUserId: string,
  ) {
    const token = randomBytes(32).toString('base64url');
    const tokenDigest = createHash('sha256').update(token, 'utf8').digest('hex');
    const expiresAt = new Date(Date.now() + dto.expiresInMinutes * 60 * 1_000);
    const credential = await prisma.$transaction(async (transaction) => {
      await lockUser(transaction, userId);
      const user = await transaction.user.findUnique({
        where: { id: userId },
        include: { platformRoleAssignments: true },
      });
      if (!user) throw new NotFoundException(`User '${userId}' was not found.`);
      if (user.status === 'DEACTIVATED') {
        throw new ConflictException('A deactivated identity must be restored before password recovery.');
      }
      await this.requireOwnerForOperatorTarget(transaction, actorUserId, user.platformRoleAssignments);
      const now = new Date();
      await transaction.passwordResetCredential.updateMany({
        where: { userId, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      const created = await transaction.passwordResetCredential.create({
        data: { userId, requestedById: actorUserId, tokenDigest, reason: dto.reason, expiresAt },
      });
      await transaction.auditLog.create({
        data: {
          action: 'CREATE',
          resource: 'password_reset_credential',
          resourceId: created.id,
          userId: actorUserId,
          metadata: {
            event: 'ASSISTED_RESET_ISSUED',
            subjectUserId: userId,
            expiresAt,
            delivery: 'MANUAL_SECURE_LINK',
            reason: dto.reason,
          },
        },
      });
      return created;
    });
    return {
      token,
      resetPath: `/reset-password?token=${encodeURIComponent(token)}`,
      expiresAt: credential.expiresAt,
      delivery: 'DISPLAY_ONCE' as const,
    };
  }

  async mutateExternalIdentity(
    userId: string,
    identityId: string,
    dto: PlatformExternalIdentityMutationDto,
    actorUserId: string,
  ) {
    await prisma.$transaction(async (transaction) => {
      await lockUser(transaction, userId);
      const user = await transaction.user.findUnique({
        where: { id: userId },
        include: { platformRoleAssignments: true },
      });
      if (!user) throw new NotFoundException(`User '${userId}' was not found.`);
      await this.requireOwnerForOperatorTarget(transaction, actorUserId, user.platformRoleAssignments);

      const identity = await transaction.externalIdentity.findFirst({
        where: { id: identityId, userId },
        include: { configuration: { select: { issuer: true, tenantId: true } } },
      });
      if (!identity) {
        throw new NotFoundException(`External identity '${identityId}' was not found for this user.`);
      }
      if (identity.updatedAt.getTime() !== new Date(dto.expectedUpdatedAt).getTime()) {
        throw new ConflictException('External identity changed since it was loaded. Reload and try again.');
      }
      if (dto.enabled && user.status !== 'ACTIVE') {
        throw new ConflictException('Restore the user before reactivating an external identity.');
      }
      if (dto.enabled && identity.issuer !== identity.configuration.issuer) {
        throw new ConflictException(
          'This binding belongs to an earlier issuer and must be linked again through validated OIDC.',
        );
      }

      const status = dto.enabled ? 'ACTIVE' : 'REVOKED';
      const changedAt = new Date();
      const updated = await transaction.externalIdentity.update({
        where: { id: identity.id },
        data: {
          status,
          statusReason: dto.reason,
          revokedAt: dto.enabled ? null : changedAt,
        },
      });
      let sessionsRevoked = false;
      if (!dto.enabled) {
        const revoked = await transaction.session.updateMany({
          where: { userId, status: 'ACTIVE' },
          data: { status: 'REVOKED', revokedAt: changedAt },
        });
        sessionsRevoked = revoked.count > 0;
      }
      await transaction.auditLog.create({
        data: {
          action: 'STATUS_CHANGE',
          resource: 'external_identity',
          resourceId: identity.id,
          userId: actorUserId,
          tenantId: identity.configuration.tenantId,
          before: { status: identity.status, revokedAt: identity.revokedAt },
          after: { status: updated.status, revokedAt: updated.revokedAt },
          metadata: {
            event: dto.enabled ? 'BINDING_REACTIVATED' : 'BINDING_REVOKED',
            reason: dto.reason,
            subjectUserId: userId,
            issuer: identity.issuer,
            sessionsRevoked,
          },
        },
      });
    });
    return this.getUser(userId);
  }

  async createTenant(dto: PlatformCreateTenantDto, actorUserId: string) {
    const moduleKeys = this.eligibleModuleKeys(
      dto.moduleKeys.length > 0 ? dto.moduleKeys : trialModuleKeys,
    );
    const ownerEmail = dto.ownerEmail.trim().toLowerCase();
    const [existing, owner] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: dto.slug }, select: { id: true } }),
      prisma.user.findUnique({
        where: { email: ownerEmail },
        select: { id: true, status: true },
      }),
    ]);
    if (existing) throw new ConflictException(`Tenant slug '${dto.slug}' is already in use.`);
    if (!owner || owner.status !== 'ACTIVE') {
      throw new BadRequestException(
        'The owner must first register an active GigaLibs account with this email.',
      );
    }

    const trialEndsAt = addDays(new Date(), dto.trialDays);
    const hostname = tenantSubdomain(dto.slug);
    let tenantId: string;
    try {
      tenantId = await prisma.$transaction(async (transaction) => {
        const tenant = await transaction.tenant.create({
          data: {
            name: dto.name,
            slug: dto.slug,
            status: 'TRIAL',
            plan: 'TRIAL',
            trialEndsAt,
            provisionedAt: new Date(),
            isolationMode: dto.isolationMode,
            region: dto.region,
            features: moduleKeys,
          },
        });
        await transaction.tenantMember.create({
          data: {
            tenantId: tenant.id,
            userId: owner.id,
            role: 'TENANT_ADMIN',
            status: 'ACTIVE',
          },
        });
        const defaults = PlatformSettingsEngine.createDefaults(tenant.id);
        await transaction.tenantSettings.create({
          data: {
            tenantId: tenant.id,
            version: defaults.version,
            branding: defaults.branding as Prisma.InputJsonValue,
            security: defaults.security as Prisma.InputJsonValue,
            localization: defaults.localization as Prisma.InputJsonValue,
            features: defaults.features as Prisma.InputJsonValue,
            metadata: defaults.metadata as Prisma.InputJsonValue,
            updatedById: actorUserId,
          },
        });
        await transaction.tenantModuleEntitlement.createMany({
          data: moduleKeys.map((moduleKey) => ({
            tenantId: tenant.id,
            moduleKey,
            status: 'ENABLED',
            source: 'TRIAL',
            endsAt: trialEndsAt,
            reason: dto.reason,
            updatedById: actorUserId,
          })),
        });
        // The trial modules' windows are activated from this event, as for any later change of modules.
        await recordEntitlementsChanged(transaction, tenant.id, moduleKeys);
        await transaction.tenantIsolationBinding.create({
          data: {
            tenantId: tenant.id,
            requestedMode: dto.isolationMode,
            status: 'REQUESTED',
            region: dto.region,
            requestedById: actorUserId,
            reason: dto.reason,
          },
        });
        if (hostname) {
          await transaction.tenantSubdomainBinding.create({
            data: {
              tenantId: tenant.id,
              hostname,
              status: 'RESERVED',
              requestedById: actorUserId,
              reason: dto.reason,
            },
          });
        }
        await transaction.auditLog.create({
          data: {
            action: 'PROVISION',
            resource: 'platform_tenant',
            resourceId: tenant.id,
            userId: actorUserId,
            tenantId: tenant.id,
            after: {
              status: 'TRIAL',
              trialEndsAt,
              ownerUserId: owner.id,
              moduleKeys,
              requestedIsolationMode: dto.isolationMode,
              subdomain: hostname,
            },
            metadata: {
              reason: dto.reason,
              dataPlaneProvisioned: false,
              subdomainActivated: false,
            },
          },
        });
        return tenant.id;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('The tenant slug or reserved subdomain is already in use.');
      }
      throw error;
    }
    return this.getTenant(tenantId);
  }

  async changeStatus(tenantId: string, dto: PlatformTenantStatusChangeDto, actorUserId: string) {
    await prisma.$transaction(async (transaction) => {
      await lockTenant(transaction, tenantId);
      const tenant = await transaction.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundException(`Tenant '${tenantId}' was not found.`);
      if (tenant.status === 'CANCELLED' && dto.status !== 'CANCELLED') {
        throw new ConflictException('A cancelled tenant requires a separate restoration process.');
      }
      const updated = await transaction.tenant.update({
        where: { id: tenantId },
        data: {
          status: dto.status,
          ...(dto.plan !== undefined ? { plan: dto.plan } : {}),
          ...(dto.status === 'ACTIVE' && !tenant.provisionedAt
            ? { provisionedAt: new Date() }
            : {}),
        },
      });
      if (dto.status === 'ACTIVE') {
        await transaction.tenantModuleEntitlement.updateMany({
          where: { tenantId, status: 'ENABLED' },
          data: {
            source: 'PLATFORM_OVERRIDE',
            endsAt: null,
            updatedById: actorUserId,
            reason: dto.reason,
          },
        });
      }
      if (dto.status === 'SUSPENDED' || dto.status === 'CANCELLED') {
        await transaction.session.updateMany({
          where: { tenantId, status: 'ACTIVE' },
          data: { status: 'REVOKED', revokedAt: new Date() },
        });
      }
      await transaction.auditLog.create({
        data: {
          action: 'STATUS_CHANGE',
          resource: 'platform_tenant',
          resourceId: tenantId,
          userId: actorUserId,
          tenantId,
          before: { status: tenant.status, plan: tenant.plan },
          after: { status: updated.status, plan: updated.plan },
          metadata: {
            reason: dto.reason,
            activationBasis: dto.billingReference ? 'BILLING_REFERENCE' : 'PLATFORM_OVERRIDE',
            ...(dto.billingReference ? { billingReference: dto.billingReference } : {}),
          },
        },
      });
    });
    return this.getTenant(tenantId);
  }

  async extendTrial(tenantId: string, dto: PlatformTrialExtensionDto, actorUserId: string) {
    await prisma.$transaction(async (transaction) => {
      await lockTenant(transaction, tenantId);
      const tenant = await transaction.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundException(`Tenant '${tenantId}' was not found.`);
      if (tenant.status === 'CANCELLED') {
        throw new ConflictException('A cancelled tenant cannot receive a trial extension.');
      }
      const previousEnd = tenant.trialEndsAt;
      const base = previousEnd && previousEnd > new Date() ? previousEnd : new Date();
      const trialEndsAt = addDays(base, dto.days);
      await transaction.tenant.update({
        where: { id: tenantId },
        data: { status: 'TRIAL', plan: 'TRIAL', trialEndsAt },
      });
      await transaction.tenantModuleEntitlement.updateMany({
        where: { tenantId, source: 'TRIAL' },
        data: {
          status: 'ENABLED',
          endsAt: trialEndsAt,
          updatedById: actorUserId,
          reason: dto.reason,
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'STATUS_CHANGE',
          resource: 'tenant_trial',
          resourceId: tenantId,
          userId: actorUserId,
          tenantId,
          before: { status: tenant.status, trialEndsAt: previousEnd },
          after: { status: 'TRIAL', trialEndsAt },
          metadata: { reason: dto.reason, days: dto.days },
        },
      });
    });
    return this.getTenant(tenantId);
  }

  async updateEntitlements(
    tenantId: string,
    dto: PlatformEntitlementUpdateDto,
    actorUserId: string,
  ) {
    const moduleKeys = this.eligibleModuleKeys(dto.moduleKeys);
    await prisma.$transaction(async (transaction) => {
      await lockTenant(transaction, tenantId);
      const tenant = await transaction.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundException(`Tenant '${tenantId}' was not found.`);
      const current = await transaction.tenantModuleEntitlement.findMany({
        where: { tenantId },
        select: { moduleKey: true, status: true },
      });
      const selected = new Set(moduleKeys);
      const allEligible = platformModuleCatalog
        .filter((module) => module.entitlementEligible)
        .map((module) => module.key);
      const source = tenant.status === 'TRIAL' ? 'TRIAL' : 'PLATFORM_OVERRIDE';
      for (const moduleKey of allEligible) {
        await transaction.tenantModuleEntitlement.upsert({
          where: { tenantId_moduleKey: { tenantId, moduleKey } },
          create: {
            tenantId,
            moduleKey,
            status: selected.has(moduleKey) ? 'ENABLED' : 'DISABLED',
            source,
            endsAt: tenant.status === 'TRIAL' ? tenant.trialEndsAt : null,
            reason: dto.reason,
            updatedById: actorUserId,
          },
          update: {
            status: selected.has(moduleKey) ? 'ENABLED' : 'DISABLED',
            source,
            endsAt: tenant.status === 'TRIAL' ? tenant.trialEndsAt : null,
            reason: dto.reason,
            updatedById: actorUserId,
          },
        });
      }
      await transaction.tenant.update({ where: { id: tenantId }, data: { features: moduleKeys } });
      await transaction.auditLog.create({
        data: {
          action: 'PERMISSION_CHANGE',
          resource: 'tenant_module_entitlement',
          resourceId: tenantId,
          userId: actorUserId,
          tenantId,
          before: {
            moduleKeys: current
              .filter((entitlement) => entitlement.status === 'ENABLED')
              .map((entitlement) => entitlement.moduleKey),
          },
          after: { moduleKeys },
          metadata: { reason: dto.reason, source },
        },
      });
      // WI-OI-120f (F0.2): the control plane activates the windows of newly enabled modules from this event, in its
      // own transaction and with retries, as the administrator recorded on each entitlement.
      await recordEntitlementsChanged(transaction, tenantId, moduleKeys);
    });
    return this.getTenant(tenantId);
  }

  async requestIsolation(tenantId: string, dto: PlatformIsolationRequestDto, actorUserId: string) {
    await prisma.$transaction(async (transaction) => {
      await lockTenant(transaction, tenantId);
      const tenant = await transaction.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundException(`Tenant '${tenantId}' was not found.`);
      const previous = await transaction.tenantIsolationBinding.findUnique({
        where: { tenantId },
      });
      await transaction.tenantIsolationBinding.upsert({
        where: { tenantId },
        create: {
          tenantId,
          requestedMode: dto.isolationMode,
          status: 'REQUESTED',
          region: dto.region,
          requestedById: actorUserId,
          reason: dto.reason,
        },
        update: {
          requestedMode: dto.isolationMode,
          effectiveMode: null,
          status: 'REQUESTED',
          region: dto.region,
          bindingReference: null,
          failureCode: null,
          failureMessage: null,
          requestedById: actorUserId,
          reason: dto.reason,
          readyAt: null,
        },
      });
      await transaction.tenant.update({
        where: { id: tenantId },
        data: { isolationMode: dto.isolationMode, region: dto.region },
      });
      await transaction.auditLog.create({
        data: {
          action: 'PROVISION',
          resource: 'tenant_isolation_binding',
          resourceId: tenantId,
          userId: actorUserId,
          tenantId,
          ...(previous
            ? {
                before: {
                  requestedMode: previous.requestedMode,
                  region: previous.region,
                  status: previous.status,
                },
              }
            : {}),
          after: { requestedMode: dto.isolationMode, region: dto.region, status: 'REQUESTED' },
          metadata: { reason: dto.reason, providerDispatched: false },
        },
      });
    });
    return this.getTenant(tenantId);
  }

  private eligibleModuleKeys(moduleKeys: readonly string[]): string[] {
    try {
      return assertEligibleModuleKeys(moduleKeys);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid module list');
    }
  }

  private async requireOwnerForOperatorTarget(
    transaction: Prisma.TransactionClient,
    actorUserId: string,
    targetAssignments: Array<{ role: string; status: string; expiresAt: Date | null }>,
  ) {
    const targetIsOperator = targetAssignments.some(
      (assignment) =>
        assignment.status === 'ACTIVE' &&
        (!assignment.expiresAt || assignment.expiresAt > new Date()),
    );
    if (!targetIsOperator) return;
    const actorIsOwner = await transaction.platformRoleAssignment.count({
      where: {
        userId: actorUserId,
        role: 'PLATFORM_OWNER',
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (actorIsOwner === 0) {
      throw new ForbiddenException('Only a platform owner may administer another platform operator.');
    }
  }

  private async assertAnotherActiveOwner(
    transaction: Prisma.TransactionClient,
    subjectUserId: string,
    assignments: Array<{ role: string; status: string; expiresAt: Date | null }>,
  ) {
    const subjectIsActiveOwner = assignments.some(
      (assignment) =>
        assignment.role === 'PLATFORM_OWNER' &&
        assignment.status === 'ACTIVE' &&
        (!assignment.expiresAt || assignment.expiresAt > new Date()),
    );
    if (!subjectIsActiveOwner) return;
    const otherOwners = await transaction.platformRoleAssignment.count({
      where: {
        userId: { not: subjectUserId },
        role: 'PLATFORM_OWNER',
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        user: { status: 'ACTIVE' },
      },
    });
    if (otherOwners === 0) {
      throw new ConflictException('The last active platform owner cannot be removed or disabled.');
    }
  }
}

const platformTenantSelection = {
  id: true,
  slug: true,
  name: true,
  status: true,
  isolationMode: true,
  region: true,
  plan: true,
  trialEndsAt: true,
  provisionedAt: true,
  createdAt: true,
  updatedAt: true,
  members: {
    where: { status: 'ACTIVE', role: { in: ['SUPER_ADMIN', 'TENANT_ADMIN'] } },
    orderBy: { joinedAt: 'asc' },
    take: 1,
    select: { user: { select: { id: true, email: true, name: true } }, role: true },
  },
  moduleEntitlements: {
    orderBy: { moduleKey: 'asc' },
    select: {
      moduleKey: true,
      status: true,
      source: true,
      startsAt: true,
      endsAt: true,
      updatedAt: true,
    },
  },
  isolationBinding: {
    select: {
      requestedMode: true,
      effectiveMode: true,
      status: true,
      region: true,
      bindingReference: true,
      failureCode: true,
      failureMessage: true,
      readyAt: true,
      updatedAt: true,
    },
  },
  subdomainBinding: {
    select: {
      hostname: true,
      status: true,
      verificationRef: true,
      failureCode: true,
      failureMessage: true,
      activatedAt: true,
      updatedAt: true,
    },
  },
  _count: { select: { members: true } },
} satisfies Prisma.TenantSelect;

const platformUserSelection = {
  id: true,
  email: true,
  name: true,
  phone: true,
  status: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  passwordHash: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  memberships: {
    orderBy: { joinedAt: 'desc' },
    select: {
      id: true,
      role: true,
      status: true,
      updatedAt: true,
      tenant: { select: { id: true, name: true, slug: true, status: true, plan: true } },
    },
  },
  platformRoleAssignments: {
    orderBy: { role: 'asc' },
    select: {
      id: true,
      role: true,
      status: true,
      reason: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  externalIdentities: {
    orderBy: [{ status: 'asc' }, { lastLoginAt: 'desc' }],
    select: {
      id: true,
      issuer: true,
      status: true,
      statusReason: true,
      lastLoginAt: true,
      revokedAt: true,
      createdAt: true,
      updatedAt: true,
      configuration: {
        select: { tenant: { select: { id: true, name: true, slug: true } } },
      },
    },
  },
  _count: { select: { sessions: true, externalIdentities: true } },
} satisfies Prisma.UserSelect;

function presentPlatformUser<T extends { passwordHash: string | null }>(user: T) {
  const { passwordHash, ...safe } = user;
  return { ...safe, hasLocalPassword: !!passwordHash };
}

function presentPlatformTenant<T extends { members: unknown[]; trialEndsAt: Date | null }>(
  tenant: T,
) {
  const { members, ...rest } = tenant;
  return {
    ...rest,
    owner: members[0] ?? null,
    trialExpired: !!tenant.trialEndsAt && tenant.trialEndsAt.getTime() <= Date.now(),
  };
}

async function lockTenant(transaction: Prisma.TransactionClient, tenantId: string) {
  await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
}

async function lockUser(transaction: Prisma.TransactionClient, userId: string) {
  await transaction.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1_000);
}

function isUniqueConstraintError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002';
}
