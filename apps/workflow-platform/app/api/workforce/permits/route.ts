import { NextRequest, NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/verified-session';
import { workforceSafetyService } from '@/lib/workforce-safety-service';
import { CreatePermitToWorkV1Schema } from '@gigalibs/contracts';

export const runtime = 'nodejs';

/**
 * GET /api/workforce/permits
 */
export async function GET(request: NextRequest) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) {
    return NextResponse.json({ error: 'Tenant context required.' }, { status: 400 });
  }

  const siteRef = request.nextUrl.searchParams.get('siteRef') || undefined;
  const status = request.nextUrl.searchParams.get('status') || undefined;
  const workOrderId = request.nextUrl.searchParams.get('workOrderId') || undefined;

  try {
    const permits = await workforceSafetyService.listPermitsToWork(
      session.context.tenant.id,
      { siteRef, status, workOrderId }
    );
    return NextResponse.json({ permits, count: permits.length });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to list permits' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workforce/permits
 * Creates a new electronic Permit to Work (ePTW).
 */
export async function POST(request: NextRequest) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) {
    return NextResponse.json({ error: 'Tenant context required.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const parsed = CreatePermitToWorkV1Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid permit payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const permit = await workforceSafetyService.createPermitToWork(
      session.context.tenant.id,
      session.context.user.id,
      parsed.data
    );

    return NextResponse.json(permit, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to create permit' },
      { status: 400 }
    );
  }
}
