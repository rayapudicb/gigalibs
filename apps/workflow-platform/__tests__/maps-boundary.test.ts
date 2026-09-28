import { generateKeyPairSync } from 'node:crypto';
import { verifyPlatformContextToken } from '@gigalibs/auth-core';
import { platformModuleCatalog } from '@gigalibs/contracts';
import { GeoCalculator, type Coordinates } from '@gigalibs/maps-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getMaps, PATCH as patchMaps, POST as postMaps } from '../app/api/maps/[...path]/route';
import { verifiedSession } from '../lib/verified-session';

vi.mock('../lib/verified-session', () => ({
  verifiedSession: vi.fn(),
}));

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privateKeyBase64 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const NODE_ID = '00000000-0000-4000-8000-000000000001';

const entitledContext = {
  user: { id: 'usr-maps', email: 'maps@example.test' },
  tenant: {
    id: 'tenant-maps',
    name: 'Maps Tenant',
    slug: 'tenant-maps',
    features: ['geospatial-studio'],
    entitlements: [{ moduleKey: 'geospatial-studio', status: 'ENABLED', version: '2026-09-26T00:00:00.000Z' }],
  },
  permissions: ['maps:*'],
  roles: ['TENANT_ADMIN'],
  platformRoles: [],
  authVersion: 1,
  session: { id: 'session-maps' },
  orgScope: { mode: 'FLAT_TENANT' },
  spatialScope: { mode: 'UNBOUNDED' },
};

const call = (
  handler: typeof getMaps,
  method: string,
  path: string[],
  init: RequestInit = {},
) =>
  handler(
    new Request(`https://platform.example.invalid/api/maps/${path.join('/')}`, { method, ...init }),
    { params: Promise.resolve({ path }) },
  );

const ok = () =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );

describe('Geospatial Studio signed BFF (WI-OI-063b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GEOSPATIAL_API_URL', 'http://127.0.0.1:4720');
    vi.stubEnv('GEOSPATIAL_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', privateKeyBase64);
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('is catalogued for controlled review and requires maps:read', () => {
    const module = platformModuleCatalog.find((candidate) => candidate.key === 'geospatial-studio');
    expect(module).toMatchObject({ readiness: 'REVIEW', requiredPermission: 'maps:read', entitlementEligible: true });
  });

  it('preserves the verified-session 401', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json({ detail: 'Authentication required.' }, { status: 401 }),
    } as never);
    expect((await call(getMaps, 'GET', ['nodes'])).status).toBe(401);
  });

  it('allow-lists only implemented routes and never proxies the retired prototype paths', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({ context: entitledContext } as never);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const path of [['v1', 'spatial', 'assets'], ['v1', 'spatial', 'dispatch-cmms'], ['nodes', '..']]) {
      const response = await call(getMaps, 'GET', path);
      expect(response.status).toBe(404);
    }
    expect((await call(patchMaps, 'PATCH', ['nodes'])).status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('denies a tenant without the entitlement or a user without the granular permission', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const context of [
      { ...entitledContext, tenant: { ...entitledContext.tenant, entitlements: [] } },
      { ...entitledContext, tenant: { ...entitledContext.tenant, features: [] } },
      { ...entitledContext, permissions: ['maps:read'] },
    ]) {
      vi.mocked(verifiedSession).mockResolvedValue({ context } as never);
      expect((await call(getMaps, 'GET', ['nodes'])).status).toBe(403);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('forwards a signed tenant-bound context and never browser credentials or tenant headers', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({ context: entitledContext } as never);
    const fetchSpy = ok();
    const response = await call(getMaps, 'GET', ['nodes'], {
      headers: { Authorization: 'Bearer browser-token', 'X-Tenant-Id': 'forged', 'X-User-Id': 'forged' },
    });
    expect(response.status).toBe(200);
    const [target, init] = fetchSpy.mock.calls[0]!;
    expect(String(target)).toBe('http://127.0.0.1:4720/v1/nodes');
    const headers = new Headers(init?.headers);
    expect(headers.get('x-tenant-id')).toBeNull();
    expect(headers.get('x-user-id')).toBeNull();
    const token = headers.get('authorization')!.replace('Bearer ', '');
    expect(token).not.toBe('browser-token');
    expect(
      verifyPlatformContextToken(token, publicKey.export({ format: 'pem', type: 'spki' }).toString(), 'gigalibs-geospatial-api'),
    ).toMatchObject({ tenant_id: 'tenant-maps', entitlement: { module_key: 'geospatial-studio' } });
  });

  it('rejects cross-site mutation before forwarding and proxies same-origin moves', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({ context: entitledContext } as never);
    const fetchSpy = ok();
    const crossSite = await call(postMaps, 'POST', ['nodes', NODE_ID, 'move'], {
      headers: { Host: 'platform.example.invalid', Origin: 'https://attacker.invalid', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(crossSite.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();

    const sameOrigin = await call(postMaps, 'POST', ['nodes', NODE_ID, 'move'], {
      headers: {
        Host: 'platform.example.invalid',
        Origin: 'https://platform.example.invalid',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expectedVersion: 1, newParentId: null }),
    });
    expect(sameOrigin.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(`http://127.0.0.1:4720/v1/nodes/${NODE_ID}/move`);
  });

  it('proxies a place import only as a same-origin POST', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({ context: entitledContext } as never);
    expect((await call(getMaps, 'GET', ['nodes', 'import'])).status).toBe(404);
    const fetchSpy = ok();
    const imported = await call(postMaps, 'POST', ['nodes', 'import'], {
      headers: {
        Host: 'platform.example.invalid',
        Origin: 'https://platform.example.invalid',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode: 'VALIDATE', rows: [{ code: 'APAC', displayName: 'Asia Pacific', nodeTypeCode: 'REGION' }] }),
    });
    expect(imported.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]![0])).toBe('http://127.0.0.1:4720/v1/nodes/import');
  });

  it('returns 503 when the local runtime is not configured and 502 during an outage', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({ context: entitledContext } as never);
    vi.stubEnv('GEOSPATIAL_API_URL', '');
    expect((await call(getMaps, 'GET', ['nodes'])).status).toBe(503);
    vi.stubEnv('GEOSPATIAL_API_URL', 'http://127.0.0.1:4720');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'));
    expect((await call(getMaps, 'GET', ['nodes'])).status).toBe(502);
  });

  it('validates Haversine distance, bearing and point-in-polygon mathematics', () => {
    const sf: Coordinates = { latitude: 37.7749, longitude: -122.4194 };
    const oakland: Coordinates = { latitude: 37.8044, longitude: -122.2712 };
    const distanceKm = GeoCalculator.haversineDistance(sf, oakland);
    expect(distanceKm).toBeGreaterThan(12);
    expect(distanceKm).toBeLessThan(15);
    const bearing = GeoCalculator.computeBearing(sf, oakland);
    expect(bearing).toBeGreaterThan(50);
    expect(bearing).toBeLessThan(90);
    const polygon = {
      id: 'poly-1',
      name: 'SF Polygon',
      vertices: [
        { latitude: 37.75, longitude: -122.45 },
        { latitude: 37.8, longitude: -122.45 },
        { latitude: 37.8, longitude: -122.4 },
        { latitude: 37.75, longitude: -122.4 },
      ],
    };
    expect(GeoCalculator.isInsideGeofence({ latitude: 37.775, longitude: -122.425 }, polygon)).toBe(true);
    expect(GeoCalculator.isInsideGeofence({ latitude: 37.7, longitude: -122.3 }, polygon)).toBe(false);
  });
});
