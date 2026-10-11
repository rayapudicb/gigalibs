/**
 * WI-OI-120ab (R5 CMMS slice 2): Transaction-local legacy scope tests for
 * spaces, tree hierarchy, and CAD layer mutations.
 */
import { describe, expect, it, vi } from 'vitest';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import type { DatabaseService } from '../database/database.service.js';
import { EamSpacesService } from './spaces.service.js';

const spaceId = '550e8400-e29b-41d4-a716-446655440041';
const parentSpaceId = '550e8400-e29b-41d4-a716-446655440042';
const northSite = '550e8400-e29b-41d4-a716-446655440043';
const southSite = '550e8400-e29b-41d4-a716-446655440044';

const departmentPrincipal = {
  tenantId: 'tenant-a',
  subject: 'worker-dept',
  departmentScope: { mode: 'DEPARTMENTS', departmentIds: ['north-dept'] },
  placeScope: { mode: 'ALL' },
} as unknown as CmmsPrincipal;

const placePrincipal = {
  tenantId: 'tenant-a',
  subject: 'worker-place',
  departmentScope: { mode: 'ALL' },
  placeScope: { mode: 'PLACES', placeIds: [northSite] },
} as unknown as CmmsPrincipal;

const context = (principal: CmmsPrincipal): CmmsCommandContext => ({
  principal,
  correlationId: 'r5-slice2-spaces-proof',
});

function serviceWithQuery(query: ReturnType<typeof vi.fn>) {
  const database = {
    withTenantTransaction: vi.fn(async (_tenant: string, operation: (client: unknown) => Promise<unknown>) =>
      operation({ query }),
    ),
  } as unknown as DatabaseService;
  return new EamSpacesService(database);
}

const mockSpaceRow = (id: string, siteRef: string | null = northSite, version = 1) => ({
  id,
  code: 'SPC-01',
  name: 'Floor 1',
  description: null,
  space_type: 'FLOOR',
  parent_space_id: null,
  site_ref: siteRef,
  floor_number: 1,
  gross_area_sqm: '100.00',
  net_area_sqm: '80.00',
  cad_layer: {},
  bim_guid: null,
  metadata: {},
  version,
  asset_count: 0,
  created_by: 'admin',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

describe('WI-OI-120ab Spaces & CAD legacy-scope boundary', () => {
  describe('Space Hierarchy & Tree Reads', () => {
    it('applies place scope predicates when querying space tree', async () => {
      const query = vi.fn(async () => ({ rows: [] }));
      const service = serviceWithQuery(query);
      const res = await service.tree(placePrincipal);
      expect(res).toEqual([]);
      expect(query).toHaveBeenCalledTimes(1);
      const [sql, values] = query.mock.calls[0] as unknown as [string, unknown[]];
      expect(sql).toContain('s.site_ref = ANY($2::uuid[])');
      expect(values).toEqual(['tenant-a', [northSite]]);
    });

    it('refuses get for a space outside caller place scope with 404', async () => {
      const query = vi.fn(async () => ({ rows: [] }));
      const service = serviceWithQuery(query);
      await expect(service.get(placePrincipal, spaceId)).rejects.toMatchObject({ status: 404 });
      const [sql, values] = query.mock.calls[0] as unknown as [string, unknown[]];
      expect(sql).toContain('s.site_ref = ANY($3::uuid[])');
      expect(values).toEqual(['tenant-a', spaceId, [northSite]]);
    });

    it('enforces scope on parent space and filters child assets by caller scope', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('SELECT s.id, s.code')) {
          return { rows: [mockSpaceRow(spaceId, northSite)] };
        }
        if (sql.includes('SELECT a.id, a.asset_tag')) {
          return { rows: [] };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      await service.getAssetsInSpace(placePrincipal, spaceId);
      expect(query).toHaveBeenCalledTimes(2);
      const [assetSql, assetValues] = query.mock.calls[1] as unknown as [string, unknown[]];
      expect(assetSql).toContain('a.site_ref = ANY($3::uuid[])');
      expect(assetValues).toEqual(['tenant-a', spaceId, [northSite]]);
    });
  });

  describe('Space Mutations Scope Enforcement', () => {
    it('fails closed when a department-scoped member attempts to create a space', async () => {
      const query = vi.fn();
      const service = serviceWithQuery(query);
      await expect(
        service.create(context(departmentPrincipal), {
          code: 'SPC-NEW',
          name: 'New Room',
          spaceType: 'ROOM',
          siteRef: northSite,
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect(query).not.toHaveBeenCalled();
    });

    it('refuses space creation when siteRef is outside caller place scope', async () => {
      const query = vi.fn();
      const service = serviceWithQuery(query);
      await expect(
        service.create(context(placePrincipal), {
          code: 'SPC-NEW',
          name: 'New Room',
          spaceType: 'ROOM',
          siteRef: southSite,
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect(query).not.toHaveBeenCalled();
    });

    it('allows space creation when siteRef is in caller place scope', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO gigalibs_cmms.cmms_spaces')) {
          return { rows: [{ id: spaceId }] };
        }
        if (sql.includes('SELECT s.id, s.code')) {
          return { rows: [mockSpaceRow(spaceId, northSite)] };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      const res = await service.create(context(placePrincipal), {
        code: 'SPC-NEW',
        name: 'New Room',
        spaceType: 'ROOM',
        siteRef: northSite,
      });
      expect(res.id).toBe(spaceId);
      expect(res.siteRef).toBe(northSite);
    });

    it('refuses update of a space at an out-of-scope site', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('SELECT s.id, s.code')) {
          return { rows: [mockSpaceRow(spaceId, southSite)] };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      await expect(
        service.update(context(placePrincipal), spaceId, {
          expectedVersion: 1,
          name: 'Renamed Space',
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('refuses moving a space to an out-of-scope siteRef', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('SELECT s.id, s.code')) {
          return { rows: [mockSpaceRow(spaceId, northSite)] };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      await expect(
        service.update(context(placePrincipal), spaceId, {
          expectedVersion: 1,
          siteRef: southSite,
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('refuses deleting a space at an out-of-scope site', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('SELECT s.id, s.code')) {
          return { rows: [mockSpaceRow(spaceId, southSite)] };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      await expect(service.delete(context(placePrincipal), spaceId)).rejects.toMatchObject({ status: 403 });
    });

    it('refuses CAD layer upload for a space at an out-of-scope site', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('SELECT s.id, s.code')) {
          return { rows: [mockSpaceRow(spaceId, southSite)] };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      await expect(
        service.uploadCadLayer(context(placePrincipal), spaceId, {
          cadLayer: { layerName: 'HVAC', version: 1 },
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('allows CAD layer upload for a space within caller place scope', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('SELECT s.id, s.code')) {
          return { rows: [mockSpaceRow(spaceId, northSite)] };
        }
        if (sql.includes('UPDATE gigalibs_cmms.cmms_spaces')) {
          return { rows: [] };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      const res = await service.uploadCadLayer(context(placePrincipal), spaceId, {
        cadLayer: { layerName: 'Architectural', entities: [] },
      });
      expect(res.id).toBe(spaceId);
    });
  });
});
