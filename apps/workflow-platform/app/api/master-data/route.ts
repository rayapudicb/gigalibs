import { NextRequest, NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/verified-session';
import { canUseTenantModule, hasPermission } from '@/lib/module-access';
import { hasSameOrigin } from '@/lib/same-origin';
import {
  masterDataStore,
  type MasterDataDomain,
  type MasterDataScope,
  type BaseMasterRecord,
} from '@/lib/master-data-store';
import {
  generateEntityCsvTemplate,
  validateMasterDataImport,
  MASTER_DATA_TEMPLATE_SPECS,
} from '@gigalibs/contracts';

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

  const url = new URL(request.url);
  const { searchParams } = url;
  const action = searchParams.get('action');
  const entityKey = searchParams.get('entityKey');

  // 1. CSV Template download
  if (action === 'template' || searchParams.get('downloadTemplate') === 'true') {
    if (!entityKey) {
      return NextResponse.json(
        { error: 'Query parameter entityKey is required for template download.' },
        { status: 400 },
      );
    }
    try {
      const csv = generateEntityCsvTemplate(entityKey);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${entityKey}_template.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate template';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  // 2. Template Specs metadata
  if (action === 'specs') {
    return NextResponse.json({ specs: MASTER_DATA_TEMPLATE_SPECS });
  }

  // 3. Normal list query
  const domain = (searchParams.get('domain') as MasterDataDomain) || undefined;
  const scope = (searchParams.get('scope') as MasterDataScope) || undefined;

  const records = masterDataStore.listRecords(session.context.tenant.id, {
    entityKey: entityKey ?? undefined,
    domain,
    scope,
  });

  return NextResponse.json(
    {
      tenantId: session.context.tenant.id,
      count: records.length,
      records,
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin mutation forbidden' }, { status: 403 });
  }

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

  const permissions = session.context.permissions;
  const hasWritePermission = hasPermission(permissions, 'master-data:write') || hasPermission(permissions, 'master-data:admin');

  if (!hasWritePermission) {
    return NextResponse.json(
      { error: 'Insufficient permissions to create or import master data.' },
      { status: 403 },
    );
  }

  const isPlatformAdmin = session.context.platformRoles.length > 0;
  const tenantId = session.context.tenant.id;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // Action: Dry-run validation or Commit bulk import
  if (body.action === 'validate' || body.action === 'dry_run') {
    const rawRows = body.rows;
    const key = typeof body.entityKey === 'string' ? body.entityKey : '';
    if (!key || !Array.isArray(rawRows)) {
      return NextResponse.json(
        { error: 'entityKey and rows array are required for import validation.' },
        { status: 400 },
      );
    }
    try {
      const result = validateMasterDataImport(key, rawRows as Record<string, string>[]);
      return NextResponse.json({ success: true, validation: result }, { status: 200 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Validation failed';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (body.action === 'import') {
    const rawRows = body.rows;
    const key = typeof body.entityKey === 'string' ? body.entityKey : '';
    if (!key || !Array.isArray(rawRows)) {
      return NextResponse.json(
        { error: 'entityKey and rows array are required for import.' },
        { status: 400 },
      );
    }
    try {
      const validation = validateMasterDataImport(key, rawRows as Record<string, string>[]);
      if (validation.errorCount > 0 && !body.allowPartial) {
        return NextResponse.json(
          {
            error: 'Import validation failed with errors. Correct the spreadsheet or enable allowPartial.',
            validation,
          },
          { status: 400 },
        );
      }

      const created = [];
      for (const rec of validation.validRecords) {
        const item = masterDataStore.createRecord(
          tenantId,
          {
            entityKey: key as BaseMasterRecord['entityKey'],
            domain: rec.domain as MasterDataDomain,
            code: rec.code,
            name: rec.name,
            scope:
              body.scope === 'PLATFORM_GLOBAL' && isPlatformAdmin
                ? 'PLATFORM_GLOBAL'
                : 'TENANT_LOCAL',
            payload: rec.payload,
          },
          isPlatformAdmin,
        );
        created.push(item);
      }

      return NextResponse.json(
        {
          success: true,
          count: created.length,
          records: created,
          validation,
        },
        { status: 201 },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Import execution failed';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  // Single record creation
  const entityKey = typeof body.entityKey === 'string' ? body.entityKey : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const domain = (body.domain as MasterDataDomain) || 'FINANCE';
  const payload = (body.recordPayload as Record<string, unknown>) || (body.payload as Record<string, unknown>) || {};

  if (!entityKey || !code || !name) {
    return NextResponse.json(
      { error: 'entityKey, code, and name are required fields.' },
      { status: 400 },
    );
  }

  try {
    const created = masterDataStore.createRecord(
      tenantId,
      {
        entityKey: entityKey as BaseMasterRecord['entityKey'],
        domain,
        code,
        name,
        scope:
          body.scope === 'PLATFORM_GLOBAL' && isPlatformAdmin
            ? 'PLATFORM_GLOBAL'
            : 'TENANT_LOCAL',
        payload,
      },
      isPlatformAdmin,
    );

    return NextResponse.json({ success: true, record: created }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create master data record';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
