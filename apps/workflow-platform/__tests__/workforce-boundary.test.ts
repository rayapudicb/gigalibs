import { generateKeyPairSync } from 'node:crypto';
import { verifyPlatformContextToken } from '@gigalibs/auth-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as gatewayRoute from '../app/api/[gateway]/[...path]/route';
import { moduleGatewayConfig } from '../lib/module-gateway';
import { composePunchBody } from '../lib/punch-geofence';
import { verifiedSession } from '../lib/verified-session';

// WI-OI-083d: modules are reached through the one generic gateway route; these handlers add the base path segment.
type PathContext = { params: Promise<{ path: string[] }> };
const at = (gateway: string, handler: typeof gatewayRoute.GET) => (request: Request, context: PathContext) =>
  handler(request, { params: context.params.then(({ path }) => ({ gateway, path })) });
const getGigaOps = at('gigaops', gatewayRoute.GET);
const getWorkforce = at('workforce', gatewayRoute.GET);
const postWorkforce = at('workforce', gatewayRoute.POST);
const requiredWorkforcePermission = moduleGatewayConfig('gigaops').requiredPermission;

vi.mock('../lib/verified-session', () => ({ verifiedSession: vi.fn() }));

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const SHEET_ID = '7a1f3c2e-5b6d-4e8f-9a0b-1c2d3e4f5a6b';
const SITE_ID = '0e9d8c7b-6a5f-4e3d-8c2b-1a0f9e8d7c6b';
const privateKeyBase64 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

const authorizedContext = {
  user: { id: 'usr-1', email: 'dispatcher@example.com' },
  tenant: {
    id: 'tenant-one',
    name: 'Tenant One',
    slug: 'tenant-one',
    features: ['gigaops'],
    entitlements: [
      { moduleKey: 'gigaops', status: 'ENABLED', version: '2026-09-25T00:00:00.000Z' },
    ],
  },
  permissions: [
    'workforce:read',
    'workforce.resources.read',
    'workforce.resources.manage',
    'workforce.capabilities.read',
    'workforce.capabilities.manage',
  ],
  roles: ['OPERATIONS_SUPERVISOR'],
  platformRoles: [],
  authVersion: 1,
  session: { id: 'session-1' },
  orgScope: { mode: 'FLAT_TENANT' },
  spatialScope: { mode: 'UNBOUNDED' },
};

describe('GigaOps Workforce signed BFF boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('WORKFORCE_API_URL', 'http://127.0.0.1:4700');
    vi.stubEnv('WORKFORCE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', privateKeyBase64);
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([
    ['canonical Workforce route', getWorkforce],
    ['GigaOps compatibility route', getGigaOps],
  ] as const)('preserves the verified-session 401 for the %s', async (_name, route) => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json({ detail: 'Authentication required.' }, { status: 401 }),
    } as never);
    const response = await route(
      new Request('https://platform.example.invalid/api/workforce/resources'),
      { params: Promise.resolve({ path: ['resources'] }) },
    );
    expect(response.status).toBe(401);
  });

  it('denies absent tenant, entitlement and granular permission before upstream access', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const context of [
      { ...authorizedContext, tenant: null },
      { ...authorizedContext, tenant: { ...authorizedContext.tenant, entitlements: [] } },
      { ...authorizedContext, permissions: ['workforce:read'] },
    ]) {
      vi.mocked(verifiedSession).mockResolvedValue({ context } as never);
      const response = await getWorkforce(
        new Request('https://platform.example.invalid/api/workforce/resources'),
        { params: Promise.resolve({ path: ['resources'] }) },
      );
      expect(response.status).toBe(403);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allowlists only the implemented Workforce resource/capability routes', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({ context: authorizedContext } as never);
    const response = await getWorkforce(
      new Request('https://platform.example.invalid/api/workforce/payroll'),
      { params: Promise.resolve({ path: ['payroll'] }) },
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: 'WORKFORCE_ROUTE_UNSUPPORTED' });
  });

  it('exposes the WI-OI-065 job routes only with job, position and engagement scopes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.mocked(verifiedSession).mockResolvedValue({ context: authorizedContext } as never);
    for (const path of [['job-profiles'], ['positions'], ['engagements']]) {
      const denied = await getWorkforce(new Request(`https://platform.example.invalid/api/workforce/${path.join('/')}`), {
        params: Promise.resolve({ path }),
      });
      expect(denied.status).toBe(403);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.mocked(verifiedSession).mockResolvedValue({
      context: { ...authorizedContext, permissions: ['workforce:*'] },
    } as never);
    const allowed = await getWorkforce(new Request('https://platform.example.invalid/api/workforce/positions?asOf=2026-10-01'), {
      params: Promise.resolve({ path: ['positions'] }),
    });
    expect(allowed.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]![0])).toBe('http://127.0.0.1:4700/v1/positions?asOf=2026-10-01');
    const unknown = await postWorkforce(
      new Request('https://platform.example.invalid/api/workforce/engagements/6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f/delete', {
        method: 'POST',
        headers: { Origin: 'https://platform.example.invalid', Host: 'platform.example.invalid', 'Content-Type': 'application/json' },
        body: '{}',
      }),
      { params: Promise.resolve({ path: ['engagements', '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f', 'delete'] }) },
    );
    expect(unknown.status).toBe(404);
  });

  it('requires the approval scope to decide absences (WI-OI-066)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'APPROVED' }), { status: 200 }));
    const decide = () =>
      postWorkforce(
        new Request('https://platform.example.invalid/api/workforce/absences/6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f/approve', {
          method: 'POST',
          headers: { Origin: 'https://platform.example.invalid', Host: 'platform.example.invalid', 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedVersion: 1 }),
        }),
        { params: Promise.resolve({ path: ['absences', '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f', 'approve'] }) },
      );
    vi.mocked(verifiedSession).mockResolvedValue({
      context: { ...authorizedContext, permissions: ['workforce:read', 'workforce.absences.read', 'workforce.absences.request'] },
    } as never);
    expect((await decide()).status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.mocked(verifiedSession).mockResolvedValue({
      context: { ...authorizedContext, permissions: ['workforce:read', 'workforce.absences.approve'] },
    } as never);
    expect((await decide()).status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]![0])).toBe('http://127.0.0.1:4700/v1/absences/6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f/approve');
  });

  it('routes WI-OI-067 bookings only with the booking scope', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'b1' }), { status: 201 }));
    const book = () =>
      postWorkforce(
        new Request('https://platform.example.invalid/api/workforce/bookings', {
          method: 'POST',
          headers: { Origin: 'https://platform.example.invalid', Host: 'platform.example.invalid', 'Content-Type': 'application/json' },
          body: '{}',
        }),
        { params: Promise.resolve({ path: ['bookings'] }) },
      );
    vi.mocked(verifiedSession).mockResolvedValue({ context: { ...authorizedContext, permissions: ['workforce:read', 'workforce.demand.manage'] } } as never);
    expect((await book()).status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.mocked(verifiedSession).mockResolvedValue({ context: { ...authorizedContext, permissions: ['workforce:read', 'workforce.bookings.manage'] } } as never);
    expect((await book()).status).toBe(201);
    expect(String(fetchSpy.mock.calls[0]![0])).toBe('http://127.0.0.1:4700/v1/bookings');
  });

  it('routes WI-OI-069 time: own punches for workers, others for managers, approval separately', async () => {
    expect(requiredWorkforcePermission('POST', ['v1', 'punches'])).toBe('workforce.time.punch');
    expect(requiredWorkforcePermission('GET', ['v1', 'timesheets', 'preview'])).toEqual(['workforce.time.punch', 'workforce.time.read']);
    expect(requiredWorkforcePermission('POST', ['v1', 'timesheets'])).toEqual(['workforce.time.punch', 'workforce.time.manage']);
    expect(requiredWorkforcePermission('POST', ['v1', 'timesheets', SHEET_ID, 'approve'])).toBe('workforce.timesheets.approve');
    expect(requiredWorkforcePermission('POST', ['v1', 'time-corrections'])).toBe('workforce.time.manage');
    expect(requiredWorkforcePermission('POST', ['v1', 'time-exceptions', SHEET_ID, 'resolve'])).toBe('workforce.time.manage');
    expect(requiredWorkforcePermission('PATCH', ['v1', 'punches'])).toBeNull();
    expect(requiredWorkforcePermission('POST', ['v1', 'punches', SHEET_ID])).toBeNull();

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const preview = () =>
      getWorkforce(new Request('https://platform.example.invalid/api/workforce/timesheets/preview?periodStart=2026-10-05'), {
        params: Promise.resolve({ path: ['timesheets', 'preview'] }),
      });
    vi.mocked(verifiedSession).mockResolvedValue({ context: { ...authorizedContext, permissions: ['workforce:read', 'workforce.bookings.read'] } } as never);
    expect((await preview()).status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const permission of ['workforce.time.punch', 'workforce.time.read']) {
      vi.mocked(verifiedSession).mockResolvedValue({ context: { ...authorizedContext, permissions: ['workforce:read', permission] } } as never);
      expect((await preview()).status).toBe(200);
    }
  });

  it('routes WI-OI-070 pay: read, manage and a separate approval scope', () => {
    expect(requiredWorkforcePermission('GET', ['v1', 'pay-packs'])).toBe('workforce.pay.read');
    expect(requiredWorkforcePermission('POST', ['v1', 'pay-rates'])).toBe('workforce.pay.manage');
    expect(requiredWorkforcePermission('POST', ['v1', 'pay-runs'])).toBe('workforce.pay.manage');
    expect(requiredWorkforcePermission('GET', ['v1', 'pay-runs', SHEET_ID, 'verification'])).toBe('workforce.pay.read');
    expect(requiredWorkforcePermission('POST', ['v1', 'pay-runs', SHEET_ID, 'approve'])).toBe('workforce.pay.approve');
    expect(requiredWorkforcePermission('POST', ['v1', 'pay-runs', SHEET_ID, 'void'])).toBe('workforce.pay.manage');
    expect(requiredWorkforcePermission('PATCH', ['v1', 'pay-runs', SHEET_ID])).toBeNull();
    expect(requiredWorkforcePermission('POST', ['v1', 'pay-packs'])).toBeNull();
    expect(requiredWorkforcePermission('POST', ['v1', 'pay-runs', SHEET_ID, 'exports'])).toBe('workforce.pay.manage');
    expect(requiredWorkforcePermission('GET', ['v1', 'pay-exports', SHEET_ID, 'file'])).toBe('workforce.pay.read');
    expect(requiredWorkforcePermission('GET', ['v1', 'pay-exports', SHEET_ID, 'reconciliation'])).toBe('workforce.pay.read');
    expect(requiredWorkforcePermission('POST', ['v1', 'pay-exports', SHEET_ID, 'acknowledge'])).toBe('workforce.pay.manage');
    expect(requiredWorkforcePermission('POST', ['v1', 'pay-exports', SHEET_ID, 'file'])).toBeNull();
  });

  it('discards client geofence evidence and composes it from the place boundary as the same user', async () => {
    const yard = {
      id: SITE_ID, code: 'YARD', displayName: 'Yard', path: 'YARD', parentId: null, nodeTypeId: SHEET_ID, nodeTypeCode: 'SITE',
      countryCode: null, subdivisionCode: null, timeZone: null, latitude: null, longitude: null, status: 'ACTIVE', version: 1,
      childCount: 0, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', ancestors: [],
      boundary: { type: 'Polygon', coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]] },
    };
    const lookup = vi.fn(async () => new Response(JSON.stringify(yard), { status: 200 }));
    const forged = JSON.stringify({
      deviceId: 'web-1', kind: 'CLOCK_IN', siteRef: SITE_ID, location: { latitude: 0.0005, longitude: 0.003 },
      geofence: { result: 'INSIDE', placeRef: SITE_ID, distanceToEdgeMeters: 0, reason: null },
    });
    const session = { ...authorizedContext, permissions: ['workforce.time.punch', 'maps.nodes.read'] } as never;
    const outside = JSON.parse(await composePunchBody(session, 'POST', ['v1', 'punches'], forged, lookup));
    expect(outside.geofence).toMatchObject({ result: 'OUTSIDE', placeRef: SITE_ID, reason: null });
    expect(outside.geofence.distanceToEdgeMeters).toBeGreaterThan(200);
    expect(lookup).toHaveBeenCalledWith(session, SITE_ID);

    const inside = JSON.parse(await composePunchBody(session, 'POST', ['v1', 'punches'], JSON.stringify({ siteRef: SITE_ID, location: { latitude: 0.0005, longitude: 0.0005 } }), lookup));
    expect(inside.geofence.result).toBe('INSIDE');

    const noPlaceAccess = { ...authorizedContext, permissions: ['workforce.time.punch'] } as never;
    const unverified = JSON.parse(await composePunchBody(noPlaceAccess, 'POST', ['v1', 'punches'], forged, lookup));
    expect(unverified.geofence).toMatchObject({ result: 'NOT_CHECKED', reason: 'NO_PLACE_PERMISSION' });

    const missing = JSON.parse(await composePunchBody(session, 'POST', ['v1', 'punches'], forged, async () => new Response('{}', { status: 404 })));
    expect(missing.geofence).toMatchObject({ result: 'NOT_CHECKED', reason: 'PLACE_NOT_FOUND' });

    const withoutLocation = JSON.parse(await composePunchBody(session, 'POST', ['v1', 'punches'], JSON.stringify({ siteRef: SITE_ID, geofence: { result: 'INSIDE' } }), lookup));
    expect(withoutLocation.geofence).toBeUndefined();
    expect(await composePunchBody(session, 'POST', ['v1', 'bookings'], forged, lookup)).toBe(forged);
  });

  it('mints a signed, tenant-bound context without forwarding browser authority headers', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({ context: authorizedContext } as never);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 25, generatedAt: new Date().toISOString() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const response = await getWorkforce(
      new Request('https://platform.example.invalid/api/workforce/resources?q=tech', {
        headers: { Authorization: 'Bearer browser-token', 'X-Tenant-Id': 'forged' },
      }),
      { params: Promise.resolve({ path: ['resources'] }) },
    );
    expect(response.status).toBe(200);
    const [target, init] = fetchSpy.mock.calls[0]!;
    expect(String(target)).toBe('http://127.0.0.1:4700/v1/resources?q=tech');
    const headers = new Headers(init?.headers);
    expect(headers.get('x-tenant-id')).toBeNull();
    expect(headers.get('authorization')).not.toBe('Bearer browser-token');
    const token = headers.get('authorization')!.replace('Bearer ', '');
    expect(verifyPlatformContextToken(
      token,
      publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      'gigalibs-workforce-api',
    )).toMatchObject({ tenant_id: 'tenant-one', sub: 'usr-1' });
  });

  it('forwards a tenant administrator whose session carries only the workforce:* role wildcard', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: { ...authorizedContext, roles: ['TENANT_ADMIN'], permissions: ['tenant:*', 'workforce:*'] },
    } as never);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 25, generatedAt: new Date().toISOString() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    for (const path of [['resources'], ['capabilities']]) {
      const response = await getWorkforce(
        new Request(`https://platform.example.invalid/api/workforce/${path.join('/')}`),
        { params: Promise.resolve({ path }) },
      );
      expect(response.status).toBe(200);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('rejects cross-site mutation before reading or forwarding its body', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({ context: authorizedContext } as never);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await postWorkforce(
      new Request('https://platform.example.invalid/api/workforce/resources', {
        method: 'POST',
        headers: {
          Host: 'platform.example.invalid',
          Origin: 'https://attacker.invalid',
          'Content-Type': 'application/json',
        },
        body: '{}',
      }),
      { params: Promise.resolve({ path: ['resources'] }) },
    );
    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns explicit 503 for missing local configuration and 502 for an outage', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({ context: authorizedContext } as never);
    vi.stubEnv('WORKFORCE_API_URL', '');
    const unconfigured = await getWorkforce(
      new Request('https://platform.example.invalid/api/workforce/resources'),
      { params: Promise.resolve({ path: ['resources'] }) },
    );
    expect(unconfigured.status).toBe(503);

    vi.stubEnv('WORKFORCE_API_URL', 'http://127.0.0.1:4700');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'));
    const outage = await getWorkforce(
      new Request('https://platform.example.invalid/api/workforce/resources'),
      { params: Promise.resolve({ path: ['resources'] }) },
    );
    expect(outage.status).toBe(502);
  });
});
