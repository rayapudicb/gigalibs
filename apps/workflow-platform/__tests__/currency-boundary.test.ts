import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getCurrency, POST as postCurrency } from '../app/api/currency/[...path]/route';
import { moduleTenantBindingId } from '../lib/ar-tenant-binding';
import { canUseTenantModule, hasPermission } from '../lib/module-access';
import { verifiedSession } from '../lib/verified-session';

vi.mock('../lib/verified-session', () => ({
  verifiedSession: vi.fn(),
}));

describe('Currency tenant binding and isolation boundary', () => {
  it('maps canonical tenant IDs to deterministic isolated UUIDs for currency schema', () => {
    const tenantA = moduleTenantBindingId('currency-workspace-east');
    const tenantB = moduleTenantBindingId('currency-workspace-west');
    const tenantARepeat = moduleTenantBindingId('currency-workspace-east');

    expect(tenantA).toBe(tenantARepeat);
    expect(tenantA).not.toBe(tenantB);
    expect(tenantA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(tenantA).not.toContain('currency-workspace-east');
  });

  it('rejects cross-tenant identity injection or invalid tenant bounds', () => {
    expect(() => moduleTenantBindingId('')).toThrow('Canonical tenant identity is invalid.');
    expect(() => moduleTenantBindingId('a'.repeat(201))).toThrow('Canonical tenant identity is invalid.');
  });

  it('verifies multi-currency module entitlement and granular permission checks', () => {
    const features = new Set(['multi-currency']);
    const permissions = ['currency:read', 'currency:convert'];

    expect(canUseTenantModule('multi-currency', features, permissions)).toBe(true);
    expect(hasPermission(permissions, 'currency:read')).toBe(true);
    expect(hasPermission(permissions, 'currency:convert')).toBe(true);
    expect(hasPermission(permissions, 'currency:*')).toBe(false);

    // With wildcard
    expect(hasPermission(['*'], 'currency:*')).toBe(true);
    expect(hasPermission(['currency:*'], 'currency:convert')).toBe(true);
  });
});

describe('Wave 6 / Multi-Currency Route Security Boundary & Anti-Mock Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CURRENCY_API_URL', 'http://127.0.0.1:3700');
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('denies unauthenticated GET /api/currency/v1/pairs with HTTP 401', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json(
        { detail: 'Authentication required.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    } as any);

    const req = new Request('https://platform.example.invalid/api/currency/v1/pairs', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'pairs'] }) };

    const res = await getCurrency(req, context);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.detail).toBe('Authentication required.');
  });

  it('denies authenticated user without an active tenant workspace with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: null,
        roles: [],
        platformRoles: [],
        permissions: [],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/currency/v1/pairs', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'pairs'] }) };

    const res = await getCurrency(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Select an active tenant workspace first.');
  });

  it('denies user when tenant lacks multi-currency entitlement with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-no-curr',
          name: 'No Currency Tenant',
          slug: 'no-currency',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['some-other-feature'],
        },
        roles: ['MEMBER'],
        platformRoles: [],
        permissions: ['currency:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/currency/v1/pairs', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'pairs'] }) };

    const res = await getCurrency(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Permission currency:read is required.');
  });

  it('denies user when tenant is entitled but user lacks required permission with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-curr-ok',
          name: 'Currency Tenant',
          slug: 'currency-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['multi-currency'],
        },
        roles: ['VIEWER'],
        platformRoles: [],
        permissions: ['other:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/currency/v1/pairs', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'pairs'] }) };

    const res = await getCurrency(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Permission currency:read is required.');
  });

  it('denies cross-site mutating requests without same-origin headers with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-curr-ok',
          name: 'Currency Tenant',
          slug: 'currency-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['multi-currency'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['currency:read', 'currency:convert'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/currency/v1/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil-attacker.invalid',
      },
      body: JSON.stringify({ from: 'USD', to: 'EUR', amountMinor: 1000 }),
    });
    const context = { params: Promise.resolve({ path: ['v1', 'convert'] }) };

    const res = await postCurrency(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Cross-site request rejected.');
  });

  it('rejects unsupported currency routes with HTTP 404', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-curr-ok',
          name: 'Currency Tenant',
          slug: 'currency-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['multi-currency'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['*'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/currency/v1/unknown-curr-path', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'unknown-curr-path'] }) };

    const res = await getCurrency(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.title).toBe('Unsupported Multi-Currency route.');
  });

  it('fails closed with HTTP 502 on upstream Currency API failure without fabricating mock data', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-curr-ok',
          name: 'Currency Tenant',
          slug: 'currency-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['multi-currency'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['*'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    // Mock fetch to simulate upstream currency service failure
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused to port 3700'));

    try {
      const req = new Request('https://platform.example.invalid/api/currency/v1/pairs', {
        method: 'GET',
      });
      const context = { params: Promise.resolve({ path: ['v1', 'pairs'] }) };

      const res = await getCurrency(req, context);
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.title).toBe('The Multi-Currency service is temporarily unavailable.');
      expect(body.pairs).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
