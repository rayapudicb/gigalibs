import { randomUUID } from 'node:crypto';
import { readBoundedBody } from '@/lib/authenticated-upstream';
import { canUseTenantModule, hasPermission } from '@/lib/module-access';
import { hasSameOrigin } from '@/lib/same-origin';
import { verifiedSession } from '@/lib/verified-session';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ path: string[] }> };
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const GET = (request: Request, context: RouteContext) => handleCommunications(request, context);
export const POST = (request: Request, context: RouteContext) => handleCommunications(request, context);
export const PUT = (request: Request, context: RouteContext) => handleCommunications(request, context);
export const PATCH = (request: Request, context: RouteContext) => handleCommunications(request, context);
export const DELETE = (request: Request, context: RouteContext) => handleCommunications(request, context);

async function handleCommunications(request: Request, context: RouteContext): Promise<NextResponse> {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) return problem(403, 'Select an active tenant workspace first.');

  const method = request.method.toUpperCase();
  const pathSegments = (await context.params).path;

  const hasPlatformAuthority = session.context.platformRoles.length > 0;
  const isSuperAdmin = session.context.permissions.includes('*');

  // Authorize communications-textfly module access
  if (
    !hasPlatformAuthority &&
    !isSuperAdmin &&
    !canUseTenantModule(
      'communications-textfly',
      new Set(session.context.tenant.features),
      session.context.permissions,
    )
  ) {
    return problem(403, 'Omnichannel Communications module is not enabled for this tenant.');
  }

  const required = method === 'GET' ? 'communications:read' : 'communications:write';
  if (!hasPlatformAuthority && !isSuperAdmin && !hasPermission(session.context.permissions, required)) {
    return problem(403, `Permission ${required} is required.`);
  }

  if (MUTATING_METHODS.has(method) && !hasSameOrigin(request)) {
    return problem(403, 'Cross-site request rejected.');
  }

  const tenantId = session.context.tenant.id;

  // WI-OI-120ak (S4, owner decision D2a): this route answers only from the Communications service. It used to fall back,
  // silently, to an in-memory store seeded with invented channels, conversations and campaigns, whose sends went
  // nowhere and whose data was lost on restart. Without the service, it says so.
  const configuredUpstream = process.env.COMMUNICATIONS_API_URL?.trim();
  if (!configuredUpstream) {
    return problem(503, 'Communications is not available on this instance: its service is not connected yet.');
  }

  let rawBody = '';
  if (MUTATING_METHODS.has(method)) {
    try {
      rawBody = await readBoundedBody(request);
    } catch {
      return problem(413, 'The request body is too large or could not be read.');
    }
  }

  try {
    const body = rawBody || undefined;
    const target = new URL(`/${pathSegments.map(encodeURIComponent).join('/')}`, configuredUpstream);
    target.search = new URL(request.url).search;

    const headers = new Headers({
      Accept: 'application/json, application/problem+json',
      'x-tenant-id': tenantId,
      'x-user-id': session.context.user.id,
      'X-Correlation-Id': request.headers.get('x-correlation-id') ?? randomUUID(),
    });
    if (body) headers.set('Content-Type', 'application/json');

    const upstream = await fetch(target, {
      method,
      headers,
      ...(body ? { body } : {}),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(4_000),
    });

    const response = new NextResponse(upstream.body, { status: upstream.status });
    for (const name of ['content-type', 'etag', 'x-correlation-id']) {
      const value = upstream.headers.get(name);
      if (value) response.headers.set(name, value);
    }
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return problem(502, 'The Communications service did not answer.');
  }
}

function problem(status: number, title: string): NextResponse {
  return NextResponse.json(
    { type: 'about:blank', title, status, correlationId: randomUUID() },
    {
      status,
      headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' },
    },
  );
}
