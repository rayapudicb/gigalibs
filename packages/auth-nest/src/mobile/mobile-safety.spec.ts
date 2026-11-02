import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MobileAuthService } from './mobile-auth.service.js';
import { MobileSafetyController } from './mobile-safety.controller.js';

// WI-OI-141 M-INC: the mobile safety adapter's gates and Safety Operations calls.
vi.mock('@gigalibs/auth-core', () => ({ buildPlatformContext: () => ({}), signPlatformContextToken: () => 'signed' }));
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const controllerFor = (permissions: string[], moduleKey = 'safety-operations') => new MobileSafetyController({
  moduleSubject: vi.fn(async () => ({ tenant: { id: 't', entitlements: [{ moduleKey, status: 'ENABLED' }] }, permissions })),
} as unknown as MobileAuthService);
const codeOf = async (work: () => Promise<unknown> | unknown) => {
  try { await work(); } catch (error) { return (error as { getResponse(): { code: string } }).getResponse().code; }
  throw new Error('Expected a refusal.');
};
const urlOf = (fetch: ReturnType<typeof vi.fn>) => String((fetch.mock.calls.at(-1) as unknown as [URL])[0]);
const report = { clientOperationId: ID, severity: 'STOP_WORK', category: 'ELECTRICAL', description: 'Exposed wiring', area: 'MCC room',
  observedAt: '2026-11-02T06:00:00.000Z' };

describe('mobile safety adapter', () => {
  let fetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv('SAFETY_OPERATIONS_API_URL', 'http://module-host:4790/safety-operations');
    vi.stubEnv('SAFETY_OPERATIONS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
    fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('reports through the hosted module with hazards.report, and acknowledges only with stop-work.acknowledge', async () => {
    const worker = controllerFor(['safety-operations.hazards.report']);
    await worker.report({}, report);
    expect(urlOf(fetch)).toBe('http://module-host:4790/safety-operations/v1/hazards');
    await worker.alerts({});
    expect(urlOf(fetch)).toBe('http://module-host:4790/safety-operations/v1/stop-work');
    expect(await codeOf(() => worker.acknowledge({}, ID))).toBe('MOBILE_SCOPE_DENIED');
    expect(await codeOf(() => worker.report({}, { ...report, area: '' }))).toBe('MOBILE_REQUEST_INVALID');
  });

  it('needs the module entitled and maps a reused capture to the safety conflict', async () => {
    expect(await codeOf(() => controllerFor(['safety-operations.hazards.report'], 'asset-maintenance').mine({}))).toBe('MOBILE_SCOPE_DENIED');
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'SAFETY_OPERATIONS_OPERATION_REUSED' }), { status: 409 }));
    expect(await codeOf(() => controllerFor(['safety-operations.hazards.report']).report({}, report))).toBe('MOBILE_SAFETY_CONFLICT');
  });
});
