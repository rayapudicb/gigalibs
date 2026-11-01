import type {
  AnalyticsQueryV1,
  AnalyticsTimeGrain,
  ModuleAnalyticsCompiledSourceCatalogV1,
} from '@gigalibs/contracts';

export interface ModuleTrendDateRange {
  readonly from: string;
  readonly to: string;
}

function rangeFilters(catalog: ModuleAnalyticsCompiledSourceCatalogV1, range?: ModuleTrendDateRange) {
  if (!range) return [];
  return [
    { field: catalog.eventTimeField, op: 'gte' as const, value: `${range.from}T00:00:00.000Z` },
    { field: catalog.eventTimeField, op: 'lte' as const, value: `${range.to}T23:59:59.999Z` },
  ];
}

/** Governed query from compiled catalog fields only (WI-OI-131 C10). */
export function buildModuleTrendQuery(
  catalog: ModuleAnalyticsCompiledSourceCatalogV1,
  input: {
    readonly measures: readonly string[];
    readonly dimensions: readonly string[];
    readonly grain: AnalyticsTimeGrain;
    readonly range?: ModuleTrendDateRange;
    readonly compareRange?: ModuleTrendDateRange;
  },
): AnalyticsQueryV1 {
  const time = input.grain ? { field: catalog.eventTimeField, grain: input.grain } : undefined;
  return {
    semanticModelId: catalog.semanticModelId,
    measures: [...input.measures],
    dimensions: [...input.dimensions],
    time,
    filters: rangeFilters(catalog, input.range),
    sort: time ? [{ by: catalog.eventTimeField, direction: 'asc' }] : [],
    limit: 1000,
    measureVersions: {},
  };
}

export function buildModuleCompareQuery(
  catalog: ModuleAnalyticsCompiledSourceCatalogV1,
  base: AnalyticsQueryV1,
  compareRange: ModuleTrendDateRange,
): AnalyticsQueryV1 {
  return {
    ...base,
    filters: rangeFilters(catalog, compareRange),
  };
}
