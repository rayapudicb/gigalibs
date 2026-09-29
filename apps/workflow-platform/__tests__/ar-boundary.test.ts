import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { GET as getAr, POST as postAr } from '../app/api/ar/[...path]/route';
import { verifiedSession } from '../lib/verified-session';
import { isLockedModule } from './helpers/locked-modules';

vi.mock('../lib/verified-session', () => ({
  verifiedSession: vi.fn(),
}));

describe.skipIf(isLockedModule('accounts-receivable'))('WI-OI-019 / RT-02 Exit Proof: AR route security boundary and anti-mock enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('RT-02: denies unauthenticated GET /api/ar/v1/invoices with HTTP 401 and returns zero mock invoices', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json(
        { detail: 'Authentication required.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    } as any);

    const req = new Request('https://platform.example.invalid/api/ar/v1/invoices', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'invoices'] }) };

    const res = await getAr(req, context);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.detail).toBe('Authentication required.');
    expect(body.invoices).toBeUndefined();
    expect(body.items).toBeUndefined();
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

    const req = new Request('https://platform.example.invalid/api/ar/v1/invoices', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'invoices'] }) };

    const res = await getAr(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Select an active tenant workspace first.');
  });

  it('denies user when tenant is not entitled to accounts-receivable with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-no-ar',
          name: 'No AR Tenant',
          slug: 'no-ar',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['some-other-feature'],
        },
        roles: ['MEMBER'],
        platformRoles: [],
        permissions: ['ar:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/ar/v1/invoices', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'invoices'] }) };

    const res = await getAr(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Permission ar:read is required.');
  });

  it('denies user when tenant is entitled but user lacks ar:read permission', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-ar-ok',
          name: 'AR Tenant',
          slug: 'ar-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['accounts-receivable'],
        },
        roles: ['VIEWER'],
        platformRoles: [],
        permissions: ['other:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/ar/v1/invoices', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'invoices'] }) };

    const res = await getAr(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Permission ar:read is required.');
  });

  it('denies cross-site mutating requests (missing origin/referer)', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-ar-ok',
          name: 'AR Tenant',
          slug: 'ar-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['accounts-receivable'],
        },
        roles: ['TENANT_ADMIN'],
        platformRoles: [],
        permissions: ['ar:read', 'ar:write'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/ar/v1/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: 'cust-1' }),
    });
    const context = { params: Promise.resolve({ path: ['v1', 'invoices'] }) };

    const res = await postAr(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Cross-site request rejected.');
  });

  it('rejects unsupported AR paths with HTTP 404', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-ar-ok',
          name: 'AR Tenant',
          slug: 'ar-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['accounts-receivable'],
        },
        roles: ['TENANT_ADMIN'],
        platformRoles: [],
        permissions: ['*'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/ar/unsupported-action-xyz', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['unsupported-action-xyz'] }) };

    const res = await getAr(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.title).toBe('Unsupported Accounts Receivable route.');
  });

  it('rejects unsupported invoice sub-actions with HTTP 404', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-ar-ok',
          name: 'AR Tenant',
          slug: 'ar-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['accounts-receivable'],
        },
        roles: ['TENANT_ADMIN'],
        platformRoles: [],
        permissions: ['*'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/ar/v1/invoices/inv-1/unsupported-sub', {
      method: 'POST',
      headers: {
        origin: 'https://platform.example.invalid',
        host: 'platform.example.invalid',
      },
    });
    const context = { params: Promise.resolve({ path: ['v1', 'invoices', 'inv-1', 'unsupported-sub'] }) };

    const res = await postAr(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.title).toBe('Unsupported Accounts Receivable route.');
  });

  it('enforces ar:write permission on newly supported mutating payment routes', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-ar-ok',
          name: 'AR Tenant',
          slug: 'ar-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['accounts-receivable'],
        },
        roles: ['VIEWER'],
        platformRoles: [],
        permissions: ['ar:read'], // only read permission, not write
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/ar/v1/invoices/inv-1/payments', {
      method: 'POST',
      headers: {
        origin: 'https://platform.example.invalid',
        host: 'platform.example.invalid',
      },
      body: JSON.stringify({ amountMinor: 1000, currency: 'USD', paymentMethod: 'ACH' }),
    });
    const context = { params: Promise.resolve({ path: ['v1', 'invoices', 'inv-1', 'payments'] }) };

    const res = await postAr(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Permission ar:write is required.');
  });

  it('enforces ar:write on checkout-session and work-sources generation', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-ar-ok',
          name: 'AR Tenant',
          slug: 'ar-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['accounts-receivable'],
        },
        roles: ['VIEWER'],
        platformRoles: [],
        permissions: ['ar:read'], // read only
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req1 = new Request('https://platform.example.invalid/api/ar/v1/invoices/inv-1/checkout-session', {
      method: 'POST',
      headers: { origin: 'https://platform.example.invalid', host: 'platform.example.invalid' },
      body: JSON.stringify({ successUrl: 'https://example.com', cancelUrl: 'https://example.com' }),
    });
    const res1 = await postAr(req1, { params: Promise.resolve({ path: ['v1', 'invoices', 'inv-1', 'checkout-session'] }) });
    expect(res1.status).toBe(403);

    const req2 = new Request('https://platform.example.invalid/api/ar/v1/work-sources/ws-1/generate-invoice', {
      method: 'POST',
      headers: { origin: 'https://platform.example.invalid', host: 'platform.example.invalid' },
      body: JSON.stringify({ currency: 'USD' }),
    });
    const res2 = await postAr(req2, { params: Promise.resolve({ path: ['v1', 'work-sources', 'ws-1', 'generate-invoice'] }) });
    expect(res2.status).toBe(403);
  });
});
