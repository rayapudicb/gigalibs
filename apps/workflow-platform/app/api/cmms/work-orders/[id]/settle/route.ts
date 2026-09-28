import { NextRequest, NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/verified-session';
import { cmmsLedgerSettlementService } from '@/lib/cmms-ledger-settlement-service';
import { SettleCmmsWorkOrderV1Schema } from '@gigalibs/contracts';

export const runtime = 'nodejs';

/**
 * POST /api/cmms/work-orders/[id]/settle
 * Settles incurred maintenance costs (parts and/or direct labor) into
 * balanced double-entry GAAP General Ledger journal entries.
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
    const rawBody = await request.json().catch(() => ({}));
    const parsed = SettleCmmsWorkOrderV1Schema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid settlement payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const financials = await cmmsLedgerSettlementService.settleWorkOrderCosts(
      session.context.tenant.id,
      id,
      parsed.data
    );

    return NextResponse.json(financials, { status: 200 });
  } catch (error: any) {
    const status = error?.message?.includes('not found') ? 404 : 400;
    return NextResponse.json(
      { error: error?.message || 'Failed to settle work order costs' },
      { status }
    );
  }
}
