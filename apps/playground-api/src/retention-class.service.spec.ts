import { beforeEach, describe, expect, it, vi } from 'vitest';

// WI-OI-120 (T9b): the retention-class service invariants that are pure control-flow (default-class handling and
// archive detaching environments), exercised against a mocked Prisma — mirroring the other control-plane worker specs.
const database = vi.hoisted(() => {
  const transaction = {
    retentionClass: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    tenantEnvironment: { updateMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) =>
      operation(transaction),
    ),
    transaction,
  };
});

vi.mock('@gigalibs/db', () => ({
  Prisma: {
    TransactionIsolationLevel: { Serializable: 'Serializable' },
    PrismaClientKnownRequestError: class extends Error {},
  },
  prisma: database,
}));

vi.mock('./tenant-resolver.js', () => ({ resolveTenantId: vi.fn(async (id: string) => id) }));

const { RetentionClassService } = await import('./retention-class.service.js');

describe('RetentionClassService', () => {
  const service = new RetentionClassService();

  beforeEach(() => {
    for (const model of Object.values(database.transaction))
      for (const fn of Object.values(model)) fn.mockReset();
  });

  it('clears any existing default before creating a new default class', async () => {
    database.transaction.retentionClass.create.mockResolvedValue({
      id: 'c1',
      key: 'financial-records',
      retentionDays: 2555,
      basis: 'REGULATORY',
      isDefault: true,
    });
    await service.create('tenant-a', 'user-1', {
      key: 'financial-records',
      name: 'Financial',
      description: undefined,
      retentionDays: 2555,
      basis: 'REGULATORY',
      isDefault: true,
    });
    expect(database.transaction.retentionClass.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', isDefault: true, archivedAt: null },
      data: { isDefault: false },
    });
    expect(database.transaction.retentionClass.create).toHaveBeenCalled();
    expect(database.transaction.auditLog.create).toHaveBeenCalled();
  });

  it('does NOT touch other defaults when creating a non-default class', async () => {
    database.transaction.retentionClass.create.mockResolvedValue({
      id: 'c2',
      key: 'telemetry',
      retentionDays: 90,
      basis: 'OPERATIONAL',
      isDefault: false,
    });
    await service.create('tenant-a', 'user-1', {
      key: 'telemetry',
      name: 'Telemetry',
      description: undefined,
      retentionDays: 90,
      basis: 'OPERATIONAL',
      isDefault: false,
    });
    expect(database.transaction.retentionClass.updateMany).not.toHaveBeenCalled();
  });

  it('archiving detaches adopting environments and clears the default flag', async () => {
    database.transaction.retentionClass.findFirst.mockResolvedValue({
      id: 'c1',
      key: 'financial-records',
      archivedAt: null,
    });
    database.transaction.retentionClass.update.mockResolvedValue({
      id: 'c1',
      key: 'financial-records',
      archivedAt: new Date('2026-10-26T00:00:00Z'),
    });
    await service.archive('tenant-a', 'user-1', 'c1');
    expect(database.transaction.tenantEnvironment.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', retentionClassId: 'c1' },
      data: { retentionClassId: null },
    });
    const updateArg = database.transaction.retentionClass.update.mock.calls[0]?.[0];
    expect(updateArg.data.isDefault).toBe(false);
    expect(updateArg.data.archivedAt).toBeInstanceOf(Date);
  });

  it('archiving an already-archived class is a no-op (returns it, changes nothing)', async () => {
    database.transaction.retentionClass.findFirst.mockResolvedValue({
      id: 'c1',
      archivedAt: new Date(),
    });
    await service.archive('tenant-a', 'user-1', 'c1');
    expect(database.transaction.tenantEnvironment.updateMany).not.toHaveBeenCalled();
    expect(database.transaction.retentionClass.update).not.toHaveBeenCalled();
  });

  it('refuses to adopt an archived class on an environment', async () => {
    database.transaction.tenantEnvironment.findFirst.mockResolvedValue({
      id: 'env-1',
      retentionClassId: null,
    });
    database.transaction.retentionClass.findFirst.mockResolvedValue({
      id: 'c9',
      archivedAt: new Date(),
    });
    await expect(
      service.assign('tenant-a', 'user-1', { environmentId: 'env-1', retentionClassId: 'c9' }),
    ).rejects.toThrow();
    expect(database.transaction.tenantEnvironment.update).not.toHaveBeenCalled();
  });
});
