import { NextResponse } from 'next/server';
import { eventFabricQueueStore } from '@/lib/event-fabric-queue';
import { verifiedSession } from '@/lib/verified-session';
import { hasSameOrigin } from '@/lib/same-origin';

export const runtime = 'nodejs';

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

  const { eventId, repairedPayload } = body;
  if (!eventId) {
    return NextResponse.json({ error: 'Missing required parameter: eventId' }, { status: 400 });
  }

  const result = eventFabricQueueStore.replayEvent(eventId, repairedPayload);
  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: 404 });
  }

  return NextResponse.json({ success: true, event: result.event, message: result.message }, { status: 200 });
}
