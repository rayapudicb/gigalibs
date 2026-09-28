import { generateKeyPairSync } from 'node:crypto';
import { verifyPlatformContextToken } from '@gigalibs/auth-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, PATCH, POST } from '../app/api/cmms/[...path]/route';
import { requiredCmmsPermission } from '../lib/cmms-proxy';
import { canUseTenantModule, hasPermission } from '../lib/module-access';
import { verifiedSession } from '../lib/verified-session';

vi.mock('../lib/verified-session', () => ({ verifiedSession: vi.fn() }));

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const ASSET_ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';

function session(overrides: { permissions?: string[]; features?: string[]; entitled?: boolean } = {}) {
  return {
    context: {
      user: { id: 'cmuser0001', email: 'admin@example.invalid', name: 'Admin', status: 'ACTIVE' },
      tenant: {
        id: 'cmtenant0001',
        name: 'Plant',
        slug: 'plant',
        status: 'ACTIVE',
        trialEndsAt: null,
        features: overrides.features ?? ['asset-maintenance'],
        entitlements:
          overrides.entitled === false ? [] : [{ moduleKey: 'asset-maintenance', status: 'ENABLED', version: 'v1' }],
      },
      roles: ['TENANT_ADMIN'],
      platformRoles: [],
      permissions: overrides.permissions ?? ['cmms:*'],
      session: { id: 'session-1', expiresAt: '2099-01-01T00:00:00Z' },
      authVersion: 1,
      orgScope: { mode: 'FLAT_TENANT' },
      spatialScope: { mode: 'UNBOUNDED' },
      mfa: { required: false, enrolled: false, verified: true, recoveryCodesRemaining: 0 },
    },
  } as never;
}

const call = (handler: typeof GET, method: string, path: string[], body?: unknown, origin = 'https://platform.example.invalid') =>
  handler(
    new Request(`https://platform.example.invalid/api/cmms/${path.join('/')}`, {
      method,
      headers: { Host: 'platform.example.invalid', Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    { params: Promise.resolve({ path }) },
  );

// WI-OI-038: the CMMS BFF signs a CMMS-audience PlatformContextV1 with its own key and exposes only core routes.
describe('CMMS BFF boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CMMS_API_URL', 'http://127.0.0.1:4200');
    vi.stubEnv('CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('grants the module to cmms:* holders and maps granular permissions', () => {
    expect(canUseTenantModule('asset-maintenance', new Set(['asset-maintenance']), ['cmms:*'])).toBe(true);
    expect(canUseTenantModule('asset-maintenance', new Set(['asset-maintenance']), ['workforce:*'])).toBe(false);
    expect(hasPermission(['cmms:*'], 'cmms.work-orders.write')).toBe(true);
    expect(requiredCmmsPermission('POST', ['v1', 'work-orders', ASSET_ID, 'status'])).toBe('cmms.work-orders.write');
    expect(requiredCmmsPermission('GET', ['v1', 'analytics', 'inventory', 'summary'])).toBe('cmms.analytics.read');
    expect(requiredCmmsPermission('POST', ['v1', 'work-orders', ASSET_ID, 'staffing'])).toBe('cmms.work-orders.write');
    expect(requiredCmmsPermission('POST', ['v1', 'work-orders', ASSET_ID, 'staffing', 'cancel'])).toBe('cmms.work-orders.write');
    expect(requiredCmmsPermission('GET', ['v1', 'work-orders', ASSET_ID, 'staffing'])).toBeNull();
  });

  it('refuses contained and unknown routes before contacting the module', async () => {
    vi.mocked(verifiedSession).mockResolvedValue(session());
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const path of [['workforce', 'resources'], ['vendors'], ['purchase-orders'], ['requests'], ['imports'], ['auth', 'token'], ['assets', '..', 'x']]) {
      expect((await call(GET, 'GET', path)).status).toBe(404);
    }
    expect((await call(POST, 'POST', ['assets', ASSET_ID, 'delete'], {})).status).toBe(404);
    // The relay inbox (WI-OI-068) is module-to-module only; a browser can never reach it through the BFF.
    for (const path of [['internal', 'v1', 'inbox'], ['..', 'internal', 'v1', 'inbox'], ['work-orders', ASSET_ID, '..', '..', '..', 'internal', 'v1', 'inbox']]) {
      expect((await call(POST, 'POST', path, {})).status).toBe(404);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('requires the entitlement, the permission and a same-origin mutation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.mocked(verifiedSession).mockResolvedValue(session({ entitled: false }));
    expect((await call(POST, 'POST', ['assets', 'search'], {})).status).toBe(403);
    vi.mocked(verifiedSession).mockResolvedValue(session({ permissions: ['cmms.assets.read'] }));
    expect((await call(POST, 'POST', ['assets'], { assetTag: 'P-1', name: 'Pump' })).status).toBe(403);
    vi.mocked(verifiedSession).mockResolvedValue(session());
    expect((await call(POST, 'POST', ['assets'], { assetTag: 'P-1', name: 'Pump' }, 'https://attacker.invalid')).status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('forwards an allowed call with a CMMS-audience context and no browser credentials', async () => {
    vi.mocked(verifiedSession).mockResolvedValue(session());
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: ASSET_ID }), { status: 200, headers: { 'Idempotency-Replayed': 'true' } }));
    const response = await call(PATCH, 'PATCH', ['assets', ASSET_ID], { expectedVersion: 1, name: 'Pump 2' });
    expect(response.status).toBe(200);
    expect(response.headers.get('idempotency-replayed')).toBe('true');
    const [target, init] = fetchSpy.mock.calls[0]!;
    expect(String(target)).toBe(`http://127.0.0.1:4200/v1/assets/${ASSET_ID}`);
    const headers = new Headers(init?.headers);
    expect(headers.get('cookie')).toBeNull();
    const claims = verifyPlatformContextToken(
      headers.get('authorization')!.replace('Bearer ', ''),
      publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      'gigalibs-cmms-api',
    );
    expect(claims).toMatchObject({ tenant_id: 'cmtenant0001', sub: 'cmuser0001', entitlement: { module_key: 'asset-maintenance' } });
    expect(claims.granted_scopes).toContain('cmms:*');
  });
});
