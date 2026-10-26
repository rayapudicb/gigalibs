import { beforeEach, describe, expect, it, vi } from 'vitest';

// WI-OI-120 (M-CUR, Phase 5A): the workspace exchange-rate store — records real rates and assembles the live
// base-relative table the FX engine converts with (newest rate per quote). Mocked Prisma, per the repo's spec pattern.
const database = vi.hoisted(() => ({
  tenantExchangeRate: { create: vi.fn(), findMany: vi.fn() },
}));

vi.mock('@gigalibs/db', () => ({ prisma: database }));
vi.mock('./tenant-resolver.js', () => ({ resolveTenantId: vi.fn(async (id: string) => id) }));

const { TenantExchangeRateService } = await import('./tenant-exchange-rate.service.js');

describe('TenantExchangeRateService', () => {
  const service = new TenantExchangeRateService();

  beforeEach(() => {
    database.tenantExchangeRate.create.mockReset();
    database.tenantExchangeRate.findMany.mockReset();
  });

  it('records a rate scoped to the workspace, defaulting asOf to now', async () => {
    database.tenantExchangeRate.create.mockResolvedValue({ id: 'r1' });
    await service.recordRate('tenant-a', 'user-1', {
      baseCurrency: 'USD',
      quoteCurrency: 'EUR',
      rate: 0.924,
      source: 'ECB',
    });
    const arg = database.tenantExchangeRate.create.mock.calls[0]?.[0];
    expect(arg.data).toMatchObject({
      tenantId: 'tenant-a',
      baseCurrency: 'USD',
      quoteCurrency: 'EUR',
      rate: 0.924,
      source: 'ECB',
      createdById: 'user-1',
    });
    expect(arg.data.asOf).toBeInstanceOf(Date);
  });

  it('honours an explicit asOf moment', async () => {
    database.tenantExchangeRate.create.mockResolvedValue({ id: 'r2' });
    await service.recordRate('tenant-a', 'user-1', {
      baseCurrency: 'USD',
      quoteCurrency: 'JPY',
      rate: 154.2,
      asOf: '2026-03-15T00:00:00Z',
      source: 'manual',
    });
    expect(database.tenantExchangeRate.create.mock.calls[0]?.[0].data.asOf).toEqual(
      new Date('2026-03-15T00:00:00Z'),
    );
  });

  it('assembles a base-relative table from the newest rate per quote (base maps to 1)', async () => {
    database.tenantExchangeRate.findMany.mockResolvedValue([
      { quoteCurrency: 'EUR', rate: 0.924, asOf: new Date('2026-03-15T00:00:00Z'), source: 'ECB' },
      { quoteCurrency: 'JPY', rate: 154.2, asOf: new Date('2026-03-15T00:00:00Z'), source: 'ECB' },
    ]);
    const result = await service.ratesTable('tenant-a', 'USD');
    expect(result.table).toEqual({ USD: 1, EUR: 0.924, JPY: 154.2 });
    // newest-per-quote is the store's job: ask Prisma for distinct quotes ordered asOf desc.
    const query = database.tenantExchangeRate.findMany.mock.calls[0]?.[0];
    expect(query.where).toEqual({ tenantId: 'tenant-a', baseCurrency: 'USD' });
    expect(query.distinct).toEqual(['quoteCurrency']);
    expect(query.orderBy).toEqual([{ quoteCurrency: 'asc' }, { asOf: 'desc' }]);
  });

  it('lists history newest-first, optionally filtered by base, as ISO strings', async () => {
    database.tenantExchangeRate.findMany.mockResolvedValue([
      {
        id: 'r1',
        baseCurrency: 'USD',
        quoteCurrency: 'EUR',
        rate: 0.924,
        asOf: new Date('2026-03-15T00:00:00Z'),
        source: 'ECB',
        createdAt: new Date('2026-03-15T01:00:00Z'),
      },
    ]);
    const rows = await service.listRates('tenant-a', 'USD');
    expect(database.tenantExchangeRate.findMany.mock.calls[0]?.[0].where).toEqual({
      tenantId: 'tenant-a',
      baseCurrency: 'USD',
    });
    expect(rows[0]?.asOf).toBe('2026-03-15T00:00:00.000Z');
    expect(rows[0]?.createdAt).toBe('2026-03-15T01:00:00.000Z');
  });
});
