import { createHash, randomUUID } from 'node:crypto';
import type { CreateRoundRouteV1, RoundCheckpointDraftV1 } from '@gigalibs/contracts';
import {
  type ModuleCommandContext, type ModulePrincipal, recordMutation,
} from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { scopeEvaluator } from '../organization.js';
import { validateCheckpointSet } from './round-rules.js';

export interface RouteRow {
  id: string;
  tenant_id: string;
  route_code: string;
  title: string;
  description: string | null;
  revision: number;
  state: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
  owning_unit_id: string | null;
  site_ref: string | null;
  schedule: unknown;
  version: number;
  created_by: string;
  approved_by: string | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  request_sha256: string;
}

export const ROUTE_COLUMNS = `id,tenant_id,route_code,title,description,revision,state,owning_unit_id,site_ref,
  schedule,version,created_by,approved_by,published_at,created_at,updated_at,request_sha256`;

export function routeView(row: RouteRow) {
  return {
    id: row.id, code: row.route_code, title: row.title, description: row.description,
    revision: Number(row.revision), state: row.state,
    owningUnitId: row.owning_unit_id, placeRef: row.site_ref, schedule: row.schedule,
    version: Number(row.version), createdBy: row.created_by, approvedBy: row.approved_by,
    publishedAt: row.published_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

@Injectable()
export class RoutesService {
  constructor(private readonly database: DatabaseService) {}

  async list(principal: ModulePrincipal, limit: number) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const scope = await scopeEvaluator(client, principal);
      const result = await client.query<RouteRow>(
        `SELECT ${ROUTE_COLUMNS} FROM ${SCHEMA}.route_templates WHERE tenant_id=$1 ORDER BY updated_at DESC,id LIMIT $2`,
        [principal.tenantId, Math.min(limit * 5, 500)],
      );
      return { items: (await scope.filter('operator-rounds.routes.read', result.rows, limit)).map(routeView) };
    });
  }

  async get(principal: ModulePrincipal, id: string) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const scope = await scopeEvaluator(client, principal);
      const route = await this.route(client, principal.tenantId, id);
      if (!(await scope.allows('operator-rounds.routes.read', route, false))) throw new NotFoundException('Route not found.');
      const checkpoints = await client.query(
        `SELECT id,position,label,asset_ref,meter_ref,tag_code,proof_mode,reading_kind,unit_code,
                nominal,amber_low,amber_high,red_low,red_high,choices,branch_rule,instructions,photo_on_exception
           FROM ${SCHEMA}.checkpoints WHERE tenant_id=$1 AND route_id=$2 ORDER BY position`,
        [principal.tenantId, id],
      );
      return { ...routeView(route), checkpoints: checkpoints.rows.map(checkpointView) };
    });
  }

  async create(context: ModuleCommandContext, input: CreateRoundRouteV1) {
    const { tenantId, subject } = context.principal;
    try { new Intl.DateTimeFormat('en', { timeZone: input.schedule.timeZone }); }
    catch { throw new BadRequestException('Use an IANA time zone.'); }
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const scope = await scopeEvaluator(client, context.principal);
      await scope.assert('operator-rounds.routes.manage', {
        owning_unit_id: input.owningUnitId, site_ref: input.placeRef,
      });
      await scope.assertOwner(input.owningUnitId);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [tenantId,input.code]);
      const hash = checksum(input);
      const revision = await client.query<{ revision: number }>(
        `SELECT coalesce(max(revision),0)+1 AS revision FROM ${SCHEMA}.route_templates WHERE tenant_id=$1 AND route_code=$2`,
        [tenantId, input.code],
      );
      const inserted = await client.query<RouteRow>(
        `INSERT INTO ${SCHEMA}.route_templates
          (id,tenant_id,request_key,request_sha256,route_code,title,description,revision,state,
           owning_unit_id,site_ref,schedule,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT',$9,$10,$11,$12)
         ON CONFLICT (tenant_id,request_key) DO NOTHING RETURNING ${ROUTE_COLUMNS}`,
        [randomUUID(),tenantId,input.requestKey,hash,input.code,input.title,input.description,
         revision.rows[0]!.revision,input.owningUnitId,input.placeRef,JSON.stringify(input.schedule),subject],
      );
      let row = inserted.rows[0];
      if (!row) {
        const replay = await client.query<RouteRow>(
          `SELECT ${ROUTE_COLUMNS} FROM ${SCHEMA}.route_templates WHERE tenant_id=$1 AND request_key=$2`,
          [tenantId,input.requestKey],
        );
        row = replay.rows[0];
        if (!row || row.request_sha256 !== hash) throw new ConflictException('Idempotency key was reused with different content.');
        return { route: routeView(row), replayed: true };
      }
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'ROUTE_CREATED', aggregateType: 'route', aggregateId: row.id, aggregateVersion: row.version,
        payload: { code: row.route_code, revision: row.revision, owningUnitId: row.owning_unit_id, placeRef: row.site_ref },
      });
      return { route: routeView(row), replayed: false };
    });
  }

  async update(context: ModuleCommandContext, id: string, input: {
    version: number; title?: string; description?: string | null; owningUnitId?: string | null;
    placeRef?: string | null; schedule?: unknown;
  }) {
    const { tenantId } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const scope = await scopeEvaluator(client, context.principal);
      const old = await this.route(client, tenantId, id, true);
      await scope.assert('operator-rounds.routes.manage', old);
      if (old.state !== 'DRAFT') throw new ConflictException('Published routes are immutable; create a new revision.');
      if (old.version !== input.version) throw new ConflictException('Route version changed.');
      const target = {
        owning_unit_id: input.owningUnitId === undefined ? old.owning_unit_id : input.owningUnitId,
        site_ref: input.placeRef === undefined ? old.site_ref : input.placeRef,
      };
      await scope.assert('operator-rounds.routes.manage', target);
      await scope.assertOwner(target.owning_unit_id);
      if (input.schedule) {
        try { new Intl.DateTimeFormat('en', { timeZone: (input.schedule as { timeZone: string }).timeZone }); }
        catch { throw new BadRequestException('Use an IANA time zone.'); }
      }
      const changed = await client.query<RouteRow>(
        `UPDATE ${SCHEMA}.route_templates SET title=$3,description=$4,owning_unit_id=$5,
           site_ref=$6,schedule=$7,version=version+1,updated_at=now()
         WHERE tenant_id=$1 AND id=$2 RETURNING ${ROUTE_COLUMNS}`,
        [tenantId,id,input.title ?? old.title,input.description === undefined ? old.description : input.description,
         target.owning_unit_id,target.site_ref,JSON.stringify(input.schedule ?? old.schedule)],
      );
      const row = changed.rows[0]!;
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'ROUTE_UPDATED', aggregateType: 'route', aggregateId: id, aggregateVersion: row.version,
        payload: { code: row.route_code, revision: row.revision },
      });
      return routeView(row);
    });
  }

  async replaceCheckpoints(context: ModuleCommandContext, routeId: string, expectedVersion: number, checkpoints: readonly RoundCheckpointDraftV1[]) {
    validateCheckpointSet(checkpoints);
    const { tenantId } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const scope = await scopeEvaluator(client, context.principal);
      const old = await this.route(client, tenantId, routeId, true);
      await scope.assert('operator-rounds.routes.manage', old);
      if (old.state !== 'DRAFT' || old.version !== expectedVersion)
        throw new ConflictException('Route is published or its version changed.');
      await client.query(`DELETE FROM ${SCHEMA}.checkpoints WHERE tenant_id=$1 AND route_id=$2`, [tenantId,routeId]);
      for (const point of checkpoints) {
        await client.query(
          `INSERT INTO ${SCHEMA}.checkpoints
            (id,tenant_id,route_id,position,label,asset_ref,meter_ref,tag_code,proof_mode,reading_kind,
             unit_code,nominal,amber_low,amber_high,red_low,red_high,choices,branch_rule,instructions,photo_on_exception)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
          [point.id ?? randomUUID(),tenantId,routeId,point.position,point.label,point.assetRef,point.meterRef,
           point.tagCode,point.proofMode,point.readingKind,point.unitCode,point.nominal,point.amberLow,
           point.amberHigh,point.redLow,point.redHigh,JSON.stringify(point.choices),JSON.stringify(point.branchRules),
           point.instructions,point.photoOnException],
        );
      }
      const updated = await client.query<RouteRow>(
        `UPDATE ${SCHEMA}.route_templates SET version=version+1,updated_at=now()
          WHERE tenant_id=$1 AND id=$2 RETURNING ${ROUTE_COLUMNS}`, [tenantId,routeId],
      );
      const row = updated.rows[0]!;
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'ROUTE_CHECKPOINTS_REPLACED', aggregateType: 'route', aggregateId: routeId,
        aggregateVersion: row.version, payload: { count: checkpoints.length, revision: row.revision },
      });
      return { ...routeView(row), checkpointCount: checkpoints.length };
    });
  }

  async publish(context: ModuleCommandContext, routeId: string, expectedVersion: number) {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const scope = await scopeEvaluator(client, context.principal);
      const old = await this.route(client, tenantId, routeId, true);
      await scope.assert('operator-rounds.routes.publish', old);
      if (old.state !== 'DRAFT' || old.version !== expectedVersion)
        throw new ConflictException('Route is published or its version changed.');
      if (old.created_by === subject) throw new ForbiddenException('A second authorized person must publish the route.');
      const points = await client.query(
        `SELECT id,position,label,asset_ref,meter_ref,tag_code,proof_mode,reading_kind,unit_code,
                nominal,amber_low,amber_high,red_low,red_high,choices,branch_rule,instructions,photo_on_exception
           FROM ${SCHEMA}.checkpoints WHERE tenant_id=$1 AND route_id=$2 ORDER BY position`,
        [tenantId,routeId],
      );
      validateCheckpointSet(points.rows.map(checkpointView));
      await client.query(
        `UPDATE ${SCHEMA}.route_templates SET state='RETIRED',version=version+1,updated_at=now()
          WHERE tenant_id=$1 AND route_code=$2 AND state='PUBLISHED'`, [tenantId,old.route_code],
      );
      const published = await client.query<RouteRow>(
        `UPDATE ${SCHEMA}.route_templates SET state='PUBLISHED',approved_by=$3,published_at=now(),
           version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING ${ROUTE_COLUMNS}`,
        [tenantId,routeId,subject],
      );
      const row = published.rows[0]!;
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'ROUTE_PUBLISHED', aggregateType: 'route', aggregateId: routeId,
        aggregateVersion: row.version, payload: { code: row.route_code, revision: row.revision },
      });
      return routeView(row);
    });
  }

  private async route(client: PoolClient, tenantId: string, id: string, lock = false): Promise<RouteRow> {
    const result = await client.query<RouteRow>(
      `SELECT ${ROUTE_COLUMNS} FROM ${SCHEMA}.route_templates WHERE tenant_id=$1 AND id=$2 ${lock ? 'FOR UPDATE' : ''}`,
      [tenantId,id],
    );
    if (!result.rows[0]) throw new NotFoundException('Route not found.');
    return result.rows[0];
  }
}

export function checkpointView(row: Record<string, unknown>): RoundCheckpointDraftV1 {
  const decimal = (value: unknown) => value === null || value === undefined ? null : String(value);
  return {
    id: String(row['id']), position: Number(row['position']), label: String(row['label']),
    assetRef: String(row['asset_ref']), meterRef: row['meter_ref'] === null ? null : String(row['meter_ref']),
    tagCode: String(row['tag_code']), proofMode: row['proof_mode'] as RoundCheckpointDraftV1['proofMode'],
    readingKind: row['reading_kind'] as RoundCheckpointDraftV1['readingKind'],
    unitCode: row['unit_code'] === null ? null : String(row['unit_code']), nominal: decimal(row['nominal']),
    amberLow: decimal(row['amber_low']), amberHigh: decimal(row['amber_high']), redLow: decimal(row['red_low']),
    redHigh: decimal(row['red_high']), choices: row['choices'] as string[],
    branchRules: row['branch_rule'] as RoundCheckpointDraftV1['branchRules'],
    instructions: row['instructions'] === null ? null : String(row['instructions']),
    photoOnException: Boolean(row['photo_on_exception']),
  };
}
