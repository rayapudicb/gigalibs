import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getDataStudio, POST as postDataStudio } from '../app/api/data-studio/[...path]/route';
import { canUseTenantModule, hasPermission } from '../lib/module-access';
import { verifiedSession } from '../lib/verified-session';

vi.mock('../lib/verified-session', () => ({
  verifiedSession: vi.fn(),
}));

describe('Wave 2 / Data Contracts Module Access Control & Permissions', () => {
  it('verifies data-contracts module entitlement and permission checks', () => {
    const features = new Set(['data-contracts']);
    const permissions = ['contracts:read'];

    expect(canUseTenantModule('data-contracts', features, permissions)).toBe(true);
    expect(hasPermission(permissions, 'contracts:read')).toBe(true);
    expect(hasPermission(permissions, 'contracts:write')).toBe(false);

    // Wildcard
    expect(hasPermission(['*'], 'contracts:read')).toBe(true);
    expect(hasPermission(['contracts:*'], 'contracts:read')).toBe(true);

    // Without feature
    expect(canUseTenantModule('data-contracts', new Set(['other']), permissions)).toBe(false);

    // Without permission
    expect(canUseTenantModule('data-contracts', features, ['other:read'])).toBe(false);
  });
});

describe('Wave 2 / Data Studio Route Security Boundary & Anti-Mock Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DATA_STUDIO_API_URL', 'http://127.0.0.1:4100');
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('denies unauthenticated GET /api/data-studio/schemas with HTTP 401', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json(
        { detail: 'Authentication required.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    } as any);

    const req = new Request('https://platform.example.invalid/api/data-studio/schemas', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['schemas'] }) };

    const res = await getDataStudio(req, context);
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

    const req = new Request('https://platform.example.invalid/api/data-studio/schemas', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['schemas'] }) };

    const res = await getDataStudio(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Select an active tenant workspace first.');
  });

  it('denies user when tenant lacks data-contracts entitlement with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-no-dc',
          name: 'No DC Tenant',
          slug: 'no-dc',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['some-other-feature'],
        },
        roles: ['MEMBER'],
        platformRoles: [],
        permissions: ['contracts:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/data-studio/schemas', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['schemas'] }) };

    const res = await getDataStudio(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Data Contracts module is not enabled for this tenant.');
  });

  it('rejects cross-site mutating POST with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-dc-ok',
          name: 'DC Tenant',
          slug: 'dc-ok',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['data-contracts'],
        },
        roles: ['MEMBER'],
        platformRoles: [],
        permissions: ['contracts:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/data-studio/schemas', {
      method: 'POST',
      headers: {
        Host: 'platform.example.invalid',
        Origin: 'https://attacker.evil.invalid',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'InvoiceContract' }),
    });
    const context = { params: Promise.resolve({ path: ['schemas'] }) };

    const res = await postDataStudio(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Cross-site request rejected.');
  });

  it('rejects malformed or path traversal route segments with HTTP 404', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-dc-ok',
          name: 'DC Tenant',
          slug: 'dc-ok',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['data-contracts'],
        },
        roles: ['MEMBER'],
        platformRoles: [],
        permissions: ['contracts:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/data-studio/../../etc/passwd', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['..', '..', 'etc', 'passwd'] }) };

    const res = await getDataStudio(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.title).toBe('Unsupported Data Studio route.');
  });

  it('handles upstream Data Studio service unavailability with fail-closed HTTP 502', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-dc-ok',
          name: 'DC Tenant',
          slug: 'dc-ok',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['data-contracts'],
        },
        roles: ['MEMBER'],
        platformRoles: [],
        permissions: ['contracts:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

    const req = new Request('https://platform.example.invalid/api/data-studio/schemas', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['schemas'] }) };

    const res = await getDataStudio(req, context);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.title).toBe('The Data Studio service is temporarily unavailable.');
  });

  it('proxies authorized requests to upstream with proper tenant and user headers', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-dc-1', email: 'dev@example.invalid', name: 'Dev', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-dc-prod',
          name: 'DC Prod',
          slug: 'dc-prod',
          status: 'ACTIVE',
          trialEndsAt: null,
          features: ['data-contracts'],
        },
        roles: ['MEMBER'],
        platformRoles: [],
        permissions: ['contracts:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    let capturedUrl = '';
    let capturedHeaders: Headers | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ schemas: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: 'W/"dc-test-etag"' },
      });
    });

    const req = new Request('https://platform.example.invalid/api/data-studio/schemas', {
      method: 'GET',
      headers: {
        'x-correlation-id': 'corr-dc-123',
      },
    });
    const context = { params: Promise.resolve({ path: ['schemas'] }) };

    const res = await getDataStudio(req, context);
    expect(res.status).toBe(200);
    expect(capturedUrl).toBe('http://127.0.0.1:4100/api/data-studio/v1/schemas');
    expect(capturedHeaders?.get('x-tenant-id')).toBe('tenant-dc-prod');
    expect(capturedHeaders?.get('x-user-id')).toBe('usr-dc-1');
    expect(capturedHeaders?.get('x-correlation-id')).toBe('corr-dc-123');
    expect(res.headers.get('etag')).toBe('W/"dc-test-etag"');
    expect(res.headers.get('cache-control')).toBe('no-store');

    const data = await res.json();
    expect(Array.isArray(data.schemas)).toBe(true);
  });
});
