import { randomUUID } from 'node:crypto';
import { parseLocalArUpstreamOrigin } from '@/lib/ar-local-upstream';
import { arTenantBindingId } from '@/lib/ar-tenant-binding';
import { readBoundedBody } from '@/lib/authenticated-upstream';
import { canUseTenantModule, hasPermission } from '@/lib/module-access';
import { hasSameOrigin } from '@/lib/same-origin';
import { verifiedSession } from '@/lib/verified-session';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ path: string[] }> };

const MUTATING_METHODS = new Set(['POST', 'PATCH']);
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export const GET = (request: Request, context: RouteContext) => proxyAr(request, context);
export const POST = (request: Request, context: RouteContext) => proxyAr(request, context);
export const PATCH = (request: Request, context: RouteContext) => proxyAr(request, context);

async function proxyAr(request: Request, context: RouteContext): Promise<NextResponse> {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) return problem(403, 'Select an active tenant workspace first.');

  const method = request.method.toUpperCase();
  const path = (await context.params).path;
  if (!isAllowedPath(method, path)) return problem(404, 'Unsupported Accounts Receivable route.');

  const requiredPermission = requiredArPermission(method, path);
  if (
    !canUseTenantModule(
      'accounts-receivable',
      new Set(session.context.tenant.features),
      session.context.permissions,
    ) ||
    !hasPermission(session.context.permissions, requiredPermission)
  ) {
    return problem(403, `Permission ${requiredPermission} is required.`);
  }

  if (MUTATING_METHODS.has(method) && !hasSameOrigin(request)) {
    return problem(403, 'Cross-site request rejected.');
  }

  try {
    const arBaseUrl = parseLocalArUpstreamOrigin(process.env.AR_API_URL);
    const body = MUTATING_METHODS.has(method) ? await readBoundedBody(request) : undefined;
    const token = await arToken(
      arBaseUrl,
      arTenantBindingId(session.context.tenant.id),
      session.context.user.id,
    );
    const target = new URL(`/${path.map(encodeURIComponent).join('/')}`, arBaseUrl);
    target.search = new URL(request.url).search;
    const headers = new Headers({
      Accept: 'application/json, application/problem+json',
      Authorization: `Bearer ${token}`,
      'X-Correlation-Id': request.headers.get('x-correlation-id') ?? randomUUID(),
    });
    if (body) headers.set('Content-Type', 'application/json');
    copyHeader(request.headers, headers, 'idempotency-key');
    copyHeader(request.headers, headers, 'if-match');

    const upstream = await fetch(target, {
      method,
      headers,
      ...(body ? { body } : {}),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(3_000),
    });
    const response = new NextResponse(upstream.body, { status: upstream.status });
    for (const name of ['content-type', 'etag', 'idempotency-replayed', 'x-correlation-id']) {
      const value = upstream.headers.get(name);
      if (value) response.headers.set(name, value);
    }
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Local AR UAT')) {
      return problem(503, error.message);
    }
    return problem(502, 'The Accounts Receivable service is temporarily unavailable.');
  }
}

async function arToken(baseUrl: string, tenantId: string, userId: string): Promise<string> {
  const cacheKey = `${tenantId}:${userId}`;
  const now = Math.floor(Date.now() / 1_000);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now + 30) return cached.token;

  const response = await fetch(`${baseUrl}/oidc/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', tenant_id: tenantId, sub: userId }),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(2_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (
    !response.ok ||
    !payload ||
    typeof payload !== 'object' ||
    typeof (payload as { access_token?: unknown }).access_token !== 'string'
  ) {
    throw new Error('AR token exchange failed.');
  }
  const expiresIn = Number((payload as { expires_in?: unknown }).expires_in);
  const token = (payload as { access_token: string }).access_token;
  tokenCache.set(cacheKey, {
    token,
    expiresAt: now + (Number.isSafeInteger(expiresIn) && expiresIn > 60 ? expiresIn : 300),
  });
  return token;
}

function isAllowedPath(method: string, path: string[]): boolean {
  if (path.some((part) => !/^[A-Za-z0-9._:-]{1,100}$/.test(part))) return false;
  const joined = path.join('/');
  if (method === 'POST' && joined === 'v1/setup') return true;
  if (joined === 'v1/customers') return method === 'GET' || method === 'POST';
  if (path.length === 3 && path[0] === 'v1' && path[1] === 'customers') {
    return method === 'GET';
  }
  if (joined === 'v1/invoices') return method === 'GET' || method === 'POST';
  if (joined === 'v1/invoices/aging') return method === 'GET';
  if (path.length === 3 && path[0] === 'v1' && path[1] === 'invoices') {
    return method === 'GET' || method === 'PATCH';
  }
  if (path.length === 4 && path[0] === 'v1' && path[1] === 'invoices') {
    const sub = path[3];
    if (sub === 'issue') return method === 'POST';
    if (sub === 'deliver') return method === 'POST';
    if (sub === 'deliveries') return method === 'GET';
    if (sub === 'pdf') return method === 'GET';
    if (sub === 'payments') return method === 'GET' || method === 'POST';
    if (sub === 'checkout-session') return method === 'POST';
    if (sub === 'download-url') return method === 'GET';
    if (sub === 'void') return method === 'GET' || method === 'POST';
    if (sub === 'credit-notes') return method === 'GET' || method === 'POST';
    if (sub === 'collections') return method === 'GET' || method === 'POST';
  }
  if (joined === 'v1/work-sources') return method === 'POST';
  if (path.length === 4 && path[0] === 'v1' && path[1] === 'work-sources') {
    const sub = path[3];
    if (sub === 'records') return method === 'POST';
    if (sub === 'summary') return method === 'GET';
    if (sub === 'generate-invoice') return method === 'POST';
    if (sub === 'family') return method === 'GET';
  }
  return false;
}

function requiredArPermission(method: string, path: string[]): string {
  if (method === 'GET') return 'ar:read';
  if (path.at(-1) === 'issue') return 'ar:issue';
  return 'ar:write';
}

function copyHeader(source: Headers, target: Headers, name: string): void {
  const value = source.get(name);
  if (value) target.set(name, value);
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
