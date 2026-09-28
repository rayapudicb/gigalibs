import { NextRequest, NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/verified-session';
import { formsEngineService } from '@/lib/forms-engine-service';

export const runtime = 'nodejs';

/**
 * GET /api/forms/[id]
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
    const form = await formsEngineService.getFormById(session.context.tenant.id, id);
    if (!form) {
      return NextResponse.json({ error: 'Form not found.' }, { status: 404 });
    }
    return NextResponse.json(form);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch form' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/forms/[id]
 */
export async function PATCH(
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
    await formsEngineService.updateForm(session.context.tenant.id, id, body);
    const updated = await formsEngineService.getFormById(session.context.tenant.id, id);
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update form' },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/forms/[id]
 */
export async function DELETE(
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
    await formsEngineService.deleteForm(session.context.tenant.id, id);
    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to delete form' },
      { status: 500 }
    );
  }
}
