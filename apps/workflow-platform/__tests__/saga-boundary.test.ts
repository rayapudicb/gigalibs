import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getSaga, POST as postSaga } from '../app/api/saga/[...path]/route';
import { moduleTenantBindingId } from '../lib/ar-tenant-binding';
import { canUseTenantModule, hasPermission } from '../lib/module-access';
import { verifiedSession } from '../lib/verified-session';

vi.mock('../lib/verified-session', () => ({
  verifiedSession: vi.fn(),
}));

describe('Distributed Saga Orchestrator tenant binding and access control', () => {
  it('maps canonical tenant IDs to deterministic isolated UUIDs for saga data', () => {
    const tenantA = moduleTenantBindingId('tenant-saga-alpha');
    const tenantB = moduleTenantBindingId('tenant-saga-beta');
    const tenantARepeat = moduleTenantBindingId('tenant-saga-alpha');

    expect(tenantA).toBe(tenantARepeat);
    expect(tenantA).not.toBe(tenantB);
    expect(tenantA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('verifies saga-orchestrator entitlement and granular permission checks', () => {
    const features = new Set(['saga-orchestrator']);
    const permissions = ['saga:read', 'saga:write'];

    expect(canUseTenantModule('saga-orchestrator', features, permissions)).toBe(true);
    expect(hasPermission(permissions, 'saga:read')).toBe(true);
    expect(hasPermission(permissions, 'saga:write')).toBe(true);
    expect(hasPermission(permissions, 'saga:admin')).toBe(false);

    // Wildcard permissions
    expect(hasPermission(['*'], 'saga:admin')).toBe(true);
    expect(hasPermission(['saga:*'], 'saga:write')).toBe(true);
  });
});

describe('Distributed Saga Route Security Boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SAGA_API_URL', 'http://127.0.0.1:3020');
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('denies unauthenticated GET /api/saga/instances with HTTP 401', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json(
        { detail: 'Authentication required.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    } as any);

    const req = new Request('https://platform.example.invalid/api/saga/instances', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['instances'] }) };

    const res = await getSaga(req, context);
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

    const req = new Request('https://platform.example.invalid/api/saga/instances', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['instances'] }) };

    const res = await getSaga(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Select an active tenant workspace first.');
  });

  it('denies user when tenant lacks saga-orchestrator entitlement with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-no-saga',
          name: 'No Saga Tenant',
          slug: 'no-saga',
          status: 'ACTIVE',
          features: ['ar', 'spend'], // lacks saga-orchestrator
        },
        roles: ['OPERATOR'],
        platformRoles: [],
        permissions: ['saga:read', 'saga:write'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/saga/instances', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['instances'] }) };

    const res = await getSaga(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toContain('entitlement is required');
  });

  it('denies user lacking saga:write on mutating POST with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-saga-active',
          name: 'Saga Tenant',
          slug: 'saga-corp',
          status: 'ACTIVE',
          features: ['saga-orchestrator'],
        },
        roles: ['VIEWER'],
        platformRoles: [],
        permissions: ['saga:read'], // lacks saga:write
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/saga/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://platform.example.invalid',
      },
      body: JSON.stringify({ sagaType: 'DISPUTE_ESCROW_SETTLEMENT' }),
    });
    const context = { params: Promise.resolve({ path: ['execute'] }) };

    const res = await postSaga(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toContain('saga:write');
  });

  it('rejects cross-site mutation without trusted Origin with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-saga-active',
          name: 'Saga Tenant',
          slug: 'saga-corp',
          status: 'ACTIVE',
          features: ['saga-orchestrator'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['saga:read', 'saga:write'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/saga/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://attacker-domain.example.evil',
      },
      body: JSON.stringify({ sagaType: 'DISPUTE_ESCROW_SETTLEMENT' }),
    });
    const context = { params: Promise.resolve({ path: ['execute'] }) };

    const res = await postSaga(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Cross-site request rejected.');
  });

  it('blocks path traversal attacks with HTTP 404', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-saga-active',
          name: 'Saga Tenant',
          slug: 'saga-corp',
          status: 'ACTIVE',
          features: ['saga-orchestrator'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['saga:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/saga/..%2f..%2fsecret', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['..', '..', 'secret'] }) };

    const res = await getSaga(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.title).toBe('Unsupported Distributed Saga route.');
  });

  it('handles upstream service failure with HTTP 502', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-saga-active',
          name: 'Saga Tenant',
          slug: 'saga-corp',
          status: 'ACTIVE',
          features: ['saga-orchestrator'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['saga:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const globalFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

    const req = new Request('https://platform.example.invalid/api/saga/instances', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['instances'] }) };

    const res = await getSaga(req, context);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.title).toBe('The Distributed Saga Orchestrator service is temporarily unavailable.');

    globalFetch.mockRestore();
  });

  it('successfully proxies authenticated GET to upstream with tenant headers', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-saga-active',
          name: 'Saga Tenant',
          slug: 'saga-corp',
          status: 'ACTIVE',
          features: ['saga-orchestrator'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['saga:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const mockSagas = [
      {
        id: 's-1',
        sagaId: 'saga-12345',
        sagaType: 'DISPUTE_ESCROW_SETTLEMENT',
        status: 'COMPLETED',
        steps: [],
      },
    ];

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockSagas), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const req = new Request('https://platform.example.invalid/api/saga/instances', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['instances'] }) };

    const res = await getSaga(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].sagaId).toBe('saga-12345');

    expect(fetchSpy).toHaveBeenCalled();
    const calledUrl = fetchSpy.mock.calls[0][0].toString();
    expect(calledUrl).toBe('http://127.0.0.1:3020/api/v1/saga/instances');
    const headers = fetchSpy.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('x-tenant-id')).toBe(moduleTenantBindingId('tenant-saga-active'));
    expect(headers.get('x-user-id')).toBe('usr-1');

    fetchSpy.mockRestore();
  });
});
