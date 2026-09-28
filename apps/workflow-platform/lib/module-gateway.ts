import { generatedModuleGateways } from '@/lib/generated/module-gateways';
import type { LocalModuleUpstream } from '@/lib/local-module-upstream';
import { composePunchBody } from '@/lib/punch-geofence';
import {
  type SignedModuleProxyConfig,
  type SignedModuleRouteContext,
  createSignedModuleProxy,
} from '@/lib/signed-module-proxy';
import { unavailableCapability } from '@/lib/unavailable-capability';
import { NextResponse } from 'next/server';

type BodyTransform = NonNullable<SignedModuleProxyConfig['transformBody']>;

// WI-OI-083d: the body transforms a manifest may name in `spec.gateway.transformBody`.
const gatewayTransforms: Readonly<Record<string, BodyTransform>> = {
  'punch-geofence': composePunchBody,
};

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
  const transformBody =
    gateway.transformBody === null ? undefined : gatewayTransforms[gateway.transformBody];
  if (gateway.transformBody !== null && !transformBody)
    throw new Error(`Module ${module} names an unknown gateway transform ${gateway.transformBody}.`);
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
    ...(transformBody ? { transformBody } : {}),
    ...code,
  };
}

export type ModuleGatewayRouteContext = { params: Promise<{ gateway: string; path: string[] }> };

interface GatewayHandler {
  readonly proxy: (request: Request, context: SignedModuleRouteContext) => Promise<Response>;
  readonly unavailable: readonly { readonly pattern: RegExp; readonly methods: readonly string[] }[];
}

const handlers = new Map<string, GatewayHandler>();

function gatewayHandler(basePath: string): GatewayHandler | undefined {
  const cached = handlers.get(basePath);
  if (cached) return cached;
  const gateway = Object.values(generatedModuleGateways).find((entry) =>
    entry.basePaths.includes(basePath),
  );
  if (!gateway) return undefined;
  const handler: GatewayHandler = {
    proxy: createSignedModuleProxy(moduleGatewayConfig(gateway.module)),
    unavailable: gateway.unavailable.map((route) => ({
      pattern: new RegExp(route.pattern),
      methods: route.methods,
    })),
  };
  handlers.set(basePath, handler);
  return handler;
}

/**
 * The one BFF route for every module gateway in the built solution (WI-OI-083d, `app/api/[gateway]/[...path]`).
 * A base path no selected module declares answers 404; a contained route answers as unavailable; everything else
 * goes through the signed proxy and its allow-list.
 */
export async function moduleGatewayRoute(
  request: Request,
  context: ModuleGatewayRouteContext,
): Promise<Response> {
  const { gateway, path } = await context.params;
  const handler = gatewayHandler(`/api/${gateway}`);
  if (!handler) {
    return NextResponse.json(
      { type: 'about:blank', title: 'Unknown module gateway.', status: 404, code: 'GATEWAY_UNKNOWN' },
      { status: 404, headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' } },
    );
  }
  const method = request.method.toUpperCase();
  const joined = path.join('/');
  if (handler.unavailable.some((route) => route.methods.includes(method) && route.pattern.test(joined)))
    return unavailableCapability();
  return handler.proxy(request, { params: Promise.resolve({ path }) });
}
