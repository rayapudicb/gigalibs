import { NextResponse } from 'next/server';
import { universalRuleKernelStore } from '@/lib/universal-rule-kernel-store';
import { verifiedSession } from '@/lib/verified-session';
import { canUseTenantModule } from '@/lib/module-access';
import { hasSameOrigin } from '@/lib/same-origin';
import { readBoundedBody } from '@/lib/authenticated-upstream';

export const runtime = 'nodejs';

export async function PATCH(
  req: Request,
  props: { params: Promise<{ ruleId: string }> }
) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) {
    return NextResponse.json({ error: 'Active tenant required' }, { status: 403 });
  }
  if (!canUseTenantModule('rule-studio', new Set(session.context.tenant.features), session.context.permissions)) {
    return NextResponse.json({ error: 'Rule Studio module is not enabled for this tenant.' }, { status: 403 });
  }
  if (!hasSameOrigin(req)) {
    return NextResponse.json({ error: 'Cross-origin mutation forbidden' }, { status: 403 });
  }

  const { ruleId } = await props.params;
  const rawBody = await readBoundedBody(req);
  try {
    const body = JSON.parse(rawBody);

    if (body.action === 'TOGGLE_HIJACK') {
      const updated = universalRuleKernelStore.toggleHijack(ruleId, body.reason || 'Manual emergency kill-switch');
      return NextResponse.json({ success: true, rule: updated });
    }

    const updated = universalRuleKernelStore.updateRule(ruleId, body);
    return NextResponse.json({ success: true, rule: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ ruleId: string }> }
) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) {
    return NextResponse.json({ error: 'Active tenant required' }, { status: 403 });
  }
  if (!canUseTenantModule('rule-studio', new Set(session.context.tenant.features), session.context.permissions)) {
    return NextResponse.json({ error: 'Rule Studio module is not enabled for this tenant.' }, { status: 403 });
  }
  if (!hasSameOrigin(req)) {
    return NextResponse.json({ error: 'Cross-origin mutation forbidden' }, { status: 403 });
  }

  const { ruleId } = await props.params;
  const deleted = universalRuleKernelStore.deleteRule(ruleId);
  if (!deleted) {
    return NextResponse.json({ success: false, error: 'Rule not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, message: `Rule ${ruleId} deleted successfully` });
}
