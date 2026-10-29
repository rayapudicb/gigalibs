import { describe, expect, it } from 'vitest';
import { DOWNTIME_FACT_TOPICS, projectDowntimeFact } from './downtime-fact-ingestion.worker.js';

describe('downtime-fact-ingestion.worker', () => {
  it('subscribes to CMMS downtime outbox topic', () => {
    expect(DOWNTIME_FACT_TOPICS).toEqual(['cmms.downtime.v1']);
  });

  it('projects availability fact rows from downtime payloads', () => {
    expect(
      projectDowntimeFact({
        assetId: 'asset-1',
        downtimeId: 'dt-1',
        startedAt: '2026-10-29T00:00:00.000Z',
        endedAt: '2026-10-29T01:00:00.000Z',
      }),
    ).toEqual({
      asset_id: 'asset-1',
      downtime_id: 'dt-1',
      started_at: '2026-10-29T00:00:00.000Z',
      ended_at: '2026-10-29T01:00:00.000Z',
      source: 'cmms_downtime_relay',
    });
  });
});
