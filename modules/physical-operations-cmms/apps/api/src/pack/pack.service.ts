import { randomUUID } from 'node:crypto';
import { CmmsIndustrySectionV1Schema, PackApplicationV1Schema, type PackApplicationV1 } from '@gigalibs/contracts';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { ClassificationsService } from '../classifications/classifications.service.js';
import { DatabaseService } from '../database/database.service.js';

export interface CmmsPackSection {
  readonly kind: 'INDUSTRY' | 'COUNTRY';
  readonly key: string;
  readonly version: string;
  readonly checksum: string;
  readonly publishedVersionId: string;
  readonly section: Record<string, unknown>;
  readonly appliedAt: string;
}

/**
 * WI-OI-154: CMMS's section of the active industry pack. The kernel sends it on `pack.apply`; asset classes are
 * created only when their code is not already present. Work order types from the pack are stored for UI reference.
 */
@Injectable()
export class CmmsPackService {
  constructor(
    private readonly database: DatabaseService,
    private readonly classifications: ClassificationsService,
  ) {}

  async apply(context: CmmsCommandContext, rawInput: unknown) {
    const parsed = PackApplicationV1Schema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        `Invalid pack application: ${parsed.error.issues[0]?.path.join('.') ?? ''} ${parsed.error.issues[0]?.message ?? ''}`.trim(),
      );
    }
    const application: PackApplicationV1 = parsed.data;
    if (application.kind !== 'INDUSTRY') throw new BadRequestException('CMMS reads industry packs only.');
    const section = CmmsIndustrySectionV1Schema.safeParse(application.section);
    if (!section.success) {
      throw new BadRequestException(
        `The pack's CMMS section is not valid: ${section.error.issues[0]?.path.join('.') ?? ''} ${section.error.issues[0]?.message ?? ''}`.trim(),
      );
    }
    const assetClasses = section.data.lists?.assetClasses ?? [];
    const tenantId = context.principal.tenantId;
    const existing = await this.database.withTenantTransaction(tenantId, async (client) => {
      return new Set(
        (await client.query<{ code: string }>('SELECT code FROM gigalibs_cmms.cmms_asset_classifications WHERE tenant_id = $1', [tenantId])).rows.map(
          (row) => row.code,
        ),
      );
    });
    const createdAssetClasses: string[] = [];
    for (const assetClass of assetClasses) {
      if (existing.has(assetClass.code)) continue;
      await this.classifications.create(context, {
        code: assetClass.code,
        name: assetClass.name,
        description: undefined,
        parentClassId: undefined,
      });
      existing.add(assetClass.code);
      createdAssetClasses.push(assetClass.code);
    }
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await this.storeSection(client, context, application, section.data);
      await client.query(
        `INSERT INTO gigalibs_cmms.audit_events (id, tenant_id, actor_subject, action, entity_type, entity_id, correlation_id, payload)
         VALUES ($1, $2, $3, 'CMMS_PACK_APPLIED', 'PACK_SECTION', 'INDUSTRY', $4, $5::jsonb)`,
        [
          randomUUID(),
          tenantId,
          context.principal.subject,
          context.correlationId,
          JSON.stringify({
            key: application.key,
            version: application.version,
            checksum: application.checksum,
            createdAssetClasses,
            workOrderTypes: section.data.lists?.workOrderTypes?.length ?? 0,
          }),
        ],
      );
      return {
        status: 'APPLIED' as const,
        key: application.key,
        version: application.version,
        createdAssetClasses,
      };
    });
  }

  async current(principal: CmmsPrincipal): Promise<{ readonly items: readonly CmmsPackSection[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => ({ items: await this.read(client, principal.tenantId) }));
  }

  private async storeSection(
    client: PoolClient,
    context: CmmsCommandContext,
    application: PackApplicationV1,
    sectionData: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO gigalibs_cmms.pack_sections
         (tenant_id, kind, pack_key, pack_version, checksum, published_version_id, section, applied_by, correlation_id)
       VALUES ($1, 'INDUSTRY', $2, $3, $4, $5, $6::jsonb, $7, $8)
       ON CONFLICT (tenant_id, kind) DO UPDATE
         SET pack_key = EXCLUDED.pack_key, pack_version = EXCLUDED.pack_version, checksum = EXCLUDED.checksum,
             published_version_id = EXCLUDED.published_version_id, section = EXCLUDED.section,
             applied_by = EXCLUDED.applied_by, correlation_id = EXCLUDED.correlation_id, applied_at = now()`,
      [
        context.principal.tenantId,
        application.key,
        application.version,
        application.checksum,
        application.publishedVersionId,
        JSON.stringify(sectionData),
        context.principal.subject,
        context.correlationId,
      ],
    );
  }

  private async read(client: PoolClient, tenantId: string): Promise<CmmsPackSection[]> {
    const result = await client.query<{
      kind: 'INDUSTRY' | 'COUNTRY';
      pack_key: string;
      pack_version: string;
      checksum: string;
      published_version_id: string;
      section: Record<string, unknown>;
      applied_at: Date;
    }>(
      `SELECT kind, pack_key, pack_version, checksum, published_version_id, section, applied_at
         FROM gigalibs_cmms.pack_sections WHERE tenant_id = $1 ORDER BY kind DESC`,
      [tenantId],
    );
    return result.rows.map((row) => ({
      kind: row.kind,
      key: row.pack_key,
      version: row.pack_version,
      checksum: row.checksum,
      publishedVersionId: row.published_version_id,
      section: row.section,
      appliedAt: row.applied_at.toISOString(),
    }));
  }
}
