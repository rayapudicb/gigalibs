import { afterEach, describe, expect, it, vi } from 'vitest';
import { calibrationApi } from '../../../modules/physical-operations-cmms/web/src/calibration-api';
import { generatedModuleGateways } from '../lib/generated/module-gateways';

// WI-OI-134 M-CAL: every call the Calibration screens make reaches a CMMS gateway route, with the permission the
// CMMS controller requires.
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const gateway = generatedModuleGateways['physical-operations-cmms']!;
const permissionFor = (method: string, path: string) => {
  const route = gateway.routes.find((candidate) => new RegExp(candidate.pattern).test(path) && method in candidate.methods);
  return route?.methods[method];
};

afterEach(() => vi.unstubAllGlobals());

describe('CMMS Calibration screens reach the gateway', () => {
  it.each([
    ['instruments', () => calibrationApi.instruments(), 'GET', 'cmms.calibration.read'],
    ['bundle', () => calibrationApi.bundle(ID), 'GET', 'cmms.calibration.read'],
    ['drift', () => calibrationApi.drift(ID), 'GET', 'cmms.calibration.read'],
    ['standards', () => calibrationApi.standards(), 'GET', 'cmms.calibration.read'],
    ['create standard', () => calibrationApi.createStandard({}), 'POST', 'cmms.calibration.manage'],
    ['update standard', () => calibrationApi.updateStandard(ID, {}), 'PATCH', 'cmms.calibration.manage'],
    ['profiles', () => calibrationApi.profiles(ID), 'GET', 'cmms.calibration.read'],
    ['create profile', () => calibrationApi.createProfile({}), 'POST', 'cmms.calibration.manage'],
    ['update profile', () => calibrationApi.updateProfile(ID, {}), 'PATCH', 'cmms.calibration.manage'],
    ['publish profile', () => calibrationApi.publishProfile(ID, 1), 'POST', 'cmms.calibration.publish'],
    ['records', () => calibrationApi.records({ status: 'SUBMITTED', assetId: ID, page: 2 }), 'GET', 'cmms.calibration.read'],
    ['record', () => calibrationApi.record(ID), 'GET', 'cmms.calibration.read'],
    ['submit', () => calibrationApi.submit({}), 'POST', 'cmms.calibration.execute'],
    ['decide', () => calibrationApi.decide(ID, {}), 'POST', 'cmms.calibration.approve'],
    ['certificate', () => calibrationApi.certificate(ID), 'GET', 'cmms.calibration.read'],
  ] as const)('%s', async (_name, call, method, permission) => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await call();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method ?? 'GET').toBe(method);
    const path = new URL(url, 'http://localhost').pathname.replace(/^\/api\/cmms\//, '');
    expect(permissionFor(method, path)).toBe(permission);
  });
});
