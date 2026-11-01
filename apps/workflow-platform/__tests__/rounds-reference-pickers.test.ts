import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assetSource, lookupSource, meterSource, operatorSource,
} from '../../../modules/operator-rounds/web/src/reference-pickers';

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

describe('Rounds reference pickers read other modules as the user', () => {
  it('offers only people whose Workforce record is linked to a login, giving both references from one choice', async () => {
    const fetch = vi.fn(async (_url: string) => reply(200, { items: [
      { id: '10000000-0000-4000-8000-000000000001', displayName: 'Asha Rao', platformUserId: 'cuser-asha' },
      { id: '10000000-0000-4000-8000-000000000002', displayName: 'Contract crew', platformUserId: null },
    ], total: 2 }));
    vi.stubGlobal('fetch', fetch);
    expect(await operatorSource.search('asha')).toEqual([{ value: '10000000-0000-4000-8000-000000000001', label: 'Asha Rao',
      data: { workforceResourceRef: '10000000-0000-4000-8000-000000000001', operatorSubject: 'cuser-asha' } }]);
    expect(String(fetch.mock.calls[0]?.[0])).toBe('/api/gigaops/v1/resources?q=asha&resourceType=HUMAN&status=ACTIVE&pageSize=10');
  });

  it('searches CMMS assets by tag or name and keeps the tag for the checkpoint', async () => {
    const fetch = vi.fn(async () => reply(200, { items: [{ id: 'a1', assetTag: 'P-101', name: 'Feed pump' }], page: 1 }));
    vi.stubGlobal('fetch', fetch);
    expect(await assetSource.search('pump')).toEqual([{ value: 'a1', label: 'P-101 · Feed pump', data: { assetTag: 'P-101', name: 'Feed pump' } }]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/cmms/v1/assets/search');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ q: 'pump', pageSize: 10 });
  });

  it('reads units and places through the platform lookups, by search and by the stored id', async () => {
    const fetch = vi.fn(async (_url: string) => reply(200, [{ value: 'u-1', label: 'Boiler house (BH)' }]));
    vi.stubGlobal('fetch', fetch);
    const units = lookupSource('organization-units');
    expect(await units.search('boil')).toEqual([{ value: 'u-1', label: 'Boiler house (BH)' }]);
    expect(await lookupSource('workspace-sites').resolve('u-1')).toEqual({ value: 'u-1', label: 'Boiler house (BH)' });
    expect(fetch.mock.calls.map((call) => String(call[0]))).toEqual([
      '/api/control/v1/lookups/organization-units?search=boil',
      '/api/control/v1/lookups/workspace-sites?ids=u-1',
    ]);
  });

  it('lists only the chosen asset’s meters and filters them by the typed text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { items: [
      { id: 'm1', name: 'Discharge pressure', unit: 'bar' }, { id: 'm2', name: 'Bearing temperature', unit: 'degC' },
    ] })));
    const meters = meterSource('a1');
    expect((await meters.search('press')).map((option) => option.value)).toEqual(['m1']);
    expect(await meters.resolve('m2')).toMatchObject({ label: 'Bearing temperature (degC)', data: { unit: 'degC' } });
  });

  it('surfaces a refused lookup so the field falls back to typing the identifier', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(403, { message: 'Forbidden' })));
    await expect(assetSource.search('pump')).rejects.toThrow('403');
    vi.stubGlobal('fetch', vi.fn(async () => reply(503, { message: 'down' })));
    await expect(operatorSource.search('asha')).rejects.toThrow('Lookup failed (503).');
  });
});
