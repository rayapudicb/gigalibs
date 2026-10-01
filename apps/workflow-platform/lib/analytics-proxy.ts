import {
  createSignedModuleProxy,
  type SignedModuleProxyConfig,
  type SignedModuleRouteContext,
} from '@/lib/signed-module-proxy';

export type AnalyticsRouteContext = SignedModuleRouteContext;

const SEGMENT = '[A-Za-z0-9._:-]+';

// WI-OI-064a: Analytics verifies this BFF-signed PlatformContextV1 instead of self-issued development tokens,
// and receives the user's verified scopes rather than a service-wide analytics:* grant.
export const analyticsModule: SignedModuleProxyConfig = {
  moduleKey: 'analytics-studio',
  audience: 'gigalibs-analytics-api',
  upstream: 'analytics',
  privateKeyEnvironmentKey: 'ANALYTICS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
  codePrefix: 'ANALYTICS',
  routeNoun: 'Analytics',
  serviceName: 'Analytics Studio',
  entitlementName: 'Analytics Studio',
  requiredPermission: requiredAnalyticsPermission,
};

export const proxyAnalytics = createSignedModuleProxy(analyticsModule);

/** Allow-list carried over unchanged from the previous proxy: the permission a route needs, or null. */
function requiredAnalyticsPermission(method: string, path: readonly string[]): string | null {
  const joined = path.join('/');
  const read = method === 'GET' ? 'analytics:read' : null;
  if (joined === 'v1/setup/status') return read;
  if (joined === 'v1/setup') return method === 'POST' ? 'analytics:action' : null;
  if (['v1/metrics/summary', 'v1/metrics/timeseries'].includes(joined)) return read;
  if (new RegExp(`^v1/metrics/lineage/${SEGMENT}$`).test(joined)) return read;
  if (joined === 'v1/actions') return method === 'GET' ? 'analytics:read' : method === 'POST' ? 'analytics:action' : null;
  // WI-OI-064b: place drill-down is read-only through the BFF; rollup rebuilds stay internal to Analytics.
  if (joined === 'v1/places/drilldown') return read;
  // WI-OI-105e: the places a member may see (within their place scope), for the farm filter and the place map.
  if (joined === 'v1/places/directory') return read;
  // WI-OI-064d: a typed metric spec is posted, but the call only reads.
  if (joined === 'v1/places/metric-drilldown') return method === 'POST' ? 'analytics:read' : null;
  // WI-OI-103d: the Explore screen — a typed query spec is posted but only reads; the model catalog and chart views.
  if (joined === 'v1/query/spec') return method === 'POST' ? 'analytics:read' : null;
  if (joined === 'v1/semantic-models') return method === 'GET' ? 'analytics:read' : method === 'POST' ? 'analytics:models:write' : null;
  if (new RegExp(`^v1/semantic-models/${SEGMENT}/catalog$`).test(joined)) return read;
  if (joined === 'v1/chart-views') return method === 'GET' ? 'analytics:read' : method === 'POST' ? 'analytics:charts:write' : null;
  if (new RegExp(`^v1/chart-views/${SEGMENT}(/data)?$`).test(joined)) return read;
  // WI-OI-103d d7: formula review. Analytics also refuses a review by the version's creator (maker-checker).
  if (new RegExp(`^v1/formula-measures/model/${SEGMENT}$`).test(joined)) return read;
  if (new RegExp(`^v1/formula-measures/${SEGMENT}/versions/${SEGMENT}/(approve|reject)$`).test(joined)) {
    return method === 'POST' ? 'analytics:models:publish' : null;
  }
  // WI-OI-103e: dashboards of saved charts with shared filters. The data call posts the viewer's filter values but
  // only reads; saving a dashboard needs analytics:dashboards:write.
  if (joined === 'v1/dashboards') return method === 'GET' ? 'analytics:read' : method === 'POST' ? 'analytics:dashboards:write' : null;
  if (new RegExp(`^v1/dashboards/${SEGMENT}$`).test(joined)) {
    return method === 'GET' ? 'analytics:read' : method === 'PATCH' ? 'analytics:dashboards:write' : null;
  }
  if (new RegExp(`^v1/dashboards/${SEGMENT}/data$`).test(joined)) return method === 'POST' ? 'analytics:read' : null;
  if (new RegExp(`^v1/dashboards/${SEGMENT}/filter-values/${SEGMENT}$`).test(joined)) return read;
  // WI-OI-103e (ADR-0016 F11): Analytics owns reports. Creating and running need analytics:reports:write; the CSV
  // download needs analytics:export. Schedules stay internal until the scheduler exists (WI-OI-104).
  if (joined === 'v1/reports/definitions') {
    return method === 'GET' ? 'analytics:read' : method === 'POST' ? 'analytics:reports:write' : null;
  }
  if (new RegExp(`^v1/reports/definitions/${SEGMENT}(/runs)?$`).test(joined)) return read;
  if (joined === 'v1/reports/runs') return method === 'POST' ? 'analytics:reports:write' : null;
  if (new RegExp(`^v1/reports/runs/${SEGMENT}$`).test(joined)) return read;
  if (new RegExp(`^v1/reports/download/${SEGMENT}$`).test(joined)) return method === 'GET' ? 'analytics:export' : null;
  // WI-OI-104e: the Sources screen maps pulled records into datasets without code. Sources (names and kinds only),
  // discovery, mappings and dataset builds belong to mapping; a model makes a dataset explorable. The Postgres
  // connector's own routes (v1/connectors) stay unexposed.
  if (joined === 'v1/sources') return method === 'GET' ? 'analytics:mappings:write' : null;
  if (new RegExp(`^v1/connectors/${SEGMENT}/discover$`).test(joined)) return method === 'POST' ? 'analytics:mappings:write' : null;
  if (joined === 'v1/mappings') return method === 'GET' ? 'analytics:read' : method === 'POST' ? 'analytics:mappings:write' : null;
  if (new RegExp(`^v1/mappings/${SEGMENT}/publish$`).test(joined)) return method === 'POST' ? 'analytics:mappings:write' : null;
  if (joined === 'v1/datasets/build') return method === 'POST' ? 'analytics:mappings:write' : null;
  if (new RegExp(`^v1/datasets/by-mapping/${SEGMENT}$`).test(joined)) return read;
  return null;
}
