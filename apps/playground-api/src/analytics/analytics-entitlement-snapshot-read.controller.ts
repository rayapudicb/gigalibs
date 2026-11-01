import { TENANT_ENTITLEMENTS_CHANGED_V2 } from '@gigalibs/contracts';
import { prisma } from '@gigalibs/db';
import { Controller, Get, Headers, NotFoundException, Param, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

/**
 * WI-OI-131 B7: Analytics pulls authoritative entitlement snapshots when relay events were missed.
 */
@Controller('internal/v1/analytics')
export class AnalyticsEntitlementSnapshotReadController {
  @Get('tenant-entitlements/:tenantId')
  async readSnapshot(
    @Param('tenantId') tenantId: string,
    @Headers('x-analytics-reconcile-token') token: string | undefined,
  ) {
    const expected = process.env.ANALYTICS_ENTITLEMENT_RECONCILE_TOKEN?.trim();
    if (!expected || !token || !safeEqual(token.trim(), expected)) {
      throw new UnauthorizedException('Reconciliation token is invalid.');
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw new NotFoundException('Tenant was not found.');

    const entitlements = await prisma.tenantModuleEntitlement.findMany({
      where: { tenantId },
      select: { moduleKey: true, status: true },
      orderBy: { moduleKey: 'asc' },
    });
    const enabledModuleKeys = entitlements.filter((row) => row.status === 'ENABLED').map((row) => row.moduleKey);
    const snapshotVersion = await prisma.controlOutboxEvent.count({
      where: { tenantId, eventType: TENANT_ENTITLEMENTS_CHANGED_V2 },
    });
    const payload = {
      tenantId,
      snapshotVersion,
      enabledModuleKeys: [...enabledModuleKeys].sort(),
      modules: entitlements.map((row) => ({
        catalogModuleKey: row.moduleKey,
        status: row.status,
      })),
    };
    return { tenantId, snapshotVersion, payload };
  }
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
