import { describe, expect, it, vi } from 'vitest';
import { MODULE_ANALYTICS_CONTROL_TOTAL_V1 } from '@gigalibs/contracts';
import { ModuleSourceReconciliationService } from './module-source-reconciliation.service.js';

const envelope = {
  messageId: 'msg-1',
  tenantId: 'tenant-a',
  eventType: MODULE_ANALYTICS_CONTROL_TOTAL_V1,
  aggregateType: 'module-analytics-control-total',
  aggregateId: 'cmms-downtime:tenant-a',
  aggregateVersion: 1,
  correlationId: 'msg-1',
  causationId: null,
  schemaVersion: 1,
  payload: {
    catalogModuleKey: 'asset-maintenance',
    sourceKey: 'cmms-downtime',
    producerRecordCount: 2,
    reportedAt: '2026-10-30T00:00:00.000Z',
    backfillComplete: true,
  },
  occurredAt: '2026-10-30T00:00:00.000Z',
};

describe('ModuleSourceReconciliationService', () => {
  it('stores control totals and marks MATCH when counts agree', async () => {
    const queries: string[] = [];
    const db = {
      withTenantTransaction: async (_tenantId: string, fn: (client: unknown) => Promise<unknown>) =>
        fn({
          query: vi.fn(async (sql: string) => {
            queries.push(sql);
            if (sql.includes('inbox_receipts')) return { rowCount: 1 };
            if (sql.includes('module_fact_receipts') && sql.includes('COUNT')) {
              return { rows: [{ upserts: '2', reversals: '0' }] };
            }
            return { rowCount: 1, rows: [] };
          }),
        }),
    };
    const result = await new ModuleSourceReconciliationService(db as never).receive('cmms', envelope as never, envelope.payload);
    expect(result.status).toBe('applied');
    expect(result.reconciliationStatus).toBe('MATCH');
    expect(queries.some((sql) => sql.includes('module_source_reconciliation'))).toBe(true);
  });
});
