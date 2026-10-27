import { beforeEach, describe, expect, it, vi } from 'vitest';

// WI-OI-120av (Phase 5A): the platform-reference load/lookup logic. Mocked Prisma; @gigalibs/contracts is real so the
// generated ICU data + canonicalReferenceString are the genuine ones (the checksum re-verification is exercised).
const database = vi.hoisted(() => {
  const tx = {
    platformReferenceVersion: { updateMany: vi.fn(), create: vi.fn() },
    platformReferenceEntry: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    tx,
    platformReferenceVersion: { findFirst: vi.fn(), findMany: vi.fn() },
    platformReferenceEntry: { findMany: vi.fn() },
    $transaction: vi.fn(async (op: (client: typeof tx) => unknown) => op(tx)),
  };
});

vi.mock('@gigalibs/db', () => ({
  prisma: database,
  Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' }, JsonNull: 'JsonNull' },
}));

const { PlatformReferenceService } = await import('./platform-reference.service.js');

describe('PlatformReferenceService', () => {
  const service = new PlatformReferenceService();

  beforeEach(() => {
    for (const model of [
      database.tx.platformReferenceVersion,
      database.tx.platformReferenceEntry,
      database.tx.auditLog,
      database.platformReferenceVersion,
      database.platformReferenceEntry,
    ])
      for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset();
    database.$transaction.mockClear();
    database.tx.platformReferenceVersion.create.mockResolvedValue({ id: 'v1' });
  });

  it('loads a generated set: retires the live version, creates a new one + its entries, audits', async () => {
    const result = await service.loadGeneratedSet('op-1', 'CURRENCIES', 'initial load');
    expect(database.tx.platformReferenceVersion.updateMany).toHaveBeenCalledWith({
      where: { setKey: 'CURRENCIES', retiredAt: null },
      data: expect.objectContaining({ retiredAt: expect.any(Date) }),
    });
    expect(database.tx.platformReferenceVersion.create).toHaveBeenCalled();
    const createMany = database.tx.platformReferenceEntry.createMany.mock.calls[0]?.[0];
    expect(createMany.data.length).toBe(result.entryCount);
    expect(result.entryCount).toBeGreaterThan(100); // 162 currencies
    // currency entries carry a payload (minorUnits); code/name are columns.
    const usd = createMany.data.find((e: { code: string }) => e.code === 'USD');
    expect(usd.payload).toEqual({ minorUnits: 2 });
    expect(database.tx.auditLog.create).toHaveBeenCalled();
  });

  it('refuses a set with no sourced dataset yet', async () => {
    // TAX_JURISDICTIONS has no ICU source (and is not generated); UNITS_OF_MEASURE is now ICU-sourced.
    await expect(service.loadGeneratedSet('op-1', 'TAX_JURISDICTIONS', 'x')).rejects.toThrow(
      /sourced dataset/,
    );
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('lookup serves the live version flattened (code + name + payload), or empty when none', async () => {
    database.platformReferenceVersion.findFirst.mockResolvedValue({
      id: 'v1',
      source: 'ISO 4217',
      version: '47.0',
      checksum: `sha256:${'a'.repeat(64)}`,
      entryCount: 1,
      loadedAt: new Date('2026-10-26T00:00:00Z'),
    });
    database.platformReferenceEntry.findMany.mockResolvedValue([
      { code: 'USD', name: 'US Dollar', payload: { minorUnits: 2 } },
    ]);
    const out = await service.lookup('CURRENCIES');
    expect(out.entries).toEqual([{ code: 'USD', name: 'US Dollar', minorUnits: 2 }]);
    expect(out.provenance?.version).toBe('47.0');

    database.platformReferenceVersion.findFirst.mockResolvedValue(null);
    expect(await service.lookup('TIME_ZONES')).toEqual({
      setKey: 'TIME_ZONES',
      provenance: null,
      entries: [],
    });
  });
});
