import { randomUUID } from 'node:crypto';
import { readBoundedBody } from '@/lib/authenticated-upstream';
import { canUseTenantModule } from '@/lib/module-access';
import { hasSameOrigin } from '@/lib/same-origin';
import { verifiedSession } from '@/lib/verified-session';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ path: string[] }> };
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const GET = (request: Request, context: RouteContext) => proxyCmms(request, context);
export const POST = (request: Request, context: RouteContext) => proxyCmms(request, context);
export const PUT = (request: Request, context: RouteContext) => proxyCmms(request, context);
export const PATCH = (request: Request, context: RouteContext) => proxyCmms(request, context);
export const DELETE = (request: Request, context: RouteContext) => proxyCmms(request, context);

async function proxyCmms(request: Request, context: RouteContext): Promise<NextResponse> {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) return problem(403, 'Select an active tenant workspace first.');

  const method = request.method.toUpperCase();
  const pathSegments = (await context.params).path;
  if (pathSegments.some((part) => !/^[A-Za-z0-9._:-]{1,100}$/.test(part))) {
    return problem(404, 'Unsupported CMMS route.');
  }

  if (
    !canUseTenantModule(
      'asset-maintenance',
      new Set(session.context.tenant.features),
      session.context.permissions,
    )
  ) {
    return problem(403, 'Asset & Maintenance module is not enabled for this tenant.');
  }

  if (MUTATING_METHODS.has(method) && !hasSameOrigin(request)) {
    return problem(403, 'Cross-site request rejected.');
  }

  try {
    const baseUrl = configuredCmmsBaseUrl();
    const body = MUTATING_METHODS.has(method) ? await readBoundedBody(request) : undefined;

    const joined = pathSegments.join('/');
    const targetPath = joined.startsWith('v1/')
      ? `/${joined}`
      : `/v1/${joined}`;

    const target = new URL(targetPath, baseUrl);
    target.search = new URL(request.url).search;

    const headers = new Headers({
      Accept: 'application/json, application/problem+json',
      'x-tenant-id': session.context.tenant.id,
      'x-user-id': session.context.user.id,
      'X-Correlation-Id': request.headers.get('x-correlation-id') ?? randomUUID(),
    });

    if (body) headers.set('Content-Type', 'application/json');
    const authHeader = request.headers.get('authorization');
    if (authHeader) headers.set('Authorization', authHeader);

    const upstream = await fetch(target, {
      method,
      headers,
      ...(body ? { body } : {}),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });

    const response = new NextResponse(upstream.body, { status: upstream.status });
    for (const name of ['content-type', 'etag', 'idempotency-replayed', 'x-correlation-id']) {
      const value = upstream.headers.get(name);
      if (value) response.headers.set(name, value);
    }
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return problem(502, 'The CMMS service is temporarily unavailable.');
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

function configuredCmmsBaseUrl(): string {
  const configured = process.env.CMMS_API_URL?.trim();
  if (!configured) throw new Error('Local CMMS UAT requires CMMS_API_URL.');
  const url = new URL(configured);
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'Local CMMS UAT requires a credential-free loopback CMMS_API_URL origin.',
    );
  }
  return url.origin;
}
