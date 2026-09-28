import { NextRequest, NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/verified-session';
import { formsEngineService } from '@/lib/forms-engine-service';

export const runtime = 'nodejs';

/**
 * GET /api/forms/[id]/submissions
 * Lists submissions for the specified form.
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
    const submissions = await formsEngineService.listSubmissions(
      session.context.tenant.id,
      id
    );
    return NextResponse.json({ submissions, count: submissions.length });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to list submissions' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/forms/[id]/submissions
 * Authenticated submission for Mode A (Operational Rounds, ePTW, Shift Handover).
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
    const result = await formsEngineService.submitForm(
      id,
      {
        formId: id,
        submissionMode: body.submissionMode || 'OPERATIONAL',
        spatialNodeId: body.spatialNodeId,
        equipmentTag: body.equipmentTag,
        clientSubmissionId: body.clientSubmissionId,
        payload: body.payload || {},
        deviceMetadata: body.deviceMetadata,
      },
      {
        submittedBy: session.context.user.id,
        enforceTenantId: session.context.tenant.id,
      }
    );

    return NextResponse.json(result, {
      status: result.status === 'DUPLICATE' ? 200 : 201,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to record form submission' },
      { status: 400 }
    );
  }
}
