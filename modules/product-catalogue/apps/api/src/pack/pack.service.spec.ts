import { describe, expect, it, vi } from 'vitest';
import { ProductCataloguePackService } from './pack.service.js';

const SAMPLE_SECTION = {
  lists: {
    units: [{ code: 'EACH', name: 'Each', symbol: 'ea', dimension: 'COUNT' as const, stdPrecision: 0, costingPrecision: 4 }],
    categories: [{ code: 'RAW', name: 'Raw materials' }],
  },
};

describe('ProductCataloguePackService', () => {
  it('refuses country packs and invalid sections', async () => {
    const service = new ProductCataloguePackService({ withTenantTransaction: vi.fn() } as never, {} as never);
    await expect(
      service.apply(
        { principal: { tenantId: 't1', subject: 'u1' }, correlationId: 'c1' } as never,
        {
          kind: 'COUNTRY',
          key: 'IN',
          version: '1.0',
          checksum: 'sha256:' + 'a'.repeat(64),
          publishedVersionId: '00000000pack0001',
          section: { lists: {} },
        },
      ),
    ).rejects.toThrow(/industry packs only/);
  });

  it('creates only missing units and categories from a manufacturing section', async () => {
    const createUom = vi.fn(async () => ({ result: { id: 'u1' }, replayed: false }));
    const createCategory = vi.fn(async () => ({ result: { id: 'c1' }, replayed: false }));
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('uom_definitions')) return { rows: [] };
      if (sql.includes('product_categories')) return { rows: [] };
      return { rows: [] };
    });
    const client = { query };
    const service = new ProductCataloguePackService(
      { withTenantTransaction: async (_tenant: string, run: (c: typeof client) => Promise<unknown>) => run(client) } as never,
      { createUom, createCategory } as never,
    );
    const result = await service.apply(
      { principal: { tenantId: 't1', subject: 'u1' }, correlationId: 'c1' } as never,
      {
        kind: 'INDUSTRY',
        key: 'manufacturing',
        version: '1.0',
        checksum: 'sha256:' + 'b'.repeat(64),
        publishedVersionId: '00000000pack0002',
        section: SAMPLE_SECTION,
      },
    );
    expect(createUom).toHaveBeenCalledTimes(SAMPLE_SECTION.lists.units.length);
    expect(createCategory).toHaveBeenCalledTimes(SAMPLE_SECTION.lists.categories.length);
    expect(result.createdUoms.length).toBe(SAMPLE_SECTION.lists.units.length);
  });
});
