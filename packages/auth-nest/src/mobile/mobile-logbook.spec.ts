import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MobileAuthService } from './mobile-auth.service.js';
import { MobileLogbookController } from './mobile-logbook.controller.js';

// WI-OI-137 M-LOG: the mobile logbook adapter calls Workforce with a Workforce-signed context.
const signed = vi.hoisted(() => ({ contexts: [] as unknown[][] }));
vi.mock('@gigalibs/auth-core', () => ({
  buildPlatformContext: (...args: unknown[]) => { signed.contexts.push(args); return {}; },
  signPlatformContextToken: () => 'signed',
}));
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const controllerFor = (permissions: string[], moduleKey = 'gigaops') => new MobileLogbookController({
  moduleSubject: vi.fn(async () => ({ tenant: { id: 't', entitlements: [{ moduleKey, status: 'ENABLED' }] }, permissions })),
} as unknown as MobileAuthService);
const codeOf = async (work: () => Promise<unknown> | unknown) => {
  try { await work(); } catch (error) { return (error as { getResponse(): { code: string } }).getResponse().code; }
  throw new Error('Expected a refusal.');
};

describe('mobile logbook adapter', () => {
  let fetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    signed.contexts.length = 0;
    vi.stubEnv('WORKFORCE_API_URL', 'http://workforce-api:4700');
    vi.stubEnv('WORKFORCE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
    fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('reads with logbook.read through a context signed for Workforce', async () => {
    await controllerFor(['workforce.logbook.read']).board({}, ID);
    expect(String((fetch.mock.calls[0] as unknown as [URL])[0])).toBe(`http://workforce-api:4700/v1/logbooks/${ID}/board`);
    expect(signed.contexts[0]?.slice(1)).toEqual(['gigaops', 'gigalibs-workforce-api', { ttlSeconds: 60 }]);
  });

  it('needs logbook.write to log, refuses without Workforce, and maps a conflict', async () => {
    const entry = { clientOperationId: ID, category: 'NOTE', text: 'Quiet', occurredAt: '2026-11-02T08:00:00Z' };
    expect(await codeOf(() => controllerFor(['workforce.logbook.read']).entry({}, ID, entry))).toBe('MOBILE_SCOPE_DENIED');
    expect(await codeOf(() => controllerFor(['workforce.logbook.write'], 'asset-maintenance').entry({}, ID, entry))).toBe('MOBILE_SCOPE_DENIED');
    expect(await codeOf(() => controllerFor(['workforce.logbook.write']).accept({}, ID, { expectedVersion: 1 }))).toBe('MOBILE_REQUEST_INVALID');
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'WORKFORCE_HANDOVER_BYPASSES_CHANGED' }), { status: 409 }));
    expect(await codeOf(() => controllerFor(['workforce.logbook.write']).accept({}, ID, {
      expectedVersion: 1, acknowledgedBypassIds: [], statement: 'I reviewed this turnover and every active bypass, and I accept custody of the unit.',
    }))).toBe('MOBILE_LOGBOOK_CONFLICT');
  });
});
