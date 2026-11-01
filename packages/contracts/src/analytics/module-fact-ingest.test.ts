import { describe, expect, it } from 'vitest';
import { parseModuleAnalyticsFactIngestV1 } from './module-fact-ingest.js';

describe('ModuleAnalyticsFactIngestV1', () => {
  it('parses a production upsert fact', () => {
    const fact = parseModuleAnalyticsFactIngestV1({
      catalogModuleKey: 'asset-maintenance',
      sourceKey: 'cmms-downtime',
      eventId: 'evt-1',
      aggregateId: 'agg-1',
      aggregateVersion: 1,
      occurredAt: '2026-10-30T04:00:00.000Z',
      factSchemaVersion: 1,
      factKind: 'UPSERT',
      dataOrigin: 'PRODUCTION',
      ownerUnitId: 'unit-north',
      fact: { event_id: 'evt-1', duration_minutes: 15 },
    });
    expect(fact.sourceKey).toBe('cmms-downtime');
  });

  it('requires reversalOfEventId for REVERSAL facts', () => {
    expect(() =>
      parseModuleAnalyticsFactIngestV1({
        catalogModuleKey: 'gigaops',
        sourceKey: 'workforce-positions',
        eventId: 'evt-2',
        aggregateId: 'agg-2',
        aggregateVersion: 2,
        occurredAt: '2026-10-30T04:00:00.000Z',
        factSchemaVersion: 1,
        factKind: 'REVERSAL',
        dataOrigin: 'PRODUCTION',
        fact: {},
      }),
    ).toThrow();
  });
});
