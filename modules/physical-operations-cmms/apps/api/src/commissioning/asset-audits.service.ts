import { ConflictException, Injectable } from '@nestjs/common';
import {
  RecordAssetSightingV1Schema,
  StartAssetAuditV1Schema,
  type AssetAuditReportV1,
  type AssetAuditWalkV1,
  type AssetSightingV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { assertWritableScope, scopePredicates } from '../auth/scope.js';
import { assertUuid, iso, isoOrNull, notFound, parseInput, recordMutation } from '../common/command.js';
import { DatabaseService } from '../database/database.service.js';

// WI-OI-135 M-TAG floor walks. A technician walks a space or site and scans tags; sightings are append-only and
// idempotent per client operation. The report compares what was seen with the register for that space or site.

const MAX_FUTURE_SKEW_MS = 5 * 60_000;

function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}

function mapWalk(row: Record<string, any>): AssetAuditWalkV1 {
  return {
    id: row.id, label: row.label, spaceId: row.space_id, siteRef: row.site_ref, status: row.status,
    startedBy: row.started_by, startedAt: iso(row.started_at), finishedAt: isoOrNull(row.finished_at),
    sightingCount: Number(row.sighting_count ?? 0),
  };
}

@Injectable()
export class AssetAuditsService {
  constructor(private readonly database: DatabaseService) {}

  async list(principal: CmmsPrincipal): Promise<{ readonly items: readonly AssetAuditWalkV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['w.tenant_id = $1', ...scopePredicates(principal, values, 'w.')];
      const rows = await client.query(
        `SELECT w.*, (SELECT count(*) FROM gigalibs_cmms.asset_audit_sightings s
                       WHERE s.tenant_id = w.tenant_id AND s.walk_id = w.id) AS sighting_count
           FROM gigalibs_cmms.asset_audit_walks w WHERE ${where.join(' AND ')}
          ORDER BY w.started_at DESC LIMIT 200`, values);
      return { items: rows.rows.map(mapWalk) };
    });
  }

  async start(context: CmmsCommandContext, raw: unknown): Promise<AssetAuditWalkV1> {
    const input = parseInput(StartAssetAuditV1Schema, raw);
    const principal = context.principal;
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const existing = (await client.query<{ id: string }>(
        'SELECT id FROM gigalibs_cmms.asset_audit_walks WHERE tenant_id = $1 AND client_operation_id = $2',
        [principal.tenantId, input.clientOperationId])).rows[0];
      if (existing) return this.walkRow(client, principal, existing.id);
      let siteRef = input.siteRef ?? null;
      if (input.spaceId) {
        const values: unknown[] = [principal.tenantId, input.spaceId];
        const where = ['s.tenant_id = $1', 's.id = $2'];
        if (principal.placeScope.mode === 'PLACES') {
          values.push([...principal.placeScope.placeIds]);
          where.push(`s.site_ref = ANY($${values.length}::uuid[])`);
        }
        const space = (await client.query<{ site_ref: string | null }>(
          `SELECT s.site_ref FROM gigalibs_cmms.cmms_spaces s WHERE ${where.join(' AND ')}`, values)).rows[0];
        if (!space) notFound('Space');
        siteRef ??= space.site_ref;
      }
      assertWritableScope(principal, { departmentId: null, siteRef }, undefined, undefined, { permission: 'cmms.audits.execute' });
      const id = (await client.query<{ id: string }>(
        `INSERT INTO gigalibs_cmms.asset_audit_walks (tenant_id, client_operation_id, label, space_id, site_ref, started_by, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [principal.tenantId, input.clientOperationId, input.label, input.spaceId ?? null, siteRef, principal.subject,
          context.correlationId])).rows[0]!.id;
      await recordMutation(client, context, {
        action: 'CMMS_ASSET_AUDIT_STARTED', aggregateType: 'CMMS_ASSET_AUDIT', aggregateId: id, aggregateVersion: 1,
        payload: { spaceId: input.spaceId ?? null, siteRef },
      });
      return this.walkRow(client, principal, id);
    });
  }

  async record(context: CmmsCommandContext, walkId: string, raw: unknown, now = new Date()): Promise<AssetSightingV1> {
    assertUuid(walkId, 'walkId');
    const input = parseInput(RecordAssetSightingV1Schema, raw);
    const principal = context.principal;
    if (Date.parse(input.seenAt) > now.getTime() + MAX_FUTURE_SKEW_MS)
      conflict('CMMS_AUDIT_CLOCK', 'The sighting is in the future; check the device clock.');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const walk = await this.walkRow(client, principal, walkId, true);
      const replay = (await client.query(
        `SELECT s.*, a.asset_tag, a.name AS asset_name FROM gigalibs_cmms.asset_audit_sightings s
           LEFT JOIN gigalibs_cmms.assets a ON a.tenant_id = s.tenant_id AND a.id = s.asset_id
          WHERE s.tenant_id = $1 AND s.client_operation_id = $2`, [principal.tenantId, input.clientOperationId])).rows[0];
      if (replay) {
        const same = replay.walk_id === walkId && replay.kind === input.tag.kind && replay.value === input.tag.value &&
          replay.space_id === (input.spaceId ?? walk.spaceId) && replay.seen_by === principal.subject &&
          new Date(replay.seen_at).getTime() === Date.parse(input.seenAt);
        if (!same) conflict('CMMS_AUDIT_OPERATION_REUSED', 'This sighting id was already used for a different scan.');
        return this.mapSighting(replay, true);
      }
      if (walk.status !== 'OPEN') conflict('CMMS_AUDIT_FINISHED', 'This floor walk is finished.');
      const values: unknown[] = [principal.tenantId, input.tag.kind, input.tag.value];
      const assetScope = scopePredicates(principal, values, 'a.');
      const asset = (await client.query<{ id: string }>(
        `SELECT a.id FROM gigalibs_cmms.asset_physical_tags t
           JOIN gigalibs_cmms.assets a ON a.tenant_id = t.tenant_id AND a.id = t.asset_id
          WHERE t.tenant_id = $1 AND t.kind = $2 AND t.value = $3 AND t.status = 'ACTIVE' AND a.archived_at IS NULL
            ${assetScope.length ? `AND ${assetScope.join(' AND ')}` : ''}`, values)).rows[0];
      const inserted = (await client.query<{ id: string }>(
        `INSERT INTO gigalibs_cmms.asset_audit_sightings
           (tenant_id, walk_id, client_operation_id, kind, value, asset_id, space_id, seen_at, seen_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [principal.tenantId, walkId, input.clientOperationId, input.tag.kind, input.tag.value, asset?.id ?? null,
          input.spaceId ?? walk.spaceId, input.seenAt, principal.subject])).rows[0]!;
      const row = (await client.query(
        `SELECT s.*, a.asset_tag, a.name AS asset_name FROM gigalibs_cmms.asset_audit_sightings s
           LEFT JOIN gigalibs_cmms.assets a ON a.tenant_id = s.tenant_id AND a.id = s.asset_id
          WHERE s.tenant_id = $1 AND s.id = $2`, [principal.tenantId, inserted.id])).rows[0];
      return this.mapSighting(row, false);
    });
  }

  async finish(context: CmmsCommandContext, walkId: string): Promise<AssetAuditWalkV1> {
    assertUuid(walkId, 'walkId');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const walk = await this.walkRow(client, context.principal, walkId, true);
      assertWritableScope(context.principal, { departmentId: null, siteRef: walk.siteRef }, undefined, undefined,
        { permission: 'cmms.audits.execute' });
      if (walk.status !== 'OPEN') conflict('CMMS_AUDIT_FINISHED', 'This floor walk is already finished.');
      await client.query(
        `UPDATE gigalibs_cmms.asset_audit_walks SET status = 'FINISHED', finished_at = now(), correlation_id = $3
          WHERE tenant_id = $1 AND id = $2`, [context.principal.tenantId, walkId, context.correlationId]);
      await recordMutation(client, context, {
        action: 'CMMS_ASSET_AUDIT_FINISHED', aggregateType: 'CMMS_ASSET_AUDIT', aggregateId: walkId, aggregateVersion: 2,
        payload: { sightings: walk.sightingCount },
      });
      return this.walkRow(client, context.principal, walkId);
    });
  }

  /** Seen and relocated assets, registered assets not seen, and tags no visible asset carries. */
  async report(principal: CmmsPrincipal, walkId: string): Promise<AssetAuditReportV1> {
    assertUuid(walkId, 'walkId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const walk = await this.walkRow(client, principal, walkId);
      const seenRows = await client.query(
        `SELECT DISTINCT ON (s.asset_id) s.asset_id, s.space_id AS seen_space_id, a.asset_tag, a.name, a.space_id AS registered_space_id
           FROM gigalibs_cmms.asset_audit_sightings s
           JOIN gigalibs_cmms.assets a ON a.tenant_id = s.tenant_id AND a.id = s.asset_id
          WHERE s.tenant_id = $1 AND s.walk_id = $2 AND s.asset_id IS NOT NULL
          ORDER BY s.asset_id, s.seen_at DESC`, [principal.tenantId, walkId]);
      const values: unknown[] = [principal.tenantId, walkId];
      const scope = scopePredicates(principal, values, 'a.');
      values.push(walk.spaceId ?? walk.siteRef);
      const target = walk.spaceId ? `a.space_id = $${values.length}::uuid` : `a.site_ref = $${values.length}::uuid`;
      const missing = await client.query(
        `SELECT a.id, a.asset_tag, a.name, a.space_id FROM gigalibs_cmms.assets a
          WHERE a.tenant_id = $1 AND a.archived_at IS NULL AND ${target}
            ${scope.length ? `AND ${scope.join(' AND ')}` : ''}
            AND NOT EXISTS (SELECT 1 FROM gigalibs_cmms.asset_audit_sightings s
                             WHERE s.tenant_id = a.tenant_id AND s.walk_id = $2 AND s.asset_id = a.id)
          ORDER BY a.asset_tag LIMIT 1000`, values);
      const unknown = await client.query(
        `SELECT kind, value, min(seen_at) AS seen_at FROM gigalibs_cmms.asset_audit_sightings
          WHERE tenant_id = $1 AND walk_id = $2 AND asset_id IS NULL GROUP BY kind, value ORDER BY min(seen_at) LIMIT 1000`,
        [principal.tenantId, walkId]);
      return {
        walk,
        seen: seenRows.rows.map((row) => ({
          assetId: row.asset_id, assetTag: row.asset_tag, name: row.name, registeredSpaceId: row.registered_space_id,
          seenSpaceId: row.seen_space_id,
          relocated: row.registered_space_id !== null && row.seen_space_id !== null && row.registered_space_id !== row.seen_space_id,
        })),
        missing: missing.rows.map((row) => ({ assetId: row.id, assetTag: row.asset_tag, name: row.name, registeredSpaceId: row.space_id })),
        unknownTags: unknown.rows.map((row) => ({ kind: row.kind, value: row.value, seenAt: iso(row.seen_at) })),
      };
    });
  }

  private mapSighting(row: Record<string, any>, replayed: boolean): AssetSightingV1 {
    return {
      id: row.id, walkId: row.walk_id, kind: row.kind, value: row.value, assetId: row.asset_id,
      assetTag: row.asset_tag ?? null, assetName: row.asset_name ?? null, spaceId: row.space_id, seenAt: iso(row.seen_at), replayed,
    };
  }

  private async walkRow(client: PoolClient, principal: CmmsPrincipal, walkId: string, lock = false): Promise<AssetAuditWalkV1> {
    const values: unknown[] = [principal.tenantId, walkId];
    const where = ['w.tenant_id = $1', 'w.id = $2', ...scopePredicates(principal, values, 'w.')];
    const row = (await client.query(
      `SELECT w.*, (SELECT count(*) FROM gigalibs_cmms.asset_audit_sightings s
                     WHERE s.tenant_id = w.tenant_id AND s.walk_id = w.id) AS sighting_count
         FROM gigalibs_cmms.asset_audit_walks w WHERE ${where.join(' AND ')}${lock ? ' FOR UPDATE OF w' : ''}`, values)).rows[0];
    if (!row) notFound('The floor walk');
    return mapWalk(row);
  }
}
