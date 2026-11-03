import { MASTER_FACT_EVENT_TYPE, MasterFactV1Schema } from '@gigalibs/contracts';
import { describe, expect, it, vi } from 'vitest';
import { CatalogueService, categoryMasterFact, productMasterFact, uomMasterFact } from './catalogue.service.js';

// WI-OI-156 slice A (ADR-0039 §1): Products writes the standard master fact for products, units and categories, so a
// consumer can keep a replica (id, code, name, status, version) and refuse an unknown or archived reference.
const product = {
  id: '6f1c2c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', code: 'BOLT-10', name: 'Bolt M10', status: 'ACTIVE', version: 3,
  baseUomId: '7a1c2c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', productType: 'STOCKED',
} as unknown as Parameters<typeof productMasterFact>[0];

describe('Products master facts', () => {
  it('describes a product, a unit and a category in the master fact shape', () => {
    expect(MasterFactV1Schema.parse(productMasterFact(product, 'UPDATED'))).toMatchObject({
      entity: 'catalogue.products', change: 'UPDATED', code: 'BOLT-10', status: 'ACTIVE', version: 3,
    });
    const uom = { id: 'u1', code: 'KGM', name: 'Kilogram', symbol: 'kg', dimension: 'WEIGHT', uomType: 'PLATFORM_REFERENCE', isActive: true, version: 1 };
    expect(MasterFactV1Schema.parse(uomMasterFact(uom as never, 'CREATED')).attributes).toEqual({ symbol: 'kg', dimension: 'WEIGHT', platformReference: true });
    const category = { id: 'c1', code: 'FAST', name: 'Fasteners', parentCategoryId: null, effectiveTo: '2026-01-01T00:00:00.000Z', version: 2 };
    expect(categoryMasterFact(category as never, 'UPDATED', new Date('2026-11-03')).status).toBe('EXPIRED');
  });

  it('marks an archived product ARCHIVED so consumers block new use', () => {
    expect(productMasterFact({ ...product, status: 'ARCHIVED' } as never, 'ARCHIVED')).toMatchObject({ change: 'ARCHIVED', status: 'ARCHIVED' });
  });

  it('writes one master fact per standard unit added, and none on a second run', async () => {
    const taken = new Set<string>();
    const facts: unknown[][] = [];
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('uom_definitions')) {
          const code = params[2] as string;
          if (taken.has(code)) return { rowCount: 0, rows: [] };
          taken.add(code);
          return { rowCount: 1, rows: [] };
        }
        if (sql.includes('outbox_events') && params[3] === MASTER_FACT_EVENT_TYPE) facts.push(params);
        return { rowCount: 1, rows: [] };
      }),
    };
    const service = new CatalogueService({ withTenantTransaction: async (_tenant: string, work: (c: typeof client) => unknown) => work(client) } as never);
    const internals = service as unknown as { resolveAccess: () => Promise<unknown>; assertWrite: () => void };
    vi.spyOn(internals, 'resolveAccess').mockResolvedValue({});
    vi.spyOn(internals, 'assertWrite').mockReturnValue(undefined);
    const context = { principal: { tenantId: 'tenant-a', subject: 'admin' }, correlationId: 'c-1' } as never;
    const first = await service.addPlatformUnits(context);
    expect(facts).toHaveLength(first.added);
    expect(JSON.parse(facts[0]![8] as string)).toMatchObject({ entity: 'catalogue.uoms', change: 'CREATED', status: 'ACTIVE' });
    await service.addPlatformUnits(context);
    expect(facts).toHaveLength(first.added);
  });
});
