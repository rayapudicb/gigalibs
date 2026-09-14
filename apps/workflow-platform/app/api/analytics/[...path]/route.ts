import { randomUUID } from 'node:crypto';
import { moduleTenantBindingId } from '@/lib/ar-tenant-binding';
import { readBoundedBody } from '@/lib/authenticated-upstream';
import { canUseTenantModule, hasPermission } from '@/lib/module-access';
import { hasSameOrigin } from '@/lib/same-origin';
import { verifiedSession } from '@/lib/verified-session';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ path: string[] }> };
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export const GET = (request: Request, context: RouteContext) => proxyAnalytics(request, context);
export const POST = (request: Request, context: RouteContext) => proxyAnalytics(request, context);

async function proxyAnalytics(request: Request, context: RouteContext): Promise<NextResponse> {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) return problem(403, 'Select an active tenant workspace first.');

  const method = request.method.toUpperCase();
  const rawPath = (await context.params).path;
  const path = rawPath[0] === 'v1' ? rawPath : ['v1', ...rawPath];

  if (!isAllowedPath(method, path)) return problem(404, 'Unsupported Analytics route.');
  const required = requiredAnalyticsPermission(method, path);
  if (
    !canUseTenantModule(
      'analytics-studio',
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
    const baseUrl = configuredAnalyticsBaseUrl();
    const body = MUTATING_METHODS.has(method) ? await readBoundedBody(request) : undefined;
    const token = await analyticsToken(
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
      const freshToken = await analyticsToken(
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
    if (error instanceof Error && error.message.startsWith('Local Analytics UAT')) {
      return problem(503, error.message);
    }
    return problem(502, 'The Analytics service is temporarily unavailable.');
  }
}

function configuredAnalyticsBaseUrl(): string {
  const configured = process.env.ANALYTICS_API_URL?.trim();
  if (!configured) throw new Error('Local Analytics UAT requires ANALYTICS_API_URL.');
  const url = new URL(configured);
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'Local Analytics UAT requires a credential-free loopback ANALYTICS_API_URL origin.',
    );
  }
  return url.origin;
}

async function analyticsToken(baseUrl: string, tenantId: string, userId: string): Promise<string> {
  const cacheKey = `${tenantId}:${userId}`;
  const now = Math.floor(Date.now() / 1_000);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now + 30) return cached.token;
  const response = await fetch(`${baseUrl}/oidc/dev/token?tenantId=${encodeURIComponent(tenantId)}&sub=${encodeURIComponent(userId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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
    throw new Error('Analytics token exchange failed.');
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
  if (joined === 'v1/setup/status') return method === 'GET';
  if (joined === 'v1/setup') return method === 'POST';
  if (joined === 'v1/metrics/summary') return method === 'GET';
  if (joined === 'v1/metrics/timeseries') return method === 'GET';
  if (joined === 'v1/metrics/charts') return method === 'GET';
  if (/^v1\/metrics\/charts\/[A-Za-z0-9._:-]+$/.test(joined)) return method === 'GET';
  if (/^v1\/metrics\/lineage\/[A-Za-z0-9._:-]+$/.test(joined)) return method === 'GET';
  if (joined === 'v1/actions') return method === 'GET' || method === 'POST';
  return false;
}

function requiredAnalyticsPermission(method: string, path: string[]): string {
  const joined = path.join('/');
  if (joined === 'v1/setup' && method === 'POST') return 'analytics:*';
  if (method === 'POST') return 'analytics:action';
  return 'analytics:read';
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
