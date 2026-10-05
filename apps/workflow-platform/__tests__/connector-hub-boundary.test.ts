import { generateKeyPairSync } from 'node:crypto';
import { verifyPlatformContextToken } from '@gigalibs/auth-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getHub, POST as postHub } from '../app/api/connectors-hub/[...path]/route';
import { verifiedSession } from '../lib/verified-session';

vi.mock('../lib/verified-session', () => ({ verifiedSession: vi.fn() }));

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const context = (permissions: string[]) => ({
  user: { id: 'usr-hub', email: 'ops@example.invalid', name: 'Ops', status: 'ACTIVE' },
  tenant: {
    id: 'tenant-hub',
    name: 'Hub Corp',
    slug: 'hub-corp',
    status: 'ACTIVE',
    trialEndsAt: null,
    features: ['connections'],
    entitlements: [{ moduleKey: 'connections', status: 'ENABLED', version: '2026-09-30T00:00:00.000Z' }],
  },
  permissions,
  roles: ['MANAGER'],
  platformRoles: [],
  authVersion: 1,
  session: { id: 'session-hub', expiresAt: '2099-01-01T00:00:00Z' },
  orgScope: { mode: 'FLAT_TENANT' },
  spatialScope: { mode: 'UNBOUNDED' },
  mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
});
const sameOrigin = { Host: 'platform.example.invalid', Origin: 'https://platform.example.invalid', 'Content-Type': 'application/json' };
const call = (handler: typeof getHub, method: string, path: string[], init: RequestInit = {}) =>
  handler(new Request(`https://platform.example.invalid/api/connectors-hub/${path.join('/')}`, { method, ...init }), {
    params: Promise.resolve({ path }),
  });

// WI-OI-104a: the BFF signs a PlatformContextV1 for Connector Hub and allows only listed routes, each with a permission.
describe('Connector Hub signed BFF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CONNECTOR_HUB_API_URL', 'http://127.0.0.1:4100');
    vi.stubEnv('CONNECTOR_HUB_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('forwards a signed context for the hub path and never an X-Tenant-Id header', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({ context: context(['connections:read']) } as never);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const response = await call(getHub, 'GET', ['connections'], { headers: { 'X-Tenant-Id': 'tenant-attacker' } });
    expect(response.status).toBe(200);
    const [target, init] = fetchSpy.mock.calls[0]!;
    expect(String(target)).toBe('http://127.0.0.1:4100/api/connectors/v1/connections');
    const headers = new Headers(init?.headers);
    expect(headers.get('x-tenant-id')).toBeNull();
    const token = headers.get('authorization')!.replace('Bearer ', '');
    const signed = verifyPlatformContextToken(token, publicKey.export({ format: 'pem', type: 'spki' }).toString(), 'gigalibs-connector-hub-api');
    expect(signed).toMatchObject({ tenant_id: 'tenant-hub', granted_scopes: ['connections:read'], entitlement: { module_key: 'connections' } });
  });

  it('lets a manager read and test but not create or sync; connections:* may do both', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.mocked(verifiedSession).mockResolvedValue({ context: context(['connections:read', 'connections:test']) } as never);
    for (const path of [['catalog'], ['connections'], ['connections', 'c1'], ['journal'], ['stats'], ['connections', 'c1', 'sync-jobs'], ['connections', 'c1', 'quarantine']]) {
      expect((await call(getHub, 'GET', path)).status).toBe(200);
    }
    expect((await call(postHub, 'POST', ['connections', 'c1', 'test'], { headers: sameOrigin, body: '{}' })).status).toBe(200);
    // WI-OI-120e (U3.2): a test webhook is sent through the signed route with connections:test, never an open endpoint.
    expect((await call(postHub, 'POST', ['connections', 'c1', 'test-webhook'], { headers: sameOrigin, body: '{}' })).status).toBe(200);
    expect(String(fetchSpy.mock.calls.at(-1)?.[0])).toBe('http://127.0.0.1:4100/api/connectors/v1/connections/c1/test-webhook');
    const forwarded = fetchSpy.mock.calls.length;
    expect((await call(postHub, 'POST', ['connections'], { headers: sameOrigin, body: '{}' })).status).toBe(403);
    expect((await call(postHub, 'POST', ['connections', 'c1', 'sync'], { headers: sameOrigin, body: '{}' })).status).toBe(403);
    expect((await call(postHub, 'POST', ['oauth', 'initiate'], { headers: sameOrigin, body: '{}' })).status).toBe(403);
    // WI-OI-104d: the pull source and its login secrets need connections:write; secrets can never be read back.
    expect((await call(postHub, 'POST', ['connections', 'c1', 'source'], { headers: sameOrigin, body: '{}' })).status).toBe(403);
    expect((await call(postHub, 'POST', ['connections', 'c1', 'credentials'], { headers: sameOrigin, body: '{}' })).status).toBe(403);
    expect((await call(postHub, 'POST', ['connections', 'c1', 'delivery'], { headers: sameOrigin, body: '{}' })).status).toBe(403);
    expect((await call(getHub, 'GET', ['connections', 'c1', 'credentials'])).status).toBe(404);
    expect(fetchSpy.mock.calls.length).toBe(forwarded);

    vi.mocked(verifiedSession).mockResolvedValue({ context: context(['connections:*']) } as never);
    expect((await call(postHub, 'POST', ['connections'], { headers: sameOrigin, body: '{}' })).status).toBe(200);
    expect((await call(postHub, 'POST', ['connections', 'c1', 'sync'], { headers: sameOrigin, body: '{}' })).status).toBe(200);
    expect((await call(postHub, 'POST', ['connections', 'c1', 'source'], { headers: sameOrigin, body: '{}' })).status).toBe(200);
    expect((await call(postHub, 'POST', ['connections', 'c1', 'credentials'], { headers: sameOrigin, body: '{}' })).status).toBe(200);
    expect((await call(postHub, 'POST', ['connections', 'c1', 'delivery'], { headers: sameOrigin, body: '{}' })).status).toBe(200);
  });

  it('refuses a test webhook to a user who may only read connections', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.mocked(verifiedSession).mockResolvedValue({ context: context(['connections:read']) } as never);
    expect((await call(postHub, 'POST', ['connections', 'c1', 'test-webhook'], { headers: sameOrigin, body: '{}' })).status).toBe(403);
    expect((await call(getHub, 'GET', ['connections', 'c1', 'test-webhook'])).status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not expose webhooks, unknown routes or cross-site changes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.mocked(verifiedSession).mockResolvedValue({ context: context(['connections:*']) } as never);
    for (const path of [['webhooks', 'stripe'], ['credentials'], ['oauth', 'callback'], ['connections', 'c1', 'delete']]) {
      expect((await call(postHub, 'POST', path, { headers: sameOrigin, body: '{}' })).status).toBe(404);
    }
    const crossSite = await call(postHub, 'POST', ['connections'], {
      headers: { Host: 'platform.example.invalid', Origin: 'https://attacker.invalid', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(crossSite.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
