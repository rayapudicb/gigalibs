import { generateKeyPairSync } from 'node:crypto';
import { CALIBRATION_TECHNICIAN_STATEMENT } from '@gigalibs/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MobileAuthService } from './mobile-auth.service.js';
import { MobileCalibrationController } from './mobile-calibration.controller.js';

// WI-OI-134 M-CAL: the mobile Calibration adapter's gates and its CMMS call.
const signed = vi.hoisted(() => ({ contexts: [] as unknown[][] }));
vi.mock('@gigalibs/auth-core', () => ({
  buildPlatformContext: (...args: unknown[]) => { signed.contexts.push(args); return { claims: true }; },
  signPlatformContextToken: () => 'signed-cmms-context',
}));

const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const subject = (permissions: string[], moduleKey = 'asset-maintenance') => ({
  tenant: { id: 'tenant-a', entitlements: [{ moduleKey, status: 'ENABLED' }] }, permissions,
});
const controllerFor = (value: ReturnType<typeof subject>) =>
  new MobileCalibrationController({ moduleSubject: vi.fn(async () => value) } as unknown as MobileAuthService);
const codeOf = async (work: () => Promise<unknown> | unknown) => {
  try { await work(); } catch (error) { return (error as { getResponse(): { code: string } }).getResponse().code; }
  throw new Error('Expected the mobile request to be refused.');
};
const submission = {
  clientOperationId: ID, assetId: ID, profileId: ID, profileRevision: 1, standardIds: [ID],
  startedAt: '2026-11-01T08:00:00Z', completedAt: '2026-11-01T08:10:00Z',
  asFound: [{ position: 0, measuredOutput: 4 }, { position: 1, measuredOutput: 20 }], statement: CALIBRATION_TECHNICIAN_STATEMENT,
};

describe('mobile Calibration adapter', () => {
  beforeEach(() => {
    signed.contexts.length = 0;
    const { privateKey } = generateKeyPairSync('ed25519');
    vi.stubEnv('CMMS_API_URL', 'http://cmms-api:4200');
    vi.stubEnv('CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('refuses a workspace without CMMS and a member without the execute permission', async () => {
    expect(await codeOf(() => controllerFor(subject(['cmms.calibration.execute'], 'operator-rounds')).instruments({}))).toBe('MOBILE_SCOPE_DENIED');
    expect(await codeOf(() => controllerFor(subject(['cmms.calibration.read'])).instruments({}))).toBe('MOBILE_SCOPE_DENIED');
  });

  it('refuses malformed identifiers and submissions before calling CMMS', async () => {
    const controller = controllerFor(subject(['cmms.calibration.execute']));
    expect(await codeOf(() => controller.bundle({}, 'not-a-uuid'))).toBe('MOBILE_REQUEST_INVALID');
    expect(await codeOf(() => controller.submit({}, { ...submission, statement: 'ok' }))).toBe('MOBILE_REQUEST_INVALID');
  });

  it('is unavailable without the CMMS signing key', async () => {
    vi.stubEnv('CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', '');
    expect(await codeOf(() => controllerFor(subject(['cmms.calibration.execute'])).instruments({}))).toBe('MOBILE_UNAVAILABLE');
  });

  it('calls CMMS with a 60-second context signed for CMMS only, and maps a conflict', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ replayed: false, record: { id: ID } }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const controller = controllerFor(subject(['cmms.calibration.execute']));
    expect(await controller.submit({ 'x-correlation-id': 'corr-1' }, submission)).toEqual({ replayed: false, record: { id: ID } });
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://cmms-api:4200/v1/calibration/records');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer signed-cmms-context');
    expect(JSON.parse(String(init.body))).toMatchObject({ clientOperationId: ID, profileRevision: 1 });
    expect(signed.contexts[0]?.slice(1)).toEqual(['asset-maintenance', 'gigalibs-cmms-api', { ttlSeconds: 60 }]);
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'CMMS_CALIBRATION_PROFILE_CHANGED' }), { status: 409 }));
    expect(await codeOf(() => controller.submit({}, submission))).toBe('MOBILE_CALIBRATION_CONFLICT');
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: ID }), { status: 200 }));
    await controller.record({}, ID);
    expect(String((fetch.mock.calls[2] as unknown as [URL])[0])).toBe(`http://cmms-api:4200/v1/calibration/records/${ID}`);
  });
});
