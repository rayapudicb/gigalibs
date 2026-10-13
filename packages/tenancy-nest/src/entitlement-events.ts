import { randomUUID } from 'node:crypto';
import type { Prisma } from '@gigalibs/db';

/**
 * WI-OI-120f (F0.2): the control outbox event from which the control plane activates the windows of a tenant's enabled
 * modules (`ModuleWindowBaselineService`, in its own transaction and with retries, as the actor recorded on each
 * entitlement). Written in the same transaction as every change to a tenant's enabled modules.
 *
 * WI-OI-120u journey (2026-10-13): creating a workspace enables its trial modules too, and wrote no event, so a new
 * workspace had no module windows until the next API start. Both creation paths now write it as well.
 */
export function recordEntitlementsChanged(
  transaction: Prisma.TransactionClient,
  tenantId: string,
  enabledModuleKeys: readonly string[],
) {
  return transaction.controlOutboxEvent.create({
    data: {
      eventId: randomUUID(),
      tenantId,
      aggregateType: 'tenant-module-entitlements',
      aggregateId: tenantId,
      eventType: 'tenant.entitlements.changed.v1',
      payload: { tenantId, enabledModuleKeys: [...enabledModuleKeys] },
    },
  });
}
