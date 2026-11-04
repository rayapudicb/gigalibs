import { randomUUID } from 'node:crypto';
import {
  PackApplicationV1Schema,
  ProductCatalogueIndustrySectionV1Schema,
  type PackApplicationV1,
} from '@gigalibs/contracts';
import { type ModuleCommandContext, type ModulePrincipal } from '@gigalibs/module-sdk';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import { CatalogueService } from '../catalogue/catalogue.service.js';
import { DatabaseService } from '../database.service.js';

export interface CataloguePackSection {
  readonly kind: 'INDUSTRY' | 'COUNTRY';
  readonly key: string;
  readonly version: string;
  readonly checksum: string;
  readonly publishedVersionId: string;
  readonly section: Record<string, unknown>;
  readonly appliedAt: string;
}

/**
 * WI-OI-154: Product Catalogue's section of the active industry pack. The kernel sends it on `pack.apply`; units and
 * categories are created only when their code is not already present (workspace edits are never overwritten).
 */
@Injectable()
export class ProductCataloguePackService {
  constructor(
    private readonly database: DatabaseService,
    private readonly catalogue: CatalogueService,
  ) {}

  async apply(context: ModuleCommandContext, rawInput: unknown) {
    const parsed = PackApplicationV1Schema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        `Invalid pack application: ${parsed.error.issues[0]?.path.join('.') ?? ''} ${parsed.error.issues[0]?.message ?? ''}`.trim(),
      );
    }
    const application: PackApplicationV1 = parsed.data;
    if (application.kind !== 'INDUSTRY') throw new BadRequestException('Product Catalogue reads industry packs only.');
    const section = ProductCatalogueIndustrySectionV1Schema.safeParse(application.section);
    if (!section.success) {
      throw new BadRequestException(
        `The pack's Product Catalogue section is not valid: ${section.error.issues[0]?.path.join('.') ?? ''} ${section.error.issues[0]?.message ?? ''}`.trim(),
      );
    }
    const lists = section.data.lists;
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const existingUoms = new Set(
        (await client.query<{ code: string }>(`SELECT code FROM ${SCHEMA}.uom_definitions WHERE tenant_id = $1`, [tenantId])).rows.map(
          (row) => row.code,
        ),
      );
      const existingCategories = new Set(
        (await client.query<{ code: string }>(`SELECT code FROM ${SCHEMA}.product_categories WHERE tenant_id = $1`, [tenantId])).rows.map(
          (row) => row.code,
        ),
      );
      const createdUoms: string[] = [];
      const createdCategories: string[] = [];
      for (const unit of lists?.units ?? []) {
        if (existingUoms.has(unit.code)) continue;
        await this.catalogue.createUom(context, unit, `pack:${application.checksum}:uom:${unit.code}`);
        existingUoms.add(unit.code);
        createdUoms.push(unit.code);
      }
      const categories = [...(lists?.categories ?? [])].sort((left, right) => {
        const leftDepth = left.parentCode ? 1 : 0;
        const rightDepth = right.parentCode ? 1 : 0;
        return leftDepth - rightDepth;
      });
      const categoryIds = new Map<string, string>();
      for (const row of (
        await client.query<{ id: string; code: string }>(`SELECT id, code FROM ${SCHEMA}.product_categories WHERE tenant_id = $1`, [tenantId])
      ).rows) {
        categoryIds.set(row.code, row.id);
      }
      for (const category of categories) {
        if (existingCategories.has(category.code)) continue;
        let parentCategoryId: string | undefined;
        if (category.parentCode) {
          parentCategoryId = categoryIds.get(category.parentCode);
          if (!parentCategoryId) {
            throw new BadRequestException(`Pack category ${category.code} references unknown parent ${category.parentCode}.`);
          }
        }
        const created = await this.catalogue.createCategory(
          context,
          { code: category.code, name: category.name, parentCategoryId, description: undefined, isDefault: false },
          `pack:${application.checksum}:category:${category.code}`,
        );
        categoryIds.set(category.code, (created.result as { id: string }).id);
        existingCategories.add(category.code);
        createdCategories.push(category.code);
      }
      await this.storeSection(client, context, application, section.data);
      await client.query(
        `INSERT INTO ${SCHEMA}.audit_events (id, tenant_id, actor_subject, action, entity_type, entity_id, correlation_id, payload)
         VALUES ($1, $2, $3, 'CATALOGUE_PACK_APPLIED', 'PACK_SECTION', 'INDUSTRY', $4, $5::jsonb)`,
        [
          randomUUID(),
          tenantId,
          context.principal.subject,
          context.correlationId,
          JSON.stringify({
            key: application.key,
            version: application.version,
            checksum: application.checksum,
            createdUoms,
            createdCategories,
          }),
        ],
      );
      return {
        status: 'APPLIED' as const,
        key: application.key,
        version: application.version,
        createdUoms,
        createdCategories,
      };
    });
  }

  async current(principal: ModulePrincipal): Promise<{ readonly items: readonly CataloguePackSection[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => ({ items: await this.read(client, principal.tenantId) }));
  }

  private async storeSection(
    client: PoolClient,
    context: ModuleCommandContext,
    application: PackApplicationV1,
    sectionData: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO ${SCHEMA}.pack_sections
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

  private async read(client: PoolClient, tenantId: string): Promise<CataloguePackSection[]> {
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
         FROM ${SCHEMA}.pack_sections WHERE tenant_id = $1 ORDER BY kind DESC`,
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
