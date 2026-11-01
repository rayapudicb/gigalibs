import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MobileAuthService } from './mobile-auth.service.js';
import { MobileSparesController } from './mobile-spares.controller.js';

// WI-OI-136 M-BOM: the mobile spares adapter's gates and CMMS calls.
vi.mock('@gigalibs/auth-core', () => ({ buildPlatformContext: () => ({}), signPlatformContextToken: () => 'signed' }));
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const controllerFor = (permissions: string[]) => new MobileSparesController({
  moduleSubject: vi.fn(async () => ({ tenant: { id: 't', entitlements: [{ moduleKey: 'asset-maintenance', status: 'ENABLED' }] }, permissions })),
} as unknown as MobileAuthService);
const codeOf = async (work: () => Promise<unknown> | unknown) => {
  try { await work(); } catch (error) { return (error as { getResponse(): { code: string } }).getResponse().code; }
  throw new Error('Expected a refusal.');
};

describe('mobile spares adapter', () => {
  let fetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv('CMMS_API_URL', 'http://cmms-api:4200');
    vi.stubEnv('CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
    fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('reads diagrams with bom.read and reserves only with parts.reserve', async () => {
    await controllerFor(['cmms.bom.read']).detail({}, ID);
    expect(String((fetch.mock.calls[0] as unknown as [URL])[0])).toBe(`http://cmms-api:4200/v1/diagrams/${ID}`);
    expect(await codeOf(() => controllerFor(['cmms.bom.read']).reserve({}, {
      clientOperationId: ID, partId: ID, workOrderId: ID, quantity: 1 }))).toBe('MOBILE_SCOPE_DENIED');
    expect(await codeOf(() => controllerFor(['cmms.parts.reserve']).image({}, ID))).toBe('MOBILE_SCOPE_DENIED');
  });

  it('maps a stock shortfall to the spares conflict and refuses bad input first', async () => {
    const controller = controllerFor(['cmms.parts.reserve']);
    expect(await codeOf(() => controller.reserve({}, { partId: ID }))).toBe('MOBILE_REQUEST_INVALID');
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'CMMS_PART_SHORT' }), { status: 409 }));
    expect(await codeOf(() => controller.reserve({}, { clientOperationId: ID, partId: ID, workOrderId: ID, quantity: 5 })))
      .toBe('MOBILE_SPARES_CONFLICT');
    await controllerFor(['cmms.bom.read']).resolve({}, { kind: 'QR', value: 'P-101' });
    expect(String((fetch.mock.calls.at(-1) as unknown as [URL])[0])).toBe('http://cmms-api:4200/v1/asset-tags/resolve?kind=QR&value=P-101');
  });
});
