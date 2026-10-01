import { createSignedModuleProxy, type SignedModuleRouteContext } from '@/lib/signed-module-proxy';

export type GeospatialRouteContext = SignedModuleRouteContext;

const UUID_SEGMENT = '[0-9a-fA-F-]{36}';

export const proxyGeospatial = createSignedModuleProxy({
  moduleKey: 'geospatial-studio',
  audience: 'gigalibs-geospatial-api',
  upstream: 'geospatial',
  privateKeyEnvironmentKey: 'GEOSPATIAL_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
  codePrefix: 'GEOSPATIAL',
  routeNoun: 'Geospatial',
  serviceName: 'Geospatial Studio',
  entitlementName: 'Geospatial Studio',
  requiredPermission: requiredGeospatialPermission,
});

function requiredGeospatialPermission(method: string, path: readonly string[]): string | null {
  const joined = path.join('/');
  if (joined === 'v1/runtime/tenant-scope' && method === 'GET') return 'maps:read';
  if (joined === 'v1/node-types') {
    return method === 'GET' ? 'maps.nodes.read' : method === 'POST' ? 'maps.node-types.manage' : null;
  }
  if (joined === 'v1/nodes') {
    return method === 'GET' ? 'maps.nodes.read' : method === 'POST' ? 'maps.nodes.manage' : null;
  }
  if (joined === 'v1/nodes/mobile/sync' && method === 'GET') return 'maps.nodes.read';
  if (joined === 'v1/nodes/lookup/tag' && method === 'GET') return 'maps.nodes.read';
  if (joined === 'v1/nodes/import') return method === 'POST' ? 'maps.nodes.manage' : null;
  // WI-OI-107: Geospatial's section of the active industry pack (applied by the kernel's pack.apply job, not the web).
  if (joined === 'v1/pack' && method === 'GET') return 'maps.nodes.read';
  // WI-OI-105b: re-send every place to Analytics' place directory (members without a place scope only).
  if (joined === 'v1/nodes/republish') return method === 'POST' ? 'maps.nodes.manage' : null;
  if (new RegExp(`^v1/nodes/${UUID_SEGMENT}$`).test(joined)) {
    return method === 'GET' ? 'maps.nodes.read' : method === 'PATCH' ? 'maps.nodes.manage' : null;
  }
  if (new RegExp(`^v1/nodes/${UUID_SEGMENT}/move$`).test(joined) && method === 'POST') {
    return 'maps.nodes.manage';
  }
  return null;
}
