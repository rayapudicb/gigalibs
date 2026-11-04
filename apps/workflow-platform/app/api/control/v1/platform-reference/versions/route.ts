import { NextResponse } from 'next/server';
import { authenticatedUpstream, authenticationRequired, proxyUpstream, unavailable } from '@/lib/authenticated-upstream';
import { verifiedSession } from '@/lib/verified-session';

function isPlatformOperator(platformRoles: readonly string[]): boolean {
  return platformRoles.some((role) =>
    ['PLATFORM_OWNER', 'PLATFORM_ADMIN', 'PLATFORM_AUDITOR'].includes(role),
  );
}

/** WI-OI-176: platform operator version history (control BFF root, not WI-OI-013 disabled stub). */
export async function GET(request: Request) {
  try {
    const session = await verifiedSession(false);
    if (session.response) return session.response;
    if (!isPlatformOperator(session.context.platformRoles)) {
      return NextResponse.json({ detail: 'Platform operator authority is required.' }, { status: 403 });
    }
    const setKey = new URL(request.url).searchParams.get('setKey');
    const path = setKey
      ? `/api/v1/platform-reference/versions?setKey=${encodeURIComponent(setKey)}`
      : '/api/v1/platform-reference/versions';
    const upstream = await authenticatedUpstream('control', path);
    if (!upstream) return authenticationRequired();
    if (!upstream.ok) return proxyUpstream(upstream);
    return NextResponse.json(await upstream.json());
  } catch (error) {
    return unavailable(error);
  }
}
