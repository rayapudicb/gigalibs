import { type CmmsRouteContext, proxyCmms } from '@/lib/cmms-proxy';

export const runtime = 'nodejs';

// WI-OI-038: same-origin BFF to the CMMS core runtime; see lib/cmms-proxy.ts for the allow-list.
export const GET = (request: Request, context: CmmsRouteContext) => proxyCmms(request, context);
export const POST = (request: Request, context: CmmsRouteContext) => proxyCmms(request, context);
export const PATCH = (request: Request, context: CmmsRouteContext) => proxyCmms(request, context);
