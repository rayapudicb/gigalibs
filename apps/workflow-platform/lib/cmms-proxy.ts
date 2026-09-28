import { moduleGatewayConfig } from '@/lib/module-gateway';
import {
  type SignedModuleProxyConfig,
  type SignedModuleRouteContext,
  createSignedModuleProxy,
} from '@/lib/signed-module-proxy';

export type CmmsRouteContext = SignedModuleRouteContext;

// WI-OI-038 / WI-OI-083: CMMS verifies this BFF-signed PlatformContextV1 (its own key and audience) and receives the
// user's verified scopes. Only the routes CMMS declares in `spec.gateway` of its module.yaml reach the module;
// everything else is refused here.
export const cmmsModule: SignedModuleProxyConfig = moduleGatewayConfig('physical-operations-cmms');

export const proxyCmms = createSignedModuleProxy(cmmsModule);

/** Allow-list: the permission a method and path require, or null when the route is not exposed. */
export function requiredCmmsPermission(method: string, path: readonly string[]): string | null {
  const permission = cmmsModule.requiredPermission(method, path);
  return typeof permission === 'string' ? permission : null;
}
