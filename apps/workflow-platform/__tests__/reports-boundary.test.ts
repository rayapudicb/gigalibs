import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getReports } from '../app/api/reports/route';
import { canUseTenantModule, hasPermission } from '../lib/module-access';
import { verifiedSession } from '../lib/verified-session';

vi.mock('../lib/verified-session', () => ({
  verifiedSession: vi.fn(),
}));

describe('Wave 8 / Reports Module Access Control & Permissions', () => {
  it('verifies reports module entitlement and permission checks', () => {
    const features = new Set(['reports']);
    const permissions = ['reports:read'];

    expect(canUseTenantModule('reports', features, permissions)).toBe(true);
    expect(hasPermission(permissions, 'reports:read')).toBe(true);
    expect(hasPermission(permissions, 'reports:write')).toBe(false);

    // Wildcard permissions
    expect(hasPermission(['*'], 'reports:read')).toBe(true);
    expect(hasPermission(['reports:*'], 'reports:read')).toBe(true);

    // Without feature flag
    expect(canUseTenantModule('reports', new Set(['other-feature']), permissions)).toBe(false);

    // Without permission
    expect(canUseTenantModule('reports', features, ['other:read'])).toBe(false);
  });
});

describe('Wave 8 / Reports Route Security Boundary & Contained Model Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('denies unauthenticated GET /api/reports with HTTP 401', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json(
        { detail: 'Authentication required.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    } as any);

    const req = new Request('https://platform.example.invalid/api/reports?reportId=GL_TRIAL_BALANCE', {
      method: 'GET',
    });

    const res = await getReports(req);
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

    const req = new Request('https://platform.example.invalid/api/reports?reportId=GL_TRIAL_BALANCE', {
      method: 'GET',
    });

    const res = await getReports(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.detail).toBe('Tenant workspace required.');
  });

  it('denies user when tenant lacks reports entitlement with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-no-reports',
          name: 'No Reports Tenant',
          slug: 'no-reports',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['some-other-feature'],
        },
        roles: ['MEMBER'],
        platformRoles: [],
        permissions: ['reports:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/reports?reportId=GL_TRIAL_BALANCE', {
      method: 'GET',
    });

    const res = await getReports(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.detail).toBe('Permission reports:read is required.');
  });

  it('denies user when user lacks reports:read permission with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-reports-ok',
          name: 'Reports Tenant',
          slug: 'reports-ok',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['reports'],
        },
        roles: ['MEMBER'],
        platformRoles: [],
        permissions: ['other:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/reports?reportId=GL_TRIAL_BALANCE', {
      method: 'GET',
    });

    const res = await getReports(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.detail).toBe('Permission reports:read is required.');
  });

  it('returns fail-closed 503 indicating read-model containment rather than leaking fake reports', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-reports-ok',
          name: 'Reports Tenant',
          slug: 'reports-ok',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['reports'],
        },
        roles: ['MEMBER'],
        platformRoles: [],
        permissions: ['reports:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/reports?reportId=GL_TRIAL_BALANCE', {
      method: 'GET',
    });

    const res = await getReports(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('REPORTS_READ_MODEL_CONTAINED');
    expect(body.title).toBe('Reporting Read-Model Contained');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
