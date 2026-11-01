import { afterEach, describe, expect, it, vi } from 'vitest';
import { sparesApi } from '../../../modules/physical-operations-cmms/web/src/spares-api';
import { generatedModuleGateways } from '../lib/generated/module-gateways';

// WI-OI-136 M-BOM: every call the Visual Spares screens make reaches a CMMS gateway route with the controller's permission.
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const gateway = generatedModuleGateways['physical-operations-cmms']!;
const permissionFor = (method: string, path: string) =>
  gateway.routes.find((route) => new RegExp(route.pattern).test(path) && method in route.methods)?.methods[method];
afterEach(() => vi.unstubAllGlobals());

describe('CMMS Visual Spares screens reach the gateway', () => {
  it.each([
    ['diagrams', () => sparesApi.diagrams(ID), 'GET', 'cmms.bom.read'],
    ['create diagram', () => sparesApi.createDiagram(ID, {}), 'POST', 'cmms.bom.manage'],
    ['open work orders', () => sparesApi.openWorkOrders(ID), 'GET', 'cmms.work-orders.read'],
    ['detail', () => sparesApi.detail(ID), 'GET', 'cmms.bom.read'],
    ['image', () => sparesApi.image(ID), 'GET', 'cmms.bom.read'],
    ['consumption', () => sparesApi.consumption(ID), 'GET', 'cmms.bom.read'],
    ['hotspots', () => sparesApi.replaceHotspots(ID, {}), 'PUT', 'cmms.bom.manage'],
    ['revise', () => sparesApi.revise(ID, 1), 'POST', 'cmms.bom.manage'],
    ['publish', () => sparesApi.publish(ID, 1), 'POST', 'cmms.bom.publish'],
    ['reserve', () => sparesApi.reserve({}), 'POST', 'cmms.parts.reserve'],
    ['release', () => sparesApi.release(ID, 'x'), 'POST', 'cmms.parts.reserve'],
    ['reservations', () => sparesApi.reservations(ID), 'GET', 'cmms.parts.read'],
  ] as const)('%s', async (_name, call, method, permission) => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await call();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method ?? 'GET').toBe(method);
    expect(permissionFor(method, new URL(url, 'http://localhost').pathname.replace(/^\/api\/cmms\//, ''))).toBe(permission);
  });
});
