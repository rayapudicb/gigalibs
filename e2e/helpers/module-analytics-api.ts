import { expect, type APIRequestContext } from '@playwright/test';

export interface ModuleSourceListItem {
  readonly sourceId: string;
  readonly sourceKey: string;
  readonly title: string;
  readonly moduleLifecycle: string | null;
}

export interface ModuleAnalyticsCatalog {
  readonly sourceId: string;
  readonly sourceKey: string;
  readonly title: string;
  readonly semanticModelId: string;
  readonly defaultViews: Array<{ key: string; kpiMeasureKeys: string[] }>;
}

export interface AnalyticsQueryResult {
  readonly columns: Array<{ name: string; role: string }>;
  readonly rows: Array<Array<string | number | boolean | null>>;
}

export async function analyticsJson<T>(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as T;
}

export async function ensureAnalyticsStudioReady(request: APIRequestContext, origin: string) {
  const status = await request.get('/api/analytics/v1/setup/status', { headers: { Origin: origin } });
  if (!status.ok()) return;
  const body = (await status.json()) as { configured?: boolean };
  if (body.configured) return;
  const setup = await request.post('/api/analytics/v1/setup', { headers: { Origin: origin } });
  expect(setup.ok(), await setup.text()).toBeTruthy();
}

export async function listModuleSources(request: APIRequestContext, origin: string) {
  return analyticsJson<ModuleSourceListItem[]>(
    await request.get('/api/analytics/v1/module-sources', { headers: { Origin: origin } }),
  );
}

export async function loadModuleCatalog(request: APIRequestContext, origin: string, sourceId: string) {
  return analyticsJson<ModuleAnalyticsCatalog>(
    await request.get(`/api/analytics/v1/module-sources/${sourceId}/catalog`, { headers: { Origin: origin } }),
  );
}

export async function runAnalyticsQuery(request: APIRequestContext, origin: string, spec: Record<string, unknown>) {
  return analyticsJson<AnalyticsQueryResult>(
    await request.post('/api/analytics/v1/query/spec', {
      data: spec,
      headers: { Origin: origin },
    }),
  );
}

/** Primary KPI query for the first default view measure (same shape central tiles and embedded workbench use). */
export function primaryKpiQuery(catalog: ModuleAnalyticsCatalog) {
  const measureKey = catalog.defaultViews[0]?.kpiMeasureKeys[0];
  if (!measureKey) throw new Error(`No KPI measure declared for ${catalog.sourceKey}.`);
  return {
    semanticModelId: catalog.semanticModelId,
    measures: [measureKey],
    dimensions: [],
    filters: [],
    sort: [],
    limit: 1,
    measureVersions: {},
  };
}

export function measureCell(result: AnalyticsQueryResult, measureKey: string): string | number | boolean | null {
  const index = result.columns.findIndex((column) => column.name === measureKey && column.role === 'measure');
  if (index < 0 || result.rows.length === 0) return null;
  return result.rows[0]![index] ?? null;
}
