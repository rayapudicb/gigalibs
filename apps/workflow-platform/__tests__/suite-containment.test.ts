import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import manifest from '../../../docs/audits/2026-09-09-readiness/iam-containment-manifest.json';
import { POST as logout } from '../app/api/auth/logout/route';
import { POST as refresh } from '../app/api/auth/refresh/route';
import { authenticatedUpstream, refreshAccessToken } from '../lib/authenticated-upstream';
import { isVerifiedSession, verifiedSession } from '../lib/verified-session';

const store = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => store) }));
// Failure injection only: this suite never certifies a DB/provider business outcome.
const fetchUpstream = vi.fn<typeof fetch>();
// Vitest transforms this discovery call; keep its type local to the test harness.
declare global {
  interface ImportMeta {
    glob<T>(pattern: string): Record<string, () => Promise<T>>;
  }
}
const routes = import.meta.glob<Record<string, () => Promise<Response>>>('../app/api/**/route.ts');
const context = () => ({
  user: {
    id: 'isolated-user',
    name: 'Isolated test',
    email: 'iam@example.invalid',
    status: 'ACTIVE',
  },
  tenant: {
    id: 'isolated-tenant',
    name: 'Isolated test',
    slug: 'iam-test',
    status: 'ACTIVE',
    trialEndsAt: null,
    features: [],
    entitlements: [],
  },
  roles: ['VIEWER'],
  platformRoles: [],
  permissions: [],
  session: { id: 'isolated-session', expiresAt: new Date(Date.now() + 60_000).toISOString() },
  authVersion: 1,
  orgScope: { mode: 'FLAT_TENANT' as const },
  spatialScope: { mode: 'UNBOUNDED' as const },
  mfa: { required: false, enrolled: false, verified: true, recoveryCodesRemaining: 0 },
});
const accessToken = (expiresAtSeconds: number) =>
  `header.${Buffer.from(JSON.stringify({ exp: expiresAtSeconds })).toString('base64url')}.signature`;
beforeEach(() => {
  vi.clearAllMocks();
  store.get.mockReset();
  fetchUpstream.mockReset();
  vi.stubGlobal('fetch', fetchUpstream);
  vi.stubEnv('CONTROL_PLANE_API_URL', 'https://control.example.invalid');
  vi.stubEnv('BFF_MAX_REQUEST_BYTES', '4096');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('WI-OI-013: complete suite API containment', () => {
  it('classifies every route so a new endpoint cannot bypass review unnoticed', () => {
    for (const file of Object.keys(routes)) {
      const relative = file.replace('../app/api/', '');
      if (manifest.canonicalApiRoots.includes(relative.split('/')[0]!)) continue;
      expect(
        manifest.entries.some((entry) => entry.file.endsWith(`/api/${relative}`)),
        file,
      ).toBe(true);
    }
  });
  for (const entry of manifest.entries.filter((entry) => entry.kind === 'api')) {
    const key = entry.file.replace('apps/workflow-platform/app/', '../app/');
    describe(entry.file, () => {
      for (const method of entry.methods ?? []) {
        it(`${method}: anonymous requests cannot read data or execute anything`, async () => {
          const handler = (await routes[key]!())[method]!;
          const response = await handler();
          expect(response.status).toBe(401);
          expect(response.headers.get('cache-control')).toBe('no-store');
          expect(fetchUpstream).not.toHaveBeenCalled();
        });
        it(`${method}: a forged or revoked session is denied by the real session boundary`, async () => {
          store.get.mockImplementation((name) =>
            name === 'gigalibs_access_token' ? { value: 'invalid-test-token' } : undefined,
          );
          fetchUpstream.mockResolvedValue(Response.json({}, { status: 401 }));
          const response = await (await routes[key]!())[method]!();
          expect(response.status).toBe(401);
          expect(fetchUpstream).toHaveBeenCalledTimes(1);
          expect(fetchUpstream.mock.calls[0]?.[0]).toBe(
            'https://control.example.invalid/api/v1/auth/context',
          );
        });
        it(`${method}: even an active session cannot activate an unsupported capability`, async () => {
          store.get.mockReturnValue({ value: 'isolated-test-token' });
          fetchUpstream.mockImplementation(async () => Response.json(context()));
          const response = await (await routes[key]!())[method]!();
          expect(response.status).toBe(503);
          expect(await response.json()).toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' });
          expect(fetchUpstream).toHaveBeenCalledTimes(1);
          expect(fetchUpstream.mock.calls[0]?.[0]).toBe(
            'https://control.example.invalid/api/v1/auth/context',
          );
        });
      }
    });
  }
  it('disabled screens import only the unavailable view, including nested entry points', () => {
    for (const entry of manifest.entries.filter((entry) => entry.kind === 'page')) {
      const source = readFileSync(resolve(entry.file), 'utf8');
      expect(source.match(/(?:import|from)\s+['"]/g)?.length, entry.file).toBe(1);
      expect(source, entry.file).toContain('/components/UnavailableCapability');
    }
  });
});

const PLACE_ID = '5b9f7c1e-4d2a-4e8b-9c3f-1a2b3c4d5e6f';

describe('canonical session verification and outage recovery', () => {
  it.each([
    null,
    {},
    { ...context(), user: { ...context().user, status: 'DISABLED' } },
    { ...context(), session: { id: 'expired', expiresAt: '2000-01-01' } },
    { ...context(), tenant: { id: 'missing-contract' } },
  ])('rejects an invalid session contract', (value) => {
    expect(isVerifiedSession(value)).toBe(false);
  });
  it.each([
    { ...context(), spatialScope: undefined },
    { ...context(), spatialScope: { mode: 'EVERYWHERE' } },
    { ...context(), spatialScope: { mode: 'SCOPED_PLACES' } },
    { ...context(), spatialScope: { mode: 'SCOPED_PLACES', placeIds: ["x') OR true --"] } },
    { ...context(), spatialScope: { mode: 'SCOPED_PLACES', placeIds: [PLACE_ID, PLACE_ID] } },
  ])('rejects a missing or malformed spatial scope', (value) => {
    expect(isVerifiedSession(value)).toBe(false);
  });
  // WI-OI-120w (R2 slice 3): the session's role assignments, signed into module contexts.
  it('accepts a session with role assignments and refuses malformed ones', () => {
    const member = { permissions: ['cmms:read'], scope: { kind: 'MEMBER' } };
    expect(isVerifiedSession({ ...context(), assignments: [member, { permissions: ['finance:read'], scope: { kind: 'UNITS', tree_version: 'v1', unit_ids: ['north'] } }] })).toBe(true);
    // WI-OI-120w (R2 slice 2b): a role at an explicit scope carries the claims a module receives for it.
    const scoped = {
      permissions: ['cmms:read'],
      scope: { kind: 'UNITS', tree_version: 'v1', unit_ids: ['north'] },
      legacy: {
        orgScope: { mode: 'SCOPED_DEPARTMENTS', departmentIds: ['north', 'store-1'] },
        organizationScope: { mode: 'UNITS', tree_version: 'v1', read_roots: ['north'], write_roots: ['north'] },
        spatialScope: { mode: 'UNBOUNDED' },
      },
    };
    expect(isVerifiedSession({ ...context(), assignments: [member, scoped] })).toBe(true);
    for (const legacy of [{}, { ...scoped.legacy, orgScope: { mode: 'EVERYWHERE' } }, { ...scoped.legacy, spatialScope: { mode: 'SCOPED_PLACES', placeIds: ['not-a-place'] } }])
      expect(isVerifiedSession({ ...context(), assignments: [{ ...scoped, legacy }] })).toBe(false);
    // Shape only (review M2): a member over the role limit keeps the application; only module calls are refused.
    expect(isVerifiedSession({ ...context(), assignments: Array.from({ length: 40 }, () => member) })).toBe(true);
    for (const assignments of [
      'all',
      [{ permissions: 'cmms:read', scope: { kind: 'MEMBER' } }],
      [{ permissions: ['cmms:read'], scope: { kind: 'EVERYWHERE' } }],
      [{ permissions: ['cmms:read'], scope: { kind: 'UNITS', tree_version: 'v1', unit_ids: [] } }],
    ])
      expect(isVerifiedSession({ ...context(), assignments })).toBe(false);
  });
  it('accepts a spatially scoped session, including the fail-closed empty scope', () => {
    expect(isVerifiedSession({ ...context(), spatialScope: { mode: 'SCOPED_PLACES', placeIds: [PLACE_ID] } })).toBe(true);
    expect(isVerifiedSession({ ...context(), spatialScope: { mode: 'SCOPED_PLACES', placeIds: [] } })).toBe(true);
  });
  it.each([403, 503])('preserves denial/unavailability status %i', async (status) => {
    store.get.mockReturnValue({ value: 'isolated-test-token' });
    fetchUpstream.mockResolvedValue(Response.json({}, { status }));
    expect((await verifiedSession()).response?.status).toBe(status);
  });
  it('denies suspended workspace even when the upstream returns 200', async () => {
    store.get.mockReturnValue({ value: 'isolated-test-token' });
    fetchUpstream.mockResolvedValue(
      Response.json({ ...context(), tenant: { ...context().tenant, status: 'SUSPENDED' } }),
    );
    expect((await verifiedSession()).response?.status).toBe(403);
  });
  it.each([500, 503, 200])(
    'retains refresh cookies on outage or malformed response %i',
    async (status) => {
      store.get.mockReturnValue({ value: 'isolated-refresh-token' });
      fetchUpstream.mockResolvedValue(Response.json({}, { status }));
      expect((await refresh()).status).toBe(503);
      expect(store.delete).not.toHaveBeenCalled();
      expect(store.set).not.toHaveBeenCalled();
    },
  );
  it('removes cookies only when refresh is explicitly rejected', async () => {
    store.get.mockReturnValue({ value: 'revoked-test-token' });
    fetchUpstream.mockResolvedValue(Response.json({}, { status: 401 }));
    expect(await refreshAccessToken()).toBeNull();
    expect(store.delete).toHaveBeenCalledWith('gigalibs_access_token');
    expect(store.delete).toHaveBeenCalledWith('gigalibs_refresh_token');
  });
  it('does not claim successful logout on failed server revocation', async () => {
    store.get.mockReturnValue({ value: 'isolated-test-token' });
    fetchUpstream.mockResolvedValue(Response.json({}, { status: 503 }));
    expect((await logout()).status).toBe(503);
    expect(store.delete).not.toHaveBeenCalled();
  });
  it('removes all browser credentials after successful DB session revocation', async () => {
    store.get.mockReturnValue({ value: 'isolated-test-token' });
    fetchUpstream.mockResolvedValue(new Response(null, { status: 204 }));
    expect((await logout()).status).toBe(200);
    expect(store.delete).toHaveBeenCalledWith('wf_role');
    expect(store.delete).toHaveBeenCalledWith('gigalibs_refresh_token');
  });
  it('bounds requests and forbids upstream redirects carrying credentials', async () => {
    store.get.mockReturnValue({ value: 'isolated-test-token' });
    fetchUpstream.mockResolvedValue(Response.json(context()));
    await authenticatedUpstream('control', '/api/v1/auth/context');
    expect(fetchUpstream.mock.calls[0]?.[1]).toMatchObject({
      redirect: 'error',
      cache: 'no-store',
    });
    expect(fetchUpstream.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it('does not replay a state-changing request after an application-level 401', async () => {
    store.get.mockImplementation((name) =>
      name === 'gigalibs_access_token'
        ? { value: accessToken(Math.floor(Date.now() / 1_000) + 300) }
        : { value: 'isolated-refresh-token' },
    );
    fetchUpstream.mockResolvedValue(Response.json({}, { status: 401 }));
    const response = await authenticatedUpstream('control', '/api/v1/auth/mfa/recovery/verify', {
      method: 'POST',
    });
    expect(response?.status).toBe(401);
    expect(fetchUpstream).toHaveBeenCalledTimes(1);
    expect(store.set).not.toHaveBeenCalled();
  });
  it('refreshes an expired access token before dispatching the protected request', async () => {
    const renewed = accessToken(Math.floor(Date.now() / 1_000) + 300);
    store.get.mockImplementation((name) =>
      name === 'gigalibs_access_token'
        ? { value: accessToken(Math.floor(Date.now() / 1_000) - 1) }
        : { value: 'isolated-refresh-token' },
    );
    fetchUpstream
      .mockResolvedValueOnce(
        Response.json({
          accessToken: renewed,
          refreshToken: 'rotated-refresh-token',
          expiresIn: 300,
          tokenType: 'Bearer',
        }),
      )
      .mockResolvedValueOnce(Response.json(context()));
    const response = await authenticatedUpstream('control', '/api/v1/auth/context');
    expect(response?.status).toBe(200);
    expect(fetchUpstream).toHaveBeenCalledTimes(2);
    expect(fetchUpstream.mock.calls[0]?.[0]).toBe(
      'https://control.example.invalid/api/v1/auth/refresh',
    );
    expect(fetchUpstream.mock.calls[1]?.[0]).toBe(
      'https://control.example.invalid/api/v1/auth/context',
    );
  });
  it('server-component verification never rotates cookies', async () => {
    store.get.mockReturnValue({ value: 'expired-test-token' });
    fetchUpstream.mockResolvedValue(Response.json({}, { status: 401 }));
    expect((await verifiedSession(false)).response?.status).toBe(401);
    expect(fetchUpstream).toHaveBeenCalledTimes(1);
    expect(store.set).not.toHaveBeenCalled();
  });
});
