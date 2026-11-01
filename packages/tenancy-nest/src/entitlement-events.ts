import { randomUUID } from 'node:crypto';
import { TENANT_ENTITLEMENTS_CHANGED_V1, TENANT_ENTITLEMENTS_CHANGED_V2 } from '@gigalibs/contracts';
import type { Prisma } from '@gigalibs/db';

/**
 * WI-OI-120f (F0.2): the control outbox event from which the control plane activates the windows of a tenant's enabled
 * modules (`ModuleWindowBaselineService`, in its own transaction and with retries, as the actor recorded on each
 * entitlement). Written in the same transaction as every change to a tenant's enabled modules.
 *
 * WI-OI-131 (A4): also writes `tenant.entitlements.changed.v2` with a monotonic snapshot version for Analytics'
 * entitlement replica and module source registration.
 */
export async function recordEntitlementsChanged(
  transaction: Prisma.TransactionClient,
  tenantId: string,
  enabledModuleKeys: readonly string[],
) {
  const sortedEnabled = [...enabledModuleKeys].sort();
  await transaction.controlOutboxEvent.create({
    data: {
      eventId: randomUUID(),
      tenantId,
      aggregateType: 'tenant-module-entitlements',
      aggregateId: tenantId,
      eventType: TENANT_ENTITLEMENTS_CHANGED_V1,
      payload: { tenantId, enabledModuleKeys: sortedEnabled },
    },
  });

  const entitlements = await transaction.tenantModuleEntitlement.findMany({
    where: { tenantId },
    select: { moduleKey: true, status: true },
    orderBy: { moduleKey: 'asc' },
  });
  const snapshotVersion =
    (await transaction.controlOutboxEvent.count({
      where: { tenantId, eventType: TENANT_ENTITLEMENTS_CHANGED_V2 },
    })) + 1;

  await transaction.controlOutboxEvent.create({
    data: {
      eventId: randomUUID(),
      tenantId,
      aggregateType: 'tenant-module-entitlements',
      aggregateId: tenantId,
      eventType: TENANT_ENTITLEMENTS_CHANGED_V2,
      payload: {
        tenantId,
        snapshotVersion,
        enabledModuleKeys: sortedEnabled,
        modules: entitlements.map((row) => ({
          catalogModuleKey: row.moduleKey,
          status: row.status,
        })),
      },
    },
  });
}
