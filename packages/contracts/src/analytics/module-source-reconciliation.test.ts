import { describe, expect, it } from 'vitest';
import { parseModuleAnalyticsControlTotalV1 } from './module-source-reconciliation.js';

describe('ModuleAnalyticsControlTotalV1', () => {
  it('parses a producer control total', () => {
    const parsed = parseModuleAnalyticsControlTotalV1({
      catalogModuleKey: 'asset-maintenance',
      sourceKey: 'cmms-downtime',
      producerRecordCount: 42,
      reportedAt: '2026-10-30T00:00:00.000Z',
      backfillComplete: true,
    });
    expect(parsed.producerRecordCount).toBe(42);
    expect(parsed.backfillComplete).toBe(true);
  });
});
