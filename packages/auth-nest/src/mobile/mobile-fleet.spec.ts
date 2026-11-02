import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MobileAuthService } from './mobile-auth.service.js';
import { MobileFleetController } from './mobile-fleet.controller.js';

// WI-OI-139 M-DVIR: the mobile fleet adapter's gates and CMMS calls.
vi.mock('@gigalibs/auth-core', () => ({ buildPlatformContext: () => ({}), signPlatformContextToken: () => 'signed' }));
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const controllerFor = (permissions: string[]) => new MobileFleetController({
  moduleSubject: vi.fn(async () => ({ tenant: { id: 't', entitlements: [{ moduleKey: 'asset-maintenance', status: 'ENABLED' }] }, permissions })),
} as unknown as MobileAuthService);
const codeOf = async (work: () => Promise<unknown> | unknown) => {
  try { await work(); } catch (error) { return (error as { getResponse(): { code: string } }).getResponse().code; }
  throw new Error('Expected a refusal.');
};
const at = '2026-11-02T06:00:00.000Z';
const inspection = {
  clientOperationId: ID, assetId: ID, templateId: ID, kind: 'PRE_TRIP', startedAt: at, submittedAt: at, certified: true,
  results: [{ itemKey: 'forks', outcome: 'PASS' }],
};
const urlOf = (fetch: ReturnType<typeof vi.fn>) => String((fetch.mock.calls.at(-1) as unknown as [URL])[0]);

describe('mobile fleet adapter', () => {
  let fetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv('CMMS_API_URL', 'http://cmms-api:4200');
    vi.stubEnv('CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
    fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('resolves a scanned tag and reads the asset with fleet.read; inspecting needs fleet.inspect', async () => {
    const reader = controllerFor(['cmms.fleet.read']);
    await reader.resolve({}, { kind: 'QR', value: 'FL-09' });
    expect(urlOf(fetch)).toBe('http://cmms-api:4200/v1/asset-tags/resolve?kind=QR&value=FL-09');
    await reader.asset({}, ID);
    expect(urlOf(fetch)).toBe(`http://cmms-api:4200/v1/fleet/assets/${ID}`);
    expect(await codeOf(() => reader.inspect({}, inspection))).toBe('MOBILE_SCOPE_DENIED');
    expect(await codeOf(() => reader.certify({}, ID, { expectedVersion: 1, correctiveAction: 'Fixed' }))).toBe('MOBILE_SCOPE_DENIED');
  });

  it('refuses a malformed inspection first and maps a changed check to the fleet conflict', async () => {
    const operator = controllerFor(['cmms.fleet.read', 'cmms.fleet.inspect']);
    expect(await codeOf(() => operator.inspect({}, { ...inspection, certified: false }))).toBe('MOBILE_REQUEST_INVALID');
    expect(await codeOf(() => operator.inspect({}, { ...inspection, results: [{ itemKey: 'forks', outcome: 'CRITICAL' }] })))
      .toBe('MOBILE_REQUEST_INVALID');
    await operator.inspect({}, inspection);
    expect(urlOf(fetch)).toBe('http://cmms-api:4200/v1/fleet/inspections');
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'CMMS_FLEET_TEMPLATE_CHANGED' }), { status: 409 }));
    expect(await codeOf(() => operator.inspect({}, inspection))).toBe('MOBILE_FLEET_CONFLICT');
  });
});
