import {
  createSignedModuleProxy,
  type SignedModuleProxyConfig,
  type SignedModuleRouteContext,
} from '@/lib/signed-module-proxy';

const SEGMENT = '[A-Za-z0-9._:-]+';
/** Connector Hub serves its API under this prefix. */
export const CONNECTOR_HUB_PATH_PREFIX = ['api', 'connectors', 'v1'] as const;

// WI-OI-104a: Connector Hub verifies this BFF-signed PlatformContextV1 instead of trusting an X-Tenant-Id header, and
// every exposed route names the permission it needs. Webhooks are for outside senders and are not exposed here.
export const connectorHubModule: SignedModuleProxyConfig = {
  moduleKey: 'connections',
  audience: 'gigalibs-connector-hub-api',
  upstream: 'connector-hub',
  privateKeyEnvironmentKey: 'CONNECTOR_HUB_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
  codePrefix: 'CONNECTOR_HUB',
  routeNoun: 'Connector Hub',
  serviceName: 'Connector Hub',
  entitlementName: 'Connections',
  requiredPermission: requiredConnectorHubPermission,
  // The browser calls `/api/connectors-hub/<path>`; the hub serves `/api/connectors/v1/<path>`.
  upstreamPathPrefix: CONNECTOR_HUB_PATH_PREFIX,
};

export const proxyConnectorHub: (request: Request, context: SignedModuleRouteContext) => Promise<Response> =
  createSignedModuleProxy(connectorHubModule);

/** The permission a route needs, or null when it is not exposed. `path` includes the hub prefix. */
export function requiredConnectorHubPermission(method: string, path: readonly string[]): string | null {
  const joined = path.join('/');
  if (!joined.startsWith('api/connectors/v1/')) return null;
  const route = joined.slice('api/connectors/v1/'.length);
  const read = method === 'GET' ? 'connections:read' : null;
  if (['catalog', 'journal', 'stats'].includes(route)) return read;
  if (route === 'connections') return method === 'GET' ? 'connections:read' : method === 'POST' ? 'connections:write' : null;
  if (new RegExp(`^connections/${SEGMENT}$`).test(route)) return read;
  if (new RegExp(`^connections/${SEGMENT}/test$`).test(route)) return method === 'POST' ? 'connections:test' : null;
  if (new RegExp(`^connections/${SEGMENT}/sync$`).test(route)) return method === 'POST' ? 'connections:sync' : null;
  // WI-OI-104d: pull history and quarantine are read; the pull source and its login secrets are written.
  if (new RegExp(`^connections/${SEGMENT}/(sync-jobs|quarantine)$`).test(route)) return read;
  if (new RegExp(`^connections/${SEGMENT}/(source|credentials|delivery)$`).test(route)) return method === 'POST' ? 'connections:write' : null;
  if (route === 'oauth/initiate') return method === 'POST' ? 'connections:write' : null;
  if (new RegExp(`^connections/${SEGMENT}/oauth/callback$`).test(route)) return method === 'POST' ? 'connections:write' : null;
  return null;
}
