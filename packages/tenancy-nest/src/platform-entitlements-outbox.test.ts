import { afterEach, describe, expect, it, vi } from 'vitest';

// WI-OI-120f (F0.2): saving a tenant's licensed modules in Platform Control Tower writes, in the same transaction, the
// control outbox event from which the control plane activates the enabled modules' windows.
const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  tenant: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  tenantMember: { create: vi.fn() },
  tenantSettings: { create: vi.fn() },
  tenantModuleEntitlement: { findMany: vi.fn(), upsert: vi.fn(), createMany: vi.fn() },
  tenantIsolationBinding: { create: vi.fn() },
  tenantSubdomainBinding: { create: vi.fn() },
  auditLog: { create: vi.fn() },
  controlOutboxEvent: { create: vi.fn() },
}));
const database = vi.hoisted(() => ({
  $transaction: vi.fn(async (operation: (client: unknown) => unknown) => operation(tx)),
  tenant: { findUnique: vi.fn() },
  tenantMember: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
}));
vi.mock('@gigalibs/db', () => ({ Prisma: {}, prisma: database }));

import { PlatformAdministrationService } from './platform-administration.service.js';
import { trialModuleKeys } from './platform-module-catalog.js';
import { TenancyService } from './tenancy.service.js';

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

    await service.updateEntitlements(
      'tenant-1',
      { moduleKeys: ['universal-inventory'], reason: 'UAT: enable Inventory' },
      'admin-1',
    );

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

// WI-OI-120u journey (2026-10-13): creating a workspace enables its trial modules, so it writes the same event; without
// it a new workspace had no module windows (the Workforce screens) until the next API start.
describe('a new workspace', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  /** The event, and that it is written in the same transaction as the trial entitlements, after them. */
  function expectEventAfterEntitlements(tenantId: string, moduleKeys: readonly string[]) {
    expect(tx.controlOutboxEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.controlOutboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        aggregateType: 'tenant-module-entitlements',
        aggregateId: tenantId,
        eventType: 'tenant.entitlements.changed.v1',
        payload: { tenantId, enabledModuleKeys: [...moduleKeys] },
      }),
    });
    const entitlements =
      tx.tenantModuleEntitlement.createMany.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
    const event =
      tx.controlOutboxEvent.create.mock.invocationCallOrder[0] ?? Number.NEGATIVE_INFINITY;
    expect(event).toBeGreaterThan(entitlements);
  }

  it('signed up by its owner writes tenant.entitlements.changed.v1 with the trial modules', async () => {
    database.tenant.findUnique.mockResolvedValue(null);
    database.tenantMember.findFirst.mockResolvedValue(null);
    tx.tenant.create.mockResolvedValue({
      id: 'tenant-new',
      name: 'Journey Works',
      slug: 'journey',
      status: 'TRIAL',
      isolationMode: 'SHARED',
      region: 'eu',
    });

    await new TenancyService().createTenant(
      { name: 'Journey Works', slug: 'journey', isolationMode: 'SHARED', region: 'eu' } as never,
      'owner-1',
    );

    expect(trialModuleKeys).toContain('gigaops');
    expectEventAfterEntitlements('tenant-new', trialModuleKeys);
  });

  it('provisioned in Platform Control Tower writes tenant.entitlements.changed.v1 with its modules', async () => {
    database.tenant.findUnique.mockResolvedValue(null);
    database.user.findUnique.mockResolvedValue({ id: 'owner-2', status: 'ACTIVE' });
    tx.tenant.create.mockResolvedValue({ id: 'tenant-provisioned' });
    const service = new PlatformAdministrationService();
    vi.spyOn(service, 'getTenant').mockResolvedValue({} as never);

    await service.createTenant(
      {
        name: 'Plant Two',
        slug: 'plant-two',
        ownerEmail: 'Owner@Example.invalid',
        moduleKeys: ['gigaops'],
        trialDays: 7,
        isolationMode: 'SHARED',
        region: 'eu',
        reason: 'UAT workspace',
      } as never,
      'platform-admin-1',
    );

    expectEventAfterEntitlements('tenant-provisioned', ['gigaops']);
  });
});
