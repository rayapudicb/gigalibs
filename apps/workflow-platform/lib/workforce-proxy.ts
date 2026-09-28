import { moduleGatewayConfig } from '@/lib/module-gateway';
import { composePunchBody } from '@/lib/punch-geofence';
import { type SignedModuleRouteContext, createSignedModuleProxy } from '@/lib/signed-module-proxy';

export type WorkforceRouteContext = SignedModuleRouteContext;

// WI-OI-083: the routes and permissions Workforce declares in `spec.gateway` of its module.yaml. The punch body is
// still composed here from Geospatial (WI-OI-069) until module web packages own their transforms.
const workforceModule = moduleGatewayConfig('gigaops', { transformBody: composePunchBody });

export const proxyWorkforce = createSignedModuleProxy(workforceModule);

/** Allow-list: the permission (a list means any one of them) a method and path require, or null. */
export function requiredWorkforcePermission(
  method: string,
  path: readonly string[],
): string | readonly string[] | null {
  return workforceModule.requiredPermission(method, path);
}
