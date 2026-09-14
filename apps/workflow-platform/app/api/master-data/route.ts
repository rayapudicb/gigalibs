import { NextRequest, NextResponse } from 'next/server';
import { masterDataStore, type MasterDataDomain, type MasterDataScope } from '@/lib/master-data-store';
import { verifiedSession } from '@/lib/verified-session';
import { canUseTenantModule } from '@/lib/module-access';
import { hasSameOrigin } from '@/lib/same-origin';
import { readBoundedBody } from '@/lib/authenticated-upstream';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) {
    return NextResponse.json({ error: 'Active tenant required' }, { status: 403 });
  }

  if (
    !canUseTenantModule(
      'master-data',
      new Set(session.context.tenant.features),
      session.context.permissions,
    )
  ) {
    return NextResponse.json(
      { error: 'Master Data Governance module is not enabled for this tenant.' },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const entityKey = searchParams.get('entityKey') || undefined;
  const domain = (searchParams.get('domain') as MasterDataDomain) || undefined;
  const scope = (searchParams.get('scope') as MasterDataScope) || undefined;

  const tenantId = session.context.tenant.id;
  const records = masterDataStore.listRecords(tenantId, {
    entityKey,
    domain,
    scope,
  });

  return NextResponse.json({
    tenantId,
    total: records.length,
    records,
    governanceTier: 'ENTERPRISE_3_TIER_MDM',
    contractVersion: '1.0',
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) {
    return NextResponse.json({ error: 'Active tenant required' }, { status: 403 });
  }

  if (
    !canUseTenantModule(
      'master-data',
      new Set(session.context.tenant.features),
      session.context.permissions,
    )
  ) {
    return NextResponse.json(
      { error: 'Master Data Governance module is not enabled for this tenant.' },
      { status: 403 },
    );
  }

  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin mutation forbidden' }, { status: 403 });
  }

  const rawBody = await readBoundedBody(request);

  try {
    const payload = JSON.parse(rawBody);
    const { entityKey, domain, code, name, scope, recordPayload } = payload;

    if (!entityKey || !domain || !code || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: entityKey, domain, code, name' },
        { status: 400 },
      );
    }

    const tenantId = session.context.tenant.id;
    const isPlatformAdmin = (session.context.platformRoles?.length ?? 0) > 0;

    const created = masterDataStore.createRecord(
      tenantId,
      {
        entityKey,
        domain,
        code,
        name,
        scope,
        payload: recordPayload || {},
      },
      isPlatformAdmin,
    );

    return NextResponse.json(
      {
        message: 'Master data record created successfully',
        record: created,
      },
      { status: 201 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to process master data record', details: err?.message || String(err) },
      { status: 400 },
    );
  }
}
