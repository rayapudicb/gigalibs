import { createHash, randomUUID } from 'node:crypto';
import {
  type CreateRoundRouteV1, type FinalizeRoundCheckpointsV1, RoundCheckpointDraftV1, type StageRoundCheckpointBatchV1,
} from '@gigalibs/contracts';
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

/** A route's checkpoint ceiling (the contract's maximum), checked across the batches of one upload. */
const MAX_ROUTE_CHECKPOINTS = 1000;
/** Unfinished uploads one route may hold at once; staging prunes old versions and uploads older than a day. */
const MAX_OPEN_UPLOADS = 20;

interface StagedBatchRow {
  batch_index: number;
  batch_count: number;
  route_version: number;
  checkpoints: unknown[];
  uploaded_by: string;
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
      await this.lockDraft(client, context, routeId, expectedVersion);
      return this.writeCheckpoints(client, context, routeId, checkpoints, {});
    });
  }

  /**
   * Stores one bounded batch of a draft's checkpoints under the author's upload. Nothing visible changes until
   * finalize; a repeated batch with the same content is a replay, a different one is refused.
   */
  async stageCheckpointBatch(context: ModuleCommandContext, routeId: string, input: StageRoundCheckpointBatchV1) {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await this.lockDraft(client, context, routeId, input.routeVersion);
      await client.query(
        `DELETE FROM ${SCHEMA}.checkpoint_upload_batches WHERE tenant_id=$1 AND route_id=$2
           AND (route_version<>$3 OR created_at < now() - interval '1 day')`,
        [tenantId, routeId, input.routeVersion],
      );
      const upload = await client.query<{ uploaded_by: string | null; batch_count: number | null; staged: string; uploads: string }>(
        `SELECT min(uploaded_by) FILTER (WHERE upload_id=$3) AS uploaded_by,
                min(batch_count) FILTER (WHERE upload_id=$3) AS batch_count,
                coalesce(sum(jsonb_array_length(checkpoints)) FILTER (WHERE upload_id=$3 AND batch_index<>$4),0) AS staged,
                count(DISTINCT upload_id) FILTER (WHERE upload_id<>$3) AS uploads
           FROM ${SCHEMA}.checkpoint_upload_batches WHERE tenant_id=$1 AND route_id=$2`,
        [tenantId, routeId, input.uploadId, input.batchIndex],
      );
      const held = upload.rows[0]!;
      if (held.uploaded_by !== null && held.uploaded_by !== subject)
        throw new ForbiddenException('This checkpoint upload belongs to another author.');
      if (held.batch_count !== null && Number(held.batch_count) !== input.batchCount)
        throw new ConflictException('This upload was started with a different number of batches.');
      if (held.uploaded_by === null && Number(held.uploads) >= MAX_OPEN_UPLOADS)
        throw new ConflictException('Too many unfinished checkpoint uploads for this route; finish one or wait a day.');
      if (Number(held.staged) + input.checkpoints.length > MAX_ROUTE_CHECKPOINTS)
        throw new BadRequestException(`A route holds at most ${MAX_ROUTE_CHECKPOINTS} checkpoints.`);
      const hash = checksum(input.checkpoints);
      const inserted = await client.query(
        `INSERT INTO ${SCHEMA}.checkpoint_upload_batches
          (tenant_id,route_id,upload_id,route_version,batch_index,batch_count,checkpoints,payload_sha256,uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (tenant_id,route_id,upload_id,batch_index) DO NOTHING
         RETURNING batch_index`,
        [tenantId, routeId, input.uploadId, input.routeVersion, input.batchIndex, input.batchCount,
         JSON.stringify(input.checkpoints), hash, subject],
      );
      let replayed = false;
      if (!inserted.rows[0]) {
        const existing = await client.query<{ payload_sha256: string }>(
          `SELECT payload_sha256 FROM ${SCHEMA}.checkpoint_upload_batches
            WHERE tenant_id=$1 AND route_id=$2 AND upload_id=$3 AND batch_index=$4`,
          [tenantId, routeId, input.uploadId, input.batchIndex],
        );
        if (existing.rows[0]?.payload_sha256 !== hash)
          throw new ConflictException('This batch was already staged with different content.');
        replayed = true;
      }
      return {
        uploadId: input.uploadId, batchIndex: input.batchIndex, batchCount: input.batchCount,
        received: input.checkpoints.length, replayed,
      };
    });
  }

  /** Replaces the draft's checkpoints with one complete upload, atomically, then removes the staged batches. */
  async finalizeCheckpoints(context: ModuleCommandContext, routeId: string, input: FinalizeRoundCheckpointsV1) {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await this.lockDraft(client, context, routeId, input.routeVersion);
      const batches = await client.query<StagedBatchRow>(
        `SELECT batch_index,batch_count,route_version,checkpoints,uploaded_by FROM ${SCHEMA}.checkpoint_upload_batches
          WHERE tenant_id=$1 AND route_id=$2 AND upload_id=$3 ORDER BY batch_index FOR UPDATE`,
        [tenantId, routeId, input.uploadId],
      );
      if (batches.rows.length === 0) throw new ConflictException('No staged checkpoints for this upload; save the draft again.');
      if (batches.rows.some((batch) => batch.uploaded_by !== subject))
        throw new ForbiddenException('This checkpoint upload belongs to another author.');
      const complete = batches.rows.length === input.batchCount && batches.rows.every((batch, index) =>
        Number(batch.batch_index) === index && Number(batch.batch_count) === input.batchCount &&
        Number(batch.route_version) === input.routeVersion);
      if (!complete) throw new ConflictException('The checkpoint upload is incomplete; send every batch again.');
      const checkpoints = batches.rows.flatMap((batch) => batch.checkpoints).map((point) => {
        const parsed = RoundCheckpointDraftV1.safeParse(point);
        if (!parsed.success) throw new BadRequestException('A staged checkpoint is no longer valid; save the draft again.');
        return parsed.data;
      });
      if (checkpoints.length !== input.checkpointCount)
        throw new ConflictException('The staged checkpoint count does not match; send every batch again.');
      validateCheckpointSet(checkpoints);
      const view = await this.writeCheckpoints(client, context, routeId, checkpoints,
        { uploadId: input.uploadId, batches: input.batchCount });
      await client.query(
        `DELETE FROM ${SCHEMA}.checkpoint_upload_batches WHERE tenant_id=$1 AND route_id=$2 AND upload_id=$3`,
        [tenantId, routeId, input.uploadId],
      );
      return view;
    });
  }

  private async lockDraft(client: PoolClient, context: ModuleCommandContext, routeId: string, expectedVersion: number) {
    const scope = await scopeEvaluator(client, context.principal);
    const old = await this.route(client, context.principal.tenantId, routeId, true);
    await scope.assert('operator-rounds.routes.manage', old);
    if (old.state !== 'DRAFT' || old.version !== expectedVersion)
      throw new ConflictException('Route is published or its version changed.');
    return old;
  }

  private async writeCheckpoints(client: PoolClient, context: ModuleCommandContext, routeId: string,
    checkpoints: readonly RoundCheckpointDraftV1[], provenance: Record<string, unknown>) {
    const { tenantId } = context.principal;
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
      aggregateVersion: row.version, payload: { count: checkpoints.length, revision: row.revision, ...provenance },
    });
    return { ...routeView(row), checkpointCount: checkpoints.length };
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
