import { proxyWorkforce, type WorkforceRouteContext } from '@/lib/workforce-proxy';

export const runtime = 'nodejs';

export const GET = (request: Request, context: WorkforceRouteContext) =>
  proxyWorkforce(request, context);
export const POST = (request: Request, context: WorkforceRouteContext) =>
  proxyWorkforce(request, context);
export const PATCH = (request: Request, context: WorkforceRouteContext) =>
  proxyWorkforce(request, context);
