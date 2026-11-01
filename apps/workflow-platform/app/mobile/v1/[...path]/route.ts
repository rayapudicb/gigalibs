import { forwardMobileRequest, mobileProblemResponse } from '../../../../lib/mobile-bff';

// WI-OI-120cf: the mobile v1 BFF (sign-in, MFA, workspaces, session, refresh, logout). See lib/mobile-bff.ts.
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  return forwardMobileRequest(request, path);
}

export const GET = handle;
export const POST = handle;

async function notFound(): Promise<Response> {
  return mobileProblemResponse('MOBILE_NOT_FOUND');
}

export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
