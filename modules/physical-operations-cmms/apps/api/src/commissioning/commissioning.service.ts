import { createHash } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  AssetTagKindV1Schema,
  AssetTagRefV1Schema,
  DecideCommissioningRequestV1Schema,
  RetireAssetTagV1Schema,
  SearchCommissioningRequestsV1Schema,
  SubmitCommissioningRequestV1Schema,
  type AssetPhysicalTagV1,
  type AssetTagRefV1,
  type AssetTagResolutionV1,
  type CommissioningContextV1,
  type CommissioningRequestV1,
  type SubmitCommissioningResultV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { assertWritableScope, scopePredicates } from '../auth/scope.js';
import { AssetsService } from '../assets/assets.service.js';
import { assertUuid, iso, isoOrNull, notFound, parseInput, recordMutation, versionConflict } from '../common/command.js';
import { DatabaseService } from '../database/database.service.js';

// WI-OI-135 M-TAG. A field proposal never writes the register: a different reviewer creates the asset through the CMMS
// asset writer (or links the physical tag to an existing asset), and the tag is bound in the same transaction, so a
// tag that was bound meanwhile refuses the whole approval and no second asset is created.

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value as Record<string, unknown>)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}

const TAG_COLUMNS = 't.id, t.asset_id, t.kind, t.value, t.status, t.bound_by, t.bound_at, t.retired_by, t.retired_at, t.retire_reason';

function mapTag(row: Record<string, any>): AssetPhysicalTagV1 {
  return {
    id: row.id, assetId: row.asset_id, kind: row.kind, value: row.value, status: row.status, boundBy: row.bound_by,
    boundAt: iso(row.bound_at), retiredBy: row.retired_by, retiredAt: isoOrNull(row.retired_at), retireReason: row.retire_reason,
  };
}

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

function mapRequest(row: Record<string, any>): CommissioningRequestV1 {
  return {
    id: row.id, status: row.status, decision: row.decision, proposedAssetTag: row.proposed_asset_tag, name: row.name,
    manufacturer: row.manufacturer, model: row.model, serialNumber: row.serial_number, category: row.category,
    classificationId: row.classification_id, parentAssetId: row.parent_asset_id, spaceId: row.space_id,
    siteRef: row.site_ref, departmentId: row.department_id, latitude: num(row.latitude), longitude: num(row.longitude),
    locationAccuracyM: num(row.location_accuracy_m), specs: row.specs ?? {}, nameplateText: row.nameplate_text,
    tag: row.tag_kind ? { kind: row.tag_kind, value: row.tag_value } : null, notes: row.notes,
    duplicates: row.duplicates ?? [], submittedBy: row.submitted_by, submittedAt: iso(row.submitted_at),
    reviewedBy: row.reviewed_by, reviewedAt: isoOrNull(row.reviewed_at), reviewNote: row.review_note,
    assetId: row.asset_id, version: row.version,
  };
}

@Injectable()
export class CommissioningService {
  constructor(
    private readonly database: DatabaseService,
    private readonly assets: AssetsService,
  ) {}

  // ─── Context ──────────────────────────────────────────────────────────────────────────────────────────

  /** The spaces (within the caller's places) and the shared classifications a technician picks from. */
  async context(principal: CmmsPrincipal): Promise<CommissioningContextV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['s.tenant_id = $1'];
      if (principal.organization?.mode === 'DENIED') where.push('FALSE');
      if (principal.placeScope.mode === 'PLACES') {
        values.push([...principal.placeScope.placeIds]);
        where.push(`s.site_ref = ANY($${values.length}::uuid[])`);
      }
      const spaces = await client.query(
        `SELECT s.id, s.code, s.name, s.space_type, s.site_ref FROM gigalibs_cmms.cmms_spaces s
          WHERE ${where.join(' AND ')} ORDER BY s.name ASC LIMIT 500`, values);
      const classes = await client.query(
        `SELECT c.id, c.code, c.name FROM gigalibs_cmms.cmms_asset_classifications c
          WHERE c.tenant_id = $1 ORDER BY c.name ASC LIMIT 500`, [principal.tenantId]);
      return {
        spaces: spaces.rows.map((row) => ({ id: row.id, code: row.code, name: row.name, spaceType: row.space_type, siteRef: row.site_ref })),
        classifications: classes.rows.map((row) => ({ id: row.id, code: row.code, name: row.name })),
      };
    });
  }

  // ─── Physical tags ────────────────────────────────────────────────────────────────────────────────────

  async resolveTag(principal: CmmsPrincipal, kind: unknown, value: unknown): Promise<AssetTagResolutionV1> {
    const tag = parseInput(AssetTagRefV1Schema, { kind, value });
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const row = (await client.query(
        `SELECT ${TAG_COLUMNS} FROM gigalibs_cmms.asset_physical_tags t
          WHERE t.tenant_id = $1 AND t.kind = $2 AND t.value = $3 AND t.status = 'ACTIVE'`,
        [principal.tenantId, tag.kind, tag.value])).rows[0];
      if (!row) notFound('A bound tag');
      const asset = await this.assets.visibleAsset(client, principal, row.asset_id, false);
      return {
        tag: mapTag(row),
        asset: { id: asset.id, assetTag: asset.assetTag, name: asset.name, status: asset.status, siteRef: asset.siteRef,
          spaceId: asset.spaceId ?? null },
      };
    });
  }

  async listTags(principal: CmmsPrincipal, assetId: string): Promise<{ readonly items: readonly AssetPhysicalTagV1[] }> {
    assertUuid(assetId, 'assetId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.assets.visibleAsset(client, principal, assetId, true);
      const result = await client.query(
        `SELECT ${TAG_COLUMNS} FROM gigalibs_cmms.asset_physical_tags t
          WHERE t.tenant_id = $1 AND t.asset_id = $2 ORDER BY t.bound_at DESC LIMIT 100`, [principal.tenantId, assetId]);
      return { items: result.rows.map(mapTag) };
    });
  }

  async bindTag(context: CmmsCommandContext, assetId: string, raw: unknown): Promise<AssetPhysicalTagV1> {
    assertUuid(assetId, 'assetId');
    const tag = parseInput(AssetTagRefV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const asset = await this.assets.visibleAsset(client, context.principal, assetId, false);
      assertWritableScope(context.principal, { departmentId: asset.departmentId, siteRef: asset.siteRef });
      return this.bindWithClient(client, context, assetId, tag);
    });
  }

  async retireTag(context: CmmsCommandContext, tagId: string, raw: unknown): Promise<AssetPhysicalTagV1> {
    assertUuid(tagId, 'tagId');
    const input = parseInput(RetireAssetTagV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const row = (await client.query(
        `SELECT ${TAG_COLUMNS} FROM gigalibs_cmms.asset_physical_tags t WHERE t.tenant_id = $1 AND t.id = $2 FOR UPDATE`,
        [context.principal.tenantId, tagId])).rows[0];
      if (!row) notFound('The tag');
      const asset = await this.assets.visibleAsset(client, context.principal, row.asset_id, true);
      assertWritableScope(context.principal, { departmentId: asset.departmentId, siteRef: asset.siteRef });
      if (row.status !== 'ACTIVE') conflict('CMMS_TAG_RETIRED', 'This tag binding is already retired.');
      const updated = (await client.query(
        `UPDATE gigalibs_cmms.asset_physical_tags t SET status = 'RETIRED', retired_by = $3, retired_at = now(),
                retire_reason = $4, correlation_id = $5
          WHERE t.tenant_id = $1 AND t.id = $2 RETURNING ${TAG_COLUMNS}`,
        [context.principal.tenantId, tagId, context.principal.subject, input.reason, context.correlationId])).rows[0];
      await recordMutation(client, context, {
        action: 'CMMS_ASSET_TAG_RETIRED', aggregateType: 'CMMS_ASSET_TAG', aggregateId: tagId, aggregateVersion: 2,
        payload: { assetId: row.asset_id, kind: row.kind },
      });
      return mapTag(updated);
    });
  }

  private async bindWithClient(client: PoolClient, context: CmmsCommandContext, assetId: string, tag: AssetTagRefV1): Promise<AssetPhysicalTagV1> {
    let row: Record<string, any>;
    try {
      row = (await client.query(
        `INSERT INTO gigalibs_cmms.asset_physical_tags AS t (tenant_id, asset_id, kind, value, bound_by, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${TAG_COLUMNS}`,
        [context.principal.tenantId, assetId, tag.kind, tag.value, context.principal.subject, context.correlationId])).rows[0];
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
      // The transaction is aborted either way; the caller's whole command (an approval included) rolls back.
      if (code === '23505')
        conflict('CMMS_TAG_BOUND', 'This physical tag is already bound to an asset; retire that binding first.');
      throw error;
    }
    await recordMutation(client, context, {
      action: 'CMMS_ASSET_TAG_BOUND', aggregateType: 'CMMS_ASSET_TAG', aggregateId: row.id, aggregateVersion: 1,
      payload: { assetId, kind: tag.kind },
    });
    return mapTag(row);
  }

  // ─── Commissioning requests ───────────────────────────────────────────────────────────────────────────

  async submit(context: CmmsCommandContext, raw: unknown): Promise<SubmitCommissioningResultV1> {
    const input = parseInput(SubmitCommissioningRequestV1Schema, raw);
    const principal = context.principal;
    const requestSha256 = sha256(canonicalJson(input));
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const existing = (await client.query<{ id: string; request_sha256: string; submitted_by: string }>(
        `SELECT id, request_sha256, submitted_by FROM gigalibs_cmms.asset_commissioning_requests
          WHERE tenant_id = $1 AND client_operation_id = $2`, [principal.tenantId, input.clientOperationId])).rows[0];
      if (existing) {
        if (existing.request_sha256 !== requestSha256 || existing.submitted_by !== principal.subject)
          conflict('CMMS_COMMISSIONING_OPERATION_REUSED', 'This capture id was already used for a different request.');
        return { replayed: true, request: await this.requestRow(client, principal, existing.id) };
      }
      let siteRef = input.siteRef ?? null;
      if (input.spaceId) {
        const space = await this.visibleSpace(client, principal, input.spaceId);
        siteRef ??= space.site_ref;
      }
      if (input.parentAssetId) await this.assets.visibleAsset(client, principal, input.parentAssetId, false);
      if (input.classificationId) {
        const found = await client.query('SELECT 1 FROM gigalibs_cmms.cmms_asset_classifications WHERE tenant_id = $1 AND id = $2',
          [principal.tenantId, input.classificationId]);
        if (!found.rows[0]) notFound('The classification');
      }
      assertWritableScope(principal, { departmentId: input.departmentId ?? null, siteRef },
        undefined, undefined, { permission: 'cmms.commissioning.submit' });
      if (input.tag) {
        const bound = await client.query(
          `SELECT 1 FROM gigalibs_cmms.asset_physical_tags WHERE tenant_id = $1 AND kind = $2 AND value = $3 AND status = 'ACTIVE'`,
          [principal.tenantId, input.tag.kind, input.tag.value]);
        if (bound.rows[0]) conflict('CMMS_TAG_BOUND', 'This physical tag is already bound to an asset.');
      }
      const duplicates = await this.duplicates(client, principal.tenantId, input.proposedAssetTag, input.serialNumber, input.manufacturer);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_cmms.asset_commissioning_requests
           (tenant_id, client_operation_id, request_sha256, proposed_asset_tag, name, manufacturer, model, serial_number,
            category, classification_id, parent_asset_id, space_id, site_ref, department_id, latitude, longitude,
            location_accuracy_m, specs, nameplate_text, tag_kind, tag_value, notes, duplicates, submitted_by, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20, $21, $22,
                 $23::jsonb, $24, $25)
         RETURNING id`,
        [principal.tenantId, input.clientOperationId, requestSha256, input.proposedAssetTag, input.name,
          input.manufacturer ?? null, input.model ?? null, input.serialNumber ?? null, input.category ?? null,
          input.classificationId ?? null, input.parentAssetId ?? null, input.spaceId ?? null, siteRef,
          input.departmentId ?? null, input.latitude ?? null, input.longitude ?? null, input.locationAccuracyM ?? null,
          JSON.stringify(input.specs ?? {}), input.nameplateText ?? null, input.tag?.kind ?? null, input.tag?.value ?? null,
          input.notes ?? null, JSON.stringify(duplicates), principal.subject, context.correlationId],
      );
      const id = inserted.rows[0]!.id;
      await recordMutation(client, context, {
        action: 'CMMS_COMMISSIONING_SUBMITTED', aggregateType: 'CMMS_COMMISSIONING_REQUEST', aggregateId: id,
        aggregateVersion: 1, payload: { proposedAssetTag: input.proposedAssetTag, duplicates: duplicates.length },
      });
      return { replayed: false, request: await this.requestRow(client, principal, id) };
    });
  }

  async search(principal: CmmsPrincipal, raw: unknown): Promise<{ readonly items: readonly CommissioningRequestV1[]; readonly total: number; readonly page: number; readonly pageSize: number }> {
    const query = parseInput(SearchCommissioningRequestsV1Schema, raw);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['r.tenant_id = $1', ...scopePredicates(principal, values, 'r.')];
      if (query.status) {
        values.push(query.status);
        where.push(`r.status = $${values.length}`);
      }
      const total = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM gigalibs_cmms.asset_commissioning_requests r WHERE ${where.join(' AND ')}`, values);
      values.push(query.pageSize, (query.page - 1) * query.pageSize);
      const rows = await client.query(
        `SELECT r.* FROM gigalibs_cmms.asset_commissioning_requests r WHERE ${where.join(' AND ')}
          ORDER BY r.submitted_at DESC, r.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
      return { items: rows.rows.map(mapRequest), total: Number(total.rows[0]?.count ?? 0), page: query.page, pageSize: query.pageSize };
    });
  }

  async get(principal: CmmsPrincipal, requestId: string): Promise<CommissioningRequestV1> {
    assertUuid(requestId, 'requestId');
    return this.database.withTenantTransaction(principal.tenantId, (client) => this.requestRow(client, principal, requestId));
  }

  async decide(context: CmmsCommandContext, requestId: string, raw: unknown): Promise<CommissioningRequestV1> {
    assertUuid(requestId, 'requestId');
    const input = parseInput(DecideCommissioningRequestV1Schema, raw);
    const principal = context.principal;
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId, requestId];
      const where = ['r.tenant_id = $1', 'r.id = $2', ...scopePredicates(principal, values, 'r.')];
      const row = (await client.query(
        `SELECT r.* FROM gigalibs_cmms.asset_commissioning_requests r WHERE ${where.join(' AND ')} FOR UPDATE OF r`, values)).rows[0];
      if (!row) notFound('The commissioning request');
      assertWritableScope(principal, { departmentId: row.department_id, siteRef: row.site_ref },
        undefined, undefined, { permission: 'cmms.commissioning.approve' });
      if (row.status !== 'SUBMITTED') conflict('CMMS_COMMISSIONING_DECIDED', 'This commissioning request is already decided.');
      if (row.version !== input.expectedVersion) versionConflict('The commissioning request');
      if (row.submitted_by === principal.subject)
        throw new ForbiddenException({ code: 'CMMS_COMMISSIONING_FOUR_EYES',
          message: 'A commissioning request is decided by someone other than its submitter.' });
      const tag: AssetTagRefV1 | null = row.tag_kind
        ? { kind: AssetTagKindV1Schema.parse(row.tag_kind), value: row.tag_value } : null;

      let assetId: string | null = null;
      let decision: 'CREATED' | 'LINKED' | 'REJECTED' = 'REJECTED';
      if (input.decision === 'APPROVE_NEW') {
        const specs = { ...(row.specs ?? {}),
          ...(row.latitude !== null ? { latitude: Number(row.latitude), longitude: Number(row.longitude) } : {}) };
        const asset = await this.assets.createWithClient(client, context, {
          assetTag: row.proposed_asset_tag, name: row.name, manufacturer: row.manufacturer, model: row.model,
          serialNumber: row.serial_number, category: row.category, classificationId: row.classification_id,
          parentAssetId: row.parent_asset_id, siteRef: row.site_ref, spaceId: row.space_id, departmentId: row.department_id,
          specs,
        });
        assetId = asset.id;
        decision = 'CREATED';
      } else if (input.decision === 'LINK_EXISTING') {
        const asset = await this.assets.visibleAsset(client, principal, input.assetId, false);
        assertWritableScope(principal, { departmentId: asset.departmentId, siteRef: asset.siteRef });
        if (row.space_id && row.space_id !== (asset.spaceId ?? null)) {
          await client.query(
            `UPDATE gigalibs_cmms.assets SET space_id = $3, site_ref = coalesce($4, site_ref), version = version + 1,
                    updated_by = $5, correlation_id = $6, updated_at = now()
              WHERE tenant_id = $1 AND id = $2`,
            [principal.tenantId, asset.id, row.space_id, row.site_ref, principal.subject, context.correlationId]);
          await recordMutation(client, context, {
            action: 'CMMS_ASSET_RELOCATED', aggregateType: 'CMMS_ASSET', aggregateId: asset.id,
            aggregateVersion: asset.version + 1, payload: { spaceId: row.space_id, commissioningRequestId: requestId },
          });
        }
        assetId = asset.id;
        decision = 'LINKED';
      }
      if (assetId && tag) await this.bindWithClient(client, context, assetId, tag);

      await client.query(
        `UPDATE gigalibs_cmms.asset_commissioning_requests
            SET status = $3, decision = $4, reviewed_by = $5, reviewed_at = now(), review_note = $6, asset_id = $7,
                version = version + 1, correlation_id = $8, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, requestId, decision === 'REJECTED' ? 'REJECTED' : 'APPROVED', decision, principal.subject,
          input.note ?? null, assetId, context.correlationId]);
      await recordMutation(client, context, {
        action: `CMMS_COMMISSIONING_${decision}`, aggregateType: 'CMMS_COMMISSIONING_REQUEST', aggregateId: requestId,
        aggregateVersion: row.version + 1, payload: { decision, assetId },
      });
      return this.requestRow(client, principal, requestId);
    });
  }

  // ─── Rows ─────────────────────────────────────────────────────────────────────────────────────────────

  private async duplicates(client: PoolClient, tenantId: string, assetTag: string, serial?: string, manufacturer?: string) {
    const rows = await client.query<{ id: string; asset_tag: string; name: string; reason: 'SERIAL_NUMBER' | 'ASSET_TAG' }>(
      `SELECT a.id, a.asset_tag, a.name, 'ASSET_TAG' AS reason FROM gigalibs_cmms.assets a
        WHERE a.tenant_id = $1 AND a.asset_tag = $2
       UNION ALL
       SELECT a.id, a.asset_tag, a.name, 'SERIAL_NUMBER' AS reason FROM gigalibs_cmms.assets a
        WHERE a.tenant_id = $1 AND $3::text IS NOT NULL AND lower(a.serial_number) = lower($3)
          AND ($4::text IS NULL OR a.manufacturer IS NULL OR lower(a.manufacturer) = lower($4))
       LIMIT 20`,
      [tenantId, assetTag, serial ?? null, manufacturer ?? null]);
    return rows.rows.map((row) => ({ assetId: row.id, assetTag: row.asset_tag, name: row.name, reason: row.reason }));
  }

  private async visibleSpace(client: PoolClient, principal: CmmsPrincipal, spaceId: string): Promise<{ site_ref: string | null }> {
    assertUuid(spaceId, 'spaceId');
    const values: unknown[] = [principal.tenantId, spaceId];
    const where = ['s.tenant_id = $1', 's.id = $2'];
    if (principal.organization?.mode === 'DENIED') where.push('FALSE');
    if (principal.placeScope.mode === 'PLACES') {
      values.push([...principal.placeScope.placeIds]);
      where.push(`s.site_ref = ANY($${values.length}::uuid[])`);
    }
    const row = (await client.query(`SELECT s.site_ref FROM gigalibs_cmms.cmms_spaces s WHERE ${where.join(' AND ')}`, values)).rows[0];
    if (!row) notFound('Space');
    return row;
  }

  private async requestRow(client: PoolClient, principal: CmmsPrincipal, requestId: string): Promise<CommissioningRequestV1> {
    const values: unknown[] = [principal.tenantId, requestId];
    const where = ['r.tenant_id = $1', 'r.id = $2', ...scopePredicates(principal, values, 'r.')];
    const row = (await client.query(`SELECT r.* FROM gigalibs_cmms.asset_commissioning_requests r WHERE ${where.join(' AND ')}`, values)).rows[0];
    if (!row) notFound('The commissioning request');
    return mapRequest(row);
  }
}
