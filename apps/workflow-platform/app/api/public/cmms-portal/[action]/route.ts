import { forwardPortalRequest } from '../../../../../lib/cmms-portal';

// WI-OI-140 M-REQ: the public request portal (no sign-in). See lib/cmms-portal.ts.
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ action: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return forwardPortalRequest(request, (await context.params).action);
}

async function notFound(): Promise<Response> {
  return new Response(JSON.stringify({ code: 'PORTAL_NOT_FOUND' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const GET = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
