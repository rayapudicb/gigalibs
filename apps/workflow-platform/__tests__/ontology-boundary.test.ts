import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getOntology, POST as postOntology } from '../app/api/ontology/[...path]/route';
import { moduleTenantBindingId } from '../lib/ar-tenant-binding';
import { canUseTenantModule, hasPermission } from '../lib/module-access';
import { verifiedSession } from '../lib/verified-session';
import { isLockedModule } from './helpers/locked-modules';

vi.mock('../lib/verified-session', () => ({
  verifiedSession: vi.fn(),
}));

describe.skipIf(isLockedModule('operational-ontology'))('Operational Ontology tenant binding and access control', () => {
  it('maps canonical tenant IDs to deterministic isolated UUIDs for ontology data', () => {
    const tenantA = moduleTenantBindingId('tenant-ontology-alpha');
    const tenantB = moduleTenantBindingId('tenant-ontology-beta');
    const tenantARepeat = moduleTenantBindingId('tenant-ontology-alpha');

    expect(tenantA).toBe(tenantARepeat);
    expect(tenantA).not.toBe(tenantB);
    expect(tenantA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('verifies operational-ontology entitlement and granular permission checks', () => {
    const features = new Set(['operational-ontology']);
    const permissions = ['ontology:read', 'ontology:write'];

    expect(canUseTenantModule('operational-ontology', features, permissions)).toBe(true);
    expect(hasPermission(permissions, 'ontology:read')).toBe(true);
    expect(hasPermission(permissions, 'ontology:write')).toBe(true);
    expect(hasPermission(permissions, 'ontology:admin')).toBe(false);

    // Wildcard permissions
    expect(hasPermission(['*'], 'ontology:admin')).toBe(true);
    expect(hasPermission(['ontology:*'], 'ontology:write')).toBe(true);
  });
});

describe.skipIf(isLockedModule('operational-ontology'))('Operational Ontology Route Security Boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ONTOLOGY_API_URL', 'http://127.0.0.1:3019');
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('denies unauthenticated GET /api/ontology/parties with HTTP 401', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json(
        { detail: 'Authentication required.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    } as any);

    const req = new Request('https://platform.example.invalid/api/ontology/parties', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['parties'] }) };

    const res = await getOntology(req, context);
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

    const req = new Request('https://platform.example.invalid/api/ontology/parties', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['parties'] }) };

    const res = await getOntology(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Select an active tenant workspace first.');
  });

  it('denies user when tenant lacks operational-ontology entitlement with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-no-ontology',
          name: 'No Ontology Tenant',
          slug: 'no-ont',
          status: 'ACTIVE',
          features: ['ar', 'spend'], // lacks operational-ontology
        },
        roles: ['OPERATOR'],
        platformRoles: [],
        permissions: ['ontology:read', 'ontology:write'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/ontology/parties', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['parties'] }) };

    const res = await getOntology(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toContain('entitlement is required');
  });

  it('denies user lacking ontology:write on mutating POST with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-ont-active',
          name: 'Ontology Tenant',
          slug: 'ont-corp',
          status: 'ACTIVE',
          features: ['operational-ontology'],
        },
        roles: ['VIEWER'],
        platformRoles: [],
        permissions: ['ontology:read'], // lacks ontology:write
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/ontology/parties', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://platform.example.invalid',
      },
      body: JSON.stringify({ code: 'SUP-001', name: 'Supplier', category: 'SUPPLIER' }),
    });
    const context = { params: Promise.resolve({ path: ['parties'] }) };

    const res = await postOntology(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toContain('ontology:write');
  });

  it('rejects cross-site mutation without trusted Origin with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-ont-active',
          name: 'Ontology Tenant',
          slug: 'ont-corp',
          status: 'ACTIVE',
          features: ['operational-ontology'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['ontology:read', 'ontology:write'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/ontology/parties', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://attacker-domain.example.evil',
      },
      body: JSON.stringify({ code: 'SUP-001', name: 'Supplier', category: 'SUPPLIER' }),
    });
    const context = { params: Promise.resolve({ path: ['parties'] }) };

    const res = await postOntology(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Cross-site request rejected.');
  });

  it('blocks path traversal attacks with HTTP 404', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-ont-active',
          name: 'Ontology Tenant',
          slug: 'ont-corp',
          status: 'ACTIVE',
          features: ['operational-ontology'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['ontology:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/ontology/..%2f..%2fsecret', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['..', '..', 'secret'] }) };

    const res = await getOntology(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.title).toBe('Unsupported Operational Ontology route.');
  });

  it('handles upstream service failure with HTTP 502', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-ont-active',
          name: 'Ontology Tenant',
          slug: 'ont-corp',
          status: 'ACTIVE',
          features: ['operational-ontology'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['ontology:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const globalFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

    const req = new Request('https://platform.example.invalid/api/ontology/parties', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['parties'] }) };

    const res = await getOntology(req, context);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.title).toBe('The Operational Ontology service is temporarily unavailable.');

    globalFetch.mockRestore();
  });

  it('successfully proxies authenticated GET to upstream with tenant headers', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-ont-active',
          name: 'Ontology Tenant',
          slug: 'ont-corp',
          status: 'ACTIVE',
          features: ['operational-ontology'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['ontology:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const mockParties = [
      {
        id: 'p-1',
        code: 'SUP-001',
        name: 'Apex Aerospace',
        category: 'SUPPLIER',
        riskTier: 'LOW',
        creditScore: 820,
      },
    ];

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockParties), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const req = new Request('https://platform.example.invalid/api/ontology/parties', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['parties'] }) };

    const res = await getOntology(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].code).toBe('SUP-001');

    expect(fetchSpy).toHaveBeenCalled();
    const calledUrl = fetchSpy.mock.calls[0][0].toString();
    expect(calledUrl).toBe('http://127.0.0.1:3019/api/v1/ontology/parties');
    const headers = fetchSpy.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('x-tenant-id')).toBe(moduleTenantBindingId('tenant-ont-active'));
    expect(headers.get('x-user-id')).toBe('usr-1');

    fetchSpy.mockRestore();
  });
});
