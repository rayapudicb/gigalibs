/**
 * WI-OI-131 D: central `/analytics` tiles and embedded module tabs must issue the same governed KPI query
 * for a compiled catalog (no React-side aggregation or alternate SQL).
 */
import { describe, expect, it } from 'vitest';
import type { ModuleAnalyticsCompiledSourceCatalogV1 } from '@gigalibs/contracts';
import { buildKpiQuery } from './build-module-queries.js';

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

describe('module analytics entry parity', () => {
  it('uses one KPI query shape for central tiles and embedded workbench', () => {
    const measureKey = catalog.defaultViews[0]!.kpiMeasureKeys[0]!;
    const centralTileQuery = buildKpiQuery(catalog, measureKey);
    const embeddedWorkbenchQuery = buildKpiQuery(catalog, measureKey);
    expect(centralTileQuery).toEqual(embeddedWorkbenchQuery);
    expect(centralTileQuery.semanticModelId).toBe(catalog.semanticModelId);
  });
});
