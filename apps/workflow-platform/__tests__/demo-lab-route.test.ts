import { generateKeyPairSync } from 'node:crypto';
import { verifyPlatformContextToken } from '@gigalibs/auth-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../app/api/demo-lab/[action]/route';
import { authenticatedUpstream } from '../lib/authenticated-upstream';
import { verifiedSession } from '../lib/verified-session';

vi.mock('../lib/verified-session', () => ({ verifiedSession: vi.fn() }));
vi.mock('../lib/authenticated-upstream', async (original) => ({
  ...(await original<typeof import('../lib/authenticated-upstream')>()),
  authenticatedUpstream: vi.fn(),
}));

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
// A solution-layer pack (WI-OI-107): place levels in the Geospatial section, the Demo Lab profile in `demo`.
const pack = {
  slug: 'qsr',
  modules: { geospatial: { lists: { placeTypes: [{ code: 'REGION', label: 'Region' }, { code: 'STORE', label: 'Store' }, { code: 'AREA', label: 'Area' }] } } },
  demo: {
    currency: 'USD', regions: 4, sitesPerRegion: 25, zonesPerSite: 2, labourHoursPerSitePerDay: 120,
    labourCostPerHour: 16, spendPerSitePerDay: 2600, downtimeMinutesPerSitePerDay: 18, carbonKgPerLabourHour: 1.1,
  },
};

function context(features: string[], overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-1', email: 'admin@example.invalid', name: 'Admin', status: 'ACTIVE' },
    tenant: { id: 'demo-tenant', name: 'Demo', slug: 'demo', status: 'ACTIVE', trialEndsAt: null, features, entitlements: [{ moduleKey: 'analytics-studio', status: 'ENABLED', version: 'v1' }] },
    roles: ['TENANT_ADMIN'],
    platformRoles: [],
    permissions: ['analytics:*'],
    session: { id: 'session-1', expiresAt: '2099-01-01T00:00:00Z' },
    authVersion: 1,
    orgScope: { mode: 'FLAT_TENANT' },
    spatialScope: { mode: 'UNBOUNDED' },
    mfa: { required: false, enrolled: false, verified: true, recoveryCodesRemaining: 0 },
    ...overrides,
  };
}

const post = (action: string, body: unknown, origin = 'https://platform.example.invalid') =>
  POST(
    new Request(`https://platform.example.invalid/api/demo-lab/${action}`, {
      method: 'POST',
      headers: { Host: 'platform.example.invalid', Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ action }) },
  );

// WI-OI-064e: Demo Lab data actions only run in demo-lab workspaces, from the activated industry pack.
describe('Demo Lab BFF route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ANALYTICS_API_URL', 'http://127.0.0.1:4400');
    vi.stubEnv('ANALYTICS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('refuses workspaces without the demo-lab label and cross-site requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.mocked(verifiedSession).mockResolvedValue({ context: context(['analytics-studio']) } as never);
    expect((await post('generate', {})).status).toBe(404);
    expect((await GET(new Request('https://platform.example.invalid/api/demo-lab/dataset'), { params: Promise.resolve({ action: 'dataset' }) })).status).toBe(404);
    vi.mocked(verifiedSession).mockResolvedValue({ context: context(['analytics-studio', 'demo-lab']) } as never);
    expect((await post('generate', {}, 'https://attacker.invalid')).status).toBe(403);
    expect((await post('generate', { days: 30, sql: 'x' })).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('builds the generation request from the activated industry pack and signs it for Analytics', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({ context: context(['analytics-studio', 'demo-lab']) } as never);
    // WI-OI-107: the active pack arrives in the solution-layer format.
    vi.mocked(authenticatedUpstream).mockImplementation(async (_plane, path) =>
      path === '/api/v1/configuration/packs/active' ? Response.json({ industry: { pack }, country: null }) : new Response(null, { status: 404 }),
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ facts: 24_000, rollupRows: 1, from: 'x', to: 'y' }));
    const response = await post('generate', { days: 30, seed: 7 });
    expect(response.status).toBe(200);
    const [target, init] = fetchSpy.mock.calls[0]!;
    expect(String(target)).toBe('http://127.0.0.1:4400/v1/demo-lab/generate');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ placeTypes: pack.modules.geospatial!.lists!.placeTypes, demoProfile: pack.demo, days: 30, seed: 7 });
    const token = new Headers(init?.headers).get('authorization')!.replace('Bearer ', '');
    expect(verifyPlatformContextToken(token, publicKey.export({ format: 'pem', type: 'spki' }).toString(), 'gigalibs-analytics-api').tenant_id).toBe('demo-tenant');
  });

  it('caps the days so a large profile stays within the synthetic fact limit', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({ context: context(['analytics-studio', 'demo-lab']) } as never);
    const big = { ...pack, demo: { ...pack.demo!, regions: 20, sitesPerRegion: 50, zonesPerSite: 5 } };
    vi.mocked(authenticatedUpstream).mockImplementation(async (_plane, path) =>
      path === '/api/v1/configuration/packs/active' ? Response.json({ industry: { pack: big }, country: null }) : new Response(null, { status: 404 }),
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ facts: 1 }));
    await post('generate', { days: 365 });
    // 1,000 sites × 5 zones → 17,000 facts a day → at most 58 days under 1,000,000 facts.
    expect(JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body)).days).toBe(58);
  });

  it('lets only platform administrators delete, purging synthetic data first', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({ context: context(['analytics-studio', 'demo-lab']) } as never);
    expect((await post('delete', {})).status).toBe(403);
    vi.mocked(verifiedSession).mockResolvedValue({ context: context(['analytics-studio', 'demo-lab'], { platformRoles: ['PLATFORM_ADMIN'] }) } as never);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ facts: 0 }));
    vi.mocked(authenticatedUpstream).mockResolvedValue(Response.json({ deleted: true }));
    expect((await post('delete', {})).status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]![0])).toBe('http://127.0.0.1:4400/v1/demo-lab/reset');
    expect(vi.mocked(authenticatedUpstream).mock.calls[0]![1]).toBe('/api/v1/platform/demo-lab/tenants/demo-tenant/delete');
  });

  // WI-OI-103d d7: the labelled sample farm source is a Demo Lab action too, and loading needs analytics:action.
  it('reads and loads the sample farm source only in Demo Lab workspaces, with analytics:action to load', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ loaded: true }));
    const read = () => GET(new Request('https://platform.example.invalid/api/demo-lab/sample-farm'), { params: Promise.resolve({ action: 'sample-farm' }) });
    vi.mocked(verifiedSession).mockResolvedValue({ context: context(['analytics-studio']) } as never);
    expect((await read()).status).toBe(404);
    expect((await post('sample-farm', {})).status).toBe(404);
    vi.mocked(verifiedSession).mockResolvedValue({ context: context(['analytics-studio', 'demo-lab'], { permissions: ['analytics:read'] }) } as never);
    expect((await read()).status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]![0])).toBe('http://127.0.0.1:4400/v1/demo-lab/sample-farm');
    expect((await post('sample-farm', {})).status).toBe(403);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    vi.mocked(verifiedSession).mockResolvedValue({ context: context(['analytics-studio', 'demo-lab']) } as never);
    expect((await post('sample-farm', {})).status).toBe(200);
    const [target, init] = fetchSpy.mock.calls[1]!;
    expect(String(target)).toBe('http://127.0.0.1:4400/v1/demo-lab/sample-farm');
    expect(init?.method).toBe('POST');
  });
});
