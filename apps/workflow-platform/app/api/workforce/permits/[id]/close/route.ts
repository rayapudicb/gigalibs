import { NextRequest, NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/verified-session';
import { workforceSafetyService } from '@/lib/workforce-safety-service';

export const runtime = 'nodejs';

/**
 * POST /api/workforce/permits/[id]/close
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
    const permit = await workforceSafetyService.closePermitToWork(
      session.context.tenant.id,
      id
    );
    return NextResponse.json(permit, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to close permit' },
      { status: 400 }
    );
  }
}
