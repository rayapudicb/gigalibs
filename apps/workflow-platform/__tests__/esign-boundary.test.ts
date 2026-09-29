import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getEsign, POST as postEsign } from '../app/api/esign/[...path]/route';
import { moduleTenantBindingId } from '../lib/ar-tenant-binding';
import { canUseTenantModule, hasPermission } from '../lib/module-access';
import { verifiedSession } from '../lib/verified-session';
import { isLockedModule } from './helpers/locked-modules';

vi.mock('../lib/verified-session', () => ({
  verifiedSession: vi.fn(),
}));

describe.skipIf(isLockedModule('esignature'))('E-Signature tenant binding and access control', () => {
  it('maps canonical tenant IDs to deterministic isolated UUIDs for esign', () => {
    const tenantA = moduleTenantBindingId('tenant-esign-alpha');
    const tenantB = moduleTenantBindingId('tenant-esign-beta');
    const tenantARepeat = moduleTenantBindingId('tenant-esign-alpha');

    expect(tenantA).toBe(tenantARepeat);
    expect(tenantA).not.toBe(tenantB);
    expect(tenantA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(tenantA).not.toContain('tenant-esign-alpha');
  });

  it('verifies esignature module entitlement and granular permission checks', () => {
    const features = new Set(['esignature']);
    const permissions = ['esign:read', 'esign:create', 'esign:sign'];

    expect(canUseTenantModule('esignature', features, permissions)).toBe(true);
    expect(hasPermission(permissions, 'esign:read')).toBe(true);
    expect(hasPermission(permissions, 'esign:create')).toBe(true);
    expect(hasPermission(permissions, 'esign:sign')).toBe(true);
    expect(hasPermission(permissions, 'esign:*')).toBe(false);

    // With wildcard
    expect(hasPermission(['*'], 'esign:*')).toBe(true);
    expect(hasPermission(['esign:*'], 'esign:sign')).toBe(true);
  });
});

describe.skipIf(isLockedModule('esignature'))('Wave 5 / E-Signature Route Security Boundary & Anti-Mock Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ESIGN_API_URL', 'http://127.0.0.1:4100');
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('denies unauthenticated GET /api/esign/v1/envelopes with HTTP 401', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json(
        { detail: 'Authentication required.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    } as any);

    const req = new Request('https://platform.example.invalid/api/esign/v1/envelopes', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'envelopes'] }) };

    const res = await getEsign(req, context);
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

    const req = new Request('https://platform.example.invalid/api/esign/v1/envelopes', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'envelopes'] }) };

    const res = await getEsign(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Select an active tenant workspace first.');
  });

  it('denies user when tenant lacks esignature entitlement with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-no-esign',
          name: 'No E-Sign Tenant',
          slug: 'no-esign',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['some-other-feature'],
        },
        roles: ['MEMBER'],
        platformRoles: [],
        permissions: ['esign:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/esign/v1/envelopes', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'envelopes'] }) };

    const res = await getEsign(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Permission esign:read is required.');
  });

  it('denies user when tenant is entitled but user lacks required permission with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-esign-ok',
          name: 'E-Sign Tenant',
          slug: 'esign-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['esignature'],
        },
        roles: ['VIEWER'],
        platformRoles: [],
        permissions: ['other:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/esign/v1/envelopes', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'envelopes'] }) };

    const res = await getEsign(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Permission esign:read is required.');
  });

  it('denies cross-site mutating requests without same-origin headers with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-esign-ok',
          name: 'E-Sign Tenant',
          slug: 'esign-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['esignature'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['esign:read', 'esign:create'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/esign/v1/envelopes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil-attacker.invalid',
      },
      body: JSON.stringify({ title: 'Agreement' }),
    });
    const context = { params: Promise.resolve({ path: ['v1', 'envelopes'] }) };

    const res = await postEsign(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Cross-site request rejected.');
  });

  it('rejects unsupported esign routes with HTTP 404', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-esign-ok',
          name: 'E-Sign Tenant',
          slug: 'esign-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['esignature'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['*'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/esign/v1/unknown-esign-path', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'unknown-esign-path'] }) };

    const res = await getEsign(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.title).toBe('Unsupported E-Signature route.');
  });

  it('fails closed with HTTP 502 on upstream E-Signature API failure without fabricating mock data', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-esign-ok',
          name: 'E-Sign Tenant',
          slug: 'esign-tenant',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['esignature'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['*'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    // Mock fetch to simulate upstream esign service failure
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused to port 4100'));

    try {
      const req = new Request('https://platform.example.invalid/api/esign/v1/envelopes', {
        method: 'GET',
      });
      const context = { params: Promise.resolve({ path: ['v1', 'envelopes'] }) };

      const res = await getEsign(req, context);
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.title).toBe('The E-Signature service is temporarily unavailable.');
      expect(body.envelopes).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
