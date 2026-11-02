import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MobileAuthService } from './mobile-auth.service.js';
import { MobileSopController } from './mobile-sop.controller.js';

// WI-OI-138 M-SOP: the mobile work-instruction adapter's gates and CMMS calls.
vi.mock('@gigalibs/auth-core', () => ({ buildPlatformContext: () => ({}), signPlatformContextToken: () => 'signed' }));
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const controllerFor = (permissions: string[]) => new MobileSopController({
  moduleSubject: vi.fn(async () => ({ tenant: { id: 't', entitlements: [{ moduleKey: 'asset-maintenance', status: 'ENABLED' }] }, permissions })),
} as unknown as MobileAuthService);
const codeOf = async (work: () => Promise<unknown> | unknown) => {
  try { await work(); } catch (error) { return (error as { getResponse(): { code: string } }).getResponse().code; }
  throw new Error('Expected a refusal.');
};
const step = { clientOperationId: ID, stepKey: 'isolate', outcome: 'CONFIRMED', recordedAt: '2026-11-02T06:00:00.000Z' };
const urlOf = (fetch: ReturnType<typeof vi.fn>) => String((fetch.mock.calls.at(-1) as unknown as [URL])[0]);

describe('mobile work-instruction adapter', () => {
  let fetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv('CMMS_API_URL', 'http://cmms-api:4200');
    vi.stubEnv('CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
    fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('lists only published procedures and reads step images by a checked key', async () => {
    const reader = controllerFor(['cmms.sop.read']);
    await reader.procedures({});
    expect(urlOf(fetch)).toBe('http://cmms-api:4200/v1/sop/procedures?status=PUBLISHED');
    await reader.stepImage({}, ID, 'isolate');
    expect(urlOf(fetch)).toBe(`http://cmms-api:4200/v1/sop/procedures/${ID}/steps/isolate/image`);
    expect(await codeOf(() => reader.stepImage({}, ID, '../x'))).toBe('MOBILE_REQUEST_INVALID');
    expect(await codeOf(() => reader.step({}, ID, step))).toBe('MOBILE_SCOPE_DENIED');
  });

  it('performs, countersigns and completes with sop.execute, refusing bad input first', async () => {
    const performer = controllerFor(['cmms.sop.read', 'cmms.sop.execute']);
    expect(await codeOf(() => performer.step({}, ID, { ...step, outcome: 'READING' }))).toBe('MOBILE_REQUEST_INVALID');
    expect(await codeOf(() => performer.start({}, { procedureId: ID }))).toBe('MOBILE_REQUEST_INVALID');
    await performer.step({}, ID, step);
    expect(urlOf(fetch)).toBe(`http://cmms-api:4200/v1/sop/executions/${ID}/steps`);
    await performer.cosign({}, ID, 'isolate');
    expect(urlOf(fetch)).toBe(`http://cmms-api:4200/v1/sop/executions/${ID}/steps/isolate/cosign`);
    await performer.awaiting({});
    expect(urlOf(fetch)).toBe('http://cmms-api:4200/v1/sop/executions?awaitingCosign=true');
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'CMMS_SOP_OFF_PATH' }), { status: 409 }));
    expect(await codeOf(() => performer.step({}, ID, step))).toBe('MOBILE_SOP_CONFLICT');
  });
});
