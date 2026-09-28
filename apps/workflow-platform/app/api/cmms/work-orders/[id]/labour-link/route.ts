import { NextRequest, NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/verified-session';
import { cmmsLedgerSettlementService } from '@/lib/cmms-ledger-settlement-service';
import { LinkCmmsLabourToBookingV1Schema } from '@gigalibs/contracts';

export const runtime = 'nodejs';

/**
 * POST /api/cmms/work-orders/[id]/labour-link
 * Links logged CMMS work order labour to a specific Workforce resource booking.
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
    const rawBody = await request.json();
    const parsed = LinkCmmsLabourToBookingV1Schema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid link payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const result = await cmmsLedgerSettlementService.linkLabourToBooking(
      session.context.tenant.id,
      id,
      parsed.data.labourId,
      parsed.data.bookingId
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to link labour to booking' },
      { status: 400 }
    );
  }
}
