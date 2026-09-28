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

export const GET = (request: Request, context: RouteContext) => proxyMarketplace(request, context);
export const POST = (request: Request, context: RouteContext) => proxyMarketplace(request, context);
export const PATCH = (request: Request, context: RouteContext) => proxyMarketplace(request, context);
export const PUT = (request: Request, context: RouteContext) => proxyMarketplace(request, context);
export const DELETE = (request: Request, context: RouteContext) => proxyMarketplace(request, context);

async function proxyMarketplace(request: Request, context: RouteContext): Promise<NextResponse> {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) return problem(403, 'Select an active tenant workspace first.');

  const method = request.method.toUpperCase();
  const rawPath = (await context.params).path;

  // Path traversal and character hardening
  if (rawPath.some((part) => part === '..' || part === '.' || !/^[A-Za-z0-9_:-]{1,100}$/.test(part))) {
    return problem(404, 'Unsupported Marketplace route.');
  }

  const path = rawPath[0] === 'v1' ? rawPath : ['v1', ...rawPath];

  // Tenant module entitlement & permissions check
  const requiredPermission = MUTATING_METHODS.has(method) ? 'marketplace:write' : 'marketplace:read';
  if (
    !canUseTenantModule(
      'module-marketplace',
      new Set(session.context.tenant.features),
      session.context.permissions,
    ) ||
    !hasPermission(session.context.permissions, requiredPermission)
  ) {
    return problem(403, `Permission ${requiredPermission} or 'module-marketplace' entitlement is required.`);
  }

  // Cross-site request forgery protection for mutations
  if (MUTATING_METHODS.has(method) && !hasSameOrigin(request)) {
    return problem(403, 'Cross-site request rejected.');
  }

  try {
    const baseUrl = configuredMarketplaceBaseUrl();
    const body = MUTATING_METHODS.has(method) ? await readBoundedBody(request) : undefined;
    const deterministicTenantId = moduleTenantBindingId(session.context.tenant.id);

    const target = new URL(`/${path.map(encodeURIComponent).join('/')}`, baseUrl);
    target.search = new URL(request.url).search;

    const headers = new Headers({
      Accept: 'application/json, application/problem+json',
      'x-tenant-id': deterministicTenantId,
      'x-user-id': session.context.user.id,
      'X-Correlation-Id': request.headers.get('x-correlation-id') ?? randomUUID(),
    });
    const serviceToken = configuredPlatformServiceToken();
    if (serviceToken) headers.set('x-gigalibs-service-token', serviceToken);

    if (body) headers.set('Content-Type', 'application/json');

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
    if (error instanceof Error && error.message.includes('MARKETPLACE_API_URL')) {
      return problem(503, error.message);
    }
    return problem(502, 'The Module Marketplace service is temporarily unavailable.');
  }
}

function configuredMarketplaceBaseUrl(): string {
  const configured = process.env.MARKETPLACE_API_URL?.trim() || process.env.PLATFORM_RBAC_API_URL?.trim();
  if (configured) {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('MARKETPLACE_API_URL must use HTTP or HTTPS.');
    }
    return configured.replace(/\/$/, '');
  }
  return 'http://127.0.0.1:4300';
}

function configuredPlatformServiceToken(): string | null {
  const configured = process.env.PLATFORM_RBAC_SERVICE_TOKEN?.trim();
  if (configured) {
    if (Buffer.byteLength(configured, 'utf8') < 32) {
      throw new Error('PLATFORM_RBAC_SERVICE_TOKEN must contain at least 32 bytes.');
    }
    return configured;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PLATFORM_RBAC_SERVICE_TOKEN must be configured in production.');
  }
  return null;
}

function problem(status: number, title: string): NextResponse {
  return NextResponse.json(
    { type: 'about:blank', title, status, correlationId: randomUUID() },
    { status, headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' } },
  );
}
