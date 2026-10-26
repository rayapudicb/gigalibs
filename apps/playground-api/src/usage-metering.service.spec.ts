import { beforeEach, describe, expect, it, vi } from 'vitest';

// WI-OI-015 (T8b): the usage-metering service — atomic increment on record, and the statement reading a period back
// through the pure hand-off. Mocked Prisma, per the repo's worker-spec pattern.
const database = vi.hoisted(() => ({
  usageCounter: { upsert: vi.fn(), findMany: vi.fn() },
}));

vi.mock('@gigalibs/db', () => ({ prisma: database }));
vi.mock('./tenant-resolver.js', () => ({ resolveTenantId: vi.fn(async (id: string) => id) }));

const { UsageMeteringService } = await import('./usage-metering.service.js');

describe('UsageMeteringService', () => {
  const service = new UsageMeteringService();

  beforeEach(() => {
    database.usageCounter.upsert.mockReset();
    database.usageCounter.findMany.mockReset();
  });

  it('records an increment into the billing period the timestamp falls in', async () => {
    await service.record('tenant-a', 'API_REQUESTS', 5, new Date('2026-03-15T00:00:00Z'));
    expect(database.usageCounter.upsert).toHaveBeenCalledWith({
      where: {
        tenantId_periodKey_meterKey: {
          tenantId: 'tenant-a',
          periodKey: '2026-03',
          meterKey: 'API_REQUESTS',
        },
      },
      create: {
        tenantId: 'tenant-a',
        periodKey: '2026-03',
        meterKey: 'API_REQUESTS',
        quantity: 5n,
      },
      update: { quantity: { increment: 5n } },
    });
  });

  it('is a no-op for a zero or negative quantity', async () => {
    await service.record('tenant-a', 'API_REQUESTS', 0);
    await service.record('tenant-a', 'API_REQUESTS', -3);
    expect(database.usageCounter.upsert).not.toHaveBeenCalled();
  });

  it('truncates a fractional quantity to a whole increment', async () => {
    await service.record('tenant-a', 'AI_TOKENS', 10.9, new Date('2026-03-15T00:00:00Z'));
    expect(database.usageCounter.upsert.mock.calls[0]?.[0].update).toEqual({
      quantity: { increment: 10n },
    });
  });

  it('reads a period back as meter -> number (from BigInt rows)', async () => {
    database.usageCounter.findMany.mockResolvedValue([
      { meterKey: 'API_REQUESTS', quantity: 150000n },
      { meterKey: 'WORKFLOW_RUNS', quantity: 42n },
    ]);
    expect(await service.periodUsage('tenant-a', '2026-03')).toEqual({
      API_REQUESTS: 150000,
      WORKFLOW_RUNS: 42,
    });
  });

  it('produces a reconciled statement for the period and plan', async () => {
    database.usageCounter.findMany.mockResolvedValue([
      { meterKey: 'API_REQUESTS', quantity: 150000n },
    ]);
    const statement = await service.statement('tenant-a', '2026-03', 'STARTER');
    // 50,000 requests over the 100,000 STARTER allowance at 0.01 minor each = 500 minor.
    expect(statement.totalAmountMinor).toBe(500);
    expect(statement.plan).toBe('STARTER');
    expect(statement.periodKey).toBe('2026-03');
  });
});
