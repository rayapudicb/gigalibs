import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getMasterData, POST as postMasterData } from '../app/api/master-data/route';
import { verifiedSession } from '../lib/verified-session';
import { masterDataStore } from '../lib/master-data-store';

vi.mock('../lib/verified-session', () => ({
  verifiedSession: vi.fn(),
}));

describe('Master Data Governance API Boundary & Tri-Modal Ingestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('denies unauthenticated GET /api/master-data with HTTP 401', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json(
        { detail: 'Authentication required.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    } as any);

    const req = new Request('https://platform.example.invalid/api/master-data', {
      method: 'GET',
    });
    const res = await getMasterData(req as any);

    expect(res.status).toBe(401);
  });

  it('denies authenticated user without active tenant workspace with HTTP 403', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      response: null,
      context: {
        user: { id: 'usr-1', email: 'user@example.com' },
        tenant: null,
        permissions: ['master-data:read'],
        platformRoles: [],
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/master-data', {
      method: 'GET',
    });
    const res = await getMasterData(req as any);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Active tenant required');
  });

  it('denies requests when master-data module is not in tenant features', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      response: null,
      context: {
        user: { id: 'usr-1', email: 'user@example.com' },
        tenant: { id: 'tenant-no-mdm', features: ['analytics'] },
        permissions: ['master-data:read'],
        platformRoles: [],
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/master-data', {
      method: 'GET',
    });
    const res = await getMasterData(req as any);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Master Data Governance module is not enabled');
  });

  it('allows authorized tenant to list master data records', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      response: null,
      context: {
        user: { id: 'usr-1', email: 'user@example.com' },
        tenant: { id: 'tenant-mdm-alpha', features: ['master-data'] },
        permissions: ['master-data:read'],
        platformRoles: [],
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/master-data?entityKey=currencies', {
      method: 'GET',
    });
    const res = await getMasterData(req as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe('tenant-mdm-alpha');
    expect(Array.isArray(body.records)).toBe(true);
    expect(body.records.some((r: any) => r.code === 'USD')).toBe(true);
  });

  it('downloads RFC 4180 CSV template for customers', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      response: null,
      context: {
        user: { id: 'usr-1', email: 'user@example.com' },
        tenant: { id: 'tenant-mdm-alpha', features: ['master-data'] },
        permissions: ['master-data:read'],
        platformRoles: [],
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/master-data?action=template&entityKey=customers', {
      method: 'GET',
    });
    const res = await getMasterData(req as any);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="customers_template.csv"');

    const csvText = await res.text();
    expect(csvText).toContain('# Template for Customer Directory Master');
    expect(csvText).toContain('Customer_Code,Company_Name,Billing_Email');
    expect(csvText).toContain('CUST-1001,Apex Global Logistics Inc');
  });

  it('denies cross-origin mutations on POST /api/master-data', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      response: null,
      context: {
        user: { id: 'usr-1', email: 'user@example.com' },
        tenant: { id: 'tenant-mdm-alpha', features: ['master-data'] },
        permissions: ['master-data:write'],
        platformRoles: [],
      },
    } as any);

    const req = new Request('http://localhost:5180/api/master-data', {
      method: 'POST',
      headers: {
        host: 'localhost:5180',
        origin: 'https://malicious-site.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ code: 'CUST-1', name: 'Test' }),
    });

    const res = await postMasterData(req as any);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Cross-origin mutation forbidden');
  });

  it('denies POST mutations without write permissions', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      response: null,
      context: {
        user: { id: 'usr-1', email: 'user@example.com' },
        tenant: { id: 'tenant-mdm-alpha', features: ['master-data'] },
        permissions: ['master-data:read'], // Read only
        platformRoles: [],
      },
    } as any);

    const req = new Request('http://localhost:5180/api/master-data', {
      method: 'POST',
      headers: {
        host: 'localhost:5180',
        origin: 'http://localhost:5180',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        entityKey: 'customers',
        code: 'CUST-NO-PERM',
        name: 'No Perm Co',
      }),
    });

    const res = await postMasterData(req as any);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Insufficient permissions');
  });

  it('runs dry-run validation without committing records to store', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      response: null,
      context: {
        user: { id: 'usr-1', email: 'user@example.com' },
        tenant: { id: 'tenant-dryrun-test', features: ['master-data'] },
        permissions: ['master-data:read', 'master-data:write'],
        platformRoles: [],
      },
    } as any);

    const req = new Request('http://localhost:5180/api/master-data', {
      method: 'POST',
      headers: {
        host: 'localhost:5180',
        origin: 'http://localhost:5180',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'validate',
        entityKey: 'customers',
        rows: [
          {
            Customer_Code: 'CUST-VALID-DRY',
            Company_Name: 'Dry Run Systems Inc',
            Billing_Email: 'dryrun@systems.io',
            Currency: 'USD',
          },
          {
            Customer_Code: 'CUST-BAD-DRY',
            Company_Name: '',
            Billing_Email: 'invalid-email',
            Currency: 'BAD',
          },
        ],
      }),
    });

    const res = await postMasterData(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.validation.validCount).toBe(1);
    expect(body.validation.errorCount).toBe(1);
    expect(body.validation.failures[0].errors.length).toBeGreaterThanOrEqual(2);

    // Verify record was NOT saved to the store
    const stored = masterDataStore.listRecords('tenant-dryrun-test', { entityKey: 'customers' });
    expect(stored.some((r) => r.code === 'CUST-VALID-DRY')).toBe(false);
  });

  it('performs atomic bulk import committing valid records to tenant partition', async () => {
    const tenantId = 'tenant-bulk-commit-01';
    vi.mocked(verifiedSession).mockResolvedValue({
      response: null,
      context: {
        user: { id: 'usr-1', email: 'user@example.com' },
        tenant: { id: tenantId, features: ['master-data'] },
        permissions: ['master-data:read', 'master-data:write'],
        platformRoles: [],
      },
    } as any);

    const req = new Request('http://localhost:5180/api/master-data', {
      method: 'POST',
      headers: {
        host: 'localhost:5180',
        origin: 'http://localhost:5180',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'import',
        entityKey: 'customers',
        rows: [
          {
            Customer_Code: 'CUST-COMMIT-101',
            Company_Name: 'Committed Customer One',
            Billing_Email: 'billing@one.io',
            Currency: 'USD',
          },
          {
            Customer_Code: 'CUST-COMMIT-102',
            Company_Name: 'Committed Customer Two',
            Billing_Email: 'billing@two.io',
            Currency: 'EUR',
          },
        ],
      }),
    });

    const res = await postMasterData(req as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.count).toBe(2);

    // Verify records are persisted in tenant partition with TENANT_LOCAL scope
    const records = masterDataStore.listRecords(tenantId, { entityKey: 'customers' });
    const rec101 = records.find((r) => r.code === 'CUST-COMMIT-101');
    const rec102 = records.find((r) => r.code === 'CUST-COMMIT-102');

    expect(rec101).toBeDefined();
    expect(rec101?.scope).toBe('TENANT_LOCAL');
    expect(rec101?.tenantId).toBe(tenantId);
    expect(rec102).toBeDefined();
    expect(rec102?.scope).toBe('TENANT_LOCAL');
    expect(rec102?.tenantId).toBe(tenantId);
  });

  it('enforces tenant sovereignty by preventing regular tenant users from creating PLATFORM_GLOBAL data', async () => {
    const tenantId = 'tenant-regular-user';
    vi.mocked(verifiedSession).mockResolvedValue({
      response: null,
      context: {
        user: { id: 'usr-regular', email: 'regular@tenant.com' },
        tenant: { id: tenantId, features: ['master-data'] },
        permissions: ['master-data:read', 'master-data:write'],
        platformRoles: [], // Regular tenant user, NOT platform admin
      },
    } as any);

    const req = new Request('http://localhost:5180/api/master-data', {
      method: 'POST',
      headers: {
        host: 'localhost:5180',
        origin: 'http://localhost:5180',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        entityKey: 'customers',
        code: 'CUST-UNAUTHORIZED-GLOBAL',
        name: 'Sneaky Global Attempt',
        scope: 'PLATFORM_GLOBAL',
      }),
    });

    const res = await postMasterData(req as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    // Scope is downgraded/constrained to TENANT_LOCAL
    expect(body.record.scope).toBe('TENANT_LOCAL');
    expect(body.record.tenantId).toBe(tenantId);
  });

  it('allows platform admin to publish PLATFORM_GLOBAL master entities', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      response: null,
      context: {
        user: { id: 'usr-platform-admin', email: 'admin@gigalibs.io' },
        tenant: { id: 'platform-root-tenant', features: ['master-data'] },
        permissions: ['master-data:read', 'master-data:write'],
        platformRoles: ['platform_admin'], // Platform Admin role
      },
    } as any);

    const req = new Request('http://localhost:5180/api/master-data', {
      method: 'POST',
      headers: {
        host: 'localhost:5180',
        origin: 'http://localhost:5180',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        entityKey: 'accounts',
        code: '9999',
        name: 'Statutory Universal Clearing Account',
        scope: 'PLATFORM_GLOBAL',
      }),
    });

    const res = await postMasterData(req as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.record.scope).toBe('PLATFORM_GLOBAL');
    expect(body.record.tenantId).toBeNull();
  });
});
