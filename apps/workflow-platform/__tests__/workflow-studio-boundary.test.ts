import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getWorkflowStudio, POST as postWorkflowStudio, PATCH as patchWorkflowStudio } from '../app/api/workflow-studio/[...path]/route';
import { moduleTenantBindingId } from '../lib/ar-tenant-binding';
import { canUseTenantModule, hasPermission } from '../lib/module-access';
import { verifiedSession } from '../lib/verified-session';

vi.mock('../lib/verified-session', () => ({
  verifiedSession: vi.fn(),
}));

describe('Workflow Studio tenant binding and access control', () => {
  it('maps canonical tenant IDs to deterministic isolated UUIDs for workflow data', () => {
    const tenantA = moduleTenantBindingId('tenant-wf-alpha');
    const tenantB = moduleTenantBindingId('tenant-wf-beta');
    const tenantARepeat = moduleTenantBindingId('tenant-wf-alpha');

    expect(tenantA).toBe(tenantARepeat);
    expect(tenantA).not.toBe(tenantB);
    expect(tenantA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('verifies workflow-definitions entitlement and granular permission checks', () => {
    const features = new Set(['workflow-definitions']);
    const permissions = ['workflows:read', 'workflows:write'];

    expect(canUseTenantModule('workflow-definitions', features, permissions)).toBe(true);
    expect(hasPermission(permissions, 'workflows:read')).toBe(true);
    expect(hasPermission(permissions, 'workflows:write')).toBe(true);
    expect(hasPermission(permissions, 'workflows:admin')).toBe(false);

    // Wildcard permissions
    expect(hasPermission(['*'], 'workflows:admin')).toBe(true);
    expect(hasPermission(['workflows:*'], 'workflows:write')).toBe(true);
  });
});

describe('Workflow Studio Route Security Boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('WORKFLOW_STUDIO_API_URL', 'http://127.0.0.1:4000');
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('denies unauthenticated GET /api/workflow-studio/workflows with HTTP 401', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json(
        { detail: 'Authentication required.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    } as any);

    const req = new Request('https://platform.example.invalid/api/workflow-studio/workflows', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['workflows'] }) };

    const res = await getWorkflowStudio(req, context);
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

    const req = new Request('https://platform.example.invalid/api/workflow-studio/workflows', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['workflows'] }) };

    const res = await getWorkflowStudio(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Select an active tenant workspace first.');
  });

  it('denies user when tenant lacks workflow-definitions entitlement with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-no-wf',
          name: 'No Workflow Tenant',
          slug: 'no-wf',
          status: 'ACTIVE',
          features: ['ar', 'spend'], // lacks workflow-definitions
        },
        roles: ['OPERATOR'],
        platformRoles: [],
        permissions: ['workflows:read', 'workflows:write'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/workflow-studio/workflows', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['workflows'] }) };

    const res = await getWorkflowStudio(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toContain('entitlement is required');
  });

  it('denies user lacking workflows:write on mutating POST with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-wf-active',
          name: 'Workflow Tenant',
          slug: 'wf-corp',
          status: 'ACTIVE',
          features: ['workflow-definitions'],
        },
        roles: ['VIEWER'],
        platformRoles: [],
        permissions: ['workflows:read'], // lacks workflows:write
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/workflow-studio/workflows', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://platform.example.invalid',
      },
      body: JSON.stringify({ name: 'Test Workflow', workflow_code: 'WF-TEST' }),
    });
    const context = { params: Promise.resolve({ path: ['workflows'] }) };

    const res = await postWorkflowStudio(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toContain('workflows:write');
  });

  it('rejects cross-site mutation without trusted Origin with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-wf-active',
          name: 'Workflow Tenant',
          slug: 'wf-corp',
          status: 'ACTIVE',
          features: ['workflow-definitions'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['workflows:read', 'workflows:write'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/workflow-studio/workflows', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://attacker-domain.example.evil',
      },
      body: JSON.stringify({ name: 'Evil Workflow' }),
    });
    const context = { params: Promise.resolve({ path: ['workflows'] }) };

    const res = await postWorkflowStudio(req, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Cross-site request rejected.');
  });

  it('blocks path traversal attacks with HTTP 404', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-wf-active',
          name: 'Workflow Tenant',
          slug: 'wf-corp',
          status: 'ACTIVE',
          features: ['workflow-definitions'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['workflows:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/workflow-studio/..%2f..%2fsecret', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['..', '..', 'secret'] }) };

    const res = await getWorkflowStudio(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.title).toBe('Unsupported Workflow Studio route.');
  });

  it('handles upstream service failure with HTTP 502', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-wf-active',
          name: 'Workflow Tenant',
          slug: 'wf-corp',
          status: 'ACTIVE',
          features: ['workflow-definitions'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['workflows:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const globalFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

    const req = new Request('https://platform.example.invalid/api/workflow-studio/workflows', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['workflows'] }) };

    const res = await getWorkflowStudio(req, context);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.title).toBe('The Workflow Studio service is temporarily unavailable.');

    globalFetch.mockRestore();
  });

  it('successfully proxies authenticated GET to upstream with tenant headers', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-wf-active',
          name: 'Workflow Tenant',
          slug: 'wf-corp',
          status: 'ACTIVE',
          features: ['workflow-definitions'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['workflows:read'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const mockWorkflows = [
      {
        id: 'wf-uuid-1',
        workflow_code: 'WF-O2C-TEST',
        name: 'Test Order-to-Cash Workflow',
        status: 'ACTIVE',
      },
    ];

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ workflows: mockWorkflows }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const req = new Request('https://platform.example.invalid/api/workflow-studio/workflows', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['workflows'] }) };

    const res = await getWorkflowStudio(req, context);
    expect(res.status).toBe(200);

    expect(fetchSpy).toHaveBeenCalled();
    const calledUrl = fetchSpy.mock.calls[0]![0].toString();
    expect(calledUrl).toBe('http://127.0.0.1:4000/api/workflow/v1/workflows');

    const headers = fetchSpy.mock.calls[0]![1]?.headers as Headers;
    expect(headers.get('x-tenant-id')).toBe(moduleTenantBindingId('tenant-wf-active'));
    expect(headers.get('x-user-id')).toBe('usr-1');

    fetchSpy.mockRestore();
  });

  it('successfully proxies authenticated PATCH /api/workflow-studio/workflows/RRR to upstream with tenant headers', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      context: {
        user: { id: 'usr-1', email: 'user@example.invalid', name: 'Test', status: 'ACTIVE' },
        tenant: {
          id: 'tenant-wf-active',
          name: 'Workflow Tenant',
          slug: 'wf-corp',
          status: 'ACTIVE',
          features: ['workflow-definitions'],
        },
        roles: ['ADMIN'],
        platformRoles: [],
        permissions: ['workflows:read', 'workflows:write'],
        session: { id: 'sess-1', expiresAt: '2099-01-01T00:00:00Z' },
        mfa: { required: false, enrolled: true, verified: true, recoveryCodesRemaining: 5 },
      },
    } as any);

    const mockUpdatedWorkflow = {
      id: 'wf-uuid-1',
      workflow_code: 'RRR',
      name: 'Test Workflow RRR',
      status: 'ACTIVE',
      dag_definition: { nodes: [{ id: 'n1', type: 'TRIGGER' }], edges: [] },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, workflow: mockUpdatedWorkflow }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const req = new Request('https://platform.example.invalid/api/workflow-studio/workflows/RRR', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://platform.example.invalid',
        Host: 'platform.example.invalid',
      },
      body: JSON.stringify({ dag_definition: mockUpdatedWorkflow.dag_definition }),
    });
    const context = { params: Promise.resolve({ path: ['workflows', 'RRR'] }) };

    const res = await patchWorkflowStudio(req, context);
    expect(res.status).toBe(200);

    expect(fetchSpy).toHaveBeenCalled();
    const calledUrl = fetchSpy.mock.calls[0]![0].toString();
    expect(calledUrl).toBe('http://127.0.0.1:4000/api/workflow/v1/workflows/RRR');

    const headers = fetchSpy.mock.calls[0]![1]?.headers as Headers;
    expect(headers.get('x-tenant-id')).toBe(moduleTenantBindingId('tenant-wf-active'));
    expect(headers.get('x-user-id')).toBe('usr-1');

    fetchSpy.mockRestore();
  });
});

