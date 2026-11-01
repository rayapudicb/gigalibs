import { describe, expect, it, vi } from 'vitest';
import { ConnectorHubInboxService, parseWorkforcePositionFact } from './connector-hub-inbox.js';

const fact = (overrides: Record<string, unknown> = {}) => ({
  messageId: '00000000-0000-4000-8000-000000000091',
  tenantId: 'tenant-1',
  eventType: 'WORKFORCE_POSITION_UPDATED_V1',
  aggregateType: 'WORKFORCE_POSITION',
  aggregateId: '00000000-0000-4000-8000-000000000092',
  aggregateVersion: 4,
  correlationId: 'corr-109',
  causationId: null,
  schemaVersion: 1,
  occurredAt: '2026-10-01T10:00:00.000Z',
  payload: {
    entityId: '00000000-0000-4000-8000-000000000092',
    aggregateVersion: 4,
    code: 'POS-1',
    jobProfileId: '00000000-0000-4000-8000-000000000093',
    siteRef: null,
    organizationUnitId: 'store-101',
    tenantShared: false,
    fte: 1,
    effectiveFrom: '2026-10-01',
    effectiveTo: null,
    status: 'OPEN',
  },
  ...overrides,
});

describe('Analytics Workforce position inbox', () => {
  it('validates a complete snapshot and binds it to the envelope aggregate', () => {
    expect(parseWorkforcePositionFact(fact()).fact).toMatchObject({ organizationUnitId: 'store-101', aggregateVersion: 4 });
    expect(parseWorkforcePositionFact(fact({ eventType: 'WORKFORCE_POSITION_SNAPSHOT_V1' })).fact)
      .toMatchObject({ entityId: '00000000-0000-4000-8000-000000000092', tenantShared: false });
    expect(() => parseWorkforcePositionFact(fact({ aggregateVersion: 5 }))).toThrow(/does not match/);
    expect(() => parseWorkforcePositionFact(fact({ payload: { ...(fact().payload as object), tenantShared: true } }))).toThrow(/tenantShared/);
  });

  it('stores the verified snapshot in the ordinary raw-record pipeline with a tenant-bound module source', async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, values: unknown[] = []) => {
        statements.push({ sql, values });
        if (sql.includes('INSERT INTO gigalibs_analytics.inbox_receipts')) return { rows: [], rowCount: 1 };
        if (sql.includes('INSERT INTO gigalibs_analytics.source_connections')) return { rows: [{ id: 'source-1' }], rowCount: 1 };
        if (sql.includes('INSERT INTO gigalibs_analytics.source_sync_runs')) return { rows: [{ id: 'run-1' }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      }),
    };
    const db = { withTenantTransaction: vi.fn(async (_tenant: string, work: (value: typeof client) => unknown) => work(client)) };
    const entitlements = { receive: vi.fn() };
    const moduleFacts = {
      ingest: vi.fn().mockResolvedValue({ status: 'stored', sourceConnectionId: 'source-1' }),
    };
    const result = await new ConnectorHubInboxService(db as never, entitlements as never, moduleFacts as never).receiveFrom(
      'workforce',
      fact(),
    );
    expect(result).toEqual({ status: 'stored', sourceConnectionId: 'source-1' });
    expect(moduleFacts.ingest).toHaveBeenCalled();
  });

  it('deduplicates before creating a source or raw record', async () => {
    const db = { withTenantTransaction: vi.fn() };
    const moduleFacts = { ingest: vi.fn().mockResolvedValue({ status: 'duplicate' }) };
    await expect(
      new ConnectorHubInboxService(db as never, { receive: vi.fn() } as never, moduleFacts as never).receiveWorkforcePosition(fact()),
    ).resolves.toEqual({ status: 'duplicate' });
    expect(moduleFacts.ingest).toHaveBeenCalled();
  });

  it('refuses a producer that tries to send another producer\'s event', async () => {
    const db = { withTenantTransaction: vi.fn() };
    await expect(
      new ConnectorHubInboxService(db as never, { receive: vi.fn() } as never, { ingest: vi.fn() } as never).receiveFrom(
        'workforce',
        { ...fact(), eventType: 'CONNECTOR_RECORD_PULLED_V1' },
      ),
    )
      .rejects.toThrow(/may not deliver/);
  });
});
