/**
 * WI-OI-120u (M-WF1): the platform lookups of the metadata windows read one control-plane list as the signed-in user and
 * answer `[{ value, label }]`: active entries matching the search, or the entries named by id whatever their status.
 * The control plane's refusal reaches the window unchanged, so the lookup adds no authority.
 */
import { NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../app/api/control/v1/lookups/[key]/route';
import { authenticatedUpstream } from '../lib/authenticated-upstream';
import { proxyGeospatial } from '../lib/geospatial-proxy';

vi.mock('../lib/authenticated-upstream', async (original) => ({
  ...(await original<typeof import('../lib/authenticated-upstream')>()),
  authenticatedUpstream: vi.fn(),
}));
vi.mock('../lib/geospatial-proxy', () => ({ proxyGeospatial: vi.fn() }));

const upstream = vi.mocked(authenticatedUpstream);
const places = vi.mocked(proxyGeospatial);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const call = (key: string, query = '') =>
  GET(new Request(`http://127.0.0.1:5180/api/control/v1/lookups/${key}${query}`), {
    params: Promise.resolve({ key }),
  });

const members = [
  {
    id: 'm1',
    status: 'ACTIVE',
    user: { id: 'user-ana', email: 'ana@example.invalid', name: 'Ana Ortiz' },
  },
  { id: 'm2', status: 'ACTIVE', user: { id: 'user-bo', email: 'bo@example.invalid', name: null } },
  {
    id: 'm3',
    status: 'SUSPENDED',
    user: { id: 'user-cy', email: 'cy@example.invalid', name: 'Cy Former' },
  },
];

afterEach(() => {
  upstream.mockReset();
  places.mockReset();
});

describe('platform lookup route', () => {
  it('answers 404 for a lookup the platform does not serve, without calling the control plane', async () => {
    const response = await call('everything');
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('lists active members as the signed-in user, labelled by name and email', async () => {
    upstream.mockResolvedValue(json(members));
    const response = await call('workspace-members');
    expect(upstream).toHaveBeenCalledWith('control', '/api/v1/tenants/current/members');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual([
      { value: 'user-ana', label: 'Ana Ortiz (ana@example.invalid)' },
      { value: 'user-bo', label: 'bo@example.invalid' },
    ]);
  });

  it('filters members by the search and names any member by id, suspended or not', async () => {
    upstream.mockResolvedValue(json(members));
    expect(await (await call('workspace-members', '?search=ORTIZ')).json()).toEqual([
      { value: 'user-ana', label: 'Ana Ortiz (ana@example.invalid)' },
    ]);
    upstream.mockResolvedValue(json(members));
    expect(await (await call('workspace-members', '?ids=user-cy')).json()).toEqual([
      { value: 'user-cy', label: 'Cy Former (cy@example.invalid)' },
    ]);
  });

  it('passes the control plane refusal through (no users:read)', async () => {
    upstream.mockResolvedValue(json({ message: 'Insufficient permissions' }, 403));
    const response = await call('workspace-members');
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: 'Insufficient permissions' });
  });

  it('asks for sign-in when there is no session', async () => {
    upstream.mockResolvedValue(null);
    expect((await call('workspace-members')).status).toBe(401);
  });

  it('refuses malformed ids before calling the control plane', async () => {
    expect((await call('workspace-members', '?ids=a,b;drop')).status).toBe(400);
    expect(
      (
        await call(
          'organization-units',
          `?ids=${Array.from({ length: 101 }, (_, index) => `u${index}`).join(',')}`,
        )
      ).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('searches organization units on the control plane and names units by id', async () => {
    const units = {
      items: [
        { id: 'unit-1', code: 'MAINT', name: 'Maintenance', status: 'ACTIVE' },
        { id: 'unit-2', code: 'OLD', name: 'Old works', status: 'ARCHIVED' },
      ],
      nextCursor: null,
    };
    upstream.mockResolvedValue(json(units));
    expect(await (await call('organization-units', '?search=main')).json()).toEqual([
      { value: 'unit-1', label: 'Maintenance (MAINT)' },
    ]);
    expect(upstream).toHaveBeenLastCalledWith(
      'control',
      '/api/v1/tenants/current/organization/units?limit=200&q=main',
    );
    upstream.mockResolvedValue(json(units));
    expect(await (await call('organization-units', '?ids=unit-2')).json()).toEqual([
      { value: 'unit-2', label: 'Old works (OLD)' },
    ]);
    expect(upstream).toHaveBeenLastCalledWith(
      'control',
      '/api/v1/tenants/current/organization/units?limit=200&ids=unit-2',
    );
  });

  // WI-OI-120u Slice 2 (owner D2a): places come from Geospatial through its signed proxy, as the signed-in user.
  it('searches active places on Geospatial and names places by id one by one', async () => {
    const site = { id: 'site-1', code: 'NP', displayName: 'North plant', status: 'ACTIVE' };
    places.mockResolvedValue(
      NextResponse.json({
        items: [site, { id: 'site-0', code: 'X', displayName: 'Closed yard', status: 'ARCHIVED' }],
      }),
    );
    expect(await (await call('workspace-sites', '?search=north')).json()).toEqual([
      { value: 'site-1', label: 'North plant (NP)' },
    ]);
    const [request, context] = places.mock.calls[0] ?? [];
    if (!request || !context) throw new Error('Geospatial was not asked');
    expect(new URL(request.url).pathname + new URL(request.url).search).toBe(
      '/api/maps/nodes?status=ACTIVE&pageSize=50&q=north',
    );
    expect(await context.params).toEqual({ path: ['nodes'] });

    // By id (security review L2): one list of up to 200 places, then the ones not on it one at a time.
    places.mockReset();
    let inFlight = 0;
    let mostAtOnce = 0;
    places.mockImplementation(async (_request, context) => {
      inFlight += 1;
      mostAtOnce = Math.max(mostAtOnce, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      const [, id] = (await context.params).path;
      if (id === undefined)
        return NextResponse.json({
          items: [{ id: 'site-1', code: 'NP', displayName: 'North plant', status: 'ACTIVE' }],
        });
      return id === 'site-gone'
        ? NextResponse.json({}, { status: 404 })
        : NextResponse.json({ id, code: 'OLD', displayName: 'Old works', status: 'ARCHIVED' });
    });
    expect(await (await call('workspace-sites', '?ids=site-1,site-9,site-gone')).json()).toEqual([
      { value: 'site-1', label: 'North plant (NP)' },
      { value: 'site-9', label: 'Old works (OLD)' },
    ]);
    expect(places).toHaveBeenCalledTimes(3);
    expect(mostAtOnce).toBe(1);
  });

  it('passes the Geospatial refusal through, and refuses more than 25 places by id', async () => {
    places.mockImplementation(async () =>
      NextResponse.json({ code: 'GEOSPATIAL_ACCESS_DENIED' }, { status: 403 }),
    );
    expect((await call('workspace-sites', '?search=x')).status).toBe(403);
    expect((await call('workspace-sites', '?ids=site-1')).status).toBe(403);
    places.mockReset();
    const many = await call(
      'workspace-sites',
      `?ids=${Array.from({ length: 26 }, (_, index) => `p${index}`).join(',')}`,
    );
    expect(many.status).toBe(400);
    expect(places).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });
});
