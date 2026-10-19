import { moduleGatewayConfig } from '@/lib/module-gateway';
import { createSignedModuleProxy } from '@/lib/signed-module-proxy';

export const runtime = 'nodejs';

// WI-OI-120gz: legacy `/api/ar/*` path kept for the suite UI; enforcement matches `spec.gateway` in
// modules/accounts-receivable/module.yaml (signed platform context, manifest allow-list).
const proxy = createSignedModuleProxy(moduleGatewayConfig('accounts-receivable'));

type RouteContext = { params: Promise<{ path: string[] }> };

export const GET = (request: Request, context: RouteContext) =>
  proxy(request, { params: context.params });
export const POST = (request: Request, context: RouteContext) =>
  proxy(request, { params: context.params });
export const PATCH = (request: Request, context: RouteContext) =>
  proxy(request, { params: context.params });
