import { generateKeyPairSync } from 'node:crypto';
import { verifyPlatformContextToken } from '@gigalibs/auth-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getAnalytics, POST as postAnalytics } from '../app/api/analytics/[...path]/route';
import { canUseTenantModule, hasPermission } from '../lib/module-access';
import { verifiedSession } from '../lib/verified-session';

vi.mock('../lib/verified-session', () => ({
  verifiedSession: vi.fn(),
}));

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privateKeyBase64 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

const entitledContext = {
  user: { id: 'usr-analytics', email: 'analyst@example.invalid', name: 'Analyst', status: 'ACTIVE' },
  tenant: {
    id: 'tenant-analytics',
    name: 'Analytics Corp',
    slug: 'analytics-corp',
    status: 'ACTIVE',
    trialEndsAt: null,
    features: ['analytics-studio'],
    entitlements: [{ moduleKey: 'analytics-studio', status: 'ENABLED', version: '2026-09-26T00:00:00.000Z' }],
  },
  permissions: ['analytics:read'],
  roles: ['MEMBER'],
  platformRoles: [],
  authVersion: 1,
  session: { id: 'session-analytics', expiresAt: '2099-01-01T00:00:00Z' },
  orgScope: { mode: 'FLAT_TENANT' },
  spatialScope: { mode: 'UNBOUNDED' },
  mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
};

const call = (handler: typeof getAnalytics, method: string, path: string[], init: RequestInit = {}) =>
  handler(new Request(`https://platform.example.invalid/api/analytics/${path.join('/')}`, { method, ...init }), {
    params: Promise.resolve({ path }),
  });

describe('Analytics Studio module access', () => {
  it('requires the analytics-studio feature and a granular or wildcard analytics permission', () => {
    const features = new Set(['analytics-studio']);
    expect(canUseTenantModule('analytics-studio', features, ['analytics:read'])).toBe(true);
    expect(canUseTenantModule('analytics-studio', new Set(['other-feature']), ['analytics:read'])).toBe(false);
    expect(canUseTenantModule('analytics-studio', features, ['other:read'])).toBe(false);
    expect(hasPermission(['analytics:read'], 'analytics:action')).toBe(false);
    expect(hasPermission(['analytics:*'], 'analytics:action')).toBe(true);
  });
});

// WI-OI-064a: the BFF forwards a freshly signed PlatformContextV1; it never calls the development issuer.
describe('Analytics Studio signed BFF (WI-OI-064a)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ANALYTICS_API_URL', 'http://127.0.0.1:4400');
    vi.stubEnv('ANALYTICS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', privateKeyBase64);
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('preserves the verified-session 401', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json({ detail: 'Authentication required.' }, { status: 401 }),
    } as never);
    expect((await call(getAnalytics, 'GET', ['v1', 'metrics', 'summary'])).status).toBe(401);
  });

  it('denies a workspace without the entitlement and a user without the permission', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.mocked(verifiedSession).mockResolvedValue({
      context: { ...entitledContext, tenant: { ...entitledContext.tenant, entitlements: [] } },
    } as never);
    expect((await call(getAnalytics, 'GET', ['v1', 'metrics', 'summary'])).status).toBe(403);
    vi.mocked(verifiedSession).mockResolvedValue({ context: entitledContext } as never);
    const denied = await call(postAnalytics, 'POST', ['v1', 'actions'], {
      headers: { Host: 'platform.example.invalid', Origin: 'https://platform.example.invalid', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ code: 'ANALYTICS_ACCESS_DENIED', title: expect.stringContaining('analytics:action') });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects unlisted routes, the development issuer path and cross-site mutations before forwarding', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.mocked(verifiedSession).mockResolvedValue({
      context: { ...entitledContext, permissions: ['analytics:*'] },
    } as never);
    for (const path of [['oidc', 'dev', 'token'], ['v1', 'connectors'], ['v1', '..', 'setup'], ['v1', 'metrics', 'charts', 'a', 'b']]) {
      expect((await call(getAnalytics, 'GET', path)).status).toBe(404);
    }
    expect((await call(postAnalytics, 'POST', ['v1', 'metrics', 'summary'])).status).toBe(404);
    const crossSite = await call(postAnalytics, 'POST', ['v1', 'actions'], {
      headers: { Host: 'platform.example.invalid', Origin: 'https://attacker.invalid', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(crossSite.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('forwards a signed context carrying the canonical tenant and the real scopes', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({ context: entitledContext } as never);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ netArRevenueUsd: 125000 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: 'W/"analytics-etag-1"' },
      }),
    );
    const response = await call(getAnalytics, 'GET', ['v1', 'metrics', 'summary'], {
      headers: { 'x-correlation-id': 'corr-analytics-999' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('W/"analytics-etag-1"');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [target, init] = fetchSpy.mock.calls[0]!;
    expect(String(target)).toBe('http://127.0.0.1:4400/v1/metrics/summary');
    const headers = new Headers(init?.headers);
    expect(headers.get('x-correlation-id')).toBe('corr-analytics-999');
    const token = headers.get('authorization')!.replace('Bearer ', '');
    const context = verifyPlatformContextToken(
      token,
      publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      'gigalibs-analytics-api',
    );
    expect(context).toMatchObject({
      tenant_id: 'tenant-analytics',
      sub: 'usr-analytics',
      granted_scopes: ['analytics:read'],
      entitlement: { module_key: 'analytics-studio', status: 'ENABLED' },
      spatial_scope: { mode: 'UNBOUNDED' },
    });
  });

  it('exposes place drill-down read-only and keeps rollup rebuilds internal', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: { ...entitledContext, permissions: ['analytics:*'] },
    } as never);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    expect((await call(getAnalytics, 'GET', ['v1', 'places', 'drilldown'])).status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]![0])).toBe('http://127.0.0.1:4400/v1/places/drilldown');
    const rebuild = await call(postAnalytics, 'POST', ['v1', 'places', 'rollups', 'rebuild'], {
      headers: { Host: 'platform.example.invalid', Origin: 'https://platform.example.invalid', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(rebuild.status).toBe(404);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const metric = await call(postAnalytics, 'POST', ['v1', 'places', 'metric-drilldown'], {
      headers: { Host: 'platform.example.invalid', Origin: 'https://platform.example.invalid', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(metric.status).toBe(200);
    expect(String(fetchSpy.mock.calls[1]![0])).toBe('http://127.0.0.1:4400/v1/places/metric-drilldown');
    expect((await call(getAnalytics, 'GET', ['v1', 'places', 'metric-drilldown'])).status).toBe(404);
  });

  it('returns 503 when the runtime is not configured and 502 during an outage', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({ context: entitledContext } as never);
    vi.stubEnv('ANALYTICS_API_URL', '');
    expect((await call(getAnalytics, 'GET', ['v1', 'metrics', 'summary'])).status).toBe(503);
    vi.stubEnv('ANALYTICS_API_URL', 'http://127.0.0.1:4400');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'));
    expect((await call(getAnalytics, 'GET', ['v1', 'metrics', 'summary'])).status).toBe(502);
  });
});
