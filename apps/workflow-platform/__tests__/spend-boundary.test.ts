import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getSpend, POST as postSpend } from '../app/api/spend/[...path]/route';
import { moduleTenantBindingId } from '../lib/ar-tenant-binding';
import { verifiedSession } from '../lib/verified-session';

vi.mock('../lib/verified-session', () => ({
  verifiedSession: vi.fn(),
}));

describe('Spend tenant binding and isolation', () => {
  it('maps canonical tenant IDs to deterministic isolated UUIDs', () => {
    const tenantA = moduleTenantBindingId('tenant-workspace-alpha');
    const tenantB = moduleTenantBindingId('tenant-workspace-beta');
    const tenantARepeat = moduleTenantBindingId('tenant-workspace-alpha');

    expect(tenantA).toBe(tenantARepeat);
    expect(tenantA).not.toBe(tenantB);
    expect(tenantA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(tenantA).not.toContain('tenant-workspace-alpha');
  });

  it('rejects invalid or empty tenant identifiers', () => {
    expect(() => moduleTenantBindingId('')).toThrow('Canonical tenant identity is invalid.');
    expect(() => moduleTenantBindingId('a'.repeat(201))).toThrow('Canonical tenant identity is invalid.');
  });
});

describe('Wave 3 / Spend Management Route Security Boundary & Anti-Mock Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SPEND_API_URL', 'http://127.0.0.1:3500');
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('denies unauthenticated GET /api/spend/v1/expenses with HTTP 401', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json(
        { detail: 'Authentication required.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    } as any);

    const req = new Request('https://platform.example.invalid/api/spend/v1/expenses', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'expenses'] }) };

    const res = await getSpend(req, context);
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

    const req = new Request('https://platform.example.invalid/api/spend/v1/expenses', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'expenses'] }) };

    const res = await getSpend(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Select an active tenant workspace first.');
  });

  it('denies user when tenant lacks spend-management entitlement with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-no-spend',
          name: 'No Spend Tenant',
          slug: 'no-spend',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['some-other-feature'],
        },
        roles: ['MEMBER'],
        platformRoles: [],
        permissions: ['spend:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/spend/v1/expenses', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'expenses'] }) };

    const res = await getSpend(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Permission spend:read is required.');
  });

  it('denies user when tenant is entitled but user lacks required permission with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-spend-ok',
          name: 'Spend Tenant',
          slug: 'spend-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['spend-management'],
        },
        roles: ['VIEWER'],
        platformRoles: [],
        permissions: ['other:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/spend/v1/expenses', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'expenses'] }) };

    const res = await getSpend(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Permission spend:read is required.');
  });

  it('denies cross-site mutating requests without same-origin headers with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-spend-ok',
          name: 'Spend Tenant',
          slug: 'spend-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['spend-management'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['spend:read', 'spend:write'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/spend/v1/expenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil-attacker.invalid',
      },
      body: JSON.stringify({ amountMinor: 1000 }),
    });
    const context = { params: Promise.resolve({ path: ['v1', 'expenses'] }) };

    const res = await postSpend(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Cross-site request rejected.');
  });

  it('rejects unsupported spend routes with HTTP 404', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-spend-ok',
          name: 'Spend Tenant',
          slug: 'spend-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['spend-management'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['*'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/spend/v1/unknown-spend-path', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'unknown-spend-path'] }) };

    const res = await getSpend(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.title).toBe('Unsupported Spend Management route.');
  });

  it('fails closed with HTTP 502 on upstream Spend API failure without fabricating mock data', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-spend-ok',
          name: 'Spend Tenant',
          slug: 'spend-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['spend-management'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['*'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    // Mock fetch to simulate upstream spend service failure
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused to port 3500'));

    try {
      const req = new Request('https://platform.example.invalid/api/spend/v1/expenses', {
        method: 'GET',
      });
      const context = { params: Promise.resolve({ path: ['v1', 'expenses'] }) };

      const res = await getSpend(req, context);
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.title).toBe('The Spend Management service is temporarily unavailable.');
      expect(body.expenses).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

