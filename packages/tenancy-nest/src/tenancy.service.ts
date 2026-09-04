import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, type Prisma } from '@gigalibs/db';
import type { ChangeTenantStatusDto, CreateTenantDto } from '@gigalibs/contracts';
import { PlatformSettingsEngine } from '@gigalibs/platform-settings';

@Injectable()
export class TenancyService {
  async createTenant(dto: CreateTenantDto, ownerUserId: string) {
    const existing = await prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new BadRequestException(`Tenant with slug '${dto.slug}' already exists`);
    }

    return prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          plan: dto.plan ?? 'FREE',
          status: 'PROVISIONING',
          isolationMode: dto.isolationMode,
          region: dto.region,
          ...(dto.customDomain !== undefined ? { customDomain: dto.customDomain } : {}),
        },
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
            isolationMode: tenant.isolationMode,
            region: tenant.region,
          },
          metadata: { provisioningState: 'REQUESTED' },
        },
      });

      return tenant;
    });
  }

  async listForUser(userId: string) {
    const memberships = await prisma.tenantMember.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { tenant: true },
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
      include: {
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
      include: { tenant: true },
    });
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException('You are not an active member of this tenant.');
    }
    return { ...membership.tenant, membershipRole: membership.role };
  }

  async changeStatus(tenantId: string, userId: string, dto: ChangeTenantStatusDto) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant '${tenantId}' was not found.`);

    return prisma.$transaction(async (transaction) => {
      const updated = await transaction.tenant.update({
        where: { id: tenantId },
        data: {
          status: dto.status,
          provisionedAt:
            dto.status === 'ACTIVE' && !tenant.provisionedAt ? new Date() : tenant.provisionedAt,
        },
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
}
