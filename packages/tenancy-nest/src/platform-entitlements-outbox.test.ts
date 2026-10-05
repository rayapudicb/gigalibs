import { afterEach, describe, expect, it, vi } from 'vitest';

// WI-OI-120f (F0.2): saving a tenant's licensed modules in Platform Control Tower writes, in the same transaction, the
// control outbox event from which the control plane activates the enabled modules' windows.
const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  tenant: { findUnique: vi.fn(), update: vi.fn() },
  tenantModuleEntitlement: { findMany: vi.fn(), upsert: vi.fn() },
  auditLog: { create: vi.fn() },
  controlOutboxEvent: { create: vi.fn() },
}));
const database = vi.hoisted(() => ({
  $transaction: vi.fn(async (operation: (client: unknown) => unknown) => operation(tx)),
}));
vi.mock('@gigalibs/db', () => ({ Prisma: {}, prisma: database }));

import { PlatformAdministrationService } from './platform-administration.service.js';

describe('licensed module update', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('writes tenant.entitlements.changed.v1 inside the entitlement transaction', async () => {
    tx.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', status: 'ACTIVE', trialEndsAt: null });
    tx.tenantModuleEntitlement.findMany.mockResolvedValue([]);
    const service = new PlatformAdministrationService();
    vi.spyOn(service, 'getTenant').mockResolvedValue({} as never);

    await service.updateEntitlements('tenant-1', { moduleKeys: ['universal-inventory'], reason: 'UAT: enable Inventory' }, 'admin-1');

    expect(tx.$queryRaw).toHaveBeenCalled(); // tenant row locked first
    expect(tx.tenantModuleEntitlement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_moduleKey: { tenantId: 'tenant-1', moduleKey: 'universal-inventory' } },
        update: expect.objectContaining({ status: 'ENABLED', updatedById: 'admin-1' }),
      }),
    );
    expect(tx.controlOutboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        aggregateType: 'tenant-module-entitlements',
        aggregateId: 'tenant-1',
        eventType: 'tenant.entitlements.changed.v1',
        payload: { tenantId: 'tenant-1', enabledModuleKeys: ['universal-inventory'] },
      }),
    });
  });
});
