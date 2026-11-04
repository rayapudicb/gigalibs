import { ReferenceSetKeySchema } from '@gigalibs/contracts';
import { NextResponse } from 'next/server';
import {
  authenticatedUpstream,
  authenticationRequired,
  proxyUpstream,
  unavailable,
} from '@/lib/authenticated-upstream';
import { hasPermission } from '@/lib/module-access';
import { verifiedSession } from '@/lib/verified-session';

/** WI-OI-176: member-readable full reference set (entries + provenance), not capped like metadata lookups. */
export async function GET(_request: Request, context: { params: Promise<{ setKey: string }> }) {
  try {
    const session = await verifiedSession(false);
    if (session.response) return session.response;
    if (!hasPermission(session.context.permissions, 'tenant:read')) {
      return NextResponse.json({ title: 'Forbidden', detail: 'tenant:read required.' }, { status: 403 });
    }
    const { setKey } = await context.params;
    const parsed = ReferenceSetKeySchema.safeParse(setKey);
    if (!parsed.success) {
      return NextResponse.json({ detail: 'Unknown reference set.' }, { status: 404 });
    }
    const upstream = await authenticatedUpstream('control', `/api/v1/platform-reference/${parsed.data}`);
    if (!upstream) return authenticationRequired();
    if (!upstream.ok) return proxyUpstream(upstream);
    const body: unknown = await upstream.json().catch(() => null);
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (error) {
    return unavailable(error);
  }
}
