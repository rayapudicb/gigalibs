import { NextRequest, NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/verified-session';
import { formsEngineService } from '@/lib/forms-engine-service';

export const runtime = 'nodejs';

/**
 * GET /api/forms
 * Lists all forms for the current authenticated tenant.
 */
export async function GET(request: NextRequest) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) {
    return NextResponse.json({ error: 'Tenant context required.' }, { status: 400 });
  }

  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('mode') || undefined;
  const status = searchParams.get('status') || undefined;
  const spatialNodeId = searchParams.get('spatialNodeId') || undefined;

  try {
    const forms = await formsEngineService.listForms(session.context.tenant.id, {
      mode,
      status,
      spatialNodeId,
    });
    return NextResponse.json({ forms, count: forms.length });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to list forms' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/forms
 * Creates a new dynamic form schema.
 */
export async function POST(request: NextRequest) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) {
    return NextResponse.json({ error: 'Tenant context required.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const form = await formsEngineService.createForm(session.context.tenant.id, body);
    return NextResponse.json(form, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to create form' },
      { status: 400 }
    );
  }
}
