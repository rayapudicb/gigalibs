import { randomUUID } from 'node:crypto';
import { moduleTenantBindingId } from '@/lib/ar-tenant-binding';
import { readBoundedBody } from '@/lib/authenticated-upstream';
import { canUseTenantModule, hasPermission } from '@/lib/module-access';
import { hasSameOrigin } from '@/lib/same-origin';
import { verifiedSession } from '@/lib/verified-session';
import { NextResponse } from 'next/server';

export interface BffProxyOptions {
  moduleKey: string;
  readPermission: string;
  writePermission: string;
  upstreamBaseUrl: string;
  upstreamPathPrefix: string;
  serviceUnavailableMessage: string;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createBffProxy(options: BffProxyOptions) {
  return async function bffProxyHandler(
    request: Request,
    context: { params: Promise<{ path: string[] }> }
  ): Promise<NextResponse> {
    const session = await verifiedSession(true);
    if (session.response) return session.response;
    if (!session.context.tenant) {
      return problem(403, 'Select an active tenant workspace first.');
    }

    const method = request.method.toUpperCase();
    const rawPath = (await context.params).path;

    // Path traversal hardening
    if (rawPath.some((part) => part === '..' || part === '.' || !/^[A-Za-z0-9_:-]{1,100}$/.test(part))) {
      return problem(404, 'Unsupported endpoint route.');
    }

    // Permission and entitlement verification
    const requiredPermission = MUTATING_METHODS.has(method)
      ? options.writePermission
      : options.readPermission;

    if (
      !canUseTenantModule(
        options.moduleKey,
        new Set(session.context.tenant.features),
        session.context.permissions
      ) ||
      !hasPermission(session.context.permissions, requiredPermission)
    ) {
      return problem(403, `Permission ${requiredPermission} or '${options.moduleKey}' entitlement is required.`);
    }

    // CSRF protection on mutations
    if (MUTATING_METHODS.has(method) && !hasSameOrigin(request)) {
      return problem(403, 'Cross-site request rejected.');
    }

    try {
      const body = MUTATING_METHODS.has(method) ? await readBoundedBody(request) : undefined;
      const deterministicTenantId = moduleTenantBindingId(session.context.tenant.id);

      const targetPath = options.upstreamPathPrefix
        ? `${options.upstreamPathPrefix}/${rawPath.map(encodeURIComponent).join('/')}`
        : `/${rawPath.map(encodeURIComponent).join('/')}`;

      const target = new URL(targetPath, options.upstreamBaseUrl);

      const upstreamResponse = await fetch(target.toString(), {
        method,
        headers: {
          'content-type': request.headers.get('content-type') || 'application/json',
          'x-tenant-id': deterministicTenantId,
          'x-user-id': session.context.user.id,
          'x-correlation-id': request.headers.get('x-correlation-id') || randomUUID(),
        },
        body,
        cache: 'no-store',
      });

      const responseBody = await upstreamResponse.text();
      return new NextResponse(responseBody, {
        status: upstreamResponse.status,
        headers: {
          'content-type': upstreamResponse.headers.get('content-type') || 'application/json',
        },
      });
    } catch {
      return problem(502, options.serviceUnavailableMessage);
    }
  };
}

function problem(status: number, detail: string): NextResponse {
  return NextResponse.json(
    {
      type: 'https://gigalibs.com/problems/service-boundary',
      title: status === 403 ? 'Forbidden' : status === 404 ? 'Not Found' : 'Service Unavailable',
      status,
      detail,
    },
    { status, headers: { 'content-type': 'application/problem+json' } }
  );
}
