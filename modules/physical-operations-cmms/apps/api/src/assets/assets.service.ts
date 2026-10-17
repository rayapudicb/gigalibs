import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  ArchiveCmmsAssetV1Schema,
  CreateCmmsAssetV1Schema,
  SearchCmmsAssetsV1Schema,
  UpdateCmmsAssetV1Schema,
  type CmmsAssetV1,
  type CmmsPageV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { assertWritableScope, scopePredicates } from '../auth/scope.js';
import {
  assertUuid,
  dateOnlyOrNull,
  iso,
  isoOrNull,
  notFound,
  numberOrNull,
  parseInput,
  recordMutation,
  translateConstraint,
  versionConflict,
  chosenOrder,
} from '../common/command.js';
import { DatabaseService } from '../database/database.service.js';

// WI-OI-120be: the columns a chosen sort may use; nothing else reaches ORDER BY.
const ASSET_SORT = { assetTag: 'a.asset_tag', name: 'a.name', createdAt: 'a.created_at' } as const;

const ASSET_COLUMNS = `a.id, a.asset_tag, a.name, a.description, a.category, a.status, a.criticality,
  a.manufacturer, a.model, a.serial_number, a.parent_asset_id, a.site_ref, a.department_id, a.space_id, a.classification_id,
  a.acquisition_cost, a.currency_code, a.purchase_date, a.warranty_expiry, a.specs, a.archived_at,
  a.version, a.created_by, a.created_at, a.updated_at,
  (SELECT COUNT(*)::int FROM gigalibs_cmms.work_orders w
    WHERE w.tenant_id = a.tenant_id AND w.asset_id = a.id
      AND w.status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD')) AS open_work_order_count`;

@Injectable()
export class AssetsService {
  constructor(private readonly database: DatabaseService) {}

  async search(principal: CmmsPrincipal, raw: unknown): Promise<CmmsPageV1<CmmsAssetV1>> {
    const query = parseInput(SearchCmmsAssetsV1Schema, raw);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['a.tenant_id = $1', ...scopePredicates(principal, values, 'a.')];
      if (!query.includeArchived) where.push('a.archived_at IS NULL');
      if (query.q) {
        values.push(`%${escapeLike(query.q)}%`);
        where.push(`(a.name ILIKE $${values.length} OR a.asset_tag ILIKE $${values.length})`);
      }
      for (const [column, value] of [
        ['status', query.status],
        ['criticality', query.criticality],
        ['site_ref', query.siteRef],
        ['parent_asset_id', query.parentAssetId],
        ['space_id', query.spaceId],
        ['classification_id', query.classificationId],
      ] as const) {
        if (value !== undefined) {
          values.push(value);
          where.push(`a.${column} = $${values.length}`);
        }
      }
      values.push(query.pageSize, (query.page - 1) * query.pageSize);
      const result = await client.query(
        `SELECT ${ASSET_COLUMNS}, COUNT(*) OVER()::int AS total_count
           FROM gigalibs_cmms.assets a
          WHERE ${where.join(' AND ')}
          ORDER BY ${chosenOrder(ASSET_SORT, query.sortField, query.sortDirection, 'a.id') ?? 'a.name ASC, a.id ASC'}
          LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      );
      return {
        items: result.rows.map(mapAsset),
        total: Number(result.rows[0]?.total_count ?? 0),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  async get(principal: CmmsPrincipal, assetId: string): Promise<CmmsAssetV1> {
    assertUuid(assetId, 'assetId');
    return this.database.withTenantTransaction(principal.tenantId, (client) =>
      this.visibleAsset(client, principal, assetId, false),
    );
  }

  async create(context: CmmsCommandContext, raw: unknown): Promise<CmmsAssetV1> {
    const input = parseInput(CreateCmmsAssetV1Schema, raw);
    const departmentId = input.departmentId ?? null;
    const siteRef = input.siteRef ?? null;
    assertWritableScope(context.principal, { departmentId, siteRef });
    const spaceId = input.spaceId === undefined ? null : input.spaceId;
    if (spaceId) assertUuid(spaceId, 'spaceId');
    const classificationId = input.classificationId === undefined ? null : input.classificationId;
    if (classificationId) assertUuid(classificationId, 'classificationId');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      if (spaceId) await this.assertVisibleSpace(client, context.principal, spaceId);
      if (input.parentAssetId) await this.visibleAsset(client, context.principal, input.parentAssetId, false);
      try {
        const result = await client.query<{ id: string }>(
          `INSERT INTO gigalibs_cmms.assets
             (tenant_id, asset_tag, name, description, category, status, criticality, manufacturer, model,
              serial_number, parent_asset_id, site_ref, department_id, space_id, classification_id, acquisition_cost, currency_code,
              purchase_date, warranty_expiry, specs, created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21, $21, $22)
           RETURNING id`,
          [
            context.principal.tenantId,
            input.assetTag,
            input.name,
            input.description ?? null,
            input.category ?? null,
            input.status ?? 'OPERATIONAL',
            input.criticality ?? 'MEDIUM',
            input.manufacturer ?? null,
            input.model ?? null,
            input.serialNumber ?? null,
            input.parentAssetId ?? null,
            siteRef,
            departmentId,
            spaceId,
            classificationId,
            input.acquisitionCost ?? null,
            input.currencyCode ?? null,
            input.purchaseDate ?? null,
            input.warrantyExpiry ?? null,
            JSON.stringify(input.specs ?? {}),
            context.principal.subject,
            context.correlationId,
          ],
        );
        const id = result.rows[0]!.id;
        await recordMutation(client, context, {
          action: 'CMMS_ASSET_CREATED',
          aggregateType: 'CMMS_ASSET',
          aggregateId: id,
          aggregateVersion: 1,
          payload: { assetTag: input.assetTag, siteRef, status: input.status ?? 'OPERATIONAL' },
        });
        return this.visibleAsset(client, context.principal, id, true);
      } catch (error) {
        translateConstraint(error, { unique: `An asset with tag ${input.assetTag} already exists.` });
      }
    });
  }

  async update(context: CmmsCommandContext, assetId: string, raw: unknown): Promise<CmmsAssetV1> {
    assertUuid(assetId, 'assetId');
    const input = parseInput(UpdateCmmsAssetV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lockVisibleAsset(client, context.principal, assetId);
      if (current.version !== input.expectedVersion) versionConflict('The asset');
      if (current.archived_at) throw new ConflictException({ code: 'CMMS_ASSET_ARCHIVED', message: 'Archived assets cannot be changed.' });

      const departmentId = input.departmentId === undefined ? current.department_id : input.departmentId;
      const siteRef = input.siteRef === undefined ? current.site_ref : input.siteRef;
      assertWritableScope(context.principal, { departmentId: current.department_id, siteRef: current.site_ref });
      assertWritableScope(context.principal, { departmentId, siteRef });

      const parentAssetId = input.parentAssetId === undefined ? current.parent_asset_id : input.parentAssetId;
      if (parentAssetId && parentAssetId !== current.parent_asset_id) {
        await this.visibleAsset(client, context.principal, parentAssetId, false);
        await assertNoCycle(client, context.principal.tenantId, assetId, parentAssetId);
      }
      const acquisitionCost = pick(input.acquisitionCost, current.acquisition_cost);
      const currencyCode = pick(input.currencyCode, current.currency_code);
      if (acquisitionCost !== null && currencyCode === null) {
        throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: 'A currency is required with an acquisition cost.' });
      }
      const spaceId = input.spaceId === undefined ? current.space_id : input.spaceId;
      if (spaceId) assertUuid(spaceId, 'spaceId');
      if (spaceId && spaceId !== current.space_id) await this.assertVisibleSpace(client, context.principal, spaceId);
      const classificationId =
        input.classificationId === undefined ? current.classification_id : input.classificationId;
      if (classificationId) assertUuid(classificationId, 'classificationId');

      const result = await client.query<{ version: number }>(
        `UPDATE gigalibs_cmms.assets
            SET name = $4, description = $5, category = $6, status = $7, criticality = $8, manufacturer = $9,
                model = $10, serial_number = $11, parent_asset_id = $12, site_ref = $13, department_id = $14,
                space_id = $15, classification_id = $16, acquisition_cost = $17, currency_code = $18, purchase_date = $19, warranty_expiry = $20,
                specs = $21::jsonb, version = version + 1, updated_by = $22, correlation_id = $23, updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND version = $3
          RETURNING version`,
        [
          context.principal.tenantId,
          assetId,
          input.expectedVersion,
          input.name ?? current.name,
          pick(input.description, current.description),
          pick(input.category, current.category),
          input.status ?? current.status,
          input.criticality ?? current.criticality,
          pick(input.manufacturer, current.manufacturer),
          pick(input.model, current.model),
          pick(input.serialNumber, current.serial_number),
          parentAssetId,
          siteRef,
          departmentId,
          spaceId,
          classificationId,
          acquisitionCost,
          currencyCode,
          pick(input.purchaseDate, current.purchase_date),
          pick(input.warrantyExpiry, current.warranty_expiry),
          JSON.stringify(input.specs ?? current.specs ?? {}),
          context.principal.subject,
          context.correlationId,
        ],
      );
      if (result.rowCount === 0) versionConflict('The asset');
      const version = Number(result.rows[0]!.version);
      await recordMutation(client, context, {
        action: 'CMMS_ASSET_UPDATED',
        aggregateType: 'CMMS_ASSET',
        aggregateId: assetId,
        aggregateVersion: version,
        payload: { changed: Object.keys(input).filter((key) => key !== 'expectedVersion'), status: input.status ?? current.status },
      });
      return this.visibleAsset(client, context.principal, assetId, true);
    });
  }

  /** Decommissions and archives; refused while open work orders or active child assets remain. */
  async archive(context: CmmsCommandContext, assetId: string, raw: unknown): Promise<CmmsAssetV1> {
    assertUuid(assetId, 'assetId');
    const input = parseInput(ArchiveCmmsAssetV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lockVisibleAsset(client, context.principal, assetId);
      if (current.version !== input.expectedVersion) versionConflict('The asset');
      if (current.archived_at) throw new ConflictException({ code: 'CMMS_ASSET_ARCHIVED', message: 'The asset is already archived.' });
      assertWritableScope(context.principal, { departmentId: current.department_id, siteRef: current.site_ref });
      const blockers = await client.query<{ open_work_orders: number; active_children: number }>(
        `SELECT
           (SELECT COUNT(*)::int FROM gigalibs_cmms.work_orders
             WHERE tenant_id = $1 AND asset_id = $2 AND status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD')) AS open_work_orders,
           (SELECT COUNT(*)::int FROM gigalibs_cmms.assets
             WHERE tenant_id = $1 AND parent_asset_id = $2 AND archived_at IS NULL) AS active_children`,
        [context.principal.tenantId, assetId],
      );
      const { open_work_orders: openWorkOrders, active_children: activeChildren } = blockers.rows[0]!;
      if (openWorkOrders > 0 || activeChildren > 0) {
        throw new ConflictException({
          code: 'CMMS_ASSET_IN_USE',
          message: `Close ${openWorkOrders} open work order(s) and archive ${activeChildren} child asset(s) first.`,
        });
      }
      const result = await client.query<{ version: number }>(
        `UPDATE gigalibs_cmms.assets
            SET status = 'DECOMMISSIONED', archived_at = now(), version = version + 1,
                updated_by = $4, correlation_id = $5, updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND version = $3
          RETURNING version`,
        [context.principal.tenantId, assetId, input.expectedVersion, context.principal.subject, context.correlationId],
      );
      if (result.rowCount === 0) versionConflict('The asset');
      await recordMutation(client, context, {
        action: 'CMMS_ASSET_ARCHIVED',
        aggregateType: 'CMMS_ASSET',
        aggregateId: assetId,
        aggregateVersion: Number(result.rows[0]!.version),
        payload: { reason: input.reason },
      });
      return this.visibleAsset(client, context.principal, assetId, true);
    });
  }

  /** Reads an asset the caller may see; out-of-scope and missing assets are indistinguishable (404). */
  async visibleAsset(
    client: PoolClient,
    principal: CmmsPrincipal,
    assetId: string,
    includeArchived: boolean,
  ): Promise<CmmsAssetV1> {
    const values: unknown[] = [principal.tenantId, assetId];
    const where = ['a.tenant_id = $1', 'a.id = $2', ...scopePredicates(principal, values, 'a.')];
    if (!includeArchived) where.push('a.archived_at IS NULL');
    const result = await client.query(`SELECT ${ASSET_COLUMNS} FROM gigalibs_cmms.assets a WHERE ${where.join(' AND ')}`, values);
    if (!result.rows[0]) notFound('The asset');
    return mapAsset(result.rows[0]);
  }

  /** WI-OI-120be (W1 review A, L5): an asset may only be placed in a space the caller can see. */
  private async assertVisibleSpace(client: PoolClient, principal: CmmsPrincipal, spaceId: string): Promise<void> {
    const values: unknown[] = [principal.tenantId, spaceId];
    const where = ['s.tenant_id = $1', 's.id = $2'];
    if (principal.organization?.mode === 'DENIED') where.push('FALSE');
    if (principal.placeScope.mode === 'PLACES') {
      values.push([...principal.placeScope.placeIds]);
      where.push(`s.site_ref = ANY($${values.length}::uuid[])`);
    }
    const result = await client.query(`SELECT s.id FROM gigalibs_cmms.cmms_spaces s WHERE ${where.join(' AND ')}`, values);
    if (!result.rows[0]) notFound('Space');
  }

  private async lockVisibleAsset(client: PoolClient, principal: CmmsPrincipal, assetId: string) {
    const values: unknown[] = [principal.tenantId, assetId];
    const where = ['a.tenant_id = $1', 'a.id = $2', ...scopePredicates(principal, values, 'a.')];
    const result = await client.query(
      `SELECT a.* FROM gigalibs_cmms.assets a WHERE ${where.join(' AND ')} FOR UPDATE`,
      values,
    );
    if (!result.rows[0]) notFound('The asset');
    const row = result.rows[0];
    return { ...row, version: Number(row.version) } as Record<string, any> & { version: number };
  }
}

async function assertNoCycle(client: PoolClient, tenantId: string, assetId: string, parentAssetId: string): Promise<void> {
  const result = await client.query<{ cycle: boolean }>(
    `WITH RECURSIVE ancestors(id, depth) AS (
       SELECT $3::uuid, 1
       UNION ALL
       SELECT a.parent_asset_id, ancestors.depth + 1
         FROM gigalibs_cmms.assets a
         JOIN ancestors ON a.tenant_id = $1 AND a.id = ancestors.id
        WHERE a.parent_asset_id IS NOT NULL AND ancestors.depth < 64
     )
     SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = $2) AS cycle`,
    [tenantId, assetId, parentAssetId],
  );
  if (result.rows[0]?.cycle) {
    throw new BadRequestException({ code: 'CMMS_ASSET_CYCLE', message: 'An asset cannot be placed under itself or its descendants.' });
  }
}

function pick<T>(next: T | null | undefined, current: T | null): T | null {
  return next === undefined ? current : next;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function mapAsset(row: any): CmmsAssetV1 {
  return {
    id: row.id,
    assetTag: row.asset_tag,
    name: row.name,
    description: row.description ?? null,
    category: row.category ?? null,
    status: row.status,
    criticality: row.criticality,
    manufacturer: row.manufacturer ?? null,
    model: row.model ?? null,
    serialNumber: row.serial_number ?? null,
    parentAssetId: row.parent_asset_id ?? null,
    siteRef: row.site_ref ?? null,
    departmentId: row.department_id ?? null,
    spaceId: row.space_id ?? null,
    classificationId: row.classification_id ?? null,
    acquisitionCost: numberOrNull(row.acquisition_cost),
    currencyCode: row.currency_code ?? null,
    purchaseDate: dateOnlyOrNull(row.purchase_date),
    warrantyExpiry: dateOnlyOrNull(row.warranty_expiry),
    specs: row.specs ?? {},
    archivedAt: isoOrNull(row.archived_at),
    openWorkOrderCount: Number(row.open_work_order_count ?? 0),
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
