import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateCmmsSpaceV1Schema,
  UpdateCmmsSpaceV1Schema,
  UploadCadLayerV1Schema,
  type CmmsSpaceTreeV1,
  type CmmsSpaceV1,
  type CmmsAssetV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { assertWritableScope, scopePredicates } from '../auth/scope.js';
import {
  assertUuid,
  iso,
  notFound,
  numberOrNull,
  parseInput,
  recordMutation,
  translateConstraint,
  versionConflict,
} from '../common/command.js';
import { DatabaseService } from '../database/database.service.js';
import { mapAsset } from '../assets/assets.service.js';

const SPACE_COLUMNS = `s.id, s.code, s.name, s.description, s.space_type, s.parent_space_id, s.site_ref,
  s.floor_number, s.gross_area_sqm, s.net_area_sqm, s.cad_layer, s.bim_guid, s.metadata,
  s.version, s.created_by, s.created_at, s.updated_at,
  (SELECT COUNT(*)::int FROM gigalibs_cmms.assets a
    WHERE a.tenant_id = s.tenant_id AND a.space_id = s.id AND a.archived_at IS NULL) AS asset_count`;

const ASSET_COLUMNS = `a.id, a.asset_tag, a.name, a.description, a.category, a.status, a.criticality,
  a.manufacturer, a.model, a.serial_number, a.parent_asset_id, a.site_ref, a.space_id, a.department_id,
  a.acquisition_cost, a.currency_code, a.purchase_date, a.warranty_expiry, a.specs, a.archived_at,
  a.version, a.created_by, a.created_at, a.updated_at,
  (SELECT COUNT(*)::int FROM gigalibs_cmms.work_orders w
    WHERE w.tenant_id = a.tenant_id AND w.asset_id = a.id
      AND w.status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD')) AS open_work_order_count`;

@Injectable()
export class EamSpacesService {
  constructor(private readonly database: DatabaseService) {}

  async create(context: CmmsCommandContext, raw: unknown): Promise<CmmsSpaceV1> {
    const input = parseInput(CreateCmmsSpaceV1Schema, raw);
    assertWritableScope(context.principal, { departmentId: null, siteRef: input.siteRef ?? null });
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      if (input.parentSpaceId) {
        const parent = await this.visibleSpace(client, context.principal, input.parentSpaceId);
        assertWritableScope(context.principal, { departmentId: null, siteRef: parent.siteRef });
      }
      try {
        const result = await client.query<{ id: string }>(
          `INSERT INTO gigalibs_cmms.cmms_spaces
             (tenant_id, code, name, description, space_type, parent_space_id, site_ref,
              floor_number, gross_area_sqm, net_area_sqm, cad_layer, bim_guid, metadata,
              created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13::jsonb, $14, $14, $15)
           RETURNING id`,
          [
            context.principal.tenantId,
            input.code,
            input.name,
            input.description ?? null,
            input.spaceType,
            input.parentSpaceId ?? null,
            input.siteRef ?? null,
            input.floorNumber ?? null,
            input.grossAreaSqm ?? null,
            input.netAreaSqm ?? null,
            JSON.stringify(input.cadLayer ?? {}),
            input.bimGuid ?? null,
            JSON.stringify(input.metadata ?? {}),
            context.principal.subject,
            context.correlationId,
          ],
        );
        const id = result.rows[0]!.id;
        await recordMutation(client, context, {
          action: 'CMMS_SPACE_CREATED',
          aggregateType: 'CMMS_SPACE',
          aggregateId: id,
          aggregateVersion: 1,
          payload: { code: input.code, name: input.name, spaceType: input.spaceType },
        });
        return this.visibleSpace(client, context.principal, id);
      } catch (error) {
        translateConstraint(error, { unique: `A space with code ${input.code} already exists.` });
      }
    });
  }

  async get(principal: CmmsPrincipal, spaceId: string): Promise<CmmsSpaceV1> {
    assertUuid(spaceId, 'spaceId');
    return this.database.withTenantTransaction(principal.tenantId, (client) =>
      this.visibleSpace(client, principal, spaceId),
    );
  }

  async update(context: CmmsCommandContext, spaceId: string, raw: unknown): Promise<CmmsSpaceV1> {
    assertUuid(spaceId, 'spaceId');
    const input = parseInput(UpdateCmmsSpaceV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.visibleSpace(client, context.principal, spaceId);
      assertWritableScope(context.principal, { departmentId: null, siteRef: current.siteRef });
      if (input.siteRef !== undefined && input.siteRef !== current.siteRef) {
        assertWritableScope(context.principal, { departmentId: null, siteRef: input.siteRef ?? null });
      }
      if (current.version !== input.expectedVersion) versionConflict('The space');

      const parentSpaceId = input.parentSpaceId === undefined ? current.parentSpaceId : input.parentSpaceId;
      if (parentSpaceId && parentSpaceId !== current.parentSpaceId) {
        const parent = await this.visibleSpace(client, context.principal, parentSpaceId);
        assertWritableScope(context.principal, { departmentId: null, siteRef: parent.siteRef });
        await assertNoSpaceCycle(client, context.principal.tenantId, spaceId, parentSpaceId);
      }

      await client.query(
        `UPDATE gigalibs_cmms.cmms_spaces
            SET name = $4,
                description = $5,
                parent_space_id = $6,
                site_ref = $7,
                floor_number = $8,
                gross_area_sqm = $9,
                net_area_sqm = $10,
                cad_layer = $11::jsonb,
                bim_guid = $12,
                metadata = $13::jsonb,
                version = version + 1,
                updated_by = $14,
                correlation_id = $15,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND version = $3`,
        [
          context.principal.tenantId,
          spaceId,
          input.expectedVersion,
          input.name ?? current.name,
          input.description !== undefined ? input.description : current.description,
          parentSpaceId,
          input.siteRef !== undefined ? input.siteRef : current.siteRef,
          input.floorNumber !== undefined ? input.floorNumber : current.floorNumber,
          input.grossAreaSqm !== undefined ? input.grossAreaSqm : current.grossAreaSqm,
          input.netAreaSqm !== undefined ? input.netAreaSqm : current.netAreaSqm,
          JSON.stringify(input.cadLayer !== undefined ? input.cadLayer : current.cadLayer),
          input.bimGuid !== undefined ? input.bimGuid : current.bimGuid,
          JSON.stringify(input.metadata !== undefined ? input.metadata : current.metadata),
          context.principal.subject,
          context.correlationId,
        ],
      );

      await recordMutation(client, context, {
        action: 'CMMS_SPACE_UPDATED',
        aggregateType: 'CMMS_SPACE',
        aggregateId: spaceId,
        aggregateVersion: current.version + 1,
        payload: { name: input.name ?? current.name, parentSpaceId },
      });

      return this.visibleSpace(client, context.principal, spaceId);
    });
  }

  async delete(context: CmmsCommandContext, spaceId: string): Promise<{ deleted: boolean }> {
    assertUuid(spaceId, 'spaceId');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const space = await this.visibleSpace(client, context.principal, spaceId);
      assertWritableScope(context.principal, { departmentId: null, siteRef: space.siteRef });

      // Guard: Cannot delete if child spaces exist
      const childCount = await client.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM gigalibs_cmms.cmms_spaces WHERE tenant_id = $1 AND parent_space_id = $2',
        [context.principal.tenantId, spaceId],
      );
      if (parseInt(childCount.rows[0]?.count ?? '0', 10) > 0) {
        throw new ConflictException({
          code: 'CMMS_SPACE_HAS_CHILDREN',
          message: 'Cannot delete a space that contains child spaces. Reassign or delete children first.',
        });
      }

      // Guard: Cannot delete if active assets exist inside space
      if (space.assetCount > 0) {
        throw new ConflictException({
          code: 'CMMS_SPACE_HAS_ASSETS',
          message: `Cannot delete space with ${space.assetCount} active assets. Move assets before deleting space.`,
        });
      }

      await client.query('DELETE FROM gigalibs_cmms.cmms_spaces WHERE tenant_id = $1 AND id = $2', [
        context.principal.tenantId,
        spaceId,
      ]);

      await recordMutation(client, context, {
        action: 'CMMS_SPACE_DELETED',
        aggregateType: 'CMMS_SPACE',
        aggregateId: spaceId,
        aggregateVersion: space.version + 1,
        payload: { code: space.code, name: space.name },
      });

      return { deleted: true };
    });
  }

  async tree(principal: CmmsPrincipal): Promise<readonly CmmsSpaceTreeV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['s.tenant_id = $1'];
      if (principal.placeScope.mode === 'PLACES') {
        values.push([...principal.placeScope.placeIds]);
        where.push(`s.site_ref = ANY($${values.length}::uuid[])`);
      }
      const result = await client.query(
        `SELECT ${SPACE_COLUMNS}
           FROM gigalibs_cmms.cmms_spaces s
          WHERE ${where.join(' AND ')}
          ORDER BY s.floor_number ASC NULLS FIRST, s.code ASC`,
        values,
      );

      const spaces = result.rows.map(mapSpace);
      return buildSpaceTree(spaces);
    });
  }

  async getAssetsInSpace(principal: CmmsPrincipal, spaceId: string): Promise<readonly CmmsAssetV1[]> {
    assertUuid(spaceId, 'spaceId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.visibleSpace(client, principal, spaceId);
      const values: unknown[] = [principal.tenantId, spaceId];
      const where = [
        'a.tenant_id = $1',
        'a.space_id = $2',
        'a.archived_at IS NULL',
        ...scopePredicates(principal, values, 'a.'),
      ];
      const result = await client.query(
        `SELECT ${ASSET_COLUMNS}
           FROM gigalibs_cmms.assets a
          WHERE ${where.join(' AND ')}
          ORDER BY a.name ASC`,
        values,
      );
      return result.rows.map(mapAsset);
    });
  }

  async uploadCadLayer(context: CmmsCommandContext, spaceId: string, raw: unknown): Promise<CmmsSpaceV1> {
    assertUuid(spaceId, 'spaceId');
    const input = parseInput(UploadCadLayerV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.visibleSpace(client, context.principal, spaceId);
      assertWritableScope(context.principal, { departmentId: null, siteRef: current.siteRef });
      await client.query(
        `UPDATE gigalibs_cmms.cmms_spaces
            SET cad_layer = $3::jsonb,
                version = version + 1,
                updated_by = $4,
                correlation_id = $5,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [
          context.principal.tenantId,
          spaceId,
          JSON.stringify(input.cadLayer),
          context.principal.subject,
          context.correlationId,
        ],
      );

      await recordMutation(client, context, {
        action: 'CMMS_SPACE_CAD_UPLOADED',
        aggregateType: 'CMMS_SPACE',
        aggregateId: spaceId,
        aggregateVersion: current.version + 1,
        payload: { spaceId },
      });

      return this.visibleSpace(client, context.principal, spaceId);
    });
  }

  private async visibleSpace(client: PoolClient, principal: CmmsPrincipal, spaceId: string): Promise<CmmsSpaceV1> {
    assertUuid(spaceId, 'spaceId');
    const values: unknown[] = [principal.tenantId, spaceId];
    const where = ['s.tenant_id = $1', 's.id = $2'];
    if (principal.placeScope.mode === 'PLACES') {
      values.push([...principal.placeScope.placeIds]);
      where.push(`s.site_ref = ANY($${values.length}::uuid[])`);
    }
    const result = await client.query(
      `SELECT ${SPACE_COLUMNS}
         FROM gigalibs_cmms.cmms_spaces s
        WHERE ${where.join(' AND ')}`,
      values,
    );
    if (!result.rows[0]) notFound('Space');
    return mapSpace(result.rows[0]);
  }
}

function mapSpace(row: any): CmmsSpaceV1 {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    spaceType: row.space_type,
    parentSpaceId: row.parent_space_id ?? null,
    siteRef: row.site_ref ?? null,
    floorNumber: row.floor_number !== null ? Number(row.floor_number) : null,
    grossAreaSqm: numberOrNull(row.gross_area_sqm),
    netAreaSqm: numberOrNull(row.net_area_sqm),
    cadLayer: row.cad_layer ?? {},
    bimGuid: row.bim_guid ?? null,
    metadata: row.metadata ?? {},
    assetCount: Number(row.asset_count ?? 0),
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function buildSpaceTree(spaces: readonly CmmsSpaceV1[]): readonly CmmsSpaceTreeV1[] {
  const map = new Map<string, CmmsSpaceTreeV1>();
  for (const s of spaces) {
    map.set(s.id, { ...s, children: [] });
  }

  const roots: CmmsSpaceTreeV1[] = [];
  for (const s of spaces) {
    const node = map.get(s.id)!;
    if (s.parentSpaceId && map.has(s.parentSpaceId)) {
      (map.get(s.parentSpaceId)!.children as CmmsSpaceTreeV1[]).push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

async function assertNoSpaceCycle(
  client: PoolClient,
  tenantId: string,
  spaceId: string,
  newParentId: string,
): Promise<void> {
  if (spaceId === newParentId) {
    throw new BadRequestException({ code: 'CMMS_CYCLE_DETECTED', message: 'A space cannot be its own parent.' });
  }
  const cycleQuery = await client.query<{ cycle: boolean }>(
    `WITH RECURSIVE ancestors(id, depth) AS (
       SELECT $3::uuid, 1
       UNION ALL
       SELECT s.parent_space_id, ancestors.depth + 1
         FROM gigalibs_cmms.cmms_spaces s
         JOIN ancestors ON s.tenant_id = $1 AND s.id = ancestors.id
        WHERE s.parent_space_id IS NOT NULL AND ancestors.depth < 64
     )
     SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = $2) AS cycle`,
    [tenantId, spaceId, newParentId],
  );
  if (cycleQuery.rows[0]?.cycle) {
    throw new BadRequestException({
      code: 'CMMS_CYCLE_DETECTED',
      message: 'A space cannot be placed under itself or its descendants.',
    });
  }
}
