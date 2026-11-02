import { afterEach, describe, expect, it, vi } from 'vitest';
import { permitsApi } from '../../../modules/physical-operations-cmms/web/src/permits-api';
import { generatedModuleGateways } from '../lib/generated/module-gateways';

// WI-OI-142 M-LOTO: every call the Permits & LOTO screens make reaches a CMMS gateway route with the controller's permission.
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const gateway = generatedModuleGateways['physical-operations-cmms']!;
const permissionFor = (method: string, path: string) =>
  gateway.routes.find((route) => new RegExp(route.pattern).test(path) && method in route.methods)?.methods[method];
afterEach(() => vi.unstubAllGlobals());

describe('CMMS Permits & LOTO screens reach the gateway', () => {
  it.each([
    ['procedures', () => permitsApi.procedures('PUBLISHED'), 'GET', 'cmms.permits.read'],
    ['create procedure', () => permitsApi.createProcedure({}), 'POST', 'cmms.isolations.manage'],
    ['update procedure', () => permitsApi.updateProcedure(ID, {}), 'PATCH', 'cmms.isolations.manage'],
    ['publish procedure', () => permitsApi.procedureAction(ID, 'publish', 1), 'POST', 'cmms.isolations.manage'],
    ['revise procedure', () => permitsApi.procedureAction(ID, 'revise', 1), 'POST', 'cmms.isolations.manage'],
    ['list', () => permitsApi.list('ACTIVE'), 'GET', 'cmms.permits.read'],
    ['get', () => permitsApi.get(ID), 'GET', 'cmms.permits.read'],
    ['request', () => permitsApi.request({}), 'POST', 'cmms.permits.request'],
    ['lock point', () => permitsApi.point(ID, 'breaker', 'lock', {}), 'POST', 'cmms.permits.request'],
    ['verify point', () => permitsApi.point(ID, 'breaker', 'verify', {}), 'POST', 'cmms.permits.request'],
    ['remove lock', () => permitsApi.point(ID, 'breaker', 'remove', {}), 'POST', 'cmms.permits.request'],
    ['witness', () => permitsApi.point(ID, 'breaker', 'witness', {}), 'POST', 'cmms.permits.authorize'],
    ['photo', () => permitsApi.photo(ID, 'breaker'), 'GET', 'cmms.permits.read'],
    ['gas test', () => permitsApi.gasTest(ID, {}), 'POST', 'cmms.permits.request'],
    ['authorize', () => permitsApi.act(ID, 'authorize', {}), 'POST', 'cmms.permits.authorize'],
    ['countersign', () => permitsApi.act(ID, 'countersign', {}), 'POST', 'cmms.permits.countersign'],
    ['de-isolate', () => permitsApi.act(ID, 'de-isolate', {}), 'POST', 'cmms.permits.request'],
    ['close', () => permitsApi.act(ID, 'close', {}), 'POST', 'cmms.permits.authorize'],
    ['cancel', () => permitsApi.act(ID, 'cancel', {}), 'POST', 'cmms.permits.request'],
    ['lock on', () => permitsApi.lock(ID, 'lock-on'), 'POST', 'cmms.permits.lock'],
    ['lock off', () => permitsApi.lock(ID, 'lock-off'), 'POST', 'cmms.permits.lock'],
  ] as const)('%s', async (_name, call, method, permission) => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await call();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method ?? 'GET').toBe(method);
    expect(permissionFor(method, new URL(url, 'http://localhost').pathname.replace(/^\/api\/cmms\//, ''))).toBe(permission);
  });
});
