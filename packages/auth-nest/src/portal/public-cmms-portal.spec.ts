import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// WI-OI-140 M-REQ: the public portal adapter: token shape, live entitled tenant, the portal principal, what CMMS
// receives, how answers map, and the per-address throttle.
const built: unknown[] = [];
vi.mock('@gigalibs/auth-core', () => ({
  buildPlatformContext: (subject: unknown) => { built.push(subject); return {}; },
  signPlatformContextToken: () => 'signed',
}));
const findFirst = vi.fn();
vi.mock('@gigalibs/db', () => ({ prisma: { tenant: { findFirst: (...args: unknown[]) => findFirst(...args) } } }));
const { PortalThrottle, PublicCmmsPortalController } = await import('./public-cmms-portal.controller.js');

const LINK = '10000000-0000-4000-8000-000000000001';
const SECRET = 'S'.repeat(43);
const token = `tenant-a.${LINK}.${SECRET}`;
const codeOf = async (work: () => Promise<unknown>) => {
  try { await work(); } catch (error) { return (error as { code?: string }).code; }
  throw new Error('Expected a refusal.');
};
const receipt = { requestNumber: 'REQ-000042', statusToken: `tenant-a.${LINK}.${'T'.repeat(43)}`, replayed: false };

describe('public CMMS request portal adapter', () => {
  let fetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    built.length = 0;
    vi.stubEnv('CMMS_API_URL', 'http://cmms-api:4200');
    vi.stubEnv('CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
    findFirst.mockResolvedValue({ id: 'tenant-a', moduleEntitlements: [{ moduleKey: 'asset-maintenance', status: 'ENABLED', updatedAt: new Date() }] });
    fetch = vi.fn(async () => new Response(JSON.stringify(receipt), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); findFirst.mockReset(); });

  it('refuses a malformed token or body before any lookup', async () => {
    const portal = new PublicCmmsPortalController();
    expect(await codeOf(() => portal.submit({}, { token: 'nope', clientOperationId: LINK, issueType: 'LEAK' }))).toBe('PORTAL_REQUEST_INVALID');
    expect(await codeOf(() => portal.submit({}, { token, clientOperationId: LINK, issueType: 'FIRE' }))).toBe('PORTAL_REQUEST_INVALID');
    expect(findFirst).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('treats an unknown or unentitled tenant as an invalid link, without calling CMMS', async () => {
    findFirst.mockResolvedValueOnce(null);
    expect(await codeOf(() => new PublicCmmsPortalController().context({}, { token }))).toBe('PORTAL_LINK_INVALID');
    findFirst.mockResolvedValueOnce({ id: 'tenant-a', moduleEntitlements: [] });
    expect(await codeOf(() => new PublicCmmsPortalController().context({}, { token }))).toBe('PORTAL_LINK_INVALID');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('calls CMMS as the portal principal with the capability, never the raw token, and a keyed client reference', async () => {
    const portal = new PublicCmmsPortalController();
    expect(await portal.submit({ 'x-gigalibs-client-address': '203.0.113.7' }, { token, clientOperationId: LINK, issueType: 'LEAK' })).toEqual(receipt);
    expect(built[0]).toMatchObject({ user: { id: `portal:${LINK}` }, tenant: { id: 'tenant-a' }, permissions: ['cmms.portal.submit'], roles: [] });
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://cmms-api:4200/v1/portal/requests');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ linkId: LINK, secret: SECRET, issueType: 'LEAK', clientKey: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(body.token).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('203.0.113.7');
  });

  it('maps CMMS answers without echoing them', async () => {
    const portal = new PublicCmmsPortalController();
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'CMMS_PORTAL_RATE_LIMITED' }), { status: 429 }));
    expect(await codeOf(() => portal.submit({}, { token, clientOperationId: LINK, issueType: 'LEAK' }))).toBe('PORTAL_BUSY');
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'CMMS_PORTAL_LINK_INVALID' }), { status: 404 }));
    expect(await codeOf(() => portal.context({}, { token }))).toBe('PORTAL_LINK_INVALID');
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ...receipt, internal: 'x' }), { status: 200 }));
    expect(await codeOf(() => portal.submit({}, { token, clientOperationId: LINK, issueType: 'LEAK' }))).toBe('PORTAL_UNAVAILABLE');
  });

  it('throttles one address per window', () => {
    const throttle = new PortalThrottle(2, 60_000);
    expect([throttle.allow('a', 0), throttle.allow('a', 1), throttle.allow('a', 2), throttle.allow('b', 2), throttle.allow('a', 60_001)])
      .toEqual([true, true, false, true, true]);
  });
});
