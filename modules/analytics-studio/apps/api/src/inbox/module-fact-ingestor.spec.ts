import { describe, expect, it, vi } from 'vitest';
import { ModuleFactIngestorService } from './module-fact-ingestor.service.js';

const productionFact = {
  catalogModuleKey: 'gigaops',
  sourceKey: 'workforce-positions',
  eventId: 'evt-100',
  aggregateId: '00000000-0000-4000-8000-000000000092',
  aggregateVersion: 1,
  occurredAt: '2026-10-30T04:00:00.000Z',
  factSchemaVersion: 1,
  factKind: 'UPSERT' as const,
  dataOrigin: 'PRODUCTION' as const,
  ownerUnitId: 'store-101',
  fact: {
    entity_id: '00000000-0000-4000-8000-000000000092',
    effective_from: '2026-10-01',
    organization_unit_id: 'store-101',
    status: 'OPEN',
    code: 'POS-1',
    fte: 1,
  },
};

const envelope = {
  messageId: 'evt-100',
  tenantId: 'tenant-1',
  eventType: 'WORKFORCE_POSITION_UPDATED_V1',
  aggregateType: 'WORKFORCE_POSITION',
  aggregateId: '00000000-0000-4000-8000-000000000092',
  aggregateVersion: 1,
  correlationId: 'c1',
  causationId: null,
  schemaVersion: 1,
  payload: productionFact,
  occurredAt: '2026-10-30T04:00:00.000Z',
};

describe('ModuleFactIngestorService', () => {
  it('rejects TEST origin facts without writing raw records', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('module_fact_rejected')) return { rowCount: 1, rows: [] };
        return { rowCount: 1, rows: [] };
      }),
    };
    const db = { withTenantTransaction: vi.fn(async (_t: string, work: (c: typeof client) => unknown) => work(client)) };
    const result = await new ModuleFactIngestorService(db as never).ingest('workforce', envelope as never, {
      ...productionFact,
      dataOrigin: 'TEST',
    });
    expect(result).toEqual({ status: 'rejected', reasonCode: 'TEST_ORIGIN' });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('module_fact_rejected'), expect.any(Array));
  });

  it('deduplicates on tenant_id, source_key and event_id', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('inbox_receipts')) return { rowCount: 1, rows: [] };
        if (sql.includes('module_fact_receipts') && sql.includes('SELECT 1')) return { rowCount: 1, rows: [{}] };
        throw new Error(`unexpected sql: ${sql}`);
      }),
    };
    const db = { withTenantTransaction: vi.fn(async (_t: string, work: (c: typeof client) => unknown) => work(client)) };
    await expect(
      new ModuleFactIngestorService(db as never).ingest('workforce', envelope as never, productionFact),
    ).resolves.toEqual({ status: 'duplicate' });
  });
});
