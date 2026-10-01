import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  boundaryAreaM2,
  CreateSpatialNodeTypeV1Schema,
  CreateSpatialNodeV1Schema,
  ImportSpatialNodesV1Schema,
  ListSpatialNodesV1QuerySchema,
  MoveSpatialNodeV1Schema,
  SpatialNodeImportRowV1Schema,
  UpdateSpatialNodeV1Schema,
  MobileSpatialSyncQuerySchema,
  type CreateSpatialNodeV1,
  type MobileSpatialSyncResponseV1,
  type MoveSpatialNodeV1,
  type SpatialBoundaryV1,
  type SpatialNodeImportResultV1,
  type SpatialNodeImportRowV1,
  type SpatialNodeChangedV1,
  type SpatialNodeDetailV1,
  type SpatialNodePageV1,
  type SpatialNodeTypeV1,
  type SpatialNodeV1,
  type UpdateSpatialNodeV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { GeospatialPrincipal } from '../auth/authorization.js';
import { GeospatialDatabaseService } from '../database/database.service.js';

const MAX_DEPTH = 32;

/**
 * Current paths of the places a spatially scoped principal may reach (each with everything inside it), or
 * null when the principal is unbounded. Resolved from place ids on every request, so a move keeps the
 * assignment and a re-used path never grants access.
 */
type ScopeRoots = readonly string[] | null;

interface PlannedImportRow {
  readonly row: number;
  readonly input: SpatialNodeImportRowV1;
  readonly parentPath: string | null;
  readonly path: string;
}

export interface CommandContext {
  readonly principal: GeospatialPrincipal;
  readonly correlationId: string;
}

@Injectable()
export class PlacesService {
  constructor(private readonly database: GeospatialDatabaseService) {}

  async listNodeTypes(principal: GeospatialPrincipal): Promise<{ readonly items: readonly SpatialNodeTypeV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const roots = await this.scopeRoots(client, principal);
      // Types are the tenant's shared catalogue; scoped principals only see counts for their own places.
      const result = await client.query(
        `SELECT t.*,
                (SELECT COUNT(*)::int FROM gigalibs_geospatial.spatial_nodes n
                  WHERE n.tenant_id = t.tenant_id AND n.node_type_id = t.id
                    ${roots === null ? '' : `AND ${inScope('n.path', 2)}`}) AS node_count
           FROM gigalibs_geospatial.spatial_node_types t
          WHERE t.tenant_id = $1
          ORDER BY t.label ASC, t.id ASC`,
        roots === null ? [principal.tenantId] : [principal.tenantId, roots],
      );
      return { items: result.rows.map(mapNodeType) };
    });
  }

  async createNodeType(context: CommandContext, rawInput: unknown): Promise<SpatialNodeTypeV1> {
    const input = parse(CreateSpatialNodeTypeV1Schema, rawInput);
    if (context.principal.spatialScope.mode !== 'UNBOUNDED') {
      throw spatialScopeDenied('Place types are shared across the workspace; ask a workspace administrator.');
    }
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      try {
        const result = await client.query(
          `INSERT INTO gigalibs_geospatial.spatial_node_types
             (tenant_id, code, label, created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $4, $5)
           RETURNING *, 0 AS node_count`,
          [context.principal.tenantId, input.code, input.label, context.principal.subject, context.correlationId],
        );
        const row = result.rows[0]!;
        await recordAudit(client, context, 'SPATIAL_NODE_TYPE_CREATED', 'SPATIAL_NODE_TYPE', row.id, { code: input.code });
        await recordOutbox(client, context, 'SpatialNodeTypeCreatedV1', 'SPATIAL_NODE_TYPE', row.id, 1, {
          nodeTypeId: row.id,
          code: input.code,
          label: input.label,
        });
        return mapNodeType(row);
      } catch (error) {
        translateUnique(error, 'A node type with this code already exists.');
      }
    });
  }

  async listNodes(principal: GeospatialPrincipal, rawQuery: unknown): Promise<SpatialNodePageV1> {
    const query = parse(ListSpatialNodesV1QuerySchema, rawQuery);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const roots = await this.scopeRoots(client, principal);
      const values: unknown[] = [principal.tenantId];
      const where = ['n.tenant_id = $1'];
      if (roots !== null) {
        values.push(roots);
        where.push(inScope('n.path', values.length));
      }
      if (query.roots === 'true') where.push('n.parent_id IS NULL');
      if (query.parentId) {
        values.push(query.parentId);
        where.push(`n.parent_id = $${values.length}`);
      }
      if (query.under) {
        const anchor = await this.lockableNode(client, principal.tenantId, query.under, false, roots);
        values.push(anchor.path, anchor.id);
        where.push(`n.path <@ $${values.length - 1}::ltree AND n.id <> $${values.length}`);
      }
      if (query.q) {
        values.push(`%${query.q}%`);
        where.push(`(n.display_name ILIKE $${values.length} OR n.code ILIKE $${values.length})`);
      }
      if (query.status) {
        values.push(query.status);
        where.push(`n.status = $${values.length}`);
      }
      values.push(query.pageSize, (query.page - 1) * query.pageSize);
      const result = await client.query(
        `${nodeSelect()}
          WHERE ${where.join(' AND ')}
          ORDER BY n.path ASC
          LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      );
      const count = await client.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM gigalibs_geospatial.spatial_nodes
          WHERE tenant_id = $1 ${roots === null ? '' : `AND ${inScope('path', 2)}`}`,
        roots === null ? [principal.tenantId] : [principal.tenantId, roots],
      );
      return {
        items: result.rows.map(mapNode),
        total: Number(result.rows[0]?.total_count ?? 0),
        page: query.page,
        pageSize: query.pageSize,
        tenantNodeCount: Number(count.rows[0]?.total ?? 0),
        generatedAt: new Date().toISOString(),
      };
    });
  }

  async getNode(principal: GeospatialPrincipal, nodeId: string): Promise<SpatialNodeDetailV1> {
    assertUuid(nodeId, 'nodeId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) =>
      this.detail(client, principal.tenantId, nodeId, await this.scopeRoots(client, principal)),
    );
  }

  async mobileSync(
    principal: GeospatialPrincipal,
    rawQuery: unknown,
  ): Promise<MobileSpatialSyncResponseV1> {
    const query = parse(MobileSpatialSyncQuerySchema, rawQuery);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const roots = await this.scopeRoots(client, principal);
      const values: unknown[] = [principal.tenantId];
      const where = ['n.tenant_id = $1'];
      if (roots !== null) {
        values.push(roots);
        where.push(inScope('n.path', values.length));
      }
      if (query.under) {
        const anchor = await this.lockableNode(client, principal.tenantId, query.under, false, roots);
        values.push(anchor.path);
        where.push(`n.path <@ $${values.length}::ltree`);
      }
      if (query.since) {
        values.push(new Date(query.since));
        where.push(`n.updated_at >= $${values.length}`);
      }
      const result = await client.query(
        `SELECT n.id, n.code, n.display_name, n.path::text AS path, nlevel(n.path) AS depth,
                t.code AS node_type_code, n.latitude, n.longitude, n.status, n.version,
                n.updated_at
           FROM gigalibs_geospatial.spatial_nodes n
           JOIN gigalibs_geospatial.spatial_node_types t
             ON t.tenant_id = n.tenant_id AND t.id = n.node_type_id
          WHERE ${where.join(' AND ')}
          ORDER BY n.path ASC`,
        values,
      );
      const count = await client.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM gigalibs_geospatial.spatial_nodes
          WHERE tenant_id = $1 ${roots === null ? '' : `AND ${inScope('path', 2)}`}`,
        roots === null ? [principal.tenantId] : [principal.tenantId, roots],
      );
      return {
        serverTime: new Date().toISOString(),
        nodes: result.rows.map((row) => ({
          id: row.id as string,
          code: row.code as string,
          displayName: row.display_name as string,
          path: row.path as string,
          depth: Number(row.depth),
          nodeTypeCode: row.node_type_code as string,
          latitude: row.latitude === null ? null : Number(row.latitude),
          longitude: row.longitude === null ? null : Number(row.longitude),
          status: row.status as 'ACTIVE' | 'INACTIVE',
          version: Number(row.version),
          updatedAt: (row.updated_at as Date).toISOString(),
        })),
        tenantNodeCount: Number(count.rows[0]?.total ?? 0),
      };
    });
  }

  async lookupTag(
    principal: GeospatialPrincipal,
    tag: string,
  ): Promise<SpatialNodeDetailV1> {
    const trimmed = tag.trim();
    if (!trimmed) throw new BadRequestException('A non-empty tag, code, or path is required.');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const roots = await this.scopeRoots(client, principal);
      const values: unknown[] = [principal.tenantId, trimmed];
      const where = [
        'n.tenant_id = $1',
        '(n.code = $2 OR n.path::text = $2 OR n.id::text = $2)',
      ];
      if (roots !== null) {
        values.push(roots);
        where.push(inScope('n.path', values.length));
      }
      const result = await client.query<{ id: string }>(
        `SELECT n.id FROM gigalibs_geospatial.spatial_nodes n WHERE ${where.join(' AND ')} LIMIT 1`,
        values,
      );
      if (result.rowCount === 0) {
        throw new NotFoundException(`No spatial place found matching tag '${trimmed}'.`);
      }
      return this.detail(client, principal.tenantId, result.rows[0]!.id, roots);
    });
  }

  async createNode(context: CommandContext, rawInput: unknown): Promise<SpatialNodeDetailV1> {
    const input = parse(CreateSpatialNodeV1Schema, rawInput);
    return this.database.withTenantTransaction(context.principal.tenantId, (client) => this.createNodeIn(client, context, input));
  }

  /** Inside the caller's tenant transaction (WI-OI-105e: the Connector Hub inbox links the source record with it). */
  async createNodeIn(client: PoolClient, context: CommandContext, input: CreateSpatialNodeV1): Promise<SpatialNodeDetailV1> {
    const tenantId = context.principal.tenantId;
    const roots = await this.scopeRoots(client, context.principal);
    if (roots !== null && !input.parentId) {
      throw spatialScopeDenied('Add the place inside one of your assigned places.');
    }
    const nodeType = await this.activeNodeType(client, tenantId, input.nodeTypeId);
    let path = input.code;
    let parentId: string | null = null;
    if (input.parentId) {
      const parent = await this.lockableNode(client, tenantId, input.parentId, false, roots);
      if (parent.status !== 'ACTIVE') {
        throw new UnprocessableEntityException({
          code: 'SPATIAL_PARENT_INACTIVE',
          message: 'A place cannot be added under an inactive parent.',
        });
      }
      if (parent.depth + 1 > MAX_DEPTH) throw depthExceeded();
      path = `${parent.path}.${input.code}`;
      parentId = parent.id;
    }
    try {
      const result = await client.query(
        `INSERT INTO gigalibs_geospatial.spatial_nodes
           (tenant_id, parent_id, node_type_id, code, path, display_name, country_code, subdivision_code,
            time_zone, latitude, longitude, boundary, area_m2, created_by, updated_by, correlation_id)
         VALUES ($1, $2, $3, $4, $5::ltree, $6, $7, $8, $9, $10, $11, $12::jsonb, $15::numeric, $13, $13, $14)
         RETURNING id`,
        [
          tenantId,
          parentId,
          nodeType.id,
          input.code,
          path,
          input.displayName,
          input.countryCode ?? null,
          input.subdivisionCode ?? null,
          input.timeZone ?? null,
          input.latitude ?? null,
          input.longitude ?? null,
          input.boundary ? JSON.stringify(input.boundary) : null,
          context.principal.subject,
          context.correlationId,
          boundaryAreaM2(input.boundary ?? null),
        ],
      );
      const id = result.rows[0]!.id as string;
      const created = await this.detail(client, tenantId, id, roots);
      await recordAudit(client, context, 'SPATIAL_NODE_CREATED', 'SPATIAL_NODE', id, { path, nodeTypeCode: nodeType.code });
      await publishNodeChange(client, context, created, 'CREATED', null);
      return created;
    } catch (error) {
      translateUnique(error, 'A place with this code already exists under the same parent.');
    }
  }

  async updateNode(context: CommandContext, nodeId: string, rawInput: unknown): Promise<SpatialNodeDetailV1> {
    assertUuid(nodeId, 'nodeId');
    const input = parse(UpdateSpatialNodeV1Schema, rawInput);
    return this.database.withTenantTransaction(context.principal.tenantId, (client) => this.updateNodeIn(client, context, nodeId, input));
  }

  async updateNodeIn(client: PoolClient, context: CommandContext, nodeId: string, input: UpdateSpatialNodeV1): Promise<SpatialNodeDetailV1> {
    const tenantId = context.principal.tenantId;
    const roots = await this.scopeRoots(client, context.principal);
    const current = await this.lockableNode(client, tenantId, nodeId, true, roots);
    if (current.version !== input.expectedVersion) throw versionConflict(input.expectedVersion, current.version);
    if (input.nodeTypeId) await this.activeNodeType(client, tenantId, input.nodeTypeId);
    if (input.status === 'INACTIVE' && current.status === 'ACTIVE') {
      const active = await client.query(
        `SELECT 1 FROM gigalibs_geospatial.spatial_nodes
          WHERE tenant_id = $1 AND path <@ $2::ltree AND id <> $3 AND status = 'ACTIVE' LIMIT 1`,
        [tenantId, current.path, nodeId],
      );
      if (active.rowCount) {
        throw new ConflictException({
          code: 'SPATIAL_ACTIVE_DESCENDANTS',
          message: 'Deactivate or move the places under this one first.',
        });
      }
    }
    if (input.status === 'ACTIVE' && current.status === 'INACTIVE' && current.parentId) {
      const parent = await this.lockableNode(client, tenantId, current.parentId, false);
      if (parent.status !== 'ACTIVE') {
        throw new UnprocessableEntityException({
          code: 'SPATIAL_PARENT_INACTIVE',
          message: 'Reactivate the parent place first.',
        });
      }
    }

    const has = (key: keyof typeof input) => Object.prototype.hasOwnProperty.call(input, key);
    const merged = {
      countryCode: has('countryCode') ? (input.countryCode ?? null) : current.countryCode,
      subdivisionCode: has('subdivisionCode') ? (input.subdivisionCode ?? null) : current.subdivisionCode,
      latitude: has('latitude') ? (input.latitude ?? null) : current.latitude,
      longitude: has('longitude') ? (input.longitude ?? null) : current.longitude,
    };
    if ((merged.latitude === null) !== (merged.longitude === null)) {
      throw new BadRequestException({
        code: 'GEOSPATIAL_VALIDATION_FAILED',
        message: 'Provide both latitude and longitude, or neither.',
      });
    }
    if (merged.subdivisionCode && !merged.subdivisionCode.startsWith(`${merged.countryCode ?? ''}-`)) {
      throw new BadRequestException({
        code: 'GEOSPATIAL_VALIDATION_FAILED',
        message: 'The subdivision must belong to the selected country.',
      });
    }

    await client.query(
      `UPDATE gigalibs_geospatial.spatial_nodes
          SET display_name = COALESCE($3, display_name),
              node_type_id = COALESCE($4, node_type_id),
              status = COALESCE($5, status),
              country_code = $6,
              subdivision_code = $7,
              time_zone = CASE WHEN $8::boolean THEN $9 ELSE time_zone END,
              latitude = $10,
              longitude = $11,
              boundary = CASE WHEN $12::boolean THEN $13::jsonb ELSE boundary END,
              area_m2 = CASE WHEN $12::boolean THEN $16::numeric ELSE area_m2 END,
              version = version + 1,
              updated_by = $14,
              correlation_id = $15,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [
        tenantId,
        nodeId,
        input.displayName ?? null,
        input.nodeTypeId ?? null,
        input.status ?? null,
        merged.countryCode,
        merged.subdivisionCode,
        has('timeZone'),
        input.timeZone ?? null,
        merged.latitude,
        merged.longitude,
        has('boundary'),
        input.boundary ? JSON.stringify(input.boundary) : null,
        context.principal.subject,
        context.correlationId,
        boundaryAreaM2(input.boundary ?? null),
      ],
    );
    const updated = await this.detail(client, tenantId, nodeId, roots);
    const change: SpatialNodeChangedV1['change'] =
      input.status === 'INACTIVE' && current.status === 'ACTIVE'
        ? 'DEACTIVATED'
        : input.status === 'ACTIVE' && current.status === 'INACTIVE'
          ? 'REACTIVATED'
          : 'UPDATED';
    await recordAudit(client, context, `SPATIAL_NODE_${change}`, 'SPATIAL_NODE', nodeId, {
      fields: Object.keys(input).filter((key) => key !== 'expectedVersion'),
    });
    await publishNodeChange(client, context, updated, change, null);
    return updated;
  }

  async moveNode(context: CommandContext, nodeId: string, rawInput: unknown): Promise<SpatialNodeDetailV1> {
    assertUuid(nodeId, 'nodeId');
    const input = parse(MoveSpatialNodeV1Schema, rawInput);
    return this.database.withTenantTransaction(context.principal.tenantId, (client) => this.moveNodeIn(client, context, nodeId, input));
  }

  async moveNodeIn(client: PoolClient, context: CommandContext, nodeId: string, input: MoveSpatialNodeV1): Promise<SpatialNodeDetailV1> {
    const tenantId = context.principal.tenantId;
    const roots = await this.scopeRoots(client, context.principal);
    const node = await this.lockableNode(client, tenantId, nodeId, true, roots);
    if (node.version !== input.expectedVersion) throw versionConflict(input.expectedVersion, node.version);
    if (roots !== null && !input.newParentId) {
      throw spatialScopeDenied('Move the place inside one of your assigned places.');
    }
    if (input.newParentId === node.parentId) {
      throw new UnprocessableEntityException({
        code: 'SPATIAL_MOVE_UNCHANGED',
        message: 'The place is already under that parent.',
      });
    }

    let newPrefix = node.code;
    if (input.newParentId) {
      const parent = await this.lockableNode(client, tenantId, input.newParentId, false, roots);
      if (parent.status !== 'ACTIVE') {
        throw new UnprocessableEntityException({
          code: 'SPATIAL_PARENT_INACTIVE',
          message: 'A place cannot be moved under an inactive parent.',
        });
      }
      const inside = await client.query(`SELECT $1::ltree <@ $2::ltree AS inside`, [parent.path, node.path]);
      if (inside.rows[0]?.inside === true) {
        throw new UnprocessableEntityException({
          code: 'SPATIAL_MOVE_CYCLE',
          message: 'A place cannot be moved under itself or one of its own places.',
        });
      }
      newPrefix = `${parent.path}.${node.code}`;
    }

    const deepest = await client.query<{ depth: number }>(
      `SELECT MAX(nlevel(path))::int AS depth FROM gigalibs_geospatial.spatial_nodes
        WHERE tenant_id = $1 AND path <@ $2::ltree`,
      [tenantId, node.path],
    );
    const newDepth = newPrefix.split('.').length + Number(deepest.rows[0]?.depth ?? node.depth) - node.depth;
    if (newDepth > MAX_DEPTH) throw depthExceeded();

    try {
      const moved = await client.query<{ id: string; previous_path: string }>(
        `WITH affected AS (
           SELECT id, path AS previous_path FROM gigalibs_geospatial.spatial_nodes
            WHERE tenant_id = $1 AND path <@ $2::ltree
            FOR UPDATE
         )
         UPDATE gigalibs_geospatial.spatial_nodes n
            -- subpath() rejects an offset equal to nlevel(), so the moved place takes the prefix as is.
            SET path = CASE WHEN n.path = $2::ltree THEN $3::ltree
                            ELSE $3::ltree || subpath(n.path, nlevel($2::ltree)) END,
                parent_id = CASE WHEN n.id = $4 THEN $5::uuid ELSE n.parent_id END,
                version = n.version + 1,
                updated_by = $6,
                correlation_id = $7,
                updated_at = now()
           FROM affected a
          WHERE n.tenant_id = $1 AND n.id = a.id
          RETURNING n.id, a.previous_path::text AS previous_path`,
        [tenantId, node.path, newPrefix, nodeId, input.newParentId, context.principal.subject, context.correlationId],
      );
      await recordAudit(client, context, 'SPATIAL_NODE_MOVED', 'SPATIAL_NODE', nodeId, {
        previousPath: node.path,
        path: newPrefix,
        affectedNodes: moved.rowCount,
      });
      for (const row of moved.rows) {
        const changed = await this.detail(client, tenantId, row.id);
        await publishNodeChange(client, context, changed, 'MOVED', row.previous_path);
      }
      return this.detail(client, tenantId, nodeId, roots);
    } catch (error) {
      translateUnique(error, 'A place with this code already exists under the new parent.');
    }
  }

  private async activeNodeType(client: PoolClient, tenantId: string, nodeTypeId: string) {
    const result = await client.query<{ id: string; code: string }>(
      `SELECT id, code FROM gigalibs_geospatial.spatial_node_types
        WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE'`,
      [tenantId, nodeTypeId],
    );
    if (result.rowCount === 0) throw new NotFoundException('Active node type was not found.');
    return result.rows[0]!;
  }

  /**
   * Bulk-creates places from spreadsheet rows. VALIDATE reports every problem by row and writes nothing;
   * COMMIT is all-or-nothing and writes the same per-place audit and `SpatialNodeChangedV1` event as a
   * single create, plus one import summary audit. Parents are referenced by path and may be created earlier
   * in the same file, so rows are inserted one depth level at a time.
   */
  /**
   * WI-OI-105b: queues every place of the tenant again with its current state (name, point, boundary, area), so a
   * consumer's place directory (Analytics) can be rebuilt. Tenant-wide, so only a member without a place scope may.
   */
  async republishPlaces(context: CommandContext): Promise<{ republished: number }> {
    if (context.principal.spatialScope.mode !== 'UNBOUNDED') {
      throw new ForbiddenException({ code: 'SPATIAL_SCOPE_DENIED', message: 'Republishing every place needs a member without a place scope.' });
    }
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const result = await client.query(
        `INSERT INTO gigalibs_geospatial.outbox_events
           (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version, correlation_id, schema_version, payload)
         SELECT gen_random_uuid()::text, n.tenant_id, 'geospatial.facts.v1', 'SpatialNodeChangedV1', 'SPATIAL_NODE', n.id::text,
                n.version, $2, 1, gigalibs_geospatial.place_fact_payload(n, t.code)
           FROM gigalibs_geospatial.spatial_nodes n
           JOIN gigalibs_geospatial.spatial_node_types t ON t.tenant_id = n.tenant_id AND t.id = n.node_type_id
          WHERE n.tenant_id = $1
         ON CONFLICT (tenant_id, aggregate_type, aggregate_id, aggregate_version, event_type)
         DO UPDATE SET payload = EXCLUDED.payload, status = 'PENDING', available_at = now(), attempt_count = 0`,
        [tenantId, context.correlationId],
      );
      const republished = result.rowCount ?? 0;
      await recordAudit(client, context, 'SPATIAL_NODES_REPUBLISHED', 'SPATIAL_NODE_REPUBLISH', randomUUID(), { republished });
      return { republished };
    });
  }

  async importNodes(context: CommandContext, rawInput: unknown): Promise<SpatialNodeImportResultV1> {
    const input = parse(ImportSpatialNodesV1Schema, rawInput);
    if (context.principal.spatialScope.mode !== 'UNBOUNDED') {
      throw spatialScopeDenied('Bulk import changes places across the workspace; ask a workspace administrator.');
    }
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const errors: SpatialNodeImportResultV1['errors'] = [];
      const planned: PlannedImportRow[] = [];
      input.rows.forEach((raw, index) => {
        const parsed = SpatialNodeImportRowV1Schema.safeParse(raw);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            errors.push({ row: index + 1, field: issue.path.join('.') || null, message: issue.message });
          }
          return;
        }
        const parentPath = parsed.data.parentPath || null;
        planned.push({
          row: index + 1,
          input: parsed.data,
          parentPath,
          path: parentPath ? `${parentPath}.${parsed.data.code}` : parsed.data.code,
        });
      });

      const rowByPath = new Map<string, number>();
      for (const item of planned) {
        const earlier = rowByPath.get(item.path);
        if (earlier) errors.push({ row: item.row, field: 'code', message: `Row ${earlier} already creates ${item.path}.` });
        else rowByPath.set(item.path, item.row);
      }

      const types = await client.query<{ id: string; code: string }>(
        `SELECT id, code FROM gigalibs_geospatial.spatial_node_types
          WHERE tenant_id = $1 AND status = 'ACTIVE' AND code = ANY($2::text[])`,
        [tenantId, [...new Set(planned.map((item) => item.input.nodeTypeCode))]],
      );
      const typeIdByCode = new Map(types.rows.map((type) => [type.code, type.id] as const));

      const existing = await client.query<{ id: string; path: string; status: string }>(
        `SELECT id, path::text AS path, status FROM gigalibs_geospatial.spatial_nodes
          WHERE tenant_id = $1 AND path = ANY($2::ltree[])`,
        [tenantId, [...new Set(planned.flatMap((item) => (item.parentPath ? [item.path, item.parentPath] : [item.path])))]],
      );
      const existingByPath = new Map(existing.rows.map((node) => [node.path, node] as const));

      for (const item of planned) {
        if (!typeIdByCode.has(item.input.nodeTypeCode)) {
          errors.push({ row: item.row, field: 'nodeTypeCode', message: `There is no active place type ${item.input.nodeTypeCode}.` });
        }
        if (existingByPath.has(item.path)) {
          errors.push({ row: item.row, field: 'code', message: `A place already exists at ${item.path}.` });
        }
        if (item.parentPath) {
          const parent = existingByPath.get(item.parentPath);
          if (parent && parent.status !== 'ACTIVE') {
            errors.push({ row: item.row, field: 'parentPath', message: `The parent ${item.parentPath} is inactive.` });
          } else if (!parent && !rowByPath.has(item.parentPath)) {
            errors.push({
              row: item.row,
              field: 'parentPath',
              message: `The parent ${item.parentPath} is neither an existing place nor created in this file.`,
            });
          }
        }
      }
      errors.sort((a, b) => a.row - b.row);

      const result: SpatialNodeImportResultV1 = {
        mode: input.mode,
        rowCount: input.rows.length,
        valid: errors.length === 0,
        created: 0,
        errors,
      };
      if (input.mode === 'VALIDATE') return result;
      if (errors.length > 0) {
        throw new UnprocessableEntityException({
          code: 'SPATIAL_IMPORT_INVALID',
          message: 'Fix the reported rows; nothing was imported.',
          result,
        });
      }

      const idByPath = new Map(existing.rows.map((node) => [node.path, node.id] as const));
      const levels = new Map<number, PlannedImportRow[]>();
      for (const item of planned) {
        const depth = item.path.split('.').length;
        levels.set(depth, [...(levels.get(depth) ?? []), item]);
      }
      const createdPaths: string[] = [];
      try {
        for (const depth of [...levels.keys()].sort((a, b) => a - b)) {
          const inserted = await client.query<{ id: string; path: string }>(
            `INSERT INTO gigalibs_geospatial.spatial_nodes
               (tenant_id, parent_id, node_type_id, code, path, display_name, country_code, subdivision_code,
                time_zone, latitude, longitude, created_by, updated_by, correlation_id)
             SELECT $1, u.parent_id, u.node_type_id, u.code, u.path::ltree, u.display_name, u.country_code,
                    u.subdivision_code, u.time_zone, u.latitude, u.longitude, $2, $2, $3
               FROM jsonb_to_recordset($4::jsonb) AS u(parent_id uuid, node_type_id uuid, code text, path text,
                    display_name text, country_code text, subdivision_code text, time_zone text,
                    latitude numeric, longitude numeric)
             RETURNING id, path::text AS path`,
            [
              tenantId,
              context.principal.subject,
              context.correlationId,
              JSON.stringify(levels.get(depth)!.map((item) => ({
                parent_id: item.parentPath ? idByPath.get(item.parentPath) : null,
                node_type_id: typeIdByCode.get(item.input.nodeTypeCode),
                code: item.input.code,
                path: item.path,
                display_name: item.input.displayName,
                country_code: item.input.countryCode ?? null,
                subdivision_code: item.input.subdivisionCode ?? null,
                time_zone: item.input.timeZone ?? null,
                latitude: item.input.latitude ?? null,
                longitude: item.input.longitude ?? null,
              }))),
            ],
          );
          for (const node of inserted.rows) {
            idByPath.set(node.path, node.id);
            createdPaths.push(node.path);
          }
        }
      } catch (error) {
        translateUnique(error, 'A place in this file was created by someone else meanwhile; validate again.');
      }

      const importId = randomUUID();
      const itemByPath = new Map(planned.map((item) => [item.path, item] as const));
      const facts = createdPaths.map((path) => {
        const item = itemByPath.get(path)!;
        const fact: SpatialNodeChangedV1 = {
          nodeId: idByPath.get(path)!,
          change: 'CREATED',
          path,
          previousPath: null,
          parentId: item.parentPath ? idByPath.get(item.parentPath)! : null,
          nodeTypeCode: item.input.nodeTypeCode,
          countryCode: item.input.countryCode ?? null,
          subdivisionCode: item.input.subdivisionCode ?? null,
          timeZone: item.input.timeZone ?? null,
          status: 'ACTIVE',
          aggregateVersion: 1,
        };
        return fact;
      });
      await client.query(
        `INSERT INTO gigalibs_geospatial.audit_events
           (id, tenant_id, actor_subject, action, entity_type, entity_id, correlation_id, payload)
         SELECT u.id, $1, $2, u.action, u.entity_type, u.entity_id, $3, u.payload
           FROM jsonb_to_recordset($4::jsonb) AS u(id text, action text, entity_type text, entity_id text, payload jsonb)`,
        [
          tenantId,
          context.principal.subject,
          context.correlationId,
          JSON.stringify([
            ...facts.map((fact) => ({
              id: randomUUID(),
              action: 'SPATIAL_NODE_CREATED',
              entity_type: 'SPATIAL_NODE',
              entity_id: fact.nodeId,
              payload: { path: fact.path, nodeTypeCode: fact.nodeTypeCode, importId },
            })),
            {
              id: randomUUID(),
              action: 'SPATIAL_NODES_IMPORTED',
              entity_type: 'SPATIAL_NODE_IMPORT',
              entity_id: importId,
              payload: { rowCount: input.rows.length, created: facts.length },
            },
          ]),
        ],
      );
      await client.query(
        `INSERT INTO gigalibs_geospatial.outbox_events
           (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version,
            correlation_id, schema_version, payload)
         SELECT u.id, $1, 'geospatial.facts.v1', 'SpatialNodeChangedV1', 'SPATIAL_NODE', u.aggregate_id, 1, $2, 1,
                u.payload
           FROM jsonb_to_recordset($3::jsonb) AS u(id text, aggregate_id text, payload jsonb)`,
        [
          tenantId,
          context.correlationId,
          JSON.stringify(facts.map((fact) => ({ id: randomUUID(), aggregate_id: fact.nodeId, payload: fact }))),
        ],
      );
      return { ...result, created: facts.length };
    });
  }

  private async scopeRoots(client: PoolClient, principal: GeospatialPrincipal): Promise<ScopeRoots> {
    const scope = principal.spatialScope;
    if (scope.mode === 'UNBOUNDED') return null;
    if (scope.place_ids.length === 0) return [];
    const result = await client.query<{ path: string }>(
      `SELECT path::text AS path FROM gigalibs_geospatial.spatial_nodes
        WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
      [principal.tenantId, scope.place_ids],
    );
    return result.rows.map((row) => row.path);
  }

  /** A place outside the principal's scope is reported exactly like a missing one. */
  private async lockableNode(
    client: PoolClient,
    tenantId: string,
    nodeId: string,
    lock: boolean,
    roots: ScopeRoots = null,
  ) {
    assertUuid(nodeId, 'nodeId');
    const result = await client.query(
      `SELECT id, parent_id, code, path::text AS path, nlevel(path) AS depth, status, version,
              country_code, subdivision_code, latitude, longitude
         FROM gigalibs_geospatial.spatial_nodes
        WHERE tenant_id = $1 AND id = $2 ${roots === null ? '' : `AND ${inScope('path', 3)}`}
        ${lock ? 'FOR UPDATE' : ''}`,
      roots === null ? [tenantId, nodeId] : [tenantId, nodeId, roots],
    );
    if (result.rowCount === 0) throw new NotFoundException('Place was not found.');
    const row = result.rows[0]!;
    return {
      id: row.id as string,
      parentId: (row.parent_id as string | null) ?? null,
      code: row.code as string,
      path: row.path as string,
      depth: Number(row.depth),
      status: row.status as 'ACTIVE' | 'INACTIVE',
      version: Number(row.version),
      countryCode: (row.country_code as string | null) ?? null,
      subdivisionCode: (row.subdivision_code as string | null) ?? null,
      latitude: row.latitude === null ? null : Number(row.latitude),
      longitude: row.longitude === null ? null : Number(row.longitude),
    };
  }

  /** Ancestors outside the principal's scope are left out of the breadcrumb. */
  private async detail(
    client: PoolClient,
    tenantId: string,
    nodeId: string,
    roots: ScopeRoots = null,
  ): Promise<SpatialNodeDetailV1> {
    const scoped = roots === null ? '' : `AND ${inScope('n.path', 3)}`;
    const result = await client.query(
      `${nodeSelect()} WHERE n.tenant_id = $1 AND n.id = $2 ${scoped}`,
      roots === null ? [tenantId, nodeId] : [tenantId, nodeId, roots],
    );
    if (result.rowCount === 0) throw new NotFoundException('Place was not found.');
    const row = result.rows[0]!;
    const ancestors = await client.query(
      `SELECT id, code, display_name, path::text AS path
         FROM gigalibs_geospatial.spatial_nodes
        WHERE tenant_id = $1 AND path @> $2::ltree AND id <> $3
          ${roots === null ? '' : `AND ${inScope('path', 4)}`}
        ORDER BY nlevel(path) ASC`,
      roots === null ? [tenantId, row.path, nodeId] : [tenantId, row.path, nodeId, roots],
    );
    return {
      ...mapNode(row),
      boundary: (row.boundary as SpatialBoundaryV1 | null) ?? null,
      ancestors: ancestors.rows.map((ancestor) => ({
        id: ancestor.id,
        code: ancestor.code,
        displayName: ancestor.display_name,
        path: ancestor.path,
      })),
    };
  }
}

/** Limits an ltree column to the scope roots bound as `$index` (an empty list matches nothing). */
function inScope(column: string, index: number): string {
  return `${column} <@ ANY($${index}::ltree[])`;
}

function spatialScopeDenied(message: string): ForbiddenException {
  return new ForbiddenException({ code: 'SPATIAL_SCOPE_DENIED', message });
}

function nodeSelect(): string {
  return `SELECT n.*, n.path::text AS path, nlevel(n.path) AS depth, t.code AS node_type_code,
                 COUNT(*) OVER()::int AS total_count,
                 (SELECT COUNT(*)::int FROM gigalibs_geospatial.spatial_nodes c
                   WHERE c.tenant_id = n.tenant_id AND c.parent_id = n.id) AS child_count
            FROM gigalibs_geospatial.spatial_nodes n
            JOIN gigalibs_geospatial.spatial_node_types t
              ON t.tenant_id = n.tenant_id AND t.id = n.node_type_id`;
}

async function recordAudit(
  client: PoolClient,
  context: CommandContext,
  action: string,
  entityType: string,
  entityId: string,
  payload: Readonly<Record<string, unknown>>,
): Promise<void> {
  await client.query(
    `INSERT INTO gigalibs_geospatial.audit_events
       (id, tenant_id, actor_subject, action, entity_type, entity_id, correlation_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [randomUUID(), context.principal.tenantId, context.principal.subject, action, entityType, entityId, context.correlationId, JSON.stringify(payload)],
  );
}

async function recordOutbox(
  client: PoolClient,
  context: CommandContext,
  eventType: string,
  aggregateType: string,
  aggregateId: string,
  aggregateVersion: number,
  payload: Readonly<Record<string, unknown>>,
): Promise<void> {
  await client.query(
    `INSERT INTO gigalibs_geospatial.outbox_events
       (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version,
        correlation_id, schema_version, payload)
     VALUES ($1, $2, 'geospatial.facts.v1', $3, $4, $5, $6, $7, 1, $8::jsonb)`,
    [randomUUID(), context.principal.tenantId, eventType, aggregateType, aggregateId, aggregateVersion, context.correlationId, JSON.stringify(payload)],
  );
}

async function publishNodeChange(
  client: PoolClient,
  context: CommandContext,
  node: SpatialNodeDetailV1,
  change: SpatialNodeChangedV1['change'],
  previousPath: string | null,
): Promise<void> {
  const fact: SpatialNodeChangedV1 = {
    nodeId: node.id,
    change,
    path: node.path,
    previousPath,
    parentId: node.parentId,
    nodeTypeCode: node.nodeTypeCode,
    countryCode: node.countryCode,
    subdivisionCode: node.subdivisionCode,
    timeZone: node.timeZone,
    status: node.status,
    aggregateVersion: node.version,
    // WI-OI-105b: enough for a consumer's place directory (Analytics tags records and applies place scope with it).
    displayName: node.displayName,
    latitude: node.latitude,
    longitude: node.longitude,
    boundary: node.boundary,
    areaM2: node.areaM2,
  };
  await recordOutbox(client, context, 'SpatialNodeChangedV1', 'SPATIAL_NODE', node.id, node.version, fact);
}

function parse<T>(
  schema: {
    safeParse(value: unknown):
      | { success: true; data: T }
      | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } };
  },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new BadRequestException({
    code: 'GEOSPATIAL_VALIDATION_FAILED',
    message: 'The Geospatial request is invalid.',
    issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  });
}

function assertUuid(value: string, field: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException({ code: 'GEOSPATIAL_VALIDATION_FAILED', message: `${field} must be a UUID.` });
  }
}

function versionConflict(expectedVersion: number, currentVersion: number): ConflictException {
  return new ConflictException({
    code: 'SPATIAL_NODE_VERSION_CONFLICT',
    message: 'The place was changed by another request. Reload and try again.',
    expectedVersion,
    currentVersion,
  });
}

function depthExceeded(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'SPATIAL_DEPTH_EXCEEDED',
    message: `Places can be nested at most ${MAX_DEPTH} levels deep.`,
  });
}

function translateUnique(error: unknown, message: string): never {
  if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
    throw new ConflictException({ code: 'GEOSPATIAL_UNIQUE_CONFLICT', message });
  }
  throw error;
}

function mapNodeType(row: any): SpatialNodeTypeV1 {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    status: row.status,
    version: Number(row.version),
    nodeCount: Number(row.node_count ?? 0),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapNode(row: any): SpatialNodeV1 {
  return {
    id: row.id,
    parentId: row.parent_id ?? null,
    nodeTypeId: row.node_type_id,
    nodeTypeCode: row.node_type_code,
    code: row.code,
    path: row.path,
    depth: Number(row.depth),
    displayName: row.display_name,
    countryCode: row.country_code ?? null,
    subdivisionCode: row.subdivision_code ?? null,
    timeZone: row.time_zone ?? null,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    hasBoundary: row.boundary !== null && row.boundary !== undefined,
    // Stored when the boundary is saved (WI-OI-105a); places saved earlier are computed on read until next saved.
    areaM2: row.area_m2 !== null && row.area_m2 !== undefined ? Number(row.area_m2) : boundaryAreaM2((row.boundary as SpatialBoundaryV1 | null) ?? null),
    childCount: Number(row.child_count ?? 0),
    status: row.status,
    version: Number(row.version),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
