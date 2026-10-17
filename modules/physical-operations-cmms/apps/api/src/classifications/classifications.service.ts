import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  CreateCmmsClassificationV1Schema,
  CreateCmmsSpecDefinitionV1Schema,
  SetCmmsAssetSpecsV1Schema,
  UpdateCmmsClassificationV1Schema,
  type CmmsAssetClassificationV1,
  type CmmsAssetSpecValueV1,
  type CmmsClassificationTreeV1,
  type CmmsEquipmentNodeV1,
  type CmmsSpecDefinitionV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import {
  assertUuid,
  iso,
  notFound,
  parseInput,
  recordMutation,
  translateConstraint,
  versionConflict,
} from '../common/command.js';
import { assertWorkspaceWide, assertWritableScope, scopePredicates } from '../auth/scope.js';
import { DatabaseService } from '../database/database.service.js';

const CLASSIFICATION_COLUMNS = `c.id, c.code, c.name, c.description, c.parent_class_id,
  c.version, c.created_by, c.created_at, c.updated_at,
  (SELECT COUNT(*)::int FROM gigalibs_cmms.cmms_asset_spec_definitions d
    WHERE d.tenant_id = c.tenant_id AND d.classification_id = c.id) AS spec_count,
  (SELECT COUNT(*)::int FROM gigalibs_cmms.assets a
    WHERE a.tenant_id = c.tenant_id AND a.classification_id = c.id AND a.archived_at IS NULL) AS asset_count`;

const SPEC_DEF_COLUMNS = `d.id, d.classification_id, d.attribute_key, d.label, d.data_type,
  d.uom, d.required, d.min_value, d.max_value, d.default_value, d.version`;

@Injectable()
export class ClassificationsService {
  constructor(private readonly database: DatabaseService) {}

  async listTree(principal: CmmsPrincipal): Promise<readonly CmmsClassificationTreeV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const result = await client.query(
        `SELECT ${CLASSIFICATION_COLUMNS}
           FROM gigalibs_cmms.cmms_asset_classifications c
          WHERE c.tenant_id = $1
          ORDER BY c.name ASC, c.id ASC`,
        [principal.tenantId],
      );
      const items = result.rows.map(mapClassification);
      return buildClassificationTree(items);
    });
  }

  async get(principal: CmmsPrincipal, id: string): Promise<CmmsAssetClassificationV1> {
    assertUuid(id, 'classificationId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      return this.visibleClassification(client, principal.tenantId, id);
    });
  }

  async create(context: CmmsCommandContext, raw: unknown): Promise<CmmsAssetClassificationV1> {
    assertWorkspaceWide(context.principal);
    const input = parseInput(CreateCmmsClassificationV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      if (input.parentClassId) {
        await this.visibleClassification(client, context.principal.tenantId, input.parentClassId);
      }
      try {
        const result = await client.query<{ id: string }>(
          `INSERT INTO gigalibs_cmms.cmms_asset_classifications
             (tenant_id, code, name, description, parent_class_id, created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $6, $7)
           RETURNING id`,
          [
            context.principal.tenantId,
            input.code,
            input.name,
            input.description ?? null,
            input.parentClassId ?? null,
            context.principal.subject,
            context.correlationId,
          ],
        );
        const id = result.rows[0]!.id;
        await recordMutation(client, context, {
          action: 'CMMS_CLASSIFICATION_CREATED',
          aggregateType: 'CMMS_CLASSIFICATION',
          aggregateId: id,
          aggregateVersion: 1,
          payload: { code: input.code, name: input.name },
        });
        return this.visibleClassification(client, context.principal.tenantId, id);
      } catch (error) {
        translateConstraint(error, {
          unique: `An asset classification with code "${input.code}" already exists.`,
          reference: 'The parent classification was not found.',
        });
      }
    });
  }

  async update(context: CmmsCommandContext, id: string, raw: unknown): Promise<CmmsAssetClassificationV1> {
    assertWorkspaceWide(context.principal);
    assertUuid(id, 'classificationId');
    const input = parseInput(UpdateCmmsClassificationV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lockClassification(client, context.principal.tenantId, id);
      if (current.version !== input.expectedVersion) versionConflict('The classification');

      const parentClassId =
        input.parentClassId === undefined ? current.parent_class_id : input.parentClassId;
      if (parentClassId && parentClassId !== current.parent_class_id) {
        await this.visibleClassification(client, context.principal.tenantId, parentClassId);
        await assertNoClassificationCycle(client, context.principal.tenantId, id, parentClassId);
      }

      const result = await client.query<{ version: number }>(
        `UPDATE gigalibs_cmms.cmms_asset_classifications
            SET name = $4, description = $5, parent_class_id = $6,
                version = version + 1, updated_by = $7, correlation_id = $8, updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND version = $3
          RETURNING version`,
        [
          context.principal.tenantId,
          id,
          input.expectedVersion,
          input.name ?? current.name,
          input.description === undefined ? current.description : input.description,
          parentClassId,
          context.principal.subject,
          context.correlationId,
        ],
      );
      if (result.rowCount === 0) versionConflict('The classification');
      const version = Number(result.rows[0]!.version);
      await recordMutation(client, context, {
        action: 'CMMS_CLASSIFICATION_UPDATED',
        aggregateType: 'CMMS_CLASSIFICATION',
        aggregateId: id,
        aggregateVersion: version,
        payload: { changed: Object.keys(input).filter((k) => k !== 'expectedVersion') },
      });
      return this.visibleClassification(client, context.principal.tenantId, id);
    });
  }

  async delete(context: CmmsCommandContext, id: string): Promise<{ success: true }> {
    assertWorkspaceWide(context.principal);
    assertUuid(id, 'classificationId');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lockClassification(client, context.principal.tenantId, id);
      const childCount = await client.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM gigalibs_cmms.cmms_asset_classifications WHERE tenant_id = $1 AND parent_class_id = $2',
        [context.principal.tenantId, id],
      );
      if (childCount.rows[0]?.count && childCount.rows[0].count > 0) {
        throw new ConflictException({
          code: 'CMMS_CLASSIFICATION_HAS_CHILDREN',
          message: 'Cannot delete classification that has child classifications.',
        });
      }
      const assetCount = await client.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM gigalibs_cmms.assets WHERE tenant_id = $1 AND classification_id = $2 AND archived_at IS NULL',
        [context.principal.tenantId, id],
      );
      if (assetCount.rows[0]?.count && assetCount.rows[0].count > 0) {
        throw new ConflictException({
          code: 'CMMS_CLASSIFICATION_IN_USE',
          message: 'Cannot delete classification assigned to active assets.',
        });
      }

      await client.query(
        'DELETE FROM gigalibs_cmms.cmms_asset_classifications WHERE tenant_id = $1 AND id = $2',
        [context.principal.tenantId, id],
      );
      await recordMutation(client, context, {
        action: 'CMMS_CLASSIFICATION_DELETED',
        aggregateType: 'CMMS_CLASSIFICATION',
        aggregateId: id,
        aggregateVersion: current.version,
        payload: { code: current.code },
      });
      return { success: true };
    });
  }

  // ─── Specification Definitions ──────────────────────────────────────────────────────────

  async listSpecDefinitions(
    principal: CmmsPrincipal,
    classificationId: string,
  ): Promise<readonly CmmsSpecDefinitionV1[]> {
    assertUuid(classificationId, 'classificationId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const result = await client.query(
        `SELECT ${SPEC_DEF_COLUMNS}
           FROM gigalibs_cmms.cmms_asset_spec_definitions d
          WHERE d.tenant_id = $1 AND d.classification_id = $2
          ORDER BY d.label ASC`,
        [principal.tenantId, classificationId],
      );
      return result.rows.map(mapSpecDefinition);
    });
  }

  async createSpecDefinition(context: CmmsCommandContext, raw: unknown): Promise<CmmsSpecDefinitionV1> {
    assertWorkspaceWide(context.principal);
    const input = parseInput(CreateCmmsSpecDefinitionV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      await this.visibleClassification(client, context.principal.tenantId, input.classificationId);
      try {
        const result = await client.query<{ id: string }>(
          `INSERT INTO gigalibs_cmms.cmms_asset_spec_definitions
             (tenant_id, classification_id, attribute_key, label, data_type, uom, required,
              min_value, max_value, default_value, created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12)
           RETURNING id`,
          [
            context.principal.tenantId,
            input.classificationId,
            input.attributeKey,
            input.label,
            input.dataType,
            input.uom ?? null,
            input.required,
            input.minValue ?? null,
            input.maxValue ?? null,
            input.defaultValue ?? null,
            context.principal.subject,
            context.correlationId,
          ],
        );
        const id = result.rows[0]!.id;
        const res = await client.query(
          `SELECT ${SPEC_DEF_COLUMNS}
             FROM gigalibs_cmms.cmms_asset_spec_definitions d
            WHERE d.tenant_id = $1 AND d.id = $2`,
          [context.principal.tenantId, id],
        );
        return mapSpecDefinition(res.rows[0]);
      } catch (error) {
        translateConstraint(error, {
          unique: `Specification attribute "${input.attributeKey}" already exists for this classification.`,
        });
      }
    });
  }

  // ─── Asset Specifications Values ────────────────────────────────────────────────────────

  async getAssetSpecs(principal: CmmsPrincipal, assetId: string): Promise<readonly CmmsAssetSpecValueV1[]> {
    assertUuid(assetId, 'assetId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.scopedAsset(client, principal, assetId, false);
      const result = await client.query(
        `SELECT d.id AS spec_definition_id, d.attribute_key, d.label, d.data_type, d.uom,
                s.value_text, s.value_number, s.value_boolean
           FROM gigalibs_cmms.cmms_asset_spec_definitions d
           JOIN gigalibs_cmms.assets a ON a.tenant_id = d.tenant_id AND a.classification_id = d.classification_id
      LEFT JOIN gigalibs_cmms.cmms_asset_specs s
             ON s.tenant_id = d.tenant_id AND s.asset_id = a.id AND s.spec_definition_id = d.id
          WHERE d.tenant_id = $1 AND a.id = $2
          ORDER BY d.label ASC`,
        [principal.tenantId, assetId],
      );
      return result.rows.map((row) => ({
        specDefinitionId: row.spec_definition_id,
        attributeKey: row.attribute_key,
        label: row.label,
        dataType: row.data_type,
        uom: row.uom ?? null,
        valueText: row.value_text ?? null,
        valueNumber: row.value_number !== null ? Number(row.value_number) : null,
        valueBoolean: row.value_boolean !== null ? Boolean(row.value_boolean) : null,
      }));
    });
  }

  async setAssetSpecs(
    context: CmmsCommandContext,
    assetId: string,
    raw: unknown,
  ): Promise<readonly CmmsAssetSpecValueV1[]> {
    assertUuid(assetId, 'assetId');
    const input = parseInput(SetCmmsAssetSpecsV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      // WI-OI-120be (W1 review A, H2): only an asset the caller may change.
      const asset = await this.scopedAsset(client, context.principal, assetId, true);
      assertWritableScope(context.principal, { departmentId: asset.department_id, siteRef: asset.site_ref });
      for (const item of input.specs) {
        // Validate definition
        const defQuery = await client.query(
          `SELECT ${SPEC_DEF_COLUMNS}
             FROM gigalibs_cmms.cmms_asset_spec_definitions d
            WHERE d.tenant_id = $1 AND d.id = $2`,
          [context.principal.tenantId, item.specDefinitionId],
        );
        if (!defQuery.rows[0]) notFound('Specification definition');
        const def = defQuery.rows[0];

        // Type checking and min/max validation
        if (def.data_type === 'NUMBER' && item.valueNumber !== undefined && item.valueNumber !== null) {
          if (def.min_value !== null && item.valueNumber < Number(def.min_value)) {
            throw new BadRequestException({
              code: 'CMMS_SPEC_OUT_OF_RANGE',
              message: `Attribute "${def.label}" must be >= ${def.min_value}${def.uom ? ` ${def.uom}` : ''}.`,
            });
          }
          if (def.max_value !== null && item.valueNumber > Number(def.max_value)) {
            throw new BadRequestException({
              code: 'CMMS_SPEC_OUT_OF_RANGE',
              message: `Attribute "${def.label}" must be <= ${def.max_value}${def.uom ? ` ${def.uom}` : ''}.`,
            });
          }
        }

        // Upsert spec value
        await client.query(
          `INSERT INTO gigalibs_cmms.cmms_asset_specs
             (tenant_id, asset_id, spec_definition_id, value_text, value_number, value_boolean, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, now())
           ON CONFLICT (tenant_id, asset_id, spec_definition_id)
           DO UPDATE SET value_text = EXCLUDED.value_text,
                         value_number = EXCLUDED.value_number,
                         value_boolean = EXCLUDED.value_boolean,
                         updated_at = now()`,
          [
            context.principal.tenantId,
            assetId,
            item.specDefinitionId,
            item.valueText ?? null,
            item.valueNumber ?? null,
            item.valueBoolean ?? null,
          ],
        );
      }
      return this.getAssetSpecs(context.principal, assetId);
    });
  }

  // ─── Equipment Tree & Status Cascading ──────────────────────────────────────────────────

  async getEquipmentTree(principal: CmmsPrincipal, assetId: string): Promise<CmmsEquipmentNodeV1> {
    assertUuid(assetId, 'assetId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      // WI-OI-120be (W1 review A, H2): the root and every child must be in the caller's scope; a child outside it is left
      // out with its own children.
      const values: unknown[] = [principal.tenantId, assetId];
      const rootScope = scopePredicates(principal, values, 'a.');
      const childScope = scopePredicates(principal, values, 'child.');
      const result = await client.query(
        `WITH RECURSIVE eq_tree AS (
           SELECT a.id, a.asset_tag, a.name, a.category, a.status, a.criticality,
                  a.classification_id, c.name AS classification_name, a.space_id, a.parent_asset_id, 1 AS depth
             FROM gigalibs_cmms.assets a
        LEFT JOIN gigalibs_cmms.cmms_asset_classifications c ON c.tenant_id = a.tenant_id AND c.id = a.classification_id
            WHERE a.tenant_id = $1 AND a.id = $2${rootScope.map((predicate) => ` AND ${predicate}`).join('')}
            UNION ALL
           SELECT child.id, child.asset_tag, child.name, child.category, child.status, child.criticality,
                  child.classification_id, cc.name AS classification_name, child.space_id, child.parent_asset_id, eq_tree.depth + 1
             FROM gigalibs_cmms.assets child
             JOIN eq_tree ON child.tenant_id = $1 AND child.parent_asset_id = eq_tree.id
        LEFT JOIN gigalibs_cmms.cmms_asset_classifications cc ON cc.tenant_id = child.tenant_id AND cc.id = child.classification_id
            WHERE child.archived_at IS NULL AND eq_tree.depth < 16${childScope.map((predicate) => ` AND ${predicate}`).join('')}
         )
         SELECT * FROM eq_tree ORDER BY depth ASC, name ASC`,
        values,
      );
      if (result.rows.length === 0) notFound('Asset');

      const nodes = new Map<string, CmmsEquipmentNodeV1>();
      for (const row of result.rows) {
        nodes.set(row.id, {
          id: row.id,
          assetTag: row.asset_tag,
          name: row.name,
          category: row.category ?? null,
          status: row.status,
          criticality: row.criticality,
          classificationId: row.classification_id ?? null,
          spaceId: row.space_id ?? null,
          classificationName: row.classification_name ?? null,
          children: [],
        });
      }

      for (const row of result.rows) {
        if (row.parent_asset_id && nodes.has(row.parent_asset_id) && row.id !== assetId) {
          (nodes.get(row.parent_asset_id)!.children as CmmsEquipmentNodeV1[]).push(nodes.get(row.id)!);
        }
      }

      return nodes.get(assetId)!;
    });
  }

  async cascadeStatus(
    context: CmmsCommandContext,
    assetId: string,
    targetStatus: string,
    reason: string,
  ): Promise<{ affectedCount: number }> {
    assertUuid(assetId, 'assetId');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      // WI-OI-120be (W1 review A, H2): the asset and every descendant must be within what the caller may change, or
      // nothing changes.
      const parent = await this.scopedAsset(client, context.principal, assetId, true);
      assertWritableScope(context.principal, { departmentId: parent.department_id, siteRef: parent.site_ref });
      const result = await client.query<{ id: string; version: number; department_id: string | null; site_ref: string | null }>(
        `WITH RECURSIVE downstream AS (
           SELECT a.id, a.version, a.department_id, a.site_ref, 1 AS depth
             FROM gigalibs_cmms.assets a
            WHERE a.tenant_id = $1 AND a.parent_asset_id = $2 AND a.archived_at IS NULL
            UNION ALL
           SELECT child.id, child.version, child.department_id, child.site_ref, downstream.depth + 1
             FROM gigalibs_cmms.assets child
             JOIN downstream ON child.tenant_id = $1 AND child.parent_asset_id = downstream.id
            WHERE child.archived_at IS NULL AND downstream.depth < 16
         )
         SELECT id, version, department_id, site_ref FROM downstream`,
        [context.principal.tenantId, assetId],
      );
      for (const child of result.rows) {
        assertWritableScope(context.principal, { departmentId: child.department_id, siteRef: child.site_ref });
      }

      for (const child of result.rows) {
        await client.query(
          `UPDATE gigalibs_cmms.assets
              SET status = $3, version = version + 1, updated_by = $4, correlation_id = $5, updated_at = now()
            WHERE tenant_id = $1 AND id = $2`,
          [context.principal.tenantId, child.id, targetStatus, context.principal.subject, context.correlationId],
        );
        await recordMutation(client, context, {
          action: 'CMMS_ASSET_STATUS_CASCADED',
          aggregateType: 'CMMS_ASSET',
          aggregateId: child.id,
          aggregateVersion: child.version + 1,
          payload: { parentAssetId: assetId, targetStatus, reason },
        });
      }

      return { affectedCount: result.rows.length };
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────────────────

  /** WI-OI-120be (W1 review A, H2): an asset only within the caller's scope; otherwise not found. */
  private async scopedAsset(
    client: PoolClient,
    principal: CmmsPrincipal,
    assetId: string,
    lock: boolean,
  ): Promise<{ id: string; department_id: string | null; site_ref: string | null }> {
    const values: unknown[] = [principal.tenantId, assetId];
    const where = ['a.tenant_id = $1', 'a.id = $2', ...scopePredicates(principal, values, 'a.')];
    const result = await client.query<{ id: string; department_id: string | null; site_ref: string | null }>(
      `SELECT a.id, a.department_id, a.site_ref FROM gigalibs_cmms.assets a WHERE ${where.join(' AND ')}${lock ? ' FOR UPDATE' : ''}`,
      values,
    );
    const asset = result.rows[0];
    if (!asset) return notFound('Asset');
    return asset;
  }

  private async visibleClassification(
    client: PoolClient,
    tenantId: string,
    id: string,
  ): Promise<CmmsAssetClassificationV1> {
    const result = await client.query(
      `SELECT ${CLASSIFICATION_COLUMNS}
         FROM gigalibs_cmms.cmms_asset_classifications c
        WHERE c.tenant_id = $1 AND c.id = $2`,
      [tenantId, id],
    );
    if (!result.rows[0]) notFound('Asset classification');
    return mapClassification(result.rows[0]);
  }

  private async lockClassification(
    client: PoolClient,
    tenantId: string,
    id: string,
  ): Promise<{ version: number; code: string; name: string; description: string | null; parent_class_id: string | null }> {
    const result = await client.query(
      `SELECT version, code, name, description, parent_class_id
         FROM gigalibs_cmms.cmms_asset_classifications
        WHERE tenant_id = $1 AND id = $2
          FOR UPDATE`,
      [tenantId, id],
    );
    if (!result.rows[0]) notFound('Asset classification');
    return result.rows[0];
  }
}

function mapClassification(row: any): CmmsAssetClassificationV1 {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    parentClassId: row.parent_class_id ?? null,
    specCount: Number(row.spec_count ?? 0),
    assetCount: Number(row.asset_count ?? 0),
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapSpecDefinition(row: any): CmmsSpecDefinitionV1 {
  return {
    id: row.id,
    classificationId: row.classification_id,
    attributeKey: row.attribute_key,
    label: row.label,
    dataType: row.data_type,
    uom: row.uom ?? null,
    required: Boolean(row.required),
    minValue: row.min_value !== null ? Number(row.min_value) : null,
    maxValue: row.max_value !== null ? Number(row.max_value) : null,
    defaultValue: row.default_value ?? null,
    version: Number(row.version),
  };
}

function buildClassificationTree(
  items: readonly CmmsAssetClassificationV1[],
): readonly CmmsClassificationTreeV1[] {
  const map = new Map<string, CmmsClassificationTreeV1>();
  for (const item of items) {
    map.set(item.id, { ...item, children: [] });
  }
  const roots: CmmsClassificationTreeV1[] = [];
  for (const item of items) {
    const node = map.get(item.id)!;
    if (item.parentClassId && map.has(item.parentClassId)) {
      (map.get(item.parentClassId)!.children as CmmsClassificationTreeV1[]).push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

async function assertNoClassificationCycle(
  client: PoolClient,
  tenantId: string,
  classId: string,
  newParentId: string,
): Promise<void> {
  if (classId === newParentId) {
    throw new BadRequestException({ code: 'CMMS_CYCLE_DETECTED', message: 'A classification cannot be its own parent.' });
  }
  const cycleQuery = await client.query<{ cycle: boolean }>(
    `WITH RECURSIVE ancestors(id, depth) AS (
       SELECT $3::uuid, 1
       UNION ALL
       SELECT c.parent_class_id, ancestors.depth + 1
         FROM gigalibs_cmms.cmms_asset_classifications c
         JOIN ancestors ON c.tenant_id = $1 AND c.id = ancestors.id
        WHERE c.parent_class_id IS NOT NULL AND ancestors.depth < 32
     )
     SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = $2) AS cycle`,
    [tenantId, classId, newParentId],
  );
  if (cycleQuery.rows[0]?.cycle) {
    throw new BadRequestException({
      code: 'CMMS_CYCLE_DETECTED',
      message: 'Classification hierarchy cannot contain circular dependencies.',
    });
  }
}
