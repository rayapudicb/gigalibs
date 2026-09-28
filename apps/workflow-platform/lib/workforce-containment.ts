import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { canUseTenantModule } from '@/lib/module-access';
import { verifiedSession } from '@/lib/verified-session';

export interface WorkforceRouteContext {
  readonly params: Promise<{ readonly path: readonly string[] }>;
}

export async function containedWorkforceResponse(
  context: WorkforceRouteContext,
): Promise<NextResponse> {
  const session = await verifiedSession(true);
  if (session.response) return session.response;

  const tenant = session.context.tenant;
  if (!tenant) {
    return problem(403, 'WORKFORCE_TENANT_REQUIRED', 'Select an active tenant workspace first.');
  }

  const pathSegments = (await context.params).path;
  if (
    pathSegments.some(
      (part) => part === '..' || part === '.' || !/^[A-Za-z0-9_:-]{1,100}$/.test(part),
    )
  ) {
    return problem(404, 'WORKFORCE_ROUTE_UNSUPPORTED', 'Unsupported Workforce route.');
  }

  const hasPermissionAndFeature = canUseTenantModule(
    'gigaops',
    new Set(tenant.features),
    session.context.permissions,
  );
  const hasEntitlement = tenant.entitlements.some(
    (entitlement) => entitlement.moduleKey === 'gigaops' && entitlement.status === 'ENABLED',
  );

  if (!hasPermissionAndFeature || !hasEntitlement) {
    return problem(
      403,
      'WORKFORCE_ACCESS_DENIED',
      'GigaOps Workforce is not enabled for this tenant or the required permission is missing.',
    );
  }

  return problem(
    503,
    'WORKFORCE_RUNTIME_CONTAINED',
    'The canonical GigaOps Workforce runtime is contained until WI-OI-060 certification completes.',
  );
}

function problem(status: number, code: string, detail: string): NextResponse {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/problem+json',
  });
  if (status === 503) headers.set('Retry-After', '60');

  return NextResponse.json(
    {
      type: 'https://gigalibs.com/problems/workforce-runtime',
      title:
        status === 403
          ? 'Forbidden'
          : status === 404
            ? 'Not Found'
            : 'Service Unavailable',
      status,
      code,
      detail,
      correlationId: randomUUID(),
    },
    { status, headers },
  );
}
