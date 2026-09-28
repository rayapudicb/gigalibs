import { NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/verified-session';
import { canUseTenantModule, hasPermission } from '@/lib/module-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) {
    return NextResponse.json({ detail: 'Tenant workspace required.' }, { status: 403 });
  }

  const features = new Set(session.context.tenant.features);
  const permissions = session.context.permissions;

  if (!canUseTenantModule('reports', features, permissions) || !hasPermission(permissions, 'reports:read')) {
    return NextResponse.json({ detail: 'Permission reports:read is required.' }, { status: 403 });
  }

  return NextResponse.json({
    type: 'https://errors.gigalibs.com/reports-contained',
    title: 'Reporting Read-Model Contained',
    status: 503,
    code: 'REPORTS_READ_MODEL_CONTAINED',
    detail: 'Universal reporting read-model is contained pending certified persistent aggregation against PostgreSQL domain services.',
  }, {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
