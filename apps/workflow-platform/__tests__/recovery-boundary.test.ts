import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getRecovery, POST as postRecovery } from '../app/api/recovery/[...path]/route';
import { moduleTenantBindingId } from '../lib/ar-tenant-binding';
import { verifiedSession } from '../lib/verified-session';

vi.mock('../lib/verified-session', () => ({
  verifiedSession: vi.fn(),
}));

describe('Autonomous Recovery tenant binding and isolation boundary', () => {
  it('maps canonical tenant IDs to deterministic isolated UUIDs for recovery schema', () => {
    const tenantA = moduleTenantBindingId('recovery-workspace-alpha');
    const tenantB = moduleTenantBindingId('recovery-workspace-beta');
    const tenantARepeat = moduleTenantBindingId('recovery-workspace-alpha');

    expect(tenantA).toBe(tenantARepeat);
    expect(tenantA).not.toBe(tenantB);
    expect(tenantA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(tenantA).not.toContain('recovery-workspace-alpha');
  });

  it('rejects cross-tenant identity injection or invalid tenant bounds', () => {
    expect(() => moduleTenantBindingId('')).toThrow('Canonical tenant identity is invalid.');
    expect(() => moduleTenantBindingId('a'.repeat(201))).toThrow('Canonical tenant identity is invalid.');
  });
});

describe('Wave 4 / Autonomous Recovery Route Security Boundary & Anti-Mock Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RECOVERY_API_URL', 'http://127.0.0.1:4200');
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('denies unauthenticated GET /api/recovery/v1/metrics with HTTP 401', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json(
        { detail: 'Authentication required.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    } as any);

    const req = new Request('https://platform.example.invalid/api/recovery/v1/metrics', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'metrics'] }) };

    const res = await getRecovery(req, context);
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

    const req = new Request('https://platform.example.invalid/api/recovery/v1/metrics', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'metrics'] }) };

    const res = await getRecovery(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Select an active tenant workspace first.');
  });

  it('denies user when tenant lacks autonomous-recovery entitlement with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-no-rec',
          name: 'No Recovery Tenant',
          slug: 'no-recovery',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['some-other-feature'],
        },
        roles: ['MEMBER'],
        platformRoles: [],
        permissions: ['recovery:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/recovery/v1/metrics', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'metrics'] }) };

    const res = await getRecovery(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Permission recovery:read is required.');
  });

  it('denies user when tenant is entitled but user lacks required permission with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-rec-ok',
          name: 'Recovery Tenant',
          slug: 'recovery-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['autonomous-recovery'],
        },
        roles: ['VIEWER'],
        platformRoles: [],
        permissions: ['other:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/recovery/v1/metrics', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'metrics'] }) };

    const res = await getRecovery(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Permission recovery:read is required.');
  });

  it('denies cross-site mutating requests without same-origin headers with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-rec-ok',
          name: 'Recovery Tenant',
          slug: 'recovery-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['autonomous-recovery'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['recovery:read', 'recovery:action'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/recovery/v1/scans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil-attacker.invalid',
      },
      body: JSON.stringify({ scanName: 'Nightly Scan' }),
    });
    const context = { params: Promise.resolve({ path: ['v1', 'scans'] }) };

    const res = await postRecovery(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Cross-site request rejected.');
  });

  it('rejects unsupported recovery routes with HTTP 404', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-rec-ok',
          name: 'Recovery Tenant',
          slug: 'recovery-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['autonomous-recovery'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['*'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/recovery/v1/unknown-recovery-path', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'unknown-recovery-path'] }) };

    const res = await getRecovery(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.title).toBe('Unsupported Autonomous Recovery route.');
  });

  it('fails closed with HTTP 502 on upstream Recovery API failure without fabricating mock data', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-rec-ok',
          name: 'Recovery Tenant',
          slug: 'recovery-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['autonomous-recovery'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['*'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    // Mock fetch to simulate upstream recovery service failure
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused to port 4200'));

    try {
      const req = new Request('https://platform.example.invalid/api/recovery/v1/metrics', {
        method: 'GET',
      });
      const context = { params: Promise.resolve({ path: ['v1', 'metrics'] }) };

      const res = await getRecovery(req, context);
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.title).toBe('The Autonomous Recovery service is temporarily unavailable.');
      expect(body.metrics).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

