import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MobileAuthService } from './mobile-auth.service.js';
import { MobileCommissioningController } from './mobile-commissioning.controller.js';

// WI-OI-135 M-TAG: the mobile commissioning adapter's gates, tag lookup query and CMMS calls.
vi.mock('@gigalibs/auth-core', () => ({
  buildPlatformContext: () => ({ claims: true }),
  signPlatformContextToken: () => 'signed-cmms-context',
}));

const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const controllerFor = (permissions: string[]) => new MobileCommissioningController({
  moduleSubject: vi.fn(async () => ({ tenant: { id: 't', entitlements: [{ moduleKey: 'asset-maintenance', status: 'ENABLED' }] }, permissions })),
} as unknown as MobileAuthService);
const codeOf = async (work: () => Promise<unknown> | unknown) => {
  try { await work(); } catch (error) { return (error as { getResponse(): { code: string } }).getResponse().code; }
  throw new Error('Expected the mobile request to be refused.');
};

describe('mobile commissioning adapter', () => {
  let fetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    const { privateKey } = generateKeyPairSync('ed25519');
    vi.stubEnv('CMMS_API_URL', 'http://cmms-api:4200');
    vi.stubEnv('CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
    fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('gates proposals on submit and walks on execute', async () => {
    expect(await codeOf(() => controllerFor(['cmms.audits.execute']).context({}))).toBe('MOBILE_SCOPE_DENIED');
    expect(await codeOf(() => controllerFor(['cmms.commissioning.submit']).start({}, {
      clientOperationId: ID, label: 'Walk', spaceId: ID }))).toBe('MOBILE_SCOPE_DENIED');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses malformed bodies and ids before calling CMMS', async () => {
    const controller = controllerFor(['cmms.commissioning.submit', 'cmms.audits.execute']);
    expect(await codeOf(() => controller.submit({}, { clientOperationId: ID, name: 'x' }))).toBe('MOBILE_REQUEST_INVALID');
    expect(await codeOf(() => controller.resolve({}, { kind: 'NFC', value: 'zz' }))).toBe('MOBILE_REQUEST_INVALID');
    expect(await codeOf(() => controller.finish({}, 'nope'))).toBe('MOBILE_REQUEST_INVALID');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('turns a tag lookup body into the CMMS resolve query, normalised', async () => {
    await controllerFor(['cmms.audits.execute']).resolve({}, { kind: 'NFC', value: '04:a2:b3' });
    expect(String((fetch.mock.calls[0] as unknown as [URL])[0])).toBe('http://cmms-api:4200/v1/asset-tags/resolve?kind=NFC&value=04A2B3');
  });

  it('posts sightings and finishes walks, and maps a conflict', async () => {
    const controller = controllerFor(['cmms.audits.execute']);
    await controller.sighting({}, ID, { clientOperationId: ID, tag: { kind: 'QR', value: 'P-1' }, seenAt: '2026-11-01T08:00:00Z' });
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe(`http://cmms-api:4200/v1/asset-audits/${ID}/sightings`);
    expect(init.method).toBe('POST');
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'CMMS_AUDIT_FINISHED' }), { status: 409 }));
    expect(await codeOf(() => controller.finish({}, ID))).toBe('MOBILE_COMMISSIONING_CONFLICT');
  });
});
