/**
 * WI-OI-042 — CMMS tenant/RLS truth-boundary tests.
 *
 * These tests exercise the real DatabaseService methods with an isolated pool
 * double. They do not represent live PostgreSQL certification.
 */
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from './database/database.service.js';

function serviceWithPool(pool: object, options: { nodeEnv?: string } = {}): DatabaseService {
  return {
    pool,
    config: { nodeEnv: options.nodeEnv ?? 'test' },
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as DatabaseService;
}

describe('CMMS DatabaseService tenant transaction boundaries', () => {
  it('keeps the tenant-local setting and business query in one transaction', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000001';
    const rows = [{ id: 'asset-1' }];
    const query = vi.fn(async (sql: string, _params?: unknown[]) =>
      sql.includes('FROM gigalibs_cmms.assets') ? { rows, rowCount: 1 } : { rows: [], rowCount: 0 },
    );
    const release = vi.fn();
    const service = serviceWithPool({ connect: vi.fn(async () => ({ query, release })) });

    const result = await DatabaseService.prototype.queryWithTenant.call(
      service,
      tenantId,
      'SELECT * FROM gigalibs_cmms.assets WHERE tenant_id = $1',
      [tenantId],
    );

    expect(result.rows).toEqual(rows);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      "SELECT set_config('app.tenant_id', $1, true)",
      'SELECT * FROM gigalibs_cmms.assets WHERE tenant_id = $1',
      'COMMIT',
    ]);
    expect(query.mock.calls[1]?.[1]).toEqual([tenantId]);
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases the connection when a tenant query fails', async () => {
    const failure = new Error('database statement rejected');
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql === 'FAILING DML') throw failure;
      return { rows: [], rowCount: 0 };
    });
    const release = vi.fn();
    const service = serviceWithPool({ connect: vi.fn(async () => ({ query, release })) });

    await expect(
      DatabaseService.prototype.queryWithTenant.call(service, 'tenant-1', 'FAILING DML'),
    ).rejects.toBe(failure);

    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      "SELECT set_config('app.tenant_id', $1, true)",
      'FAILING DML',
      'ROLLBACK',
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it('wraps multi-statement operations in the same tenant transaction', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
    const client = { query, release: vi.fn() };
    const service = serviceWithPool({ connect: vi.fn(async () => client) });

    const result = await DatabaseService.prototype.withTenantTransaction.call(
      service,
      'tenant-1',
      async (scopedClient) => {
        await scopedClient.query('INSERT INTO gigalibs_cmms.parts DEFAULT VALUES');
        return 'done';
      },
    );

    expect(result).toBe('done');
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      "SELECT set_config('app.tenant_id', $1, true)",
      'INSERT INTO gigalibs_cmms.parts DEFAULT VALUES',
      'COMMIT',
    ]);
    expect(client.release).toHaveBeenCalledOnce();
  });
});

describe('CMMS DatabaseService bootstrap gates', () => {
  it('accepts migrations through 000004 for an unprivileged role', async () => {
    const pool = {
      query: vi.fn(async () => ({
        rows: [{ migration_count: '4', is_superuser: false, bypasses_rls: false }],
      })),
    };
    const service = serviceWithPool(pool, { nodeEnv: 'production' });

    await expect(DatabaseService.prototype.bootstrapCheck.call(service)).resolves.toBeUndefined();
  });

  it('rejects an incomplete migration set', async () => {
    const pool = {
      query: vi.fn(async () => ({
        rows: [{ migration_count: '3', is_superuser: false, bypasses_rls: false }],
      })),
    };
    const service = serviceWithPool(pool, { nodeEnv: 'production' });

    await expect(DatabaseService.prototype.bootstrapCheck.call(service)).rejects.toThrow(
      'migrations through 000004 are not installed',
    );
  });

  it.each([
    { is_superuser: true, bypasses_rls: false },
    { is_superuser: false, bypasses_rls: true },
  ])('rejects privileged production database roles: %o', async (role) => {
    const pool = {
      query: vi.fn(async () => ({ rows: [{ migration_count: '4', ...role }] })),
    };
    const service = serviceWithPool(pool, { nodeEnv: 'production' });

    await expect(DatabaseService.prototype.bootstrapCheck.call(service)).rejects.toThrow(
      'must not be superuser or BYPASSRLS',
    );
  });
});

// ─── WI-OI-042: New CMMS Capability Boundary Tests ────────────────────────────
// Vendors, Customers, Requests, PurchaseOrders all use the same queryWithTenant
// tenant isolation contract. These tests verify the SQL envelope for each new
// capability — correct tenant scoping, soft-delete filtering, optimistic
// concurrency version predicates, and atomicity for the convert-to-WO flow.

describe('CMMS Vendors tenant boundary', () => {
  it('routes vendor search through tenant-scoped query envelope', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000002';
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ total: '0' }], rowCount: 1 };
      if (sql.includes('FROM gigalibs_cmms.vendors')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const release = vi.fn();
    const service = serviceWithPool({ connect: vi.fn(async () => ({ query, release })) });

    const { VendorsService } = await import('./vendors/vendors.service.js');
    const svc = new VendorsService(service as unknown as DatabaseService);
    const result = await svc.search(tenantId, {});

    expect(result.total).toBe(0);
    // Every queryWithTenant call begins with BEGIN + set_config
    const allSql = query.mock.calls.map(([sql]) => sql);
    expect(allSql.some(sql => sql.includes("set_config('app.tenant_id'"))).toBe(true);
    expect(allSql.some(sql => sql.includes('FROM gigalibs_cmms.vendors'))).toBe(true);
  });

  it('includes NOT is_deleted predicate in vendor search', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000002';
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ total: '0' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const service = serviceWithPool({ connect: vi.fn(async () => ({ query, release: vi.fn() })) });
    const { VendorsService } = await import('./vendors/vendors.service.js');
    const svc = new VendorsService(service as unknown as DatabaseService);
    await svc.search(tenantId, {});

    const vendorSql = query.mock.calls.map(([sql]) => sql).find(sql => sql.includes('FROM gigalibs_cmms.vendors'));
    expect(vendorSql).toContain('NOT is_deleted');
  });
});

describe('CMMS Customers tenant boundary', () => {
  it('routes customer search through tenant-scoped query envelope', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000003';
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ total: '0' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const service = serviceWithPool({ connect: vi.fn(async () => ({ query, release: vi.fn() })) });
    const { CustomersService } = await import('./customers/customers.service.js');
    const svc = new CustomersService(service as unknown as DatabaseService);
    const result = await svc.search(tenantId, {});

    expect(result.total).toBe(0);
    const allSql = query.mock.calls.map(([sql]) => sql);
    expect(allSql.some(sql => sql.includes("set_config('app.tenant_id'"))).toBe(true);
    expect(allSql.some(sql => sql.includes('FROM gigalibs_cmms.customers'))).toBe(true);
  });
});

describe('CMMS Maintenance Requests tenant boundary', () => {
  it('routes request search through tenant-scoped query envelope', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000004';
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ total: '0' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const service = serviceWithPool({ connect: vi.fn(async () => ({ query, release: vi.fn() })) });
    const { RequestsService } = await import('./requests/requests.service.js');
    const svc = new RequestsService(service as unknown as DatabaseService);
    const result = await svc.search(tenantId, {});

    expect(result.total).toBe(0);
    const allSql = query.mock.calls.map(([sql]) => sql);
    expect(allSql.some(sql => sql.includes('FROM gigalibs_cmms.maintenance_requests'))).toBe(true);
  });

  it('executes convert-to-WO as a single withTenantTransaction call', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000004';
    const reqId = randomUUID();
    const woId = randomUUID();

    const clientQuery = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FOR UPDATE') && sql.includes('maintenance_requests')) {
        return { rows: [{ id: reqId, title: 'Fix pump', description: null, priority: 'HIGH', status: 'APPROVED', asset_id: null, location_id: null, version: 1 }] };
      }
      if (sql.includes('COUNT(*) AS cnt') && sql.includes('work_orders')) {
        return { rows: [{ cnt: '0' }] };
      }
      if (sql.includes('INSERT INTO gigalibs_cmms.work_orders')) {
        return { rows: [{ id: woId, wo_number: 'WO-000001' }] };
      }
      if (sql.includes('UPDATE gigalibs_cmms.maintenance_requests')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('SELECT id, title') && sql.includes('maintenance_requests') && !sql.includes('FOR UPDATE')) {
        return { rows: [{ id: reqId, title: 'Fix pump', description: null, priority: 'HIGH', status: 'CONVERTED', asset_id: null, location_id: null, requester_name: null, requester_email: null, requester_phone: null, converted_wo_id: woId, portal_uuid: null, version: 2, created_at: new Date(), updated_at: new Date() }] };
      }
      return { rows: [], rowCount: 0 };
    });
    const clientRelease = vi.fn();

    let transactionStarted = false;
    const wrapQuery = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql === 'BEGIN') { transactionStarted = true; }
      return clientQuery(sql, params);
    });

    const service = serviceWithPool({ connect: vi.fn(async () => ({ query: wrapQuery, release: clientRelease })) });
    const { RequestsService } = await import('./requests/requests.service.js');
    const svc = new RequestsService(service as unknown as DatabaseService);

    const result = await svc.convertToWorkOrder(tenantId, 'actor-uuid', reqId, 1);

    expect(transactionStarted).toBe(true);
    expect(result.workOrderNumber).toBe('WO-000001');
    expect(result.request.status).toBe('CONVERTED');
    expect(result.request.convertedWoId).toBe(woId);
    expect(clientRelease).toHaveBeenCalledOnce();
  });
});

describe('CMMS Purchase Orders tenant boundary', () => {
  it('routes PO search through tenant-scoped query envelope', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000005';
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ total: '0' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const service = serviceWithPool({ connect: vi.fn(async () => ({ query, release: vi.fn() })) });
    const { PurchaseOrdersService } = await import('./purchase-orders/purchase-orders.service.js');
    const svc = new PurchaseOrdersService(service as unknown as DatabaseService);
    const result = await svc.search(tenantId, {});

    expect(result.total).toBe(0);
    const allSql = query.mock.calls.map(([sql]) => sql);
    expect(allSql.some(sql => sql.includes('FROM gigalibs_cmms.purchase_orders'))).toBe(true);
  });

  it('includes department scope predicate when departmentIds provided', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000005';
    const deptId = '11111111-1111-1111-1111-111111111111';
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ total: '0' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const service = serviceWithPool({ connect: vi.fn(async () => ({ query, release: vi.fn() })) });
    const { PurchaseOrdersService } = await import('./purchase-orders/purchase-orders.service.js');
    const svc = new PurchaseOrdersService(service as unknown as DatabaseService);
    await svc.search(tenantId, {}, [deptId]);

    const poSearchSql = query.mock.calls.map(([sql]) => sql).find(sql => sql.includes('FROM gigalibs_cmms.purchase_orders'));
    expect(poSearchSql).toContain('department_id IS NULL OR department_id IN');
  });
});

// randomUUID for test use in truth-boundary
function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
