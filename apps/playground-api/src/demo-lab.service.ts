import { randomBytes } from 'node:crypto';
import { bundledGovernedCatalogue } from '@gigalibs/configuration-core';
import { SHIPPED_COUNTRY_PACKS, SHIPPED_INDUSTRY_PACKS, type CreateDemoLabTenantDto, type DeleteDemoLabTenantDto } from '@gigalibs/contracts';
import { prisma } from '@gigalibs/db';
import { PlatformAdministrationService } from '@gigalibs/tenancy-nest';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigurationStudioService } from './configuration-studio.service.js';

export const DEMO_LAB_FEATURE = 'demo-lab';

/**
 * WI-OI-064e Demo Lab (FR-13): isolated, labelled tenants with synthetic data only. Creation reuses platform tenant
 * provisioning and activates the operations metrics plus the chosen industry and country packs; synthetic facts
 * are generated inside the demo tenant through the web BFF. Only tenants carrying `demo-lab` can be deleted here.
 */
@Injectable()
export class DemoLabService {
  constructor(
    private readonly platform: PlatformAdministrationService,
    private readonly configuration: ConfigurationStudioService,
  ) {}

  catalogues() {
    return {
      // WI-OI-107: the packs shipped at the solution layer that carry a Demo Lab profile.
      industries: SHIPPED_INDUSTRY_PACKS.flatMap((pack) =>
        pack.demo
          ? [{
              slug: pack.slug,
              label: pack.label,
              emoji: pack.emoji ?? null,
              placeTypes: pack.modules.geospatial?.lists?.placeTypes ?? [],
              demoProfile: pack.demo,
            }]
          : [],
      ),
      countries: SHIPPED_COUNTRY_PACKS.map((pack) => ({
        code: pack.code.toLowerCase(),
        label: pack.label,
        currency: pack.currency,
      })),
    };
  }

  async list() {
    const tenants = await prisma.tenant.findMany({
      where: { features: { has: DEMO_LAB_FEATURE }, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, slug: true, name: true, status: true, createdAt: true, trialEndsAt: true },
    });
    return { items: tenants };
  }

  async create(actorId: string, dto: CreateDemoLabTenantDto) {
    const industry = bundledGovernedCatalogue('INDUSTRY_PACK', dto.industry);
    const country = bundledGovernedCatalogue('COUNTRY_PACK', dto.country);
    if (!industry || !country) throw new NotFoundException('Choose a shipped industry pack and country pack.');
    const actor = await prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { email: true } });
    const slug = `demo-${dto.industry}-${dto.country}-${randomBytes(3).toString('hex')}`.slice(0, 63);
    const tenant = await this.platform.createTenant(
      {
        name: `Demo Lab — ${industry.title} (${country.title})`.slice(0, 100),
        slug,
        ownerEmail: actor.email,
        trialDays: 90,
        isolationMode: 'ROW_LEVEL_SECURITY',
        region: 'local',
        moduleKeys: ['analytics-studio', 'gigaops'],
        reason: dto.reason,
      },
      actorId,
    );
    await prisma.$transaction([
      prisma.tenant.update({ where: { id: tenant.id }, data: { features: { push: DEMO_LAB_FEATURE } } }),
      prisma.auditLog.create({
        data: {
          action: 'SETTINGS_CHANGE',
          resource: 'demo-lab-tenant',
          resourceId: tenant.id,
          userId: actorId,
          tenantId: tenant.id,
          after: { feature: DEMO_LAB_FEATURE, industry: dto.industry, country: dto.country },
          metadata: { reason: dto.reason, synthetic: true },
        },
      }),
    ]);
    for (const [kind, key] of [
      ['METRIC_CATALOGUE', 'operations'],
      ['INDUSTRY_PACK', dto.industry],
      ['COUNTRY_PACK', dto.country],
    ] as const) {
      await this.configuration.provisionDemoCatalogue(tenant.id, actorId, kind, key);
    }
    return { id: tenant.id, slug, name: tenant.name, industry: dto.industry, country: dto.country };
  }

  /**
   * Decommissions a Demo Lab tenant. Audit records are append-only by trigger, so no audited tenant can be hard
   * deleted; instead the workspace is closed (CANCELLED), its memberships removed, sessions revoked and
   * entitlements disabled, after the web BFF has purged its synthetic Analytics data. The tenant row and its audit
   * trail remain as evidence. Tenant erasure for all tenants is a data-retention capability (registered).
   */
  async remove(actorId: string, tenantId: string, dto: DeleteDemoLabTenantDto) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, slug: true, features: true, status: true },
    });
    if (!tenant || !tenant.features.includes(DEMO_LAB_FEATURE) || tenant.status === 'CANCELLED') {
      throw new NotFoundException('Demo Lab tenant was not found.');
    }
    const now = new Date();
    const [, members, sessions, entitlements] = await prisma.$transaction([
      prisma.tenant.update({ where: { id: tenant.id }, data: { status: 'CANCELLED' } }),
      prisma.tenantMember.deleteMany({ where: { tenantId: tenant.id } }),
      prisma.session.updateMany({ where: { tenantId: tenant.id, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: now } }),
      prisma.tenantModuleEntitlement.updateMany({ where: { tenantId: tenant.id, status: 'ENABLED' }, data: { status: 'DISABLED', updatedById: actorId, reason: dto.reason } }),
      prisma.auditLog.create({
        data: {
          action: 'DELETE',
          resource: 'demo-lab-tenant',
          resourceId: tenant.id,
          userId: actorId,
          tenantId: tenant.id,
          before: { slug: tenant.slug, status: tenant.status },
          after: { status: 'CANCELLED', decommissioned: true },
          metadata: { reason: dto.reason, synthetic: true },
        },
      }),
    ]);
    return {
      decommissioned: true,
      id: tenant.id,
      slug: tenant.slug,
      membersRemoved: members.count,
      sessionsRevoked: sessions.count,
      entitlementsDisabled: entitlements.count,
    };
  }
}
