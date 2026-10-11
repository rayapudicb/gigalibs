import { verifiedSession } from '@/lib/verified-session';
import { prisma } from '@gigalibs/db';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  const tenantId = session.context?.tenant?.id;
  if (!tenantId) return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });

  const rows = await prisma.$queryRawUnsafe<Array<{
    tenant_id: string;
    source_manifest_version: string;
    source_checksum: string;
    retention_days: number;
    status: string;
    published_at: Date;
  }>>(
    `SELECT tenant_id, source_manifest_version, source_checksum, retention_days, status, published_at
       FROM gigalibs_assistant.tenant_policies
      WHERE tenant_id = $1`,
    tenantId
  );

  const policy = rows[0] || null;
  return NextResponse.json({ policy });
}

export async function POST(request: Request) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  const tenantId = session.context?.tenant?.id;
  if (!tenantId) return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });

  let body: { retentionDays?: number; enabled?: boolean } = {};
  try {
    body = await request.json();
  } catch {}

  const retentionDays =
    typeof body.retentionDays === 'number' && body.retentionDays >= 1 && body.retentionDays <= 365
      ? body.retentionDays
      : 30;
  const status = body.enabled === false ? 'DISABLED' : 'PUBLISHED';
  const checksum = '0'.repeat(64);

  await prisma.$executeRawUnsafe(
    `INSERT INTO gigalibs_assistant.tenant_policies (
       tenant_id, source_manifest_version, source_checksum, retention_days, status, published_at, updated_at
     ) VALUES (
       $1, 'v1', $2, $3, $4, now(), now()
     )
     ON CONFLICT (tenant_id) DO UPDATE SET
       retention_days = EXCLUDED.retention_days,
       status = EXCLUDED.status,
       updated_at = now()`,
    tenantId,
    checksum,
    retentionDays,
    status
  );

  return NextResponse.json({
    policy: {
      tenantId,
      retentionDays,
      status,
      version: 'v1',
    },
  });
}
