import { afterEach, describe, expect, it, vi } from 'vitest';
import { commissioningApi } from '../../../modules/physical-operations-cmms/web/src/commissioning-api';
import { generatedModuleGateways } from '../lib/generated/module-gateways';

// WI-OI-135 M-TAG: every call the Commissioning screens make reaches a CMMS gateway route with the controller's permission.
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const gateway = generatedModuleGateways['physical-operations-cmms']!;
const permissionFor = (method: string, path: string) =>
  gateway.routes.find((route) => new RegExp(route.pattern).test(path) && method in route.methods)?.methods[method];
afterEach(() => vi.unstubAllGlobals());

describe('CMMS Commissioning screens reach the gateway', () => {
  it.each([
    ['requests', () => commissioningApi.requests('SUBMITTED'), 'GET', 'cmms.commissioning.read'],
    ['request', () => commissioningApi.request(ID), 'GET', 'cmms.commissioning.read'],
    ['decide', () => commissioningApi.decide(ID, {}), 'POST', 'cmms.commissioning.approve'],
    ['resolve tag', () => commissioningApi.resolveTag('NFC', '04A2'), 'GET', 'cmms.assets.read'],
    ['asset tags', () => commissioningApi.assetTags(ID), 'GET', 'cmms.assets.read'],
    ['bind tag', () => commissioningApi.bindTag(ID, { kind: 'QR', value: 'x' }), 'POST', 'cmms.assets.write'],
    ['retire tag', () => commissioningApi.retireTag(ID, 'damaged'), 'POST', 'cmms.assets.write'],
    ['walks', () => commissioningApi.walks(), 'GET', 'cmms.audits.read'],
    ['report', () => commissioningApi.report(ID), 'GET', 'cmms.audits.read'],
    ['finish walk', () => commissioningApi.finishWalk(ID), 'POST', 'cmms.audits.execute'],
  ] as const)('%s', async (_name, call, method, permission) => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await call();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method ?? 'GET').toBe(method);
    expect(permissionFor(method, new URL(url, 'http://localhost').pathname.replace(/^\/api\/cmms\//, ''))).toBe(permission);
  });
});
