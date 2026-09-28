import { NextRequest, NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/verified-session';
import { telemetryBridgeService } from '@/lib/telemetry-bridge-service';

export const runtime = 'nodejs';

/**
 * GET /api/telemetry/nodes/[nodeId]/live
 * Mobile-First live telemetry & prefill inspection resolver.
 * Called when a field technician scans a physical QR code on an asset or spatial checkpoint.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ nodeId: string }> }
) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) {
    return NextResponse.json({ error: 'Tenant context required.' }, { status: 400 });
  }

  const { nodeId } = await context.params;

  try {
    const data = await telemetryBridgeService.getMobileNodeTelemetry(
      session.context.tenant.id,
      nodeId
    );
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch live telemetry' },
      { status: 500 }
    );
  }
}
