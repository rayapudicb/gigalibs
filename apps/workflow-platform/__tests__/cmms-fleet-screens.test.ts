import { afterEach, describe, expect, it, vi } from 'vitest';
import { fleetApi } from '../../../modules/physical-operations-cmms/web/src/fleet-api';
import { generatedModuleGateways } from '../lib/generated/module-gateways';

// WI-OI-139 M-DVIR: every call the Fleet Readiness screens make reaches a CMMS gateway route with the controller's permission.
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const gateway = generatedModuleGateways['physical-operations-cmms']!;
const permissionFor = (method: string, path: string) =>
  gateway.routes.find((route) => new RegExp(route.pattern).test(path) && method in route.methods)?.methods[method];
afterEach(() => vi.unstubAllGlobals());

describe('CMMS Fleet Readiness screens reach the gateway', () => {
  it.each([
    ['readiness', () => fleetApi.readiness(), 'GET', 'cmms.fleet.read'],
    ['asset', () => fleetApi.asset(ID), 'GET', 'cmms.fleet.read'],
    ['templates', () => fleetApi.templates('PUBLISHED'), 'GET', 'cmms.fleet.read'],
    ['template', () => fleetApi.template(ID), 'GET', 'cmms.fleet.read'],
    ['create template', () => fleetApi.createTemplate({}), 'POST', 'cmms.fleet.manage'],
    ['update template', () => fleetApi.updateTemplate(ID, {}), 'PATCH', 'cmms.fleet.manage'],
    ['publish', () => fleetApi.templateAction(ID, 'publish', 1), 'POST', 'cmms.fleet.manage'],
    ['revise', () => fleetApi.templateAction(ID, 'revise', 1), 'POST', 'cmms.fleet.manage'],
    ['retire', () => fleetApi.templateAction(ID, 'retire', 1), 'POST', 'cmms.fleet.manage'],
    ['enrol', () => fleetApi.enroll({}), 'PUT', 'cmms.fleet.manage'],
    ['inspections', () => fleetApi.inspections({ assetId: ID }), 'GET', 'cmms.fleet.read'],
    ['inspection', () => fleetApi.inspection(ID), 'GET', 'cmms.fleet.read'],
    ['photo', () => fleetApi.photo(ID, 'forks'), 'GET', 'cmms.fleet.read'],
    ['groundings', () => fleetApi.groundings('ALL'), 'GET', 'cmms.fleet.read'],
    ['red tag', () => fleetApi.ground({}), 'POST', 'cmms.fleet.inspect'],
    ['certify', () => fleetApi.certify(ID, {}), 'POST', 'cmms.fleet.certify'],
    ['clear', () => fleetApi.clear(ID, {}), 'POST', 'cmms.fleet.authorize'],
  ] as const)('%s', async (_name, call, method, permission) => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await call();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method ?? 'GET').toBe(method);
    expect(permissionFor(method, new URL(url, 'http://localhost').pathname.replace(/^\/api\/cmms\//, ''))).toBe(permission);
  });
});
