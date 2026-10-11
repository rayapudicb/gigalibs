import { verifiedSession } from '@/lib/verified-session';
import { prisma } from '@gigalibs/db';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ threadId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  const tenantId = session.context?.tenant?.id;
  const userId = session.context?.user?.id;
  if (!tenantId || !userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { threadId } = await context.params;

  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    title: string;
    version: number;
    policy_version: string;
    expires_at: Date;
    created_at: Date;
    updated_at: Date;
  }>>(
    `SELECT id, title, version, policy_version, expires_at, created_at, updated_at
       FROM gigalibs_assistant.assistant_threads
      WHERE tenant_id = $1 AND owner_user_id = $2 AND id = $3::uuid AND expires_at > now()`,
    tenantId,
    userId,
    threadId
  );

  const thread = rows[0];
  if (!thread) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
  }

  return NextResponse.json({ thread });
}
