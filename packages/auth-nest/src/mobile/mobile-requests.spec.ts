import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MobileAuthService } from './mobile-auth.service.js';
import { MobileRequestsController } from './mobile-requests.controller.js';

// WI-OI-140 M-REQ: the signed-in mobile report adapter's gate and CMMS calls.
vi.mock('@gigalibs/auth-core', () => ({ buildPlatformContext: () => ({}), signPlatformContextToken: () => 'signed' }));
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const controllerFor = (permissions: string[]) => new MobileRequestsController({
  moduleSubject: vi.fn(async () => ({ tenant: { id: 't', entitlements: [{ moduleKey: 'asset-maintenance', status: 'ENABLED' }] }, permissions })),
} as unknown as MobileAuthService);
const codeOf = async (work: () => Promise<unknown> | unknown) => {
  try { await work(); } catch (error) { return (error as { getResponse(): { code: string } }).getResponse().code; }
  throw new Error('Expected a refusal.');
};
const urlOf = (fetch: ReturnType<typeof vi.fn>) => String((fetch.mock.calls.at(-1) as unknown as [URL])[0]);

describe('mobile report adapter', () => {
  let fetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv('CMMS_API_URL', 'http://cmms-api:4200');
    vi.stubEnv('CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
    fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('reports and lists own reports with requests.report, and refuses bad input first', async () => {
    const member = controllerFor(['cmms.requests.report']);
    expect(await codeOf(() => member.report({}, { clientOperationId: ID, assetId: ID, issueType: 'OTHER' }))).toBe('MOBILE_REQUEST_INVALID');
    await member.report({}, { clientOperationId: ID, assetId: ID, issueType: 'LEAK' });
    expect(urlOf(fetch)).toBe('http://cmms-api:4200/v1/request-reports');
    await member.mine({});
    expect(urlOf(fetch)).toBe('http://cmms-api:4200/v1/request-reports/mine');
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'CMMS_REPORT_OPERATION_REUSED' }), { status: 409 }));
    expect(await codeOf(() => member.report({}, { clientOperationId: ID, assetId: ID, issueType: 'LEAK' }))).toBe('MOBILE_REPORT_CONFLICT');
    expect(await codeOf(() => controllerFor(['cmms.requests.create']).mine({}))).toBe('MOBILE_SCOPE_DENIED');
  });
});
