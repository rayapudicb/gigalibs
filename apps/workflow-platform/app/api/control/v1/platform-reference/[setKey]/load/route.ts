import { ReferenceSetKeySchema } from '@gigalibs/contracts';
import { NextResponse } from 'next/server';
import {
  authenticatedUpstream,
  authenticationRequired,
  proxyUpstream,
  readBoundedBody,
  unavailable,
} from '@/lib/authenticated-upstream';
import { verifiedSession } from '@/lib/verified-session';

function isPlatformOperator(platformRoles: readonly string[]): boolean {
  return platformRoles.some((role) => ['PLATFORM_OWNER', 'PLATFORM_ADMIN'].includes(role));
}

/** WI-OI-176: platform operator load generated reference set (control BFF root). */
export async function POST(request: Request, context: { params: Promise<{ setKey: string }> }) {
  try {
    const session = await verifiedSession(false);
    if (session.response) return session.response;
    if (!isPlatformOperator(session.context.platformRoles)) {
      return NextResponse.json({ detail: 'Platform operator authority is required.' }, { status: 403 });
    }
    const { setKey } = await context.params;
    const parsed = ReferenceSetKeySchema.safeParse(setKey);
    if (!parsed.success) return NextResponse.json({ detail: 'Unknown reference set.' }, { status: 404 });
    const body = JSON.parse(await readBoundedBody(request)) as { reason?: unknown };
    const upstream = await authenticatedUpstream(
      'control',
      `/api/v1/platform-reference/${parsed.data}/load-generated`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    if (!upstream) return authenticationRequired();
    if (!upstream.ok) return proxyUpstream(upstream);
    return NextResponse.json(await upstream.json());
  } catch (error) {
    return unavailable(error);
  }
}
