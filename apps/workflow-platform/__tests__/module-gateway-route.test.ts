/**
 * WI-OI-083d — one generic route serves every module gateway the built solution declares. Unknown base paths answer
 * 404, contained routes answer "unavailable" to a signed-in tenant user exactly as the removed hand-written stubs did,
 * and a manifest's named body transform resolves to the shell's implementation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as gatewayRoute from '../app/api/[gateway]/[...path]/route';
import { generatedModuleGateways } from '../lib/generated/module-gateways';
import { moduleGatewayConfig } from '../lib/module-gateway';
import { composePunchBody } from '../lib/punch-geofence';
import { verifiedSession } from '../lib/verified-session';

vi.mock('../lib/verified-session', () => ({ verifiedSession: vi.fn() }));

const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';

const signedIn = {
  context: {
    user: { id: 'user-1', email: 'admin@example.invalid', name: 'Admin', status: 'ACTIVE' },
    tenant: { id: 'tenant-1', name: 'Plant', slug: 'plant', status: 'ACTIVE', features: [], entitlements: [] },
    roles: ['TENANT_ADMIN'],
    platformRoles: [],
    permissions: [],
  },
};

const call = (method: string, gateway: string, path: string) =>
  gatewayRoute[method as 'GET' | 'POST' | 'PATCH'](
    new Request(`http://127.0.0.1:5180/api/${gateway}/${path}`, {
      method,
      headers: { Origin: 'http://127.0.0.1:5180' },
    }),
    { params: Promise.resolve({ gateway, path: path.split('/') }) },
  );

afterEach(() => vi.mocked(verifiedSession).mockReset());

describe('generic module gateway route', () => {
  it('answers 404 for a base path no module declares, before any session work', async () => {
    const response = await call('GET', 'unknown-module', 'v1/anything');
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('GATEWAY_UNKNOWN');
    expect(verifiedSession).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', 'cmms', `work-orders/${ID}/financials`],
    ['POST', 'cmms', `work-orders/${ID}/labour-link`],
    ['POST', 'cmms', `work-orders/${ID}/settle`],
    ['GET', 'workforce', 'handovers'],
    ['POST', 'workforce', 'handovers'],
    ['POST', 'workforce', `handovers/${ID}/countersign`],
    ['GET', 'workforce', 'permits'],
    ['POST', 'workforce', 'permits'],
    ['POST', 'workforce', `permits/${ID}/approve`],
    ['POST', 'workforce', `permits/${ID}/close`],
  ])('keeps %s /api/%s/%s contained as unavailable', async (method, gateway, path) => {
    vi.mocked(verifiedSession).mockResolvedValue(signedIn as never);
    const response = await call(method, gateway, path);
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('CAPABILITY_UNAVAILABLE');
  });

  it('still requires a session for contained routes', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      response: new Response(null, { status: 401 }),
    } as never);
    expect((await call('POST', 'cmms', `work-orders/${ID}/settle`)).status).toBe(401);
  });

  it('sends a method a contained route does not list to the allow-list, which refuses it', async () => {
    vi.mocked(verifiedSession).mockResolvedValue(signedIn as never);
    const response = await call('GET', 'cmms', `work-orders/${ID}/settle`);
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('CMMS_ROUTE_UNSUPPORTED');
  });

  it('resolves every named body transform, and Workforce composes the punch geofence', () => {
    for (const module of Object.keys(generatedModuleGateways)) {
      expect(() => moduleGatewayConfig(module)).not.toThrow();
    }
    expect(moduleGatewayConfig('gigaops').transformBody).toBe(composePunchBody);
    expect(moduleGatewayConfig('physical-operations-cmms').transformBody).toBeUndefined();
  });
});
