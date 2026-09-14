import { NextResponse } from 'next/server';
import { eventFabricQueueStore } from '@/lib/event-fabric-queue';
import { verifiedSession } from '@/lib/verified-session';
import { hasSameOrigin } from '@/lib/same-origin';
import type { SovereignTenantId } from '@/lib/tenant-ingestion-store';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<NextResponse> {
  const session = await verifiedSession(false);
  if (session.response) return session.response;

  const url = new URL(request.url);
  const eventId = url.searchParams.get('eventId');
  const tenantIdParam = url.searchParams.get('tenantId') as SovereignTenantId | null;
  const tenantId = tenantIdParam || (session.context.tenant?.slug as SovereignTenantId) || undefined;

  if (eventId) {
    const event = eventFabricQueueStore.getEvent(eventId);
    if (!event) {
      return NextResponse.json({ error: 'Queued event not found' }, { status: 404 });
    }
    return NextResponse.json({ event });
  }

  const items = eventFabricQueueStore.getEvents({ tenantId });
  const stats = eventFabricQueueStore.getStats();

  return NextResponse.json({ items, stats, count: items.length });
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

  const { source, type, data = {}, subject, tenantId: bodyTenantId } = body;
  const tenantId = (bodyTenantId || session.context.tenant?.slug || 'defense') as SovereignTenantId;

  if (!source || !type) {
    return NextResponse.json({ error: 'Missing required parameters: source and type' }, { status: 400 });
  }

  const queued = eventFabricQueueStore.enqueueEvent(tenantId, source, type, data, subject);
  return NextResponse.json({ event: queued }, { status: 201 });
}
