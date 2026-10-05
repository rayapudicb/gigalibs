import { NextResponse } from 'next/server';
import { RuleNotFoundError, universalRuleKernelStore } from '@/lib/universal-rule-kernel-store';
import { verifiedSession } from '@/lib/verified-session';
import { canUseTenantModule, hasPermission } from '@/lib/module-access';
import { hasSameOrigin } from '@/lib/same-origin';
import { readBoundedBody } from '@/lib/authenticated-upstream';

export const runtime = 'nodejs';

const RULES_WRITE_PERMISSION = 'rules:write';

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
  // WI-OI-120e (U3.2): reading Rule Studio is not enough to change a rule.
  if (!hasPermission(session.context.permissions, RULES_WRITE_PERMISSION)) {
    return NextResponse.json({ error: 'Changing rules requires the rules:write permission.' }, { status: 403 });
  }

  // WI-OI-120e (U3.2, P0-04): the rule must belong to the signed-in tenant; the store ignores any tenant, ID or
  // statistics in the body.
  const tenantId = session.context.tenant.id;
  const { ruleId } = await props.params;
  const rawBody = await readBoundedBody(req);
  try {
    const body = JSON.parse(rawBody);

    if (body.action === 'TOGGLE_HIJACK') {
      const updated = universalRuleKernelStore.toggleHijack(ruleId, tenantId, body.reason || 'Manual emergency kill-switch');
      return NextResponse.json({ success: true, rule: updated });
    }

    const updated = universalRuleKernelStore.updateRule(ruleId, tenantId, body);
    return NextResponse.json({ success: true, rule: updated });
  } catch (error: any) {
    if (error instanceof RuleNotFoundError) {
      return NextResponse.json({ success: false, error: 'Rule not found' }, { status: 404 });
    }
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
  // WI-OI-120e (U3.2): reading Rule Studio is not enough to change a rule.
  if (!hasPermission(session.context.permissions, RULES_WRITE_PERMISSION)) {
    return NextResponse.json({ error: 'Changing rules requires the rules:write permission.' }, { status: 403 });
  }

  const { ruleId } = await props.params;
  try {
    const deleted = universalRuleKernelStore.deleteRule(ruleId, session.context.tenant.id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Rule not found' }, { status: 404 });
    }
  } catch (error: any) {
    if (error instanceof RuleNotFoundError) {
      return NextResponse.json({ success: false, error: 'Rule not found' }, { status: 404 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ success: true, message: `Rule ${ruleId} deleted successfully` });
}
