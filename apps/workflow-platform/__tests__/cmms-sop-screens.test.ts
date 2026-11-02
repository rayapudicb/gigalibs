import { afterEach, describe, expect, it, vi } from 'vitest';
import { sopApi } from '../../../modules/physical-operations-cmms/web/src/sop-api';
import { generatedModuleGateways } from '../lib/generated/module-gateways';

// WI-OI-138 M-SOP: every call the Work Instructions screens make reaches a CMMS gateway route with the controller's permission.
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const gateway = generatedModuleGateways['physical-operations-cmms']!;
const permissionFor = (method: string, path: string) =>
  gateway.routes.find((route) => new RegExp(route.pattern).test(path) && method in route.methods)?.methods[method];
afterEach(() => vi.unstubAllGlobals());

describe('CMMS Work Instructions screens reach the gateway', () => {
  it.each([
    ['procedures', () => sopApi.procedures('PUBLISHED'), 'GET', 'cmms.sop.read'],
    ['procedure', () => sopApi.procedure(ID), 'GET', 'cmms.sop.read'],
    ['create', () => sopApi.create({}), 'POST', 'cmms.sop.author'],
    ['update', () => sopApi.update(ID, {}), 'PATCH', 'cmms.sop.author'],
    ['revise', () => sopApi.lifecycle(ID, 'revise', 1), 'POST', 'cmms.sop.author'],
    ['submit', () => sopApi.lifecycle(ID, 'submit', 1), 'POST', 'cmms.sop.author'],
    ['approve', () => sopApi.lifecycle(ID, 'approve', 1), 'POST', 'cmms.sop.approve'],
    ['reject', () => sopApi.lifecycle(ID, 'reject', 1, 'why'), 'POST', 'cmms.sop.approve'],
    ['withdraw', () => sopApi.lifecycle(ID, 'withdraw', 1), 'POST', 'cmms.sop.approve'],
    ['upload step image', () => sopApi.uploadStepImage(ID, 'isolate', {}), 'PUT', 'cmms.sop.author'],
    ['step image', () => sopApi.stepImage(ID, 'isolate'), 'GET', 'cmms.sop.read'],
    ['durations', () => sopApi.durations(ID), 'GET', 'cmms.sop.read'],
    ['add feedback', () => sopApi.addFeedback(ID, { stepKey: 'isolate', text: 'x' }), 'POST', 'cmms.sop.execute'],
    ['feedback', () => sopApi.feedback('OPEN'), 'GET', 'cmms.sop.read'],
    ['resolve feedback', () => sopApi.resolveFeedback(ID, 'done'), 'POST', 'cmms.sop.author'],
    ['executions', () => sopApi.executions({ awaitingCosign: true }), 'GET', 'cmms.sop.read'],
    ['start', () => sopApi.start({}), 'POST', 'cmms.sop.execute'],
    ['execution', () => sopApi.execution(ID), 'GET', 'cmms.sop.read'],
    ['record step', () => sopApi.recordStep(ID, {}), 'POST', 'cmms.sop.execute'],
    ['cosign', () => sopApi.cosign(ID, 'isolate'), 'POST', 'cmms.sop.execute'],
    ['complete', () => sopApi.complete(ID), 'POST', 'cmms.sop.execute'],
    ['photo', () => sopApi.photo(ID, 'evidence'), 'GET', 'cmms.sop.read'],
  ] as const)('%s', async (_name, call, method, permission) => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await call();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method ?? 'GET').toBe(method);
    expect(permissionFor(method, new URL(url, 'http://localhost').pathname.replace(/^\/api\/cmms\//, ''))).toBe(permission);
  });
});
