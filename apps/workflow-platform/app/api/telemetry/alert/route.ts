import { NextRequest, NextResponse } from 'next/server';
import { ThingsBoardWebhookAlertSchema } from '@gigalibs/contracts';
import { telemetryBridgeService } from '@/lib/telemetry-bridge-service';

export const runtime = 'nodejs';

/**
 * POST /api/telemetry/alert
 * Inbound webhook receiver for self-hosted ThingsBoard Community Edition rule nodes.
 * Evaluates threshold breaches and triggers automated Condition-Based Maintenance (CBM).
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId =
      request.headers.get('x-tenant-id') ||
      request.nextUrl.searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant context header (x-tenant-id) or query parameter required.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = ThingsBoardWebhookAlertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid ThingsBoard alert payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const result = await telemetryBridgeService.handleThingsBoardAlert(
      tenantId,
      parsed.data
    );

    return NextResponse.json(result, {
      status: result.status === 'CBM_WORK_ORDER_CREATED' ? 201 : 200,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to process ThingsBoard alert' },
      { status: 500 }
    );
  }
}
