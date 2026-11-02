import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MobileAuthService } from './mobile-auth.service.js';
import { MobilePermitsController } from './mobile-permits.controller.js';

// WI-OI-142 M-LOTO: the mobile permit adapter's gates and CMMS calls.
vi.mock('@gigalibs/auth-core', () => ({ buildPlatformContext: () => ({}), signPlatformContextToken: () => 'signed' }));
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const controllerFor = (permissions: string[]) => new MobilePermitsController({
  moduleSubject: vi.fn(async () => ({ tenant: { id: 't', entitlements: [{ moduleKey: 'asset-maintenance', status: 'ENABLED' }] }, permissions })),
} as unknown as MobileAuthService);
const codeOf = async (work: () => Promise<unknown> | unknown) => {
  try { await work(); } catch (error) { return (error as { getResponse(): { code: string } }).getResponse().code; }
  throw new Error('Expected a refusal.');
};
const urlOf = (fetch: ReturnType<typeof vi.fn>) => String((fetch.mock.calls.at(-1) as unknown as [URL])[0]);
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64, 7)]).toString('base64');

describe('mobile permit adapter', () => {
  let fetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv('CMMS_API_URL', 'http://cmms-api:4200');
    vi.stubEnv('CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
    fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('locks a checked point with a photo, and signs a personal lock only with permits.lock', async () => {
    const tech = controllerFor(['cmms.permits.read', 'cmms.permits.request', 'cmms.permits.lock']);
    await tech.lock({}, ID, 'breaker', { expectedVersion: 1, lockSerial: 'L-22', photoContentType: 'image/png', photoBase64: png });
    expect(urlOf(fetch)).toBe(`http://cmms-api:4200/v1/permits/${ID}/points/breaker/lock`);
    expect(await codeOf(() => tech.lock({}, ID, '../x', { expectedVersion: 1 }))).toBe('MOBILE_REQUEST_INVALID');
    expect(await codeOf(() => tech.verify({}, ID, 'breaker', { expectedVersion: 1, zeroEnergyConfirmed: false }))).toBe('MOBILE_REQUEST_INVALID');
    await tech.mine({});
    expect(urlOf(fetch)).toBe('http://cmms-api:4200/v1/permits?mine=true');
    expect(await codeOf(() => controllerFor(['cmms.permits.read', 'cmms.permits.request']).lockOn({}, ID))).toBe('MOBILE_SCOPE_DENIED');
    await controllerFor(['cmms.permits.lock']).lockOn({}, ID);
    expect(urlOf(fetch)).toBe(`http://cmms-api:4200/v1/permits/${ID}/lock-on`);
  });

  it('maps a refused step to the permit conflict', async () => {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'CMMS_PERMIT_LOCKS_ON' }), { status: 409 }));
    expect(await codeOf(() => controllerFor(['cmms.permits.request']).deIsolate({}, ID, { expectedVersion: 3 }))).toBe('MOBILE_PERMIT_CONFLICT');
  });
});
