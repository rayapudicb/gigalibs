import { NextResponse } from 'next/server';
import { universalRuleKernelStore } from '@/lib/universal-rule-kernel-store';
import { verifiedSession } from '@/lib/verified-session';
import { canUseTenantModule } from '@/lib/module-access';
import { hasSameOrigin } from '@/lib/same-origin';
import { readBoundedBody } from '@/lib/authenticated-upstream';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) {
    return NextResponse.json({ error: 'Active tenant required' }, { status: 403 });
  }
  if (!canUseTenantModule('rule-studio', new Set(session.context.tenant.features), session.context.permissions)) {
    return NextResponse.json({ error: 'Rule Studio module is not enabled for this tenant.' }, { status: 403 });
  }

  const tenantId = session.context.tenant.id;
  const rules = universalRuleKernelStore.getRules(tenantId);
  return NextResponse.json({ success: true, rules });
}

export async function POST(req: Request) {
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

  const rawBody = await readBoundedBody(req);
  try {
    const body = JSON.parse(rawBody);
    const tenantId = session.context.tenant.id;

    if (!body.name || !body.ruleCode || !Array.isArray(body.conditions) || !body.action) {
      return NextResponse.json(
        { success: false, error: 'Missing required rule parameters (name, ruleCode, conditions, action)' },
        { status: 400 },
      );
    }

    const created = universalRuleKernelStore.createRule({
      tenantId,
      ruleCode: body.ruleCode,
      name: body.name,
      description: body.description || '',
      triggerEvent: body.triggerEvent || 'ALL_EVENTS',
      scope: body.scope || 'TENANT_DEFAULT',
      lifecycleStatus: body.lifecycleStatus || 'DRAFT',
      priority: typeof body.priority === 'number' ? body.priority : 100,
      systemLocked: false,
      conditions: body.conditions,
      action: body.action,
    });

    return NextResponse.json({ success: true, rule: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
