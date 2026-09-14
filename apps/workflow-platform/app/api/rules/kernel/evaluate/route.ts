import { NextResponse } from 'next/server';
import { universalRuleKernelStore } from '@/lib/universal-rule-kernel-store';
import { verifiedSession } from '@/lib/verified-session';
import { canUseTenantModule } from '@/lib/module-access';
import { hasSameOrigin } from '@/lib/same-origin';
import { readBoundedBody } from '@/lib/authenticated-upstream';

export const runtime = 'nodejs';

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
    const triggerEvent = body.triggerEvent || 'API_GATEWAY_INGRESS';
    const payload = body.payload !== undefined ? body.payload : body;

    const verdict = universalRuleKernelStore.evaluate(tenantId, triggerEvent, payload);
    return NextResponse.json({ success: true, verdict });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
