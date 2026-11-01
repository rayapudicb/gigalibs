import { describe, expect, it, vi } from 'vitest';
import { TENANT_MODULE_ENTITLEMENTS_SNAPSHOT_V2 } from '@gigalibs/contracts';
import { EntitlementSnapshotInboxService } from './entitlement-snapshot-inbox.service.js';

const snapshotBody = (version: number) => ({
  messageId: '00000000-0000-4000-8000-000000000101',
  tenantId: 'tenant-1',
  eventType: TENANT_MODULE_ENTITLEMENTS_SNAPSHOT_V2,
  aggregateType: 'tenant-module-entitlements',
  aggregateId: 'tenant-1',
  aggregateVersion: version,
  correlationId: 'corr-131',
  causationId: null,
  schemaVersion: 1,
  occurredAt: '2026-10-30T04:00:00.000Z',
  payload: {
    tenantId: 'tenant-1',
    snapshotVersion: version,
    enabledModuleKeys: ['asset-maintenance'],
    modules: [
      { catalogModuleKey: 'asset-maintenance', status: 'ENABLED' },
      { catalogModuleKey: 'gigaops', status: 'DISABLED' },
    ],
  },
});

describe('EntitlementSnapshotInboxService', () => {
  it('registers entitled module sources with NO_DATA and marks disabled sources unavailable', async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, values: unknown[] = []) => {
        statements.push({ sql, values });
        if (sql.includes('inbox_receipts')) return { rowCount: 1 };
        if (sql.includes('MAX(snapshot_version)')) return { rows: [{ max_version: null }] };
        return { rowCount: 1, rows: [] };
      }),
    };
    const db = { withTenantTransaction: vi.fn(async (_tenant: string, work: (value: typeof client) => unknown) => work(client)) };
    const result = await new EntitlementSnapshotInboxService(db as never).receive(snapshotBody(1));
    expect(result).toEqual({ status: 'applied' });
    expect(statements.some(({ sql }) => sql.includes('tenant_module_entitlement_replica'))).toBe(true);
    const sourceInsert = statements.find(({ sql }) => sql.includes('INSERT INTO gigalibs_analytics.source_connections'))!;
    expect(sourceInsert.values).toContain('cmms:downtime');
    expect(sourceInsert.values).toContain('NO_DATA');
    const disable = statements.find(({ sql }) => sql.includes("module_lifecycle = 'UNAVAILABLE'"))!;
    expect(disable.values).toEqual(['tenant-1', 'gigaops']);
  });

  it('rejects stale snapshots without mutating sources', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('inbox_receipts')) return { rowCount: 1 };
        if (sql.includes('MAX(snapshot_version)')) return { rows: [{ max_version: '3' }] };
        throw new Error('should not run');
      }),
    };
    const db = { withTenantTransaction: vi.fn(async (_tenant: string, work: (value: typeof client) => unknown) => work(client)) };
    await expect(new EntitlementSnapshotInboxService(db as never).receive(snapshotBody(2))).resolves.toEqual({
      status: 'stale',
    });
    expect(client.query).toHaveBeenCalledTimes(2);
  });
});
