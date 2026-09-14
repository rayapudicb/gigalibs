import { randomUUID } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/verified-session';
import { canUseTenantModule } from '@/lib/module-access';
import { hasSameOrigin } from '@/lib/same-origin';
import { readBoundedBody } from '@/lib/authenticated-upstream';

export const runtime = 'nodejs';

function getRulesBaseUrl(): string {
  const url = process.env.RULES_API_URL;
  if (!url) {
    throw new Error('RULES_API_URL environment variable is required.');
  }
  return url.replace('localhost', '127.0.0.1');
}

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
    return NextResponse.json({ error: 'Active tenant required' }, { status: 403 });
  }
  if (!canUseTenantModule('rule-studio', new Set(session.context.tenant.features), session.context.permissions)) {
    return NextResponse.json({ error: 'Rule Studio module is not enabled for this tenant.' }, { status: 403 });
  }

  const mutating = request.method !== 'GET' && request.method !== 'HEAD';
  if (mutating && !hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin mutation forbidden' }, { status: 403 });
  }

  const { path } = await context.params;
  if (!path || path.length === 0) {
    return NextResponse.json({ detail: 'Invalid Rules API path.' }, { status: 400 });
  }

  const rulesBaseUrl = getRulesBaseUrl();
  const targetUrl = new URL(`${rulesBaseUrl}/api/rules/v1/${path.join('/')}`);
  targetUrl.search = request.nextUrl.search;

  try {
    const headers = new Headers();
    headers.set('Accept', 'application/json');

    const incomingContentType = request.headers.get('content-type');
    if (incomingContentType) headers.set('Content-Type', incomingContentType);

    const idempotencyKey = request.headers.get('idempotency-key');
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);

    headers.set('X-Tenant-Id', session.context.tenant.id);

    const correlationId = request.headers.get('x-correlation-id') || randomUUID();
    headers.set('X-Correlation-Id', correlationId);

    const body = mutating ? await readBoundedBody(request) : undefined;

    const response = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
    });

    const data = await response.text();
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Upstream Rules API unavailable', details: err?.message || String(err) },
      { status: 503 },
    );
  }
}
