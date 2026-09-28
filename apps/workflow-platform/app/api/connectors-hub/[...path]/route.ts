import { randomUUID } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/verified-session';
import { canUseTenantModule } from '@/lib/module-access';
import { hasSameOrigin } from '@/lib/same-origin';
import { readBoundedBody } from '@/lib/authenticated-upstream';
import { localModuleUpstreamOrigin } from '@/lib/local-module-upstream';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ path: string[] }> };

export const GET = (request: NextRequest, context: RouteContext) => proxy(request, context);
export const POST = (request: NextRequest, context: RouteContext) => proxy(request, context);
export const PUT = (request: NextRequest, context: RouteContext) => proxy(request, context);
export const PATCH = (request: NextRequest, context: RouteContext) => proxy(request, context);
export const DELETE = (request: NextRequest, context: RouteContext) => proxy(request, context);

async function proxy(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) {
    return NextResponse.json({ detail: 'Active tenant workspace required.' }, { status: 403 });
  }

  const { path } = await context.params;
  if (!path || path.length === 0) {
    return NextResponse.json({ detail: 'Invalid Connector Hub API path.' }, { status: 400 });
  }

  // Check module entitlement
  if (!canUseTenantModule('connections', new Set(session.context.tenant.features), session.context.permissions)) {
    return NextResponse.json({ detail: 'Forbidden: connections module not enabled.' }, { status: 403 });
  }

  const method = request.method.toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !hasSameOrigin(request)) {
    return NextResponse.json({ detail: 'Cross-site request rejected.' }, { status: 403 });
  }

  try {
    const hubBaseUrl = localModuleUpstreamOrigin('connector-hub');
    const targetUrl = new URL(`${hubBaseUrl}/api/connectors/v1/${path.join('/')}`);
    targetUrl.search = request.nextUrl.search;
    const headers = new Headers();
    headers.set('Accept', 'application/json');

    const incomingContentType = request.headers.get('content-type');
    if (incomingContentType) headers.set('Content-Type', incomingContentType);

    const idempotencyKey = request.headers.get('idempotency-key') || request.headers.get('x-idempotency-key');
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);

    headers.set('X-Tenant-Id', session.context.tenant.id);

    const correlationId = request.headers.get('x-correlation-id') || randomUUID();
    headers.set('X-Correlation-Id', correlationId);

    const body =
      request.method !== 'GET' && request.method !== 'HEAD'
        ? await readBoundedBody(request)
        : undefined;

    const response = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });

    const data = await response.text();
    const forwardHeaders = new Headers();
    const contentType = response.headers.get('content-type');
    if (contentType) forwardHeaders.set('Content-Type', contentType);

    return new NextResponse(data, {
      status: response.status,
      headers: forwardHeaders,
    });
  } catch (error) {
    const configurationError =
      error instanceof Error && error.message.startsWith('Local module runtime');
    return NextResponse.json(
      {
        detail: configurationError
          ? 'Connector Hub is not configured for this local runtime.'
          : 'The Connector Hub service is temporarily unavailable.',
      },
      { status: configurationError ? 503 : 502 },
    );
  }
}
