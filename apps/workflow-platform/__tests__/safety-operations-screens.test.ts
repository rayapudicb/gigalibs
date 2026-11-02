import { afterEach, describe, expect, it, vi } from 'vitest';
import { safetyApi } from '../../../modules/safety-operations/web/src/safety-api';
import { generatedModuleGateways } from '../lib/generated/module-gateways';

// WI-OI-141 M-INC: every call the Safety Operations screens make reaches a gateway route with the controller's permission.
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const gateway = generatedModuleGateways['safety-operations']!;
const permissionFor = (method: string, path: string) =>
  gateway.routes.find((route) => new RegExp(route.pattern).test(path) && method in route.methods)?.methods[method];
afterEach(() => vi.unstubAllGlobals());

describe('Safety Operations screens reach the gateway', () => {
  it.each([
    ['report', () => safetyApi.report({}), 'POST', 'safety-operations.hazards.report'],
    ['mine', () => safetyApi.mine(), 'GET', 'safety-operations.hazards.report'],
    ['list', () => safetyApi.list({ status: 'REPORTED' }), 'GET', 'safety-operations.hazards.read'],
    ['insights', () => safetyApi.insights(90), 'GET', 'safety-operations.hazards.read'],
    ['get', () => safetyApi.get(ID), 'GET', 'safety-operations.hazards.report'],
    ['photo', () => safetyApi.photo(ID), 'GET', 'safety-operations.hazards.report'],
    ['triage', () => safetyApi.triage(ID, {}), 'POST', 'safety-operations.hazards.triage'],
    ['close', () => safetyApi.close(ID, {}), 'POST', 'safety-operations.hazards.triage'],
    ['investigate', () => safetyApi.investigate(ID, {}), 'POST', 'safety-operations.investigations.manage'],
    ['open alerts', () => safetyApi.openAlerts(), 'GET', 'safety-operations.hazards.report'],
    ['acknowledge', () => safetyApi.acknowledge(ID), 'POST', 'safety-operations.stop-work.acknowledge'],
    ['lift', () => safetyApi.lift(ID, {}), 'POST', 'safety-operations.stop-work.lift'],
  ] as const)('%s', async (_name, call, method, permission) => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await call();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method ?? 'GET').toBe(method);
    expect(permissionFor(method, new URL(url, 'http://localhost').pathname.replace(/^\/api\/safety-operations\//, ''))).toBe(permission);
  });
});
