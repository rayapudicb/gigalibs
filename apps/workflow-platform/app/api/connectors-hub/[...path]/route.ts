import { proxyConnectorHub } from '@/lib/connector-hub-proxy';
import type { SignedModuleRouteContext } from '@/lib/signed-module-proxy';

export const runtime = 'nodejs';

// WI-OI-104a: signed, allow-listed proxy to Connector Hub (replaces the proxy that forwarded an X-Tenant-Id header).
export const GET = (request: Request, context: SignedModuleRouteContext) => proxyConnectorHub(request, context);
export const POST = (request: Request, context: SignedModuleRouteContext) => proxyConnectorHub(request, context);
