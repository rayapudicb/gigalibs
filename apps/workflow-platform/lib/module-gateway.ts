import { generatedModuleGateways } from '@/lib/generated/module-gateways';
import type { LocalModuleUpstream } from '@/lib/local-module-upstream';
import type { SignedModuleProxyConfig } from '@/lib/signed-module-proxy';

/**
 * Module gateways from the manifests (WI-OI-083): `spec.gateway` in each module's `module.yaml` declares who the
 * module is to the BFF (catalogue key, audience, upstream, signing key) and the only routes the BFF may reach, with
 * the permission (or any-of permissions) each method needs. `pnpm modules:catalog` generates the table; the signed
 * proxy stays the single enforcement point.
 */
export function moduleGatewayConfig(
  module: string,
  code: Pick<SignedModuleProxyConfig, 'transformBody'> = {},
): SignedModuleProxyConfig {
  const gateway = generatedModuleGateways[module];
  if (!gateway) throw new Error(`No gateway is declared for module ${module}.`);
  const routes = gateway.routes.map((route) => ({
    pattern: new RegExp(route.pattern),
    methods: route.methods,
  }));
  return {
    moduleKey: gateway.catalogKey,
    audience: gateway.audience,
    upstream: gateway.upstream as LocalModuleUpstream,
    privateKeyEnvironmentKey: gateway.signingKeyEnvironment,
    codePrefix: gateway.codePrefix,
    routeNoun: gateway.routeNoun,
    serviceName: gateway.serviceName,
    entitlementName: gateway.entitlementName,
    requiredPermission: (method, path) => {
      const joined = path.join('/');
      return routes.find((route) => route.pattern.test(joined))?.methods[method] ?? null;
    },
    ...code,
  };
}
