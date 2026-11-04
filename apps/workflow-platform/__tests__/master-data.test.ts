/**
 * WI-OI-152 (ADR-0037 §3): who sees which master in the Master data area, and how a master is counted.
 */
import type { MasterDataEntryV1 } from '@gigalibs/contracts';
import { describe, expect, it, vi } from 'vitest';
import { countMaster, isMasterDataGroup, masterCountUrl, masterGroups, readableMasters } from '../lib/master-data';

const products: MasterDataEntryV1 = {
  key: 'catalogue.products',
  label: 'Products',
  group: 'products-and-stock',
  level: 'MODULE',
  moduleKey: 'product-catalogue',
  catalogKey: 'product-catalogue',
  moduleLabel: 'Products',
  route: '/products',
  readPermission: 'products:read',
  count: { kind: 'records', basePath: '/api/product-catalogue', entity: 'catalogue.products' },
  importable: false,
  packSection: null,
};
const units: MasterDataEntryV1 = {
  ...products,
  key: 'organization-units',
  label: 'Organization units',
  group: 'organization-and-people',
  moduleKey: 'core',
  catalogKey: 'tenant-access',
  route: '/settings/organization',
  readPermission: 'users:read',
  count: { kind: 'lookup', basePath: '/api/control', resolver: 'organization-units' },
};

const answer = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('readable masters', () => {
  const context = {
    tenant: { features: ['product-catalogue', 'tenant-access'] },
    permissions: ['products:read', 'tenant:read'],
    platformRoles: [],
    uatPreview: true,
  };

  it('shows a master only when its module is open and the person holds its read permission', () => {
    expect(readableMasters(context, [products, units]).map((entry) => entry.key)).toEqual(['catalogue.products']);
    expect(readableMasters({ ...context, permissions: ['tenant:read'] }, [products])).toEqual([]);
    expect(readableMasters({ ...context, tenant: { features: [] } }, [products])).toEqual([]);
  });

  it('shows platform reference masters with tenant:read even when the settings module is closed (WI-OI-176)', () => {
    const countries: MasterDataEntryV1 = {
      key: 'platform-countries',
      label: 'Countries',
      group: 'reference-data',
      level: 'PLATFORM_REFERENCE',
      moduleKey: 'core',
      catalogKey: 'tenant-access',
      moduleLabel: 'Workspace settings',
      route: '/master-data/reference/COUNTRIES',
      readPermission: 'tenant:read',
      count: { kind: 'lookup', basePath: '/api/control', resolver: 'platform-countries' },
      importable: false,
      packSection: null,
    };
    expect(
      readableMasters({ tenant: { features: [] }, permissions: ['tenant:read'], platformRoles: [] }, [countries]),
    ).toEqual([countries]);
  });

  it('orders groups as the area does and knows its group keys', () => {
    expect(masterGroups([products, units])).toEqual(['organization-and-people', 'products-and-stock']);
    expect(isMasterDataGroup('finance')).toBe(true);
    expect(isMasterDataGroup('settings')).toBe(false);
  });
});

describe('counting a master', () => {
  it('reads the total of a one-row page of the record list', async () => {
    const fetchImpl = answer(200, { items: [{}], total: 42, page: 1, pageSize: 1 });
    expect(await countMaster(products, fetchImpl as unknown as typeof fetch)).toEqual({ state: 'ready', count: 42, capped: false });
    expect(masterCountUrl(products)).toBe('/api/product-catalogue/v1/records/catalogue.products?page=1&pageSize=1');
  });

  it('counts lookup options and marks a full answer as capped', async () => {
    const fifty = Array.from({ length: 50 }, (_, index) => ({ value: String(index), label: String(index) }));
    expect(await countMaster(units, answer(200, fifty) as unknown as typeof fetch)).toEqual({ state: 'ready', count: 50, capped: true });
    expect(await countMaster(units, answer(200, [{ value: 'a', label: 'A' }]) as unknown as typeof fetch)).toEqual({
      state: 'ready',
      count: 1,
      capped: false,
    });
  });

  it('says "no access" on a refusal and "not answering" on an error or a timeout, never throws', async () => {
    expect(await countMaster(products, answer(403, { title: 'no' }) as unknown as typeof fetch)).toEqual({ state: 'unavailable', reason: 'no-access' });
    expect(await countMaster(products, answer(503, { title: 'down' }) as unknown as typeof fetch)).toEqual({
      state: 'unavailable',
      reason: 'not-answering',
    });
    const hanging = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    expect(await countMaster(products, hanging as unknown as typeof fetch, 20)).toEqual({ state: 'unavailable', reason: 'not-answering' });
  });
});
