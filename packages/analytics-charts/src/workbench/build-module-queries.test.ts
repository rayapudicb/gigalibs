import { describe, expect, it } from 'vitest';
import { buildKpiQuery, pickView } from './build-module-queries.js';
import type { ModuleAnalyticsCompiledSourceCatalogV1 } from '@gigalibs/contracts';

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

describe('build-module-queries', () => {
  it('builds a KPI query against the compiled semantic model', () => {
    const query = buildKpiQuery(catalog, 'downtime_minutes');
    expect(query.semanticModelId).toBe(catalog.semanticModelId);
    expect(query.measures).toEqual(['downtime_minutes']);
  });

  it('respects allowed view keys', () => {
    expect(pickView(catalog, ['reliability_overview']).key).toBe('reliability_overview');
  });
});
