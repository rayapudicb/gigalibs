import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getScanner, POST as postScanner } from '../app/api/scanner/[...path]/route';
import { moduleTenantBindingId } from '../lib/ar-tenant-binding';
import { canUseTenantModule, hasPermission } from '../lib/module-access';
import { verifiedSession } from '../lib/verified-session';
import { isLockedModule } from './helpers/locked-modules';

vi.mock('../lib/verified-session', () => ({
  verifiedSession: vi.fn(),
}));

describe.skipIf(isLockedModule('document-scanner'))('Document Scanner tenant binding and access control', () => {
  it('maps canonical tenant IDs to deterministic isolated UUIDs for scanner', () => {
    const tenantA = moduleTenantBindingId('tenant-scanner-alpha');
    const tenantB = moduleTenantBindingId('tenant-scanner-beta');
    const tenantARepeat = moduleTenantBindingId('tenant-scanner-alpha');

    expect(tenantA).toBe(tenantARepeat);
    expect(tenantA).not.toBe(tenantB);
    expect(tenantA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('verifies document-scanner module entitlement and granular permission checks', () => {
    const features = new Set(['scanner', 'document-scanner']);
    const permissions = ['documents:read', 'documents:create'];

    expect(canUseTenantModule('document-scanner', features, permissions)).toBe(true);
    expect(hasPermission(permissions, 'documents:read')).toBe(true);
    expect(hasPermission(permissions, 'documents:create')).toBe(true);
    expect(hasPermission(permissions, 'documents:admin')).toBe(false);

    // Wildcard permissions
    expect(hasPermission(['*'], 'documents:admin')).toBe(true);
    expect(hasPermission(['documents:*'], 'documents:create')).toBe(true);
  });
});

describe.skipIf(isLockedModule('document-scanner'))('Document Scanner Route Security Boundary & Anti-Mock Enforcement (AI-01, AI-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SCANNER_API_URL', 'http://127.0.0.1:3017');
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('denies unauthenticated GET /api/scanner/v1/scanner/jobs with HTTP 401', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json(
        { detail: 'Authentication required.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    } as any);

    const req = new Request('https://platform.example.invalid/api/scanner/v1/scanner/jobs', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'scanner', 'jobs'] }) };

    const res = await getScanner(req, context);
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

    const req = new Request('https://platform.example.invalid/api/scanner/v1/scanner/jobs', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'scanner', 'jobs'] }) };

    const res = await getScanner(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Select an active tenant workspace first.');
  });

  it('denies user when tenant lacks document-scanner entitlement with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-no-scanner',
          name: 'No Scanner Tenant',
          slug: 'no-scanner',
          status: 'ACTIVE',
          features: ['ap'], // lacks document-scanner
        },
        roles: ['OPERATOR'],
        platformRoles: [],
        permissions: ['documents:read', 'documents:create'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/scanner/v1/scanner/jobs', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'scanner', 'jobs'] }) };

    const res = await getScanner(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toContain('entitlement is required');
  });

  it('denies user lacking documents:create on mutating POST /api/scanner/v1/scanner/upload with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-scanner-active',
          name: 'Scanner Tenant',
          slug: 'scanner-corp',
          status: 'ACTIVE',
          features: ['document-scanner'],
        },
        roles: ['VIEWER'],
        platformRoles: [],
        permissions: ['documents:read'], // lacks documents:create
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/scanner/v1/scanner/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://platform.example.invalid',
      },
      body: JSON.stringify({ fileName: 'test.pdf', textContent: 'sample' }),
    });
    const context = { params: Promise.resolve({ path: ['v1', 'scanner', 'upload'] }) };

    const res = await postScanner(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toContain('documents:create');
  });

  it('rejects cross-site mutation without trusted Origin/Referer with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-scanner-active',
          name: 'Scanner Tenant',
          slug: 'scanner-corp',
          status: 'ACTIVE',
          features: ['document-scanner'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['documents:read', 'documents:create'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/scanner/v1/scanner/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://malicious-site.example.evil',
      },
      body: JSON.stringify({ fileName: 'test.pdf' }),
    });
    const context = { params: Promise.resolve({ path: ['v1', 'scanner', 'upload'] }) };

    const res = await postScanner(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Cross-site request rejected.');
  });

  it('blocks path traversal attacks with HTTP 404', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-scanner-active',
          name: 'Scanner Tenant',
          slug: 'scanner-corp',
          status: 'ACTIVE',
          features: ['document-scanner'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['documents:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/scanner/..%2f..%2fsecret', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['..', '..', 'secret'] }) };

    const res = await getScanner(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.title).toBe('Unsupported Document Scanner route.');
  });

  it('handles upstream service failure with HTTP 502', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-scanner-active',
          name: 'Scanner Tenant',
          slug: 'scanner-corp',
          status: 'ACTIVE',
          features: ['document-scanner'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['documents:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    // Mock fetch failure
    const globalFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

    const req = new Request('https://platform.example.invalid/api/scanner/v1/scanner/jobs', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'scanner', 'jobs'] }) };

    const res = await getScanner(req, context);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.title).toBe('The Document Scanner service is temporarily unavailable.');

    globalFetch.mockRestore();
  });

  it('successfully proxies authenticated request to upstream with tenant headers', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-scanner-active',
          name: 'Scanner Tenant',
          slug: 'scanner-corp',
          status: 'ACTIVE',
          features: ['document-scanner'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['documents:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const mockUpstreamResponse = [
      {
        id: 'job-1',
        fileName: 'invoice-sample.pdf',
        status: 'EXTRACTED',
        confidenceScore: 0.96,
        isArithmeticReconciled: true,
      },
    ];

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockUpstreamResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const req = new Request('https://platform.example.invalid/api/scanner/v1/scanner/jobs', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['v1', 'scanner', 'jobs'] }) };

    const res = await getScanner(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].fileName).toBe('invoice-sample.pdf');

    expect(fetchSpy).toHaveBeenCalled();
    const calledUrl = fetchSpy.mock.calls[0][0].toString();
    expect(calledUrl).toBe('http://127.0.0.1:3017/v1/scanner/jobs');
    const headers = fetchSpy.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('x-tenant-id')).toBe(moduleTenantBindingId('tenant-scanner-active'));
    expect(headers.get('x-user-id')).toBe('usr-1');

    fetchSpy.mockRestore();
  });
});
