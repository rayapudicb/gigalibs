/**
 * WI-OI-120ab (R5 CMMS slice 2): Transaction-local legacy scope tests for
 * storerooms and part balances.
 */
import { describe, expect, it, vi } from 'vitest';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import type { DatabaseService } from '../database/database.service.js';
import { PartsService } from './parts.service.js';

const partId = '550e8400-e29b-41d4-a716-446655440011';
const storeroomId = '550e8400-e29b-41d4-a716-446655440012';
const northSite = '550e8400-e29b-41d4-a716-446655440013';
const southSite = '550e8400-e29b-41d4-a716-446655440014';

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

const allPrincipal = {
  tenantId: 'tenant-a',
  subject: 'admin-all',
  departmentScope: { mode: 'ALL' },
  placeScope: { mode: 'ALL' },
} as unknown as CmmsPrincipal;

const context = (principal: CmmsPrincipal): CmmsCommandContext => ({
  principal,
  correlationId: 'r5-slice2-parts-proof',
});

function serviceWithQuery(query: ReturnType<typeof vi.fn>) {
  const database = {
    withTenantTransaction: vi.fn(async (_tenant: string, operation: (client: unknown) => Promise<unknown>) =>
      operation({ query }),
    ),
  } as unknown as DatabaseService;
  return new PartsService(database);
}

describe('WI-OI-120ab Storerooms & Balances legacy-scope boundary', () => {
  describe('Storeroom CRUD Scope Enforcement', () => {
    it('fails closed when a department-scoped user tries to create a storeroom', async () => {
      const query = vi.fn();
      const service = serviceWithQuery(query);
      await expect(
        service.createStoreroom(context(departmentPrincipal), {
          code: 'STR-01',
          name: 'North Storeroom',
          siteRef: northSite,
          isActive: true,
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect(query).not.toHaveBeenCalled();
    });

    it('refuses storeroom creation outside the place-scoped user siteRef', async () => {
      const query = vi.fn();
      const service = serviceWithQuery(query);
      await expect(
        service.createStoreroom(context(placePrincipal), {
          code: 'STR-02',
          name: 'South Storeroom',
          siteRef: southSite,
          isActive: true,
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect(query).not.toHaveBeenCalled();
    });

    it('allows storeroom creation when siteRef is in caller place scope', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO gigalibs_cmms.cmms_storerooms')) {
          return { rows: [{ id: storeroomId }] };
        }
        if (sql.includes('SELECT * FROM gigalibs_cmms.cmms_storerooms')) {
          return {
            rows: [
              {
                id: storeroomId,
                code: 'STR-01',
                name: 'North Storeroom',
                site_ref: northSite,
                is_active: true,
                version: 1,
                created_by: 'worker-place',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ],
          };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      const res = await service.createStoreroom(context(placePrincipal), {
        code: 'STR-01',
        name: 'North Storeroom',
        siteRef: northSite,
        isActive: true,
      });
      expect(res.id).toBe(storeroomId);
      expect(res.siteRef).toBe(northSite);
    });

    it('refuses update of a storeroom residing at an out-of-scope site', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('SELECT * FROM gigalibs_cmms.cmms_storerooms')) {
          return {
            rows: [
              {
                id: storeroomId,
                name: 'South Storeroom',
                site_ref: southSite,
                version: 1,
                is_active: true,
              },
            ],
          };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      await expect(
        service.updateStoreroom(context(placePrincipal), storeroomId, {
          expectedVersion: 1,
          name: 'Renamed Storeroom',
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('refuses moving a storeroom to an out-of-scope siteRef', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('SELECT * FROM gigalibs_cmms.cmms_storerooms')) {
          return {
            rows: [
              {
                id: storeroomId,
                name: 'North Storeroom',
                site_ref: northSite,
                version: 1,
                is_active: true,
              },
            ],
          };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      await expect(
        service.updateStoreroom(context(placePrincipal), storeroomId, {
          expectedVersion: 1,
          siteRef: southSite,
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('refuses deleting a storeroom residing at an out-of-scope site', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('SELECT site_ref FROM gigalibs_cmms.cmms_storerooms')) {
          return { rows: [{ site_ref: southSite }] };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      await expect(service.deleteStoreroom(context(placePrincipal), storeroomId)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('filters storeroom list by place scope predicates', async () => {
      const query = vi.fn(async () => ({ rows: [] }));
      const service = serviceWithQuery(query);
      await service.listStorerooms(placePrincipal);
      expect(query).toHaveBeenCalledTimes(1);
      const [sql, values] = query.mock.calls[0] as unknown as [string, unknown[]];
      expect(sql).toContain('site_ref = ANY($2::uuid[])');
      expect(values).toEqual(['tenant-a', [northSite]]);
    });
  });

  describe('Part Balances Scope Enforcement', () => {
    it('filters listPartBalances with both part scope and storeroom place predicates', async () => {
      const query = vi.fn(async () => ({ rows: [] }));
      const service = serviceWithQuery(query);
      await service.listPartBalances(placePrincipal, partId, storeroomId);
      expect(query).toHaveBeenCalledTimes(1);
      const [sql, values] = query.mock.calls[0] as unknown as [string, unknown[]];
      expect(sql).toContain('p.site_ref = ANY($2::uuid[])');
      expect(sql).toContain('s.site_ref = ANY($3::uuid[])');
      expect(sql).toContain('b.part_id = $4');
      expect(sql).toContain('b.storeroom_id = $5');
      expect(values).toEqual(['tenant-a', [northSite], [northSite], partId, storeroomId]);
    });

    it('refuses setPartBalance if the part is out of caller department scope', async () => {
      const query = vi.fn();
      const service = serviceWithQuery(query);
      vi.spyOn(service, 'visiblePartRow').mockResolvedValue({
        id: partId,
        department_id: 'south-dept',
        site_ref: northSite,
      });
      await expect(
        service.setPartBalance(context(departmentPrincipal), {
          partId,
          storeroomId,
          binLocation: 'A-01',
          quantityOnHand: 10,
          minQuantity: 2,
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('refuses setPartBalance if the storeroom is out of caller place scope', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('SELECT site_ref FROM gigalibs_cmms.cmms_storerooms')) {
          return { rows: [{ site_ref: southSite }] };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      vi.spyOn(service, 'visiblePartRow').mockResolvedValue({
        id: partId,
        department_id: null,
        site_ref: northSite,
      });
      await expect(
        service.setPartBalance(context(placePrincipal), {
          partId,
          storeroomId,
          binLocation: 'A-01',
          quantityOnHand: 10,
          minQuantity: 2,
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('fails closed when department-scoped user tries to set balance in a storeroom', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('SELECT site_ref FROM gigalibs_cmms.cmms_storerooms')) {
          return { rows: [{ site_ref: northSite }] };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      vi.spyOn(service, 'visiblePartRow').mockResolvedValue({
        id: partId,
        department_id: 'north-dept',
        site_ref: northSite,
      });
      await expect(
        service.setPartBalance(context(departmentPrincipal), {
          partId,
          storeroomId,
          binLocation: 'A-01',
          quantityOnHand: 10,
          minQuantity: 2,
        }),
      ).rejects.toMatchObject({ status: 403 });
    });
  });
});
