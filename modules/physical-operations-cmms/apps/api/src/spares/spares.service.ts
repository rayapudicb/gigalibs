import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  CreateAssetDiagramV1Schema,
  DIAGRAM_IMAGE_MAX_BYTES,
  PublishAssetDiagramV1Schema,
  ReleasePartReservationV1Schema,
  ReplaceDiagramHotspotsV1Schema,
  ReservePartV1Schema,
  ReviseAssetDiagramV1Schema,
  UpdateAssetDiagramV1Schema,
  sniffDiagramImage,
  type AssetDiagramDetailV1,
  type AssetDiagramV1,
  type DiagramConsumptionV1,
  type DiagramImageV1,
  type PartAvailabilityV1,
  type PartReservationV1,
  type ReservePartResultV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { assertWritableScope, scopePredicates } from '../auth/scope.js';
import { AssetsService } from '../assets/assets.service.js';
import { assertUuid, iso, isoOrNull, notFound, parseInput, recordMutation, versionConflict } from '../common/command.js';
import { DatabaseService } from '../database/database.service.js';

// WI-OI-136 M-BOM. Diagrams are governed revisions (draft → published by someone who wrote none of it); hotspots change
// only on drafts. Available stock is on hand minus open reservations, read under a part row lock when reserving.

const DIAGRAM_COLUMNS = `d.id, d.asset_id, a.asset_tag, d.diagram_code, d.title, d.revision, d.status, d.image_content_type,
  d.image_sha256, octet_length(d.image_bytes) AS image_size, d.width_px, d.height_px, d.authored_by, d.last_edited_by,
  d.published_by, d.published_at, d.version, d.updated_at`;
const CLOSED_WORK_ORDER = new Set(['COMPLETED', 'CANCELLED']);

function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}

function decodeImage(contentType: string, base64: string): { bytes: Buffer; sha256: string } {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0 || bytes.length > DIAGRAM_IMAGE_MAX_BYTES || sniffDiagramImage(bytes) !== contentType)
    throw new BadRequestException({ code: 'CMMS_DIAGRAM_IMAGE_INVALID',
      message: 'The diagram image must be a PNG, JPEG or WebP of at most 700 KB, matching its declared type.' });
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function mapDiagram(row: Record<string, any>): AssetDiagramV1 {
  return {
    id: row.id, assetId: row.asset_id, assetTag: row.asset_tag, diagramCode: row.diagram_code, title: row.title,
    revision: row.revision, status: row.status, imageContentType: row.image_content_type, imageSha256: row.image_sha256,
    imageBytes: Number(row.image_size), widthPx: row.width_px, heightPx: row.height_px, authoredBy: row.authored_by,
    publishedBy: row.published_by, publishedAt: isoOrNull(row.published_at), version: row.version, updatedAt: iso(row.updated_at),
  };
}

function mapReservation(row: Record<string, any>): PartReservationV1 {
  return {
    id: row.id, partId: row.part_id, partNumber: row.part_number, workOrderId: row.work_order_id, woNumber: row.wo_number,
    quantity: Number(row.quantity), status: row.status, reservedBy: row.reserved_by, reservedAt: iso(row.reserved_at),
    closedAt: isoOrNull(row.closed_at), closeReason: row.close_reason,
  };
}

@Injectable()
export class SparesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly assets: AssetsService,
  ) {}

  // ─── Diagrams ─────────────────────────────────────────────────────────────────────────────────────────

  async list(principal: CmmsPrincipal, assetId: string): Promise<{ readonly items: readonly AssetDiagramV1[] }> {
    assertUuid(assetId, 'assetId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.assets.visibleAsset(client, principal, assetId, true);
      const rows = await client.query(
        `SELECT ${DIAGRAM_COLUMNS} FROM gigalibs_cmms.asset_diagrams d
           JOIN gigalibs_cmms.assets a ON a.tenant_id = d.tenant_id AND a.id = d.asset_id
          WHERE d.tenant_id = $1 AND d.asset_id = $2 AND d.status <> 'SUPERSEDED'
          ORDER BY d.diagram_code, d.revision DESC`, [principal.tenantId, assetId]);
      return { items: rows.rows.map(mapDiagram) };
    });
  }

  async create(context: CmmsCommandContext, assetId: string, raw: unknown): Promise<AssetDiagramV1> {
    assertUuid(assetId, 'assetId');
    const input = parseInput(CreateAssetDiagramV1Schema, raw);
    const image = decodeImage(input.imageContentType, input.imageBase64);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const asset = await this.assets.visibleAsset(client, context.principal, assetId, false);
      assertWritableScope(context.principal, { departmentId: asset.departmentId, siteRef: asset.siteRef },
        undefined, undefined, { permission: 'cmms.bom.manage' });
      await client.query('SELECT 1 FROM gigalibs_cmms.assets WHERE tenant_id = $1 AND id = $2 FOR UPDATE', [context.principal.tenantId, assetId]);
      const next = (await client.query<{ next: number }>(
        `SELECT coalesce(max(revision), 0) + 1 AS next FROM gigalibs_cmms.asset_diagrams
          WHERE tenant_id = $1 AND asset_id = $2 AND diagram_code = $3`, [context.principal.tenantId, assetId, input.diagramCode])).rows[0]!.next;
      const id = await this.insertDraft(client, context, assetId, input.diagramCode, input.title, next,
        input.imageContentType, image, input.widthPx, input.heightPx);
      return this.diagramRow(client, context.principal, id);
    });
  }

  /** A new draft revision from the published diagram, with its image and hotspots. */
  async revise(context: CmmsCommandContext, diagramId: string, raw: unknown): Promise<AssetDiagramV1> {
    assertUuid(diagramId, 'diagramId');
    const input = parseInput(ReviseAssetDiagramV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const source = await this.lockDiagram(client, context, diagramId);
      if (source.status !== 'PUBLISHED') conflict('CMMS_DIAGRAM_NOT_PUBLISHED', 'Only the published diagram is revised.');
      if (source.version !== input.expectedVersion) versionConflict('The diagram');
      const full = (await client.query<{ image_bytes: Buffer }>(
        'SELECT image_bytes FROM gigalibs_cmms.asset_diagrams WHERE tenant_id = $1 AND id = $2', [context.principal.tenantId, diagramId])).rows[0]!;
      const next = (await client.query<{ next: number }>(
        `SELECT coalesce(max(revision), 0) + 1 AS next FROM gigalibs_cmms.asset_diagrams
          WHERE tenant_id = $1 AND asset_id = $2 AND diagram_code = $3`, [context.principal.tenantId, source.assetId, source.diagramCode])).rows[0]!.next;
      const id = await this.insertDraft(client, context, source.assetId, source.diagramCode, source.title, next,
        source.imageContentType, { bytes: full.image_bytes, sha256: source.imageSha256 }, source.widthPx, source.heightPx);
      await client.query(
        `INSERT INTO gigalibs_cmms.asset_diagram_hotspots (tenant_id, diagram_id, callout, part_id, quantity, x, y, radius, label)
         SELECT tenant_id, $3, callout, part_id, quantity, x, y, radius, label FROM gigalibs_cmms.asset_diagram_hotspots
          WHERE tenant_id = $1 AND diagram_id = $2`, [context.principal.tenantId, diagramId, id]);
      return this.diagramRow(client, context.principal, id);
    });
  }

  async update(context: CmmsCommandContext, diagramId: string, raw: unknown): Promise<AssetDiagramV1> {
    assertUuid(diagramId, 'diagramId');
    const input = parseInput(UpdateAssetDiagramV1Schema, raw);
    const image = input.imageBase64 && input.imageContentType ? decodeImage(input.imageContentType, input.imageBase64) : null;
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lockDraft(client, context, diagramId, input.expectedVersion);
      await client.query(
        `UPDATE gigalibs_cmms.asset_diagrams
            SET title = $3, image_content_type = $4, image_bytes = coalesce($5, image_bytes), image_sha256 = $6,
                width_px = $7, height_px = $8, last_edited_by = $9, updated_by = $9, correlation_id = $10,
                version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, diagramId, input.title ?? current.title, input.imageContentType ?? current.imageContentType,
          image?.bytes ?? null, image?.sha256 ?? current.imageSha256, input.widthPx ?? current.widthPx,
          input.heightPx ?? current.heightPx, context.principal.subject, context.correlationId]);
      await this.audit(client, context, 'CMMS_DIAGRAM_EDITED', diagramId, current.version + 1, { imageReplaced: image !== null });
      return this.diagramRow(client, context.principal, diagramId);
    });
  }

  async replaceHotspots(context: CmmsCommandContext, diagramId: string, raw: unknown): Promise<AssetDiagramDetailV1> {
    assertUuid(diagramId, 'diagramId');
    const input = parseInput(ReplaceDiagramHotspotsV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lockDraft(client, context, diagramId, input.expectedVersion);
      const partIds = [...new Set(input.hotspots.map((hotspot) => hotspot.partId))];
      if (partIds.length) {
        const values: unknown[] = [context.principal.tenantId, partIds];
        const where = ['p.tenant_id = $1', 'p.id = ANY($2::uuid[])', 'p.archived_at IS NULL', ...scopePredicates(context.principal, values, 'p.')];
        const found = await client.query(`SELECT p.id FROM gigalibs_cmms.parts p WHERE ${where.join(' AND ')}`, values);
        if (found.rows.length !== partIds.length) notFound('A hotspot part');
      }
      await client.query('DELETE FROM gigalibs_cmms.asset_diagram_hotspots WHERE tenant_id = $1 AND diagram_id = $2',
        [context.principal.tenantId, diagramId]);
      if (input.hotspots.length)
        await client.query(
          `INSERT INTO gigalibs_cmms.asset_diagram_hotspots (tenant_id, diagram_id, callout, part_id, quantity, x, y, radius, label)
           SELECT $1, $2, upper(h.callout), h.part_id, h.quantity, h.x, h.y, h.radius, h.label
             FROM jsonb_to_recordset($3::jsonb) AS h(callout text, part_id uuid, quantity numeric, x numeric, y numeric,
                  radius numeric, label text)`,
          [context.principal.tenantId, diagramId, JSON.stringify(input.hotspots.map((hotspot) => ({
            callout: hotspot.callout, part_id: hotspot.partId, quantity: hotspot.quantity, x: hotspot.x, y: hotspot.y,
            radius: hotspot.radius, label: hotspot.label ?? null })))]);
      await client.query(
        `UPDATE gigalibs_cmms.asset_diagrams SET last_edited_by = $3, updated_by = $3, correlation_id = $4,
                version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, diagramId, context.principal.subject, context.correlationId]);
      await this.audit(client, context, 'CMMS_DIAGRAM_HOTSPOTS_REPLACED', diagramId, current.version + 1, { hotspots: input.hotspots.length });
      return this.detailWithClient(client, context.principal, diagramId);
    });
  }

  async publish(context: CmmsCommandContext, diagramId: string, raw: unknown): Promise<AssetDiagramV1> {
    assertUuid(diagramId, 'diagramId');
    const input = parseInput(PublishAssetDiagramV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const values: unknown[] = [context.principal.tenantId, diagramId];
      const where = ['d.tenant_id = $1', 'd.id = $2', ...scopePredicates(context.principal, values, 'a.')];
      const row = (await client.query(
        `SELECT ${DIAGRAM_COLUMNS}, a.department_id, a.site_ref FROM gigalibs_cmms.asset_diagrams d
           JOIN gigalibs_cmms.assets a ON a.tenant_id = d.tenant_id AND a.id = d.asset_id
          WHERE ${where.join(' AND ')} FOR UPDATE OF d`, values)).rows[0];
      if (!row) notFound('The diagram');
      assertWritableScope(context.principal, { departmentId: row.department_id, siteRef: row.site_ref },
        undefined, undefined, { permission: 'cmms.bom.publish' });
      if (row.status !== 'DRAFT') conflict('CMMS_DIAGRAM_PUBLISHED', 'Only a draft diagram can be published.');
      if (row.version !== input.expectedVersion) versionConflict('The diagram');
      if (context.principal.subject === row.authored_by || context.principal.subject === row.last_edited_by)
        throw new ForbiddenException({ code: 'CMMS_DIAGRAM_FOUR_EYES', message: 'A diagram is published by someone who did not write it.' });
      await client.query(
        `UPDATE gigalibs_cmms.asset_diagrams SET status = 'SUPERSEDED', version = version + 1, updated_by = $4,
                correlation_id = $5, updated_at = now()
          WHERE tenant_id = $1 AND asset_id = $2 AND diagram_code = $3 AND status = 'PUBLISHED'`,
        [context.principal.tenantId, row.asset_id, row.diagram_code, context.principal.subject, context.correlationId]);
      await client.query(
        `UPDATE gigalibs_cmms.asset_diagrams SET status = 'PUBLISHED', published_by = $3, published_at = now(), updated_by = $3,
                correlation_id = $4, version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, diagramId, context.principal.subject, context.correlationId]);
      await this.audit(client, context, 'CMMS_DIAGRAM_PUBLISHED', diagramId, row.version + 1, { assetId: row.asset_id, revision: row.revision });
      return this.diagramRow(client, context.principal, diagramId);
    });
  }

  async detail(principal: CmmsPrincipal, diagramId: string): Promise<AssetDiagramDetailV1> {
    assertUuid(diagramId, 'diagramId');
    return this.database.withTenantTransaction(principal.tenantId, (client) => this.detailWithClient(client, principal, diagramId));
  }

  async image(principal: CmmsPrincipal, diagramId: string): Promise<DiagramImageV1> {
    assertUuid(diagramId, 'diagramId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const diagram = await this.diagramRow(client, principal, diagramId);
      const row = (await client.query<{ image_bytes: Buffer }>(
        'SELECT image_bytes FROM gigalibs_cmms.asset_diagrams WHERE tenant_id = $1 AND id = $2', [principal.tenantId, diagramId])).rows[0]!;
      return { contentType: diagram.imageContentType, base64: row.image_bytes.toString('base64'), sha256: diagram.imageSha256 };
    });
  }

  /** Parts issued to the asset's work orders in the last 12 months, per callout. */
  async consumption(principal: CmmsPrincipal, diagramId: string): Promise<DiagramConsumptionV1> {
    assertUuid(diagramId, 'diagramId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const diagram = await this.diagramRow(client, principal, diagramId);
      const since = new Date(Date.now() - 365 * 24 * 60 * 60_000);
      const rows = await client.query(
        `SELECT h.callout, h.part_id, coalesce(sum(-m.quantity_delta), 0) AS issued, count(m.id)::int AS issues
           FROM gigalibs_cmms.asset_diagram_hotspots h
           LEFT JOIN gigalibs_cmms.stock_movements m ON m.tenant_id = h.tenant_id AND m.part_id = h.part_id
                 AND m.movement_type = 'ISSUE' AND m.created_at >= $3
                 AND m.work_order_id IN (SELECT w.id FROM gigalibs_cmms.work_orders w WHERE w.tenant_id = h.tenant_id AND w.asset_id = $4)
          WHERE h.tenant_id = $1 AND h.diagram_id = $2
          GROUP BY h.callout, h.part_id ORDER BY h.callout`,
        [principal.tenantId, diagramId, since, diagram.assetId]);
      return {
        diagramId, since: since.toISOString(),
        callouts: rows.rows.map((row) => ({ callout: row.callout, partId: row.part_id, issuedQuantity: Number(row.issued), issueCount: row.issues })),
      };
    });
  }

  // ─── Reservations ─────────────────────────────────────────────────────────────────────────────────────

  async reserve(context: CmmsCommandContext, raw: unknown): Promise<ReservePartResultV1> {
    const input = parseInput(ReservePartV1Schema, raw);
    const principal = context.principal;
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const existing = (await client.query(
        `SELECT r.*, p.part_number, w.wo_number FROM gigalibs_cmms.part_reservations r
           JOIN gigalibs_cmms.parts p ON p.tenant_id = r.tenant_id AND p.id = r.part_id
           JOIN gigalibs_cmms.work_orders w ON w.tenant_id = r.tenant_id AND w.id = r.work_order_id
          WHERE r.tenant_id = $1 AND r.client_operation_id = $2`, [principal.tenantId, input.clientOperationId])).rows[0];
      if (existing) {
        if (existing.part_id !== input.partId || existing.work_order_id !== input.workOrderId ||
            Number(existing.quantity) !== input.quantity || existing.reserved_by !== principal.subject)
          conflict('CMMS_RESERVATION_OPERATION_REUSED', 'This reservation id was already used for a different request.');
        const availability = await this.availabilityWithClient(client, principal, [input.partId]);
        return { replayed: true, reservation: mapReservation(existing), availability: availability[0]!, lowStock: availability[0]!.stockState === 'LOW' || availability[0]!.stockState === 'OUT' };
      }
      const woValues: unknown[] = [principal.tenantId, input.workOrderId];
      const woWhere = ['w.tenant_id = $1', 'w.id = $2', ...scopePredicates(principal, woValues, 'w.')];
      const wo = (await client.query<{ id: string; wo_number: string; status: string; department_id: string | null; site_ref: string | null }>(
        `SELECT w.id, w.wo_number, w.status, w.department_id, w.site_ref FROM gigalibs_cmms.work_orders w
          WHERE ${woWhere.join(' AND ')} FOR UPDATE OF w`, woValues)).rows[0];
      if (!wo) notFound('The work order');
      if (CLOSED_WORK_ORDER.has(wo.status)) conflict('CMMS_WO_CLOSED', 'Parts are not reserved to a closed work order.');
      assertWritableScope(principal, { departmentId: wo.department_id, siteRef: wo.site_ref },
        undefined, undefined, { permission: 'cmms.parts.reserve' });
      const partValues: unknown[] = [principal.tenantId, input.partId];
      const part = (await client.query<{ id: string; non_stock: boolean }>(
        `SELECT p.id, p.non_stock FROM gigalibs_cmms.parts p
          WHERE ${['p.tenant_id = $1', 'p.id = $2', 'p.archived_at IS NULL', ...scopePredicates(principal, partValues, 'p.')].join(' AND ')}
          FOR UPDATE OF p`, partValues)).rows[0];
      if (!part) notFound('The part');
      const [before] = await this.availabilityWithClient(client, principal, [input.partId]);
      if (!part.non_stock && input.quantity > before!.available + 1e-9)
        conflict('CMMS_PART_SHORT', `Only ${before!.available} ${before!.unitOfMeasure} is available to reserve.`);
      const inserted = (await client.query<{ id: string }>(
        `INSERT INTO gigalibs_cmms.part_reservations (tenant_id, client_operation_id, part_id, work_order_id, diagram_id,
           quantity, reserved_by, site_ref, department_id, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [principal.tenantId, input.clientOperationId, input.partId, input.workOrderId, input.diagramId ?? null, input.quantity,
          principal.subject, wo.site_ref, wo.department_id, context.correlationId])).rows[0]!;
      await recordMutation(client, context, {
        action: 'CMMS_PART_RESERVED', aggregateType: 'CMMS_PART_RESERVATION', aggregateId: inserted.id, aggregateVersion: 1,
        payload: { partId: input.partId, workOrderId: input.workOrderId, quantity: input.quantity },
      });
      const [after] = await this.availabilityWithClient(client, principal, [input.partId]);
      const lowStock = after!.stockState === 'LOW' || after!.stockState === 'OUT';
      if (lowStock)
        await recordMutation(client, context, {
          action: 'CMMS_PART_LOW_STOCK', aggregateType: 'CMMS_PART_STOCK_ALERT', aggregateId: inserted.id, aggregateVersion: 1,
          payload: { partId: input.partId, available: after!.available, reorderPoint: after!.reorderPoint },
        });
      const reservation = (await client.query(
        `SELECT r.*, p.part_number, w.wo_number FROM gigalibs_cmms.part_reservations r
           JOIN gigalibs_cmms.parts p ON p.tenant_id = r.tenant_id AND p.id = r.part_id
           JOIN gigalibs_cmms.work_orders w ON w.tenant_id = r.tenant_id AND w.id = r.work_order_id
          WHERE r.tenant_id = $1 AND r.id = $2`, [principal.tenantId, inserted.id])).rows[0];
      return { replayed: false, reservation: mapReservation(reservation), availability: after!, lowStock };
    });
  }

  async release(context: CmmsCommandContext, reservationId: string, raw: unknown): Promise<PartReservationV1> {
    assertUuid(reservationId, 'reservationId');
    const input = parseInput(ReleasePartReservationV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const values: unknown[] = [context.principal.tenantId, reservationId];
      const row = (await client.query(
        `SELECT r.* FROM gigalibs_cmms.part_reservations r
          WHERE ${['r.tenant_id = $1', 'r.id = $2', ...scopePredicates(context.principal, values, 'r.')].join(' AND ')} FOR UPDATE OF r`, values)).rows[0];
      if (!row) notFound('The reservation');
      assertWritableScope(context.principal, { departmentId: row.department_id, siteRef: row.site_ref },
        undefined, undefined, { permission: 'cmms.parts.reserve' });
      if (row.status !== 'OPEN') conflict('CMMS_RESERVATION_CLOSED', 'This reservation is already closed.');
      await client.query(
        `UPDATE gigalibs_cmms.part_reservations SET status = 'RELEASED', closed_by = $3, closed_at = now(), close_reason = $4,
                correlation_id = $5 WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, reservationId, context.principal.subject, input.reason, context.correlationId]);
      await recordMutation(client, context, {
        action: 'CMMS_PART_RESERVATION_RELEASED', aggregateType: 'CMMS_PART_RESERVATION', aggregateId: reservationId,
        aggregateVersion: 2, payload: { reason: input.reason },
      });
      return (await this.reservationsFor(client, context.principal, row.work_order_id)).find((item) => item.id === reservationId)!;
    });
  }

  async workOrderReservations(principal: CmmsPrincipal, workOrderId: string): Promise<{ readonly items: readonly PartReservationV1[] }> {
    assertUuid(workOrderId, 'workOrderId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => ({ items: await this.reservationsFor(client, principal, workOrderId) }));
  }

  /** Open work orders on an asset, for choosing where a reserved part goes. */
  async openWorkOrders(principal: CmmsPrincipal, assetId: string): Promise<{ readonly items: readonly { id: string; woNumber: string; title: string; status: string }[] }> {
    assertUuid(assetId, 'assetId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.assets.visibleAsset(client, principal, assetId, false);
      const values: unknown[] = [principal.tenantId, assetId];
      const rows = await client.query(
        `SELECT w.id, w.wo_number, w.title, w.status FROM gigalibs_cmms.work_orders w
          WHERE ${['w.tenant_id = $1', 'w.asset_id = $2', "w.status NOT IN ('COMPLETED', 'CANCELLED')", ...scopePredicates(principal, values, 'w.')].join(' AND ')}
          ORDER BY w.created_at DESC LIMIT 50`, values);
      return { items: rows.rows.map((row) => ({ id: row.id, woNumber: row.wo_number, title: row.title, status: row.status })) };
    });
  }

  // ─── Rows ─────────────────────────────────────────────────────────────────────────────────────────────

  private async availabilityWithClient(client: PoolClient, principal: CmmsPrincipal, partIds: readonly string[]): Promise<PartAvailabilityV1[]> {
    if (partIds.length === 0) return [];
    const rows = await client.query(
      `SELECT p.id, p.part_number, p.name, p.unit_of_measure, p.unit_cost, p.currency_code, p.quantity_on_hand,
              p.min_quantity, p.reorder_point, p.non_stock,
              coalesce((SELECT sum(r.quantity) FROM gigalibs_cmms.part_reservations r
                         WHERE r.tenant_id = p.tenant_id AND r.part_id = p.id AND r.status = 'OPEN'), 0) AS reserved,
              coalesce((SELECT json_agg(json_build_object('storeroomId', b.storeroom_id, 'storeroomName', s.name,
                         'binLocation', b.bin_location, 'onHand', b.quantity_on_hand) ORDER BY s.name, b.bin_location)
                          FROM gigalibs_cmms.cmms_part_balances b
                          JOIN gigalibs_cmms.cmms_storerooms s ON s.tenant_id = b.tenant_id AND s.id = b.storeroom_id
                         WHERE b.tenant_id = p.tenant_id AND b.part_id = p.id AND b.quantity_on_hand > 0), '[]'::json) AS bins
         FROM gigalibs_cmms.parts p WHERE p.tenant_id = $1 AND p.id = ANY($2::uuid[])`,
      [principal.tenantId, [...partIds]]);
    const asOf = new Date().toISOString();
    const byId = new Map(rows.rows.map((row) => {
      const onHand = Number(row.quantity_on_hand);
      const reserved = Number(row.reserved);
      const available = Math.round((onHand - reserved) * 1000) / 1000;
      const threshold = row.reorder_point !== null ? Number(row.reorder_point) : Number(row.min_quantity);
      const stockState: PartAvailabilityV1['stockState'] = row.non_stock ? 'NON_STOCK'
        : available <= 0 ? 'OUT' : threshold > 0 && available <= threshold ? 'LOW' : 'IN_STOCK';
      return [row.id as string, {
        partId: row.id, partNumber: row.part_number, name: row.name, unitOfMeasure: row.unit_of_measure,
        unitCost: row.unit_cost === null ? null : Number(row.unit_cost), currencyCode: String(row.currency_code).trim(),
        onHand, reserved, available, reorderPoint: row.reorder_point === null ? null : Number(row.reorder_point), stockState,
        bins: (row.bins as { storeroomId: string; storeroomName: string; binLocation: string; onHand: unknown }[])
          .map((bin) => ({ ...bin, onHand: Number(bin.onHand) })),
        asOf,
      } satisfies PartAvailabilityV1];
    }));
    return partIds.map((id) => byId.get(id)).filter((item): item is PartAvailabilityV1 => item !== undefined);
  }

  private async detailWithClient(client: PoolClient, principal: CmmsPrincipal, diagramId: string): Promise<AssetDiagramDetailV1> {
    const diagram = await this.diagramRow(client, principal, diagramId);
    const hotspots = await client.query(
      `SELECT callout, part_id, quantity, x, y, radius, label FROM gigalibs_cmms.asset_diagram_hotspots
        WHERE tenant_id = $1 AND diagram_id = $2 ORDER BY callout`, [principal.tenantId, diagramId]);
    const availability = await this.availabilityWithClient(client, principal, [...new Set(hotspots.rows.map((row) => row.part_id as string))]);
    const byPart = new Map(availability.map((item) => [item.partId, item]));
    return {
      diagram,
      hotspots: hotspots.rows.filter((row) => byPart.has(row.part_id)).map((row) => ({
        callout: row.callout, partId: row.part_id, quantity: Number(row.quantity), x: Number(row.x), y: Number(row.y),
        radius: Number(row.radius), label: row.label, availability: byPart.get(row.part_id)!,
      })),
    };
  }

  private async reservationsFor(client: PoolClient, principal: CmmsPrincipal, workOrderId: string): Promise<PartReservationV1[]> {
    const values: unknown[] = [principal.tenantId, workOrderId];
    const rows = await client.query(
      `SELECT r.*, p.part_number, w.wo_number FROM gigalibs_cmms.part_reservations r
         JOIN gigalibs_cmms.parts p ON p.tenant_id = r.tenant_id AND p.id = r.part_id
         JOIN gigalibs_cmms.work_orders w ON w.tenant_id = r.tenant_id AND w.id = r.work_order_id
        WHERE ${['r.tenant_id = $1', 'r.work_order_id = $2', ...scopePredicates(principal, values, 'r.')].join(' AND ')}
        ORDER BY r.reserved_at DESC LIMIT 200`, values);
    return rows.rows.map(mapReservation);
  }

  private async insertDraft(client: PoolClient, context: CmmsCommandContext, assetId: string, code: string, title: string,
    revision: number, contentType: string, image: { bytes: Buffer; sha256: string }, widthPx: number, heightPx: number): Promise<string> {
    try {
      const id = (await client.query<{ id: string }>(
        `INSERT INTO gigalibs_cmms.asset_diagrams (tenant_id, asset_id, diagram_code, title, revision, image_content_type,
           image_bytes, image_sha256, width_px, height_px, authored_by, last_edited_by, updated_by, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $11, $12) RETURNING id`,
        [context.principal.tenantId, assetId, code, title, revision, contentType, image.bytes, image.sha256, widthPx, heightPx,
          context.principal.subject, context.correlationId])).rows[0]!.id;
      await this.audit(client, context, 'CMMS_DIAGRAM_DRAFTED', id, 1, { assetId, diagramCode: code, revision });
      return id;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
      if (code === '23505') conflict('CMMS_DIAGRAM_DRAFT_EXISTS', 'This diagram already has a draft; edit that draft.');
      throw error;
    }
  }

  private async lockDiagram(client: PoolClient, context: CmmsCommandContext, diagramId: string): Promise<AssetDiagramV1 & { departmentId: string | null; siteRef: string | null }> {
    const values: unknown[] = [context.principal.tenantId, diagramId];
    const where = ['d.tenant_id = $1', 'd.id = $2', ...scopePredicates(context.principal, values, 'a.')];
    const row = (await client.query(
      `SELECT ${DIAGRAM_COLUMNS}, a.department_id, a.site_ref FROM gigalibs_cmms.asset_diagrams d
         JOIN gigalibs_cmms.assets a ON a.tenant_id = d.tenant_id AND a.id = d.asset_id
        WHERE ${where.join(' AND ')} FOR UPDATE OF d`, values)).rows[0];
    if (!row) notFound('The diagram');
    assertWritableScope(context.principal, { departmentId: row.department_id, siteRef: row.site_ref },
      undefined, undefined, { permission: 'cmms.bom.manage' });
    return { ...mapDiagram(row), departmentId: row.department_id, siteRef: row.site_ref };
  }

  private async lockDraft(client: PoolClient, context: CmmsCommandContext, diagramId: string, expectedVersion: number) {
    const current = await this.lockDiagram(client, context, diagramId);
    if (current.status !== 'DRAFT') conflict('CMMS_DIAGRAM_PUBLISHED', 'Only a draft diagram can be changed; revise the published one.');
    if (current.version !== expectedVersion) versionConflict('The diagram');
    return current;
  }

  private async diagramRow(client: PoolClient, principal: CmmsPrincipal, diagramId: string): Promise<AssetDiagramV1> {
    const values: unknown[] = [principal.tenantId, diagramId];
    const where = ['d.tenant_id = $1', 'd.id = $2', ...scopePredicates(principal, values, 'a.')];
    const row = (await client.query(
      `SELECT ${DIAGRAM_COLUMNS} FROM gigalibs_cmms.asset_diagrams d
         JOIN gigalibs_cmms.assets a ON a.tenant_id = d.tenant_id AND a.id = d.asset_id WHERE ${where.join(' AND ')}`, values)).rows[0];
    if (!row) notFound('The diagram');
    return mapDiagram(row);
  }

  private audit(client: PoolClient, context: CmmsCommandContext, action: string, diagramId: string, version: number, payload: Record<string, unknown>) {
    return recordMutation(client, context, { action, aggregateType: 'CMMS_ASSET_DIAGRAM', aggregateId: diagramId, aggregateVersion: version, payload });
  }
}

