import { NextRequest, NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/verified-session';
import { workforceSafetyService } from '@/lib/workforce-safety-service';
import { CreateShiftHandoverV1Schema } from '@gigalibs/contracts';

export const runtime = 'nodejs';

/**
 * GET /api/workforce/handovers
 */
export async function GET(request: NextRequest) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) {
    return NextResponse.json({ error: 'Tenant context required.' }, { status: 400 });
  }

  const siteRef = request.nextUrl.searchParams.get('siteRef') || undefined;

  try {
    const handovers = await workforceSafetyService.listShiftHandovers(
      session.context.tenant.id,
      siteRef
    );
    return NextResponse.json({ handovers, count: handovers.length });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to list shift handovers' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workforce/handovers
 * Outgoing shift lead initiates a structured two-party handover.
 */
export async function POST(request: NextRequest) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) {
    return NextResponse.json({ error: 'Tenant context required.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const parsed = CreateShiftHandoverV1Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid shift handover payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const handover = await workforceSafetyService.createShiftHandover(
      session.context.tenant.id,
      session.context.user.id,
      parsed.data
    );

    return NextResponse.json(handover, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to initiate shift handover' },
      { status: 400 }
    );
  }
}
