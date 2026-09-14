import { randomUUID } from 'node:crypto';
import { moduleTenantBindingId } from '@/lib/ar-tenant-binding';
import { readBoundedBody } from '@/lib/authenticated-upstream';
import { canUseTenantModule, hasPermission } from '@/lib/module-access';
import { hasSameOrigin } from '@/lib/same-origin';
import { verifiedSession } from '@/lib/verified-session';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ path: string[] }> };
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export const GET = (request: Request, context: RouteContext) => proxyCurrency(request, context);
export const POST = (request: Request, context: RouteContext) => proxyCurrency(request, context);
export const PUT = (request: Request, context: RouteContext) => proxyCurrency(request, context);
export const PATCH = (request: Request, context: RouteContext) => proxyCurrency(request, context);

async function proxyCurrency(request: Request, context: RouteContext): Promise<NextResponse> {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) return problem(403, 'Select an active tenant workspace first.');

  const method = request.method.toUpperCase();
  const rawPath = (await context.params).path;
  const path = rawPath[0] === 'v1' ? rawPath : ['v1', ...rawPath];
  if (!isAllowedPath(method, path)) return problem(404, 'Unsupported Multi-Currency route.');
  const required = requiredCurrencyPermission(method, path);
  if (
    !canUseTenantModule(
      'multi-currency',
      new Set(session.context.tenant.features),
      session.context.permissions,
    ) ||
    !hasPermission(session.context.permissions, required)
  ) {
    return problem(403, `Permission ${required} is required.`);
  }
  if (MUTATING_METHODS.has(method) && !hasSameOrigin(request)) {
    return problem(403, 'Cross-site request rejected.');
  }

  try {
    const baseUrl = configuredCurrencyBaseUrl();
    const body = MUTATING_METHODS.has(method) ? await readBoundedBody(request) : undefined;
    const token = await currencyToken(
      baseUrl,
      moduleTenantBindingId(session.context.tenant.id),
      session.context.user.id,
    );
    const target = new URL(`/${path.map(encodeURIComponent).join('/')}`, baseUrl);
    target.search = new URL(request.url).search;
    const headers = new Headers({
      Accept: 'application/json, application/problem+json',
      Authorization: `Bearer ${token}`,
      'X-Correlation-Id': request.headers.get('x-correlation-id') ?? randomUUID(),
    });
    if (body) headers.set('Content-Type', 'application/json');
    copyHeader(request.headers, headers, 'idempotency-key');
    copyHeader(request.headers, headers, 'if-match');
    let upstream = await fetch(target, {
      method,
      headers,
      ...(body ? { body } : {}),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (upstream.status === 401) {
      tokenCache.delete(
        `${moduleTenantBindingId(session.context.tenant.id)}:${session.context.user.id}`,
      );
      const freshToken = await currencyToken(
        baseUrl,
        moduleTenantBindingId(session.context.tenant.id),
        session.context.user.id,
      );
      headers.set('Authorization', `Bearer ${freshToken}`);
      upstream = await fetch(target, {
        method,
        headers,
        ...(body ? { body } : {}),
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
    }
    const response = new NextResponse(upstream.body, { status: upstream.status });
    for (const name of ['content-type', 'etag', 'idempotency-replayed', 'x-correlation-id']) {
      const value = upstream.headers.get(name);
      if (value) response.headers.set(name, value);
    }
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Local Currency UAT')) {
      return problem(503, error.message);
    }
    return problem(502, 'The Multi-Currency service is temporarily unavailable.');
  }
}

function configuredCurrencyBaseUrl(): string {
  const configured = process.env.CURRENCY_API_URL?.trim();
  if (!configured) throw new Error('Local Currency UAT requires CURRENCY_API_URL.');
  const url = new URL(configured);
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'Local Currency UAT requires a credential-free loopback CURRENCY_API_URL origin.',
    );
  }
  return url.origin;
}

async function currencyToken(baseUrl: string, tenantId: string, userId: string): Promise<string> {
  const cacheKey = `${tenantId}:${userId}`;
  const now = Math.floor(Date.now() / 1_000);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now + 30) return cached.token;
  const response = await fetch(`${baseUrl}/oidc/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ tenant_id: tenantId, sub: userId }),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (
    !response.ok ||
    !payload ||
    typeof payload !== 'object' ||
    typeof (payload as { access_token?: unknown }).access_token !== 'string'
  ) {
    throw new Error('Currency token exchange failed.');
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
  if (joined === 'v1/setup') return method === 'GET' || method === 'POST';
  if (joined === 'v1/pairs') return method === 'GET';
  if (joined === 'v1/convert' || joined === 'v1/batch-convert') return method === 'POST';
  if (joined === 'v1/ledger') return method === 'GET';
  if (joined === 'v1/preferences') return method === 'GET' || method === 'PUT';
  if (joined === 'v1/hedging') return method === 'GET';
  if (joined === 'v1/revaluation') return method === 'GET';
  return false;
}

function requiredCurrencyPermission(method: string, path: string[]): string {
  const joined = path.join('/');
  if (joined === 'v1/setup' && method === 'POST') return 'currency:*';
  if (joined === 'v1/preferences' && method === 'PUT') return 'currency:*';
  if (joined === 'v1/convert' || joined === 'v1/batch-convert') return 'currency:convert';
  return 'currency:read';
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
