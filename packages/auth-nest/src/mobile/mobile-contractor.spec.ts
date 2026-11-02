import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MobileAuthService } from './mobile-auth.service.js';
import { MobileContractorController } from './mobile-contractor.controller.js';

vi.mock('@gigalibs/auth-core', () => ({ buildPlatformContext: () => ({}), signPlatformContextToken: () => 'signed' }));
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const controllerFor = (permissions: string[], moduleKey = 'safety-operations') => new MobileContractorController({
  moduleSubject: vi.fn(async () => ({ tenant: { id: 't', entitlements: [{ moduleKey, status: 'ENABLED' }] }, permissions })),
} as unknown as MobileAuthService);
const codeOf = async (work: () => Promise<unknown> | unknown) => {
  try { await work(); } catch (error) { return (error as { getResponse(): { code: string } }).getResponse().code; }
  throw new Error('Expected a refusal.');
};
const urlOf = (fetch: ReturnType<typeof vi.fn>) => String((fetch.mock.calls.at(-1) as unknown as [URL])[0]);

describe('mobile contractor adapter', () => {
  let fetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv('SAFETY_OPERATIONS_API_URL', 'http://module-host:4790/safety-operations');
    vi.stubEnv('SAFETY_OPERATIONS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
    fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('forwards enroll and verify with the right permissions', async () => {
    const worker = controllerFor(['safety-operations.contractors.worker']);
    await worker.enroll({}, { clientOperationId: ID, companyCode: 'APEX', displayName: 'Jane Doe' });
    expect(urlOf(fetch)).toBe('http://module-host:4790/safety-operations/v1/contractor-workers/enroll');
    expect(await codeOf(() => worker.verify({}, { clientOperationId: ID, passId: ID, passSecret: 'a'.repeat(64) }))).toBe('MOBILE_SCOPE_DENIED');
    const gate = controllerFor(['safety-operations.contractors.gate']);
    await gate.verify({}, { clientOperationId: ID, passId: ID, passSecret: 'a'.repeat(64) });
    expect(urlOf(fetch)).toBe('http://module-host:4790/safety-operations/v1/contractor-passes/verify');
  });

  it('needs safety-operations entitled and maps module conflicts', async () => {
    expect(await codeOf(() => controllerFor(['safety-operations.contractors.worker'], 'asset-maintenance').enroll({}, {
      clientOperationId: ID, companyCode: 'APEX', displayName: 'Jane',
    }))).toBe('MOBILE_SCOPE_DENIED');
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'SAFETY_OPERATIONS_OPERATION_REUSED' }), { status: 409 }));
    expect(await codeOf(() => controllerFor(['safety-operations.contractors.worker']).enroll({}, {
      clientOperationId: ID, companyCode: 'APEX', displayName: 'Jane',
    }))).toBe('MOBILE_CONTRACTOR_CONFLICT');
  });
});
