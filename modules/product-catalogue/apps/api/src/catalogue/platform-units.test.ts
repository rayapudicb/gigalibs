import { GENERATED_UNITS_OF_MEASURE } from '@gigalibs/contracts';
import { describe, expect, it, vi } from 'vitest';
import { CatalogueService, platformUnitId } from './catalogue.service.js';

// WI-OI-153 slice C (ADR-0038 §1): the platform's standard units become read-only PLATFORM_REFERENCE rows in a
// workspace, with fixed ids, idempotently; a code the workspace already uses for its own unit is kept.
describe('platform units in a workspace', () => {
  it('gives each unit a fixed, version-5 shaped id per workspace and code', () => {
    const id = platformUnitId('tenant-a', 'KGM');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(platformUnitId('tenant-a', 'KGM')).toBe(id);
    expect(platformUnitId('tenant-b', 'KGM')).not.toBe(id);
    expect(platformUnitId('tenant-a', 'LTR')).not.toBe(id);
  });

  it('adds every standard unit as platform reference once, skipping codes already taken', async () => {
    const taken = new Set(['EA']);
    const inserts: unknown[][] = [];
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('INSERT INTO') && sql.includes('uom_definitions')) {
          inserts.push(params);
          const code = params[2] as string;
          if (taken.has(code)) return { rowCount: 0, rows: [] };
          taken.add(code);
          return { rowCount: 1, rows: [{ id: params[0] }] };
        }
        return { rowCount: 1, rows: [] };
      }),
    };
    const service = new CatalogueService({ withTenantTransaction: async (_tenant: string, work: (c: typeof client) => unknown) => work(client) } as never);
    const internals = service as unknown as { resolveAccess: () => Promise<unknown>; assertWrite: () => void };
    vi.spyOn(internals, 'resolveAccess').mockResolvedValue({});
    vi.spyOn(internals, 'assertWrite').mockReturnValue(undefined);
    const context = { principal: { tenantId: 'tenant-a', subject: 'admin' } } as never;

    const first = await service.addPlatformUnits(context);
    expect(first).toMatchObject({ added: GENERATED_UNITS_OF_MEASURE.entryCount - 1, available: GENERATED_UNITS_OF_MEASURE.entryCount });
    const kilogram = inserts.find((params) => params[2] === 'KGM');
    expect(kilogram).toEqual([platformUnitId('tenant-a', 'KGM'), 'tenant-a', 'KGM', 'Kilogram', 'kg', 'WEIGHT', 2, 'admin']);
    const piece = inserts.find((params) => params[2] === 'H87');
    expect(piece?.[6]).toBe(0); // counting units have no decimals

    const again = await service.addPlatformUnits(context);
    expect(again.added).toBe(0);
  });
});
