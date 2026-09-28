import { NextRequest, NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/verified-session';
import { formsEngineService } from '@/lib/forms-engine-service';
import { MobileBatchSubmitPayloadSchema } from '@gigalibs/contracts';

export const runtime = 'nodejs';

/**
 * POST /api/forms/mobile/batch-submit
 * Mobile-First Batch Ingestion for offline sync queues with clientSubmissionId idempotency.
 */
export async function POST(request: NextRequest) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) {
    return NextResponse.json({ error: 'Tenant context required.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const parsed = MobileBatchSubmitPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid batch submit payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const result = await formsEngineService.mobileBatchSubmit(
      session.context.tenant.id,
      parsed.data.submissions,
      session.context.user.id
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to process batch submissions' },
      { status: 500 }
    );
  }
}
