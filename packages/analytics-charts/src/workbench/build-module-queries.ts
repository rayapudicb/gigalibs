import type {
  AnalyticsQueryV1,
  ModuleAnalyticsCompiledSourceCatalogV1,
  ModuleAnalyticsDefaultViewV1,
} from '@gigalibs/contracts';

export interface ModuleWorkbenchDateRange {
  readonly from: string;
  readonly to: string;
}

function timeFilters(catalog: ModuleAnalyticsCompiledSourceCatalogV1, range?: ModuleWorkbenchDateRange) {
  if (!range) return [];
  return [
    { field: catalog.eventTimeField, op: 'gte' as const, value: `${range.from}T00:00:00.000Z` },
    { field: catalog.eventTimeField, op: 'lte' as const, value: `${range.to}T23:59:59.999Z` },
  ];
}

export function buildKpiQuery(
  catalog: ModuleAnalyticsCompiledSourceCatalogV1,
  measureKey: string,
  range?: ModuleWorkbenchDateRange,
): AnalyticsQueryV1 {
  return {
    semanticModelId: catalog.semanticModelId,
    measures: [measureKey],
    dimensions: [],
    filters: timeFilters(catalog, range),
    sort: [],
    limit: 1,
    measureVersions: {},
  };
}

export function buildTrendQuery(
  catalog: ModuleAnalyticsCompiledSourceCatalogV1,
  view: ModuleAnalyticsDefaultViewV1,
  range?: ModuleWorkbenchDateRange,
): AnalyticsQueryV1 {
  return {
    semanticModelId: catalog.semanticModelId,
    measures: [view.trendMeasureKey],
    dimensions: [],
    time: { field: catalog.eventTimeField, grain: 'month' },
    filters: timeFilters(catalog, range),
    sort: [{ by: catalog.eventTimeField, direction: 'asc' }],
    limit: 500,
    measureVersions: {},
  };
}

export function buildBreakdownQuery(
  catalog: ModuleAnalyticsCompiledSourceCatalogV1,
  view: ModuleAnalyticsDefaultViewV1,
  range?: ModuleWorkbenchDateRange,
): AnalyticsQueryV1 {
  return {
    semanticModelId: catalog.semanticModelId,
    measures: view.kpiMeasureKeys.slice(0, 4),
    dimensions: [view.breakdownDimensionKey],
    filters: timeFilters(catalog, range),
    sort: [{ by: view.kpiMeasureKeys[0]!, direction: 'desc' }],
    limit: 50,
    measureVersions: {},
  };
}

export function pickView(
  catalog: ModuleAnalyticsCompiledSourceCatalogV1,
  allowedViewKeys?: readonly string[],
): ModuleAnalyticsDefaultViewV1 {
  const allowed = allowedViewKeys?.length
    ? catalog.defaultViews.filter((view) => allowedViewKeys.includes(view.key))
    : catalog.defaultViews;
  const view = allowed[0] ?? catalog.defaultViews[0];
  if (!view) throw new Error('No default view is declared for this module source.');
  return view;
}
