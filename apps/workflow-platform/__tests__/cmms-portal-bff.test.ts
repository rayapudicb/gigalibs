import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../app/api/public/cmms-portal/[action]/route';
import { portalApi } from '../../../modules/physical-operations-cmms/web/src/portal-api';
import { generatedModuleGateways } from '../lib/generated/module-gateways';

// WI-OI-140 M-REQ: the public portal's front door forwards three POST actions with the client's address and nothing
// of the browser's credentials; the managers' link routes reach the gateway; the portal routes are on no gateway.
const upstreamFetch = vi.fn<typeof fetch>();
const context = (action: string) => ({ params: Promise.resolve({ action }) });
const request = (action: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
  new Request(`https://plant.example.invalid/api/public/cmms-portal/${action}`, { method: 'POST', body: '{"token":"x"}', ...init });
const gateway = generatedModuleGateways['physical-operations-cmms']!;
const permissionFor = (method: string, path: string) =>
  gateway.routes.find((route) => new RegExp(route.pattern).test(path) && method in route.methods)?.methods[method];

describe('public request portal front door (WI-OI-140)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', upstreamFetch);
    vi.stubEnv('CONTROL_PLANE_API_URL', 'https://control.example.invalid');
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
    upstreamFetch.mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('forwards only the three actions, by POST, with the client address and no cookie or authorization', async () => {
    upstreamFetch.mockResolvedValue(new Response('{"assetTag":"HS-03"}', { status: 200 }));
    const response = await POST(request('context', {
      headers: { cookie: 'session=secret', authorization: 'Bearer secret', 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'x-tenant-id': 't' },
    }), context('context'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const [url, init] = upstreamFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe('https://control.example.invalid/api/v1/public/cmms-portal/context');
    const headers = new Headers(init.headers);
    expect(headers.get('x-gigalibs-client-address')).toBe('203.0.113.7');
    for (const name of ['cookie', 'authorization', 'x-tenant-id']) expect(headers.get(name)).toBeNull();
    expect((await POST(request('approve'), context('approve'))).status).toBe(404);
    expect((await GET()).status).toBe(404);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
  });

  it('answers in its own words when the control plane is unreachable or out of contract', async () => {
    upstreamFetch.mockRejectedValueOnce(new Error('down'));
    expect(await (await POST(request('requests'), context('requests'))).json()).toEqual({ code: 'PORTAL_UNAVAILABLE' });
    upstreamFetch.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    expect((await POST(request('status'), context('status'))).status).toBe(503);
  });

  it('routes the managers’ link calls through the gateway and lists no portal route on it', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
    for (const [call, method] of [
      [() => portalApi.links(ID), 'GET'], [() => portalApi.createLink({}), 'POST'], [() => portalApi.revoke(ID, 'x'), 'POST'],
      [() => portalApi.submissions(), 'GET'], [() => portalApi.photo(ID), 'GET'],
    ] as const) {
      fetch.mockClear();
      await call();
      const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(init.method ?? 'GET').toBe(method);
      expect(permissionFor(method, new URL(url, 'http://localhost').pathname.replace(/^\/api\/cmms\//, ''))).toBe('cmms.portal.manage');
    }
    for (const path of ['v1/portal/context', 'v1/portal/requests', 'v1/portal/status'])
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) expect(permissionFor(method, path)).toBeUndefined();
  });
});
