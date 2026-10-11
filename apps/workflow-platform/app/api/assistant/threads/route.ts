import { verifiedSession } from '@/lib/verified-session';
import { prisma } from '@gigalibs/db';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type ThreadRecord = {
  id: string;
  tenant_id: string;
  owner_user_id: string;
  title: string;
  version: number;
  policy_version: string;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
};

export async function GET() {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  const tenantId = session.context?.tenant?.id;
  const userId = session.context?.user?.id;
  if (!tenantId || !userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Verify published tenant policy
  const policies = await prisma.$queryRawUnsafe<Array<{ status: string; retention_days: number }>>(
    `SELECT status, retention_days FROM gigalibs_assistant.tenant_policies WHERE tenant_id = $1 AND status = 'PUBLISHED'`,
    tenantId
  );
  if (!policies[0]) {
    return NextResponse.json(
      { error: 'Assistant private history requires a published tenant policy.' },
      { status: 503 }
    );
  }

  // Query private threads scoped to this specific user & tenant
  const threads = await prisma.$queryRawUnsafe<ThreadRecord[]>(
    `SELECT id, tenant_id, owner_user_id, title, version, policy_version, expires_at, created_at, updated_at
       FROM gigalibs_assistant.assistant_threads
      WHERE tenant_id = $1 AND owner_user_id = $2 AND expires_at > now()
      ORDER BY created_at DESC, id DESC LIMIT 50`,
    tenantId,
    userId
  );

  return NextResponse.json({
    items: threads.map((t) => ({
      id: t.id,
      title: t.title,
      version: t.version,
      policyVersion: t.policy_version,
      expiresAt: t.expires_at,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    })),
  });
}

export async function POST(request: Request) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  const tenantId = session.context?.tenant?.id;
  const userId = session.context?.user?.id;
  if (!tenantId || !userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const idempotencyKey =
    request.headers.get('idempotency-key') || `thread_${Date.now()}_${randomUUID().slice(0, 8)}`;

  let body: { title?: string } = {};
  try {
    body = await request.json();
  } catch {}

  const title = (body.title || 'Work Order Operational Inquiry').trim().slice(0, 120);

  // Verify published tenant policy
  const policies = await prisma.$queryRawUnsafe<Array<{
    source_manifest_version: string;
    source_checksum: string;
    retention_days: number;
    status: string;
  }>>(
    `SELECT source_manifest_version, source_checksum, retention_days, status
       FROM gigalibs_assistant.tenant_policies
      WHERE tenant_id = $1 AND status = 'PUBLISHED'`,
    tenantId
  );
  if (!policies[0]) {
    return NextResponse.json(
      { error: 'Assistant private history requires a published tenant policy.' },
      { status: 503 }
    );
  }

  const policy = policies[0];
  const threadId = randomUUID();
  const requestSha256 = '0'.repeat(64);

  // Idempotent insertion
  await prisma.$executeRawUnsafe(
    `INSERT INTO gigalibs_assistant.assistant_threads (
       id, tenant_id, owner_user_id, title, idempotency_key, request_sha256,
       policy_version, policy_checksum, classification, expires_at, created_at, updated_at
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, $6, $7, $8, 'TENANT_INTERNAL',
       now() + ($9::int * interval '1 day'), now(), now()
     )
     ON CONFLICT (tenant_id, owner_user_id, idempotency_key) DO NOTHING`,
    threadId,
    tenantId,
    userId,
    title,
    idempotencyKey,
    requestSha256,
    policy.source_manifest_version,
    policy.source_checksum,
    policy.retention_days
  );

  // Retrieve created or existing thread
  const existing = await prisma.$queryRawUnsafe<ThreadRecord[]>(
    `SELECT id, tenant_id, owner_user_id, title, version, policy_version, expires_at, created_at, updated_at
       FROM gigalibs_assistant.assistant_threads
      WHERE tenant_id = $1 AND owner_user_id = $2 AND idempotency_key = $3`,
    tenantId,
    userId,
    idempotencyKey
  );

  const thread = existing[0];
  if (!thread) {
    return NextResponse.json({ error: 'Failed to create thread' }, { status: 500 });
  }

  return NextResponse.json(
    {
      id: thread.id,
      title: thread.title,
      version: thread.version,
      policyVersion: thread.policy_version,
      expiresAt: thread.expires_at,
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
    },
    { status: 201 }
  );
}
