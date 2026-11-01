import { describe, expect, it } from 'vitest';
import { cmmsDowntimeToModuleFactIngest } from './module-fact-adapters.js';

describe('cmmsDowntimeToModuleFactIngest', () => {
  it('maps downtime events to the cmms-downtime contract', () => {
    const fact = cmmsDowntimeToModuleFactIngest(
      {
        messageId: 'evt-1',
        tenantId: 'tenant-1',
        eventType: 'DOWNTIME_ENDED_V1',
        aggregateType: 'asset_downtime',
        aggregateId: 'agg-1',
        aggregateVersion: 2,
        correlationId: 'c1',
        causationId: null,
        schemaVersion: 1,
        occurredAt: '2026-10-30T05:00:00.000Z',
        payload: {},
      },
      {
        assetId: 'asset-1',
        downtimeId: 'down-1',
        startedAt: '2026-10-30T04:00:00.000Z',
        endedAt: '2026-10-30T05:00:00.000Z',
      },
    );
    expect(fact.sourceKey).toBe('cmms-downtime');
    expect(fact.fact.duration_minutes).toBe(60);
  });
});
