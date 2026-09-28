import { NextRequest, NextResponse } from 'next/server';
import { formsEngineService } from '@/lib/forms-engine-service';

export const runtime = 'nodejs';

/**
 * GET /api/forms/public/[slug]
 * Public unauthenticated schema fetch for Mode B dynamic URLs (/forms/q/{slug}).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  try {
    const form = await formsEngineService.getPublicFormBySlug(slug);
    if (!form) {
      return NextResponse.json(
        { error: 'Public form not found or inactive.' },
        { status: 404 }
      );
    }

    return NextResponse.json(form);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch public form' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/forms/public/[slug]
 * Public unauthenticated submission for Mode B surveys, applicant intake, supplier audits.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  try {
    const publicForm = await formsEngineService.getPublicFormBySlug(slug);
    if (!publicForm) {
      return NextResponse.json(
        { error: 'Public form not found or inactive.' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ipAddress = forwardedFor ? forwardedFor.split(',')[0].trim() : '0.0.0.0';

    const result = await formsEngineService.submitForm(
      publicForm.id,
      {
        formId: publicForm.id,
        submissionMode: 'PUBLIC',
        clientSubmissionId: body.clientSubmissionId,
        payload: body.payload || {},
        deviceMetadata: body.deviceMetadata,
      },
      {
        submittedBy: body.respondentEmail || 'anonymous:public_url',
        ipAddress,
      }
    );

    return NextResponse.json(
      {
        success: true,
        submissionId: result.id,
        message: publicForm.schemaAst.successMessage || 'Form submitted successfully.',
        status: result.status,
      },
      { status: result.status === 'DUPLICATE' ? 200 : 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to submit public form' },
      { status: 400 }
    );
  }
}
