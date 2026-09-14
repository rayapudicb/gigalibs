import { NextResponse } from 'next/server';
import { verifiedSession } from './verified-session';

// WI-OI-013 containment: these capabilities lack a verified tenant-scoped,
// persistent implementation. Authentication never enables prototype execution.
export async function unavailableCapability() {
  const session = await verifiedSession();
  if (session.response) return session.response;
  if (!session.context.tenant) return NextResponse.json(
    { detail: 'Select an active workspace.', code: 'TENANT_REQUIRED' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );
  return NextResponse.json({
    code: 'CAPABILITY_UNAVAILABLE',
    detail: 'This capability is unavailable. No business action has been performed.',
  }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
