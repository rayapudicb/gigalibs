import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { GET, POST } from '../app/api/ar/[...path]/route';
import { canUseTenantModule, hasPermission } from '../lib/module-access';
import { moduleGatewayConfig } from '../lib/module-gateway';
import { verifiedSession } from '../lib/verified-session';
import { isLockedModule } from './helpers/locked-modules';

vi.mock('../lib/verified-session', () => ({ verifiedSession: vi.fn() }));

const { privateKey } = generateKeyPairSync('ed25519');
const requiredArPermission = moduleGatewayConfig('accounts-receivable').requiredPermission;

function session(overrides: { permissions?: string[]; features?: string[]; entitled?: boolean } = {}) {
  return {
    context: {
      user: { id: 'ar-user-1', email: 'ar@example.invalid', name: 'AR User', status: 'ACTIVE' },
      tenant: {
        id: '323e4567-e89b-12d3-a456-426614174000',
        name: 'Tenant',
        slug: 'tenant',
        status: 'ACTIVE',
        trialEndsAt: null,
        features: overrides.features ?? ['accounts-receivable'],
        entitlements:
          overrides.entitled === false
            ? []
            : [{ moduleKey: 'accounts-receivable', status: 'ENABLED', version: 'v1' }],
      },
      roles: ['TENANT_ADMIN'],
      platformRoles: [],
      permissions: overrides.permissions ?? ['ar:*'],
      session: { id: 'session-1', expiresAt: '2099-01-01T00:00:00Z' },
      authVersion: 1,
      orgScope: { mode: 'FLAT_TENANT' },
      spatialScope: { mode: 'UNBOUNDED' },
      mfa: { required: false, enrolled: false, verified: true, recoveryCodesRemaining: 0 },
    },
  } as never;
}

describe.skipIf(isLockedModule('accounts-receivable'))('AR manifest gateway boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('AR_API_URL', 'http://ar-api:3400');
    vi.stubEnv(
      'AR_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
      privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    );
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('maps manifest routes to ar permissions', () => {
    expect(canUseTenantModule('accounts-receivable', new Set(['accounts-receivable']), ['ar:*'])).toBe(true);
    expect(hasPermission(['ar:*'], 'ar:read')).toBe(true);
    expect(requiredArPermission('GET', ['v1', 'invoices'])).toBe('ar:read');
    expect(requiredArPermission('POST', ['v1', 'invoices', 'inv-1', 'issue'])).toBe('ar:issue');
    expect(requiredArPermission('PATCH', ['v1', 'invoices', 'inv-1'])).toBe('ar:write');
    expect(requiredArPermission('GET', ['v1', 'unsupported'])).toBeNull();
  });

  it('refuses unknown routes before contacting AR', async () => {
    vi.mocked(verifiedSession).mockResolvedValue(session());
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await GET(
      new Request('https://platform.example.invalid/api/ar/v1/unsupported-action', {
        method: 'GET',
        headers: { Host: 'platform.example.invalid', Origin: 'https://platform.example.invalid' },
      }),
      { params: Promise.resolve({ path: ['v1', 'unsupported-action'] }) },
    );
    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('requires entitlement and permission for mutations', async () => {
    vi.mocked(verifiedSession).mockResolvedValue(session({ entitled: false }));
    expect(
      (
        await POST(
          new Request('https://platform.example.invalid/api/ar/v1/invoices', {
            method: 'POST',
            headers: {
              Host: 'platform.example.invalid',
              Origin: 'https://platform.example.invalid',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ customerId: 'x' }),
          }),
          { params: Promise.resolve({ path: ['v1', 'invoices'] }) },
        )
      ).status,
    ).toBe(403);

    vi.mocked(verifiedSession).mockResolvedValue(session({ permissions: ['ar:read'] }));
    expect(
      (
        await POST(
          new Request('https://platform.example.invalid/api/ar/v1/invoices', {
            method: 'POST',
            headers: {
              Host: 'platform.example.invalid',
              Origin: 'https://platform.example.invalid',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ customerId: 'x' }),
          }),
          { params: Promise.resolve({ path: ['v1', 'invoices'] }) },
        )
      ).status,
    ).toBe(403);
  });
});
