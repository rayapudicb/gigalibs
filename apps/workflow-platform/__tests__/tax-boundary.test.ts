import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getTax, POST as postTax } from '../app/api/tax/[...path]/route';
import { moduleTenantBindingId } from '../lib/ar-tenant-binding';
import { canUseTenantModule, hasPermission } from '../lib/module-access';
import { verifiedSession } from '../lib/verified-session';

vi.mock('../lib/verified-session', () => ({
  verifiedSession: vi.fn(),
}));

describe('Tax Configuration tenant binding and access control', () => {
  it('maps canonical tenant IDs to deterministic isolated UUIDs for tax schema', () => {
    const tenantA = moduleTenantBindingId('tax-workspace-alpha');
    const tenantB = moduleTenantBindingId('tax-workspace-beta');
    const tenantARepeat = moduleTenantBindingId('tax-workspace-alpha');

    expect(tenantA).toBe(tenantARepeat);
    expect(tenantA).not.toBe(tenantB);
    expect(tenantA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(tenantA).not.toContain('tax-workspace-alpha');
  });

  it('verifies tax-configuration module entitlement and granular permission checks', () => {
    const features = new Set(['tax-configuration']);
    const permissions = ['tax:read', 'tax:write', 'tax:manage'];

    expect(canUseTenantModule('tax-configuration', features, permissions)).toBe(true);
    expect(hasPermission(permissions, 'tax:read')).toBe(true);
    expect(hasPermission(permissions, 'tax:write')).toBe(true);
    expect(hasPermission(permissions, 'tax:manage')).toBe(true);
    expect(hasPermission(permissions, 'tax:*')).toBe(false);

    // With wildcard
    expect(hasPermission(['*'], 'tax:*')).toBe(true);
    expect(hasPermission(['tax:*'], 'tax:write')).toBe(true);
  });
});

describe('Wave 6 / Tax Configuration Route Security Boundary & Anti-Mock Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TAX_API_URL', 'http://127.0.0.1:3600');
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('denies unauthenticated GET /api/tax/api/tax/v1/jurisdictions with HTTP 401', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json(
        { detail: 'Authentication required.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    } as any);

    const req = new Request('https://platform.example.invalid/api/tax/api/tax/v1/jurisdictions', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['api', 'tax', 'v1', 'jurisdictions'] }) };

    const res = await getTax(req, context);
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

    const req = new Request('https://platform.example.invalid/api/tax/api/tax/v1/jurisdictions', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['api', 'tax', 'v1', 'jurisdictions'] }) };

    const res = await getTax(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Select an active tenant workspace first.');
  });

  it('denies user when tenant lacks tax-configuration entitlement with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-no-tax',
          name: 'No Tax Tenant',
          slug: 'no-tax',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['some-other-feature'],
        },
        roles: ['MEMBER'],
        platformRoles: [],
        permissions: ['tax:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/tax/api/tax/v1/jurisdictions', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['api', 'tax', 'v1', 'jurisdictions'] }) };

    const res = await getTax(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Permission tax:read is required.');
  });

  it('denies user when tenant is entitled but user lacks required permission with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-tax-ok',
          name: 'Tax Tenant',
          slug: 'tax-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['tax-configuration'],
        },
        roles: ['VIEWER'],
        platformRoles: [],
        permissions: ['other:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/tax/api/tax/v1/jurisdictions', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['api', 'tax', 'v1', 'jurisdictions'] }) };

    const res = await getTax(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Permission tax:read is required.');
  });

  it('denies cross-site mutating requests without same-origin headers with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-tax-ok',
          name: 'Tax Tenant',
          slug: 'tax-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['tax-configuration'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['tax:read', 'tax:write'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/tax/api/tax/v1/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil-attacker.invalid',
      },
      body: JSON.stringify({ amountMinor: 1000, jurisdiction: 'US-CA' }),
    });
    const context = { params: Promise.resolve({ path: ['api', 'tax', 'v1', 'calculate'] }) };

    const res = await postTax(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Cross-site request rejected.');
  });

  it('rejects unsupported tax routes with HTTP 404', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-tax-ok',
          name: 'Tax Tenant',
          slug: 'tax-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['tax-configuration'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['*'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/tax/unknown-tax-path', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['unknown-tax-path'] }) };

    const res = await getTax(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.title).toBe('Unsupported Tax Configuration route.');
  });

  it('fails closed with HTTP 502 on upstream Tax API failure without fabricating mock data', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-tax-ok',
          name: 'Tax Tenant',
          slug: 'tax-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['tax-configuration'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['*'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    // Mock fetch to simulate upstream tax service failure
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused to port 3600'));

    try {
      const req = new Request('https://platform.example.invalid/api/tax/api/tax/v1/jurisdictions', {
        method: 'GET',
      });
      const context = { params: Promise.resolve({ path: ['api', 'tax', 'v1', 'jurisdictions'] }) };

      const res = await getTax(req, context);
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.title).toBe('The Tax Configuration service is temporarily unavailable.');
      expect(body.jurisdictions).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
