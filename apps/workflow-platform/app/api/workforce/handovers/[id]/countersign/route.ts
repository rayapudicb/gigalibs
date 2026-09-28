import { NextRequest, NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/verified-session';
import { workforceSafetyService } from '@/lib/workforce-safety-service';
import { CountersignShiftHandoverV1Schema } from '@gigalibs/contracts';

export const runtime = 'nodejs';

/**
 * POST /api/workforce/handovers/[id]/countersign
 * Oncoming shift lead reviews and countersigns the shift handover.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) {
    return NextResponse.json({ error: 'Tenant context required.' }, { status: 400 });
  }

  const { id } = await context.params;

  try {
    const body = await request.json();
    const parsed = CountersignShiftHandoverV1Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid countersign payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const handover = await workforceSafetyService.countersignShiftHandover(
      session.context.tenant.id,
      id,
      session.context.user.id,
      parsed.data
    );

    return NextResponse.json(handover, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to countersign shift handover' },
      { status: 400 }
    );
  }
}
