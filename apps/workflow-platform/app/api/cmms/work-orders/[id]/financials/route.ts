import { NextRequest, NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/verified-session';
import { cmmsLedgerSettlementService } from '@/lib/cmms-ledger-settlement-service';

export const runtime = 'nodejs';

/**
 * GET /api/cmms/work-orders/[id]/financials
 * Returns comprehensive cost breakdown, labor hours, parts consumption,
 * settlement status, and linked GAAP General Ledger journal entries.
 */
export async function GET(
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
    const financials = await cmmsLedgerSettlementService.getWorkOrderFinancials(
      session.context.tenant.id,
      id
    );
    return NextResponse.json(financials);
  } catch (error: any) {
    const status = error?.message?.includes('not found') ? 404 : 500;
    return NextResponse.json(
      { error: error?.message || 'Failed to retrieve work order financials' },
      { status }
    );
  }
}
