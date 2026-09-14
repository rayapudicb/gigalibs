import { NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/verified-session';
import { canUseTenantModule, hasPermission } from '@/lib/module-access';
import { reportsEngine, type ReportCategory } from '@/lib/reports-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) {
    return NextResponse.json({ detail: 'Tenant workspace required.' }, { status: 403 });
  }

  const tenantId = session.context.tenant.id;
  const features = new Set(session.context.tenant.features);
  const permissions = session.context.permissions;

  if (!canUseTenantModule('reports', features, permissions) || !hasPermission(permissions, 'reports:read')) {
    return NextResponse.json({ detail: 'Permission reports:read is required.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const reportId = (searchParams.get('reportId') || 'GL_TRIAL_BALANCE') as ReportCategory;
  const fiscalPeriod = searchParams.get('fiscalPeriod') || 'Q3 2026';
  const currency = searchParams.get('currency') || 'USD';

  const report = reportsEngine.generateReport(tenantId, reportId, fiscalPeriod, currency);

  return NextResponse.json({
    success: true,
    report,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
