import { NextResponse } from 'next/server';
import { sagaOrchestratorStore } from '@/lib/saga-orchestrator';
import { verifiedSession } from '@/lib/verified-session';
import { hasSameOrigin } from '@/lib/same-origin';
import type { SovereignTenantId } from '@/lib/tenant-ingestion-store';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<NextResponse> {
  const session = await verifiedSession(false);
  if (session.response) return session.response;

  const url = new URL(request.url);
  const sagaId = url.searchParams.get('sagaId');
  const tenantIdParam = url.searchParams.get('tenantId') as SovereignTenantId | null;
  const tenantId = tenantIdParam || (session.context.tenant?.slug as SovereignTenantId) || undefined;

  if (sagaId) {
    const saga = sagaOrchestratorStore.getSaga(sagaId);
    if (!saga) {
      return NextResponse.json({ error: 'Saga instance not found' }, { status: 404 });
    }
    return NextResponse.json({ saga });
  }

  const sagas = sagaOrchestratorStore.getSagas(tenantId);
  return NextResponse.json({ sagas, count: sagas.length });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await verifiedSession(false);
  if (session.response) return session.response;

  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-site request rejected' }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const { sagaType, payload = {}, failAtStep, tenantId: bodyTenantId } = body;
  const tenantId = (bodyTenantId || session.context.tenant?.slug || 'defense') as SovereignTenantId;

  if (!sagaType) {
    return NextResponse.json({ error: 'Missing required parameter: sagaType' }, { status: 400 });
  }

  const validTypes = ['DISPUTE_ESCROW_SETTLEMENT', 'GRID_CONTINGENCY_FAILOVER', 'TREASURY_RTGS_SETTLEMENT'];
  if (!validTypes.includes(sagaType)) {
    return NextResponse.json(
      { error: `Invalid sagaType. Expected one of: ${validTypes.join(', ')}` },
      { status: 400 },
    );
  }

  const instance = sagaOrchestratorStore.executeSaga(tenantId, sagaType, payload, failAtStep);
  return NextResponse.json({ saga: instance }, { status: 201 });
}
