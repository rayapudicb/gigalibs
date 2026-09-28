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
  if (['v1/metrics/summary', 'v1/metrics/timeseries', 'v1/metrics/charts'].includes(joined)) return read;
  if (new RegExp(`^v1/metrics/(charts|lineage)/${SEGMENT}$`).test(joined)) return read;
  if (joined === 'v1/actions') return method === 'GET' ? 'analytics:read' : method === 'POST' ? 'analytics:action' : null;
  // WI-OI-064b: place drill-down is read-only through the BFF; rollup rebuilds stay internal to Analytics.
  if (joined === 'v1/places/drilldown') return read;
  // WI-OI-064d: a typed metric spec is posted, but the call only reads.
  if (joined === 'v1/places/metric-drilldown') return method === 'POST' ? 'analytics:read' : null;
  return null;
}
