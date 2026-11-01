import { describe, expect, it } from 'vitest';
import type { ModuleAnalyticsCompiledSourceCatalogV1 } from '@gigalibs/contracts';
import { buildModuleCompareQuery, buildModuleTrendQuery } from './build-module-trend-query';

const catalog: ModuleAnalyticsCompiledSourceCatalogV1 = {
  sourceId: '00000000-0000-4000-8000-000000000001',
  sourceKey: 'cmms-downtime',
  title: 'CMMS downtime',
  catalogModuleKey: 'asset-maintenance',
  contractVersion: 1,
  semanticModelId: '00000000-0000-4000-8000-000000000002',
  mappingId: '00000000-0000-4000-8000-000000000003',
  moduleLifecycle: 'ACTIVE',
  measures: [
    {
      key: 'downtime_minutes',
      label: 'Downtime minutes',
      aggregation: 'SUM',
      unit: 'MINUTES',
      precision: 0,
      factField: 'duration_minutes',
      reversalPolicy: 'NET',
    },
  ],
  dimensions: [{ key: 'failure_code', label: 'Failure code', factField: 'failure_code' }],
  defaultViews: [
    {
      key: 'reliability_overview',
      label: 'Reliability overview',
      kpiMeasureKeys: ['downtime_minutes'],
      trendMeasureKey: 'downtime_minutes',
      breakdownDimensionKey: 'failure_code',
    },
  ],
  freshnessTargetSeconds: 900,
  eventTimeField: 'occurred_at',
  primaryKeyField: 'event_id',
};

describe('build-module-trend-query', () => {
  it('builds a time-series query on the compiled semantic model', () => {
    const query = buildModuleTrendQuery(catalog, {
      measures: ['downtime_minutes'],
      dimensions: ['failure_code'],
      grain: 'month',
      range: { from: '2026-01-01', to: '2026-03-31' },
    });
    expect(query.semanticModelId).toBe(catalog.semanticModelId);
    expect(query.time?.grain).toBe('month');
    expect(query.filters).toHaveLength(2);
  });

  it('shifts filters for comparison queries', () => {
    const base = buildModuleTrendQuery(catalog, {
      measures: ['downtime_minutes'],
      dimensions: [],
      grain: 'month',
      range: { from: '2026-02-01', to: '2026-02-28' },
    });
    const compare = buildModuleCompareQuery(catalog, base, { from: '2026-01-01', to: '2026-01-31' });
    expect(compare.filters[0]?.value).toContain('2026-01-01');
  });
});
