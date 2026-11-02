import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  CertifyFleetRepairV1Schema,
  ClearFleetGroundingV1Schema,
  CreateCmmsRequestV1Schema,
  CreateFleetTemplateV1Schema,
  EnrollFleetAssetV1Schema,
  FLEET_PHOTO_MAX_BYTES,
  FleetVersionV1Schema,
  FleetZonesV1Schema,
  GroundFleetAssetV1Schema,
  SubmitFleetInspectionV1Schema,
  UpdateFleetTemplateV1Schema,
  fleetItemKeys,
  fleetReadinessState,
  sniffDiagramImage,
  type CmmsAssetV1,
  type FleetAssetViewV1,
  type FleetEnrollmentV1,
  type FleetGroundingV1,
  type FleetInspectionV1,
  type FleetReadinessV1,
  type FleetTemplateV1,
  type SubmitFleetInspectionResultV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { assertWorkspaceWide, assertWritableScope, scopePredicates } from '../auth/scope.js';
import { AssetsService } from '../assets/assets.service.js';
import { assertUuid, iso, isoOrNull, notFound, parseInput, recordMutation, versionConflict } from '../common/command.js';
import { derivedRequestKey, systemPrincipal } from '../common/system-principal.js';
import { DatabaseService } from '../database/database.service.js';
import { RequestsService } from '../requests/requests.service.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';

// WI-OI-139 M-DVIR. Check templates are shared reference data (workspace-wide access, like job plans); enrolment,
// inspections and groundings follow their asset's scope. A critical defect or a manual red tag grounds the asset: one
// open grounding per asset, an emergency work order raised by CMMS itself, and an operational asset taken offline until
// a supervisor who did not certify the repair clears it.

const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const MAX_LATE_MS = 24 * 3_600_000;
const MAX_HISTORY_DAYS = 92;
const DAY_MS = 86_400_000;

function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

function mapTemplate(row: Record<string, any>): FleetTemplateV1 {
  return {
    id: row.id, code: row.code, name: row.name, revision: row.revision, status: row.status, classificationId: row.classification_id,
    zones: FleetZonesV1Schema.parse(row.zones), authoredBy: row.authored_by, publishedBy: row.published_by,
    publishedAt: isoOrNull(row.published_at), version: row.version, updatedAt: iso(row.updated_at),
  };
}

function mapEnrollment(row: Record<string, any>): FleetEnrollmentV1 {
  return {
    assetId: row.asset_id, templateCode: row.template_code, intervalHours: row.interval_hours,
    requiredCredential: row.required_credential, enrolledBy: row.enrolled_by, version: row.version, updatedAt: iso(row.updated_at),
  };
}

function mapGrounding(row: Record<string, any>): FleetGroundingV1 {
  return {
    id: row.id, assetId: row.asset_id, assetTag: row.asset_tag, assetName: row.asset_name, source: row.source,
    inspectionId: row.inspection_id, reason: row.reason, status: row.status, groundedBy: row.grounded_by,
    groundedAt: iso(row.grounded_at), workOrderId: row.work_order_id, correctiveAction: row.corrective_action,
    certifiedBy: row.certified_by, certifiedAt: isoOrNull(row.certified_at), clearedBy: row.cleared_by,
    clearedAt: isoOrNull(row.cleared_at), clearanceNote: row.clearance_note, override: row.override, version: row.version,
  };
}

const READINESS_SELECT = `
  SELECT a.id AS asset_id, a.asset_tag, a.name AS asset_name, a.site_ref, a.department_id, e.template_code,
         e.interval_hours, e.required_credential, g.id AS grounding_id, g.status AS grounding_status,
         last.submitted_at AS last_at, last.result AS last_result, qualifying.submitted_at AS qualifying_at
    FROM gigalibs_cmms.fleet_enrollments e
    JOIN gigalibs_cmms.assets a ON a.tenant_id = e.tenant_id AND a.id = e.asset_id
    LEFT JOIN gigalibs_cmms.fleet_groundings g ON g.tenant_id = e.tenant_id AND g.asset_id = e.asset_id AND g.status <> 'CLEARED'
    LEFT JOIN LATERAL (
      SELECT i.submitted_at, i.result FROM gigalibs_cmms.fleet_inspections i
       WHERE i.tenant_id = e.tenant_id AND i.asset_id = e.asset_id ORDER BY i.submitted_at DESC LIMIT 1) last ON true
    LEFT JOIN LATERAL (
      SELECT max(i.submitted_at) AS submitted_at FROM gigalibs_cmms.fleet_inspections i
       WHERE i.tenant_id = e.tenant_id AND i.asset_id = e.asset_id AND i.result <> 'GROUNDED'
         AND i.received_at > coalesce((SELECT max(c.cleared_at) FROM gigalibs_cmms.fleet_groundings c
               WHERE c.tenant_id = e.tenant_id AND c.asset_id = e.asset_id AND c.status = 'CLEARED'), '-infinity')) qualifying ON true`;

function mapReadiness(row: Record<string, any>, now: Date): FleetReadinessV1 {
  const dueAt = row.qualifying_at ? new Date(new Date(row.qualifying_at).getTime() + row.interval_hours * 3_600_000) : null;
  return {
    assetId: row.asset_id, assetTag: row.asset_tag, assetName: row.asset_name, siteRef: row.site_ref, departmentId: row.department_id,
    templateCode: row.template_code, intervalHours: row.interval_hours, requiredCredential: row.required_credential,
    state: fleetReadinessState({ openGroundingStatus: row.grounding_status ?? null, dueAt, now }),
    lastInspectionAt: isoOrNull(row.last_at), lastResult: row.last_result ?? null, dueAt: dueAt ? dueAt.toISOString() : null,
    openGroundingId: row.grounding_id ?? null,
  };
}

@Injectable()
export class FleetService {
  constructor(
    private readonly database: DatabaseService,
    private readonly assets: AssetsService,
    private readonly workOrders: WorkOrdersService,
    private readonly requests: RequestsService,
  ) {}

  // ─── Templates (shared reference data) ────────────────────────────────────────────────────────────────

  async listTemplates(principal: CmmsPrincipal, status?: string): Promise<{ readonly items: readonly FleetTemplateV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      let filter = "AND t.status <> 'SUPERSEDED'";
      if (status && ['DRAFT', 'PUBLISHED', 'SUPERSEDED', 'RETIRED'].includes(status)) {
        values.push(status);
        filter = `AND t.status = $${values.length}`;
      }
      const rows = await client.query(
        `SELECT t.* FROM gigalibs_cmms.fleet_check_templates t WHERE t.tenant_id = $1 ${filter} ORDER BY t.code, t.revision DESC LIMIT 500`, values);
      return { items: rows.rows.map(mapTemplate) };
    });
  }

  async getTemplate(principal: CmmsPrincipal, templateId: string): Promise<FleetTemplateV1> {
    assertUuid(templateId, 'templateId');
    return this.database.withTenantTransaction(principal.tenantId, (client) => this.templateRow(client, principal.tenantId, templateId, false));
  }

  async createTemplate(context: CmmsCommandContext, raw: unknown): Promise<FleetTemplateV1> {
    const input = parseInput(CreateFleetTemplateV1Schema, raw);
    assertWorkspaceWide(context.principal);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      if (input.classificationId) {
        const found = await client.query('SELECT 1 FROM gigalibs_cmms.cmms_asset_classifications WHERE tenant_id = $1 AND id = $2',
          [context.principal.tenantId, input.classificationId]);
        if (!found.rows[0]) notFound('The asset class');
      }
      const next = await this.nextRevision(client, context.principal.tenantId, input.code);
      const id = await this.insertDraft(() => client.query<{ id: string }>(
        `INSERT INTO gigalibs_cmms.fleet_check_templates (tenant_id, code, name, revision, classification_id, zones, authored_by,
           updated_by, correlation_id) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $7, $8) RETURNING id`,
        [context.principal.tenantId, input.code, input.name, next, input.classificationId ?? null, JSON.stringify(input.zones),
          context.principal.subject, context.correlationId]));
      await this.audit(client, context, 'CMMS_FLEET_TEMPLATE_DRAFTED', 'CMMS_FLEET_TEMPLATE', id, 1, { code: input.code, revision: next });
      return this.templateRow(client, context.principal.tenantId, id, false);
    });
  }

  async updateTemplate(context: CmmsCommandContext, templateId: string, raw: unknown): Promise<FleetTemplateV1> {
    assertUuid(templateId, 'templateId');
    const input = parseInput(UpdateFleetTemplateV1Schema, raw);
    assertWorkspaceWide(context.principal);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lockTemplate(client, context, templateId, 'DRAFT', input.expectedVersion);
      await client.query(
        `UPDATE gigalibs_cmms.fleet_check_templates SET name = $3, zones = $4::jsonb, updated_by = $5, correlation_id = $6,
                version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, templateId, input.name ?? current.name, JSON.stringify(input.zones ?? current.zones),
          context.principal.subject, context.correlationId]);
      await this.audit(client, context, 'CMMS_FLEET_TEMPLATE_EDITED', 'CMMS_FLEET_TEMPLATE', templateId, current.version + 1, {});
      return this.templateRow(client, context.principal.tenantId, templateId, false);
    });
  }

  async publishTemplate(context: CmmsCommandContext, templateId: string, raw: unknown): Promise<FleetTemplateV1> {
    assertUuid(templateId, 'templateId');
    const input = parseInput(FleetVersionV1Schema, raw);
    assertWorkspaceWide(context.principal);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lockTemplate(client, context, templateId, 'DRAFT', input.expectedVersion);
      await client.query(
        `UPDATE gigalibs_cmms.fleet_check_templates SET status = 'SUPERSEDED', version = version + 1, updated_by = $3,
                correlation_id = $4, updated_at = now() WHERE tenant_id = $1 AND code = $2 AND status = 'PUBLISHED'`,
        [context.principal.tenantId, current.code, context.principal.subject, context.correlationId]);
      await client.query(
        `UPDATE gigalibs_cmms.fleet_check_templates SET status = 'PUBLISHED', published_by = $3, published_at = now(), updated_by = $3,
                correlation_id = $4, version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, templateId, context.principal.subject, context.correlationId]);
      await this.audit(client, context, 'CMMS_FLEET_TEMPLATE_PUBLISHED', 'CMMS_FLEET_TEMPLATE', templateId, current.version + 1,
        { code: current.code, revision: current.revision });
      return this.templateRow(client, context.principal.tenantId, templateId, false);
    });
  }

  async reviseTemplate(context: CmmsCommandContext, templateId: string, raw: unknown): Promise<FleetTemplateV1> {
    assertUuid(templateId, 'templateId');
    const input = parseInput(FleetVersionV1Schema, raw);
    assertWorkspaceWide(context.principal);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const source = await this.lockTemplate(client, context, templateId, 'PUBLISHED', input.expectedVersion);
      const next = await this.nextRevision(client, context.principal.tenantId, source.code);
      const id = await this.insertDraft(() => client.query<{ id: string }>(
        `INSERT INTO gigalibs_cmms.fleet_check_templates (tenant_id, code, name, revision, classification_id, zones, authored_by,
           updated_by, correlation_id)
         SELECT tenant_id, code, name, $3, classification_id, zones, $4, $4, $5 FROM gigalibs_cmms.fleet_check_templates
          WHERE tenant_id = $1 AND id = $2 RETURNING id`,
        [context.principal.tenantId, templateId, next, context.principal.subject, context.correlationId]));
      await this.audit(client, context, 'CMMS_FLEET_TEMPLATE_DRAFTED', 'CMMS_FLEET_TEMPLATE', id, 1,
        { code: source.code, revision: next, from: templateId });
      return this.templateRow(client, context.principal.tenantId, id, false);
    });
  }

  async retireTemplate(context: CmmsCommandContext, templateId: string, raw: unknown): Promise<FleetTemplateV1> {
    assertUuid(templateId, 'templateId');
    const input = parseInput(FleetVersionV1Schema, raw);
    assertWorkspaceWide(context.principal);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lockTemplate(client, context, templateId, 'PUBLISHED', input.expectedVersion);
      const enrolled = await client.query('SELECT 1 FROM gigalibs_cmms.fleet_enrollments WHERE tenant_id = $1 AND template_code = $2 LIMIT 1',
        [context.principal.tenantId, current.code]);
      if (enrolled.rows[0]) conflict('CMMS_FLEET_TEMPLATE_IN_USE', 'Assets are enrolled on this check; move them to another first.');
      await client.query(
        `UPDATE gigalibs_cmms.fleet_check_templates SET status = 'RETIRED', updated_by = $3, correlation_id = $4, version = version + 1,
                updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, templateId, context.principal.subject, context.correlationId]);
      await this.audit(client, context, 'CMMS_FLEET_TEMPLATE_RETIRED', 'CMMS_FLEET_TEMPLATE', templateId, current.version + 1, {});
      return this.templateRow(client, context.principal.tenantId, templateId, false);
    });
  }

  // ─── Enrolment and readiness ──────────────────────────────────────────────────────────────────────────

  async enroll(context: CmmsCommandContext, raw: unknown): Promise<FleetEnrollmentV1> {
    const input = parseInput(EnrollFleetAssetV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const asset = await this.assets.visibleAsset(client, context.principal, input.assetId, false);
      this.assertWrite(context.principal, asset, 'cmms.fleet.manage');
      if (!(await this.publishedTemplate(client, context.principal.tenantId, input.templateCode)))
        conflict('CMMS_FLEET_NO_TEMPLATE', 'Publish a check for this code before enrolling assets on it.');
      const row = (await client.query(
        `INSERT INTO gigalibs_cmms.fleet_enrollments (tenant_id, asset_id, template_code, interval_hours, required_credential,
           enrolled_by, updated_by, correlation_id) VALUES ($1, $2, $3, $4, $5, $6, $6, $7)
         ON CONFLICT (tenant_id, asset_id) DO UPDATE SET template_code = EXCLUDED.template_code, interval_hours = EXCLUDED.interval_hours,
           required_credential = EXCLUDED.required_credential, updated_by = EXCLUDED.updated_by, correlation_id = EXCLUDED.correlation_id,
           version = gigalibs_cmms.fleet_enrollments.version + 1, updated_at = now()
         RETURNING *`,
        [context.principal.tenantId, input.assetId, input.templateCode, input.intervalHours, input.requiredCredential ?? null,
          context.principal.subject, context.correlationId])).rows[0];
      await this.audit(client, context, 'CMMS_FLEET_ASSET_ENROLLED', 'CMMS_FLEET_ENROLLMENT', input.assetId, row.version,
        { templateCode: input.templateCode, intervalHours: input.intervalHours });
      return mapEnrollment(row);
    });
  }

  async readiness(principal: CmmsPrincipal, now = new Date()): Promise<{ readonly items: readonly FleetReadinessV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['e.tenant_id = $1', 'a.archived_at IS NULL', ...scopePredicates(principal, values, 'a.')];
      const rows = await client.query(`${READINESS_SELECT} WHERE ${where.join(' AND ')} ORDER BY a.asset_tag LIMIT 1000`, values);
      return { items: rows.rows.map((row) => mapReadiness(row, now)) };
    });
  }

  async assetView(principal: CmmsPrincipal, assetId: string, now = new Date()): Promise<FleetAssetViewV1> {
    assertUuid(assetId, 'assetId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.assets.visibleAsset(client, principal, assetId, false);
      const readiness = await this.readinessRow(client, principal.tenantId, assetId, now);
      const template = await this.publishedTemplate(client, principal.tenantId, readiness.templateCode);
      const grounding = readiness.openGroundingId ? await this.groundingRow(client, principal, readiness.openGroundingId, false) : null;
      const recent = await client.query<{ id: string }>(
        'SELECT id FROM gigalibs_cmms.fleet_inspections WHERE tenant_id = $1 AND asset_id = $2 ORDER BY submitted_at DESC LIMIT 5',
        [principal.tenantId, assetId]);
      const recentInspections: FleetInspectionV1[] = [];
      for (const row of recent.rows) recentInspections.push(await this.inspectionRow(client, principal, row.id));
      return {
        readiness,
        eligibility: {
          eligible: readiness.state === 'OPERATIONAL', state: readiness.state,
          credentialCheck: readiness.requiredCredential ? 'UNVERIFIED' : 'NOT_REQUIRED',
        },
        template, openGrounding: grounding, recentInspections,
      };
    });
  }

  // ─── Inspections ──────────────────────────────────────────────────────────────────────────────────────

  async submitInspection(context: CmmsCommandContext, raw: unknown, now = new Date()): Promise<SubmitFleetInspectionResultV1> {
    const input = parseInput(SubmitFleetInspectionV1Schema, raw);
    const principal = context.principal;
    const submittedAt = Date.parse(input.submittedAt);
    if (submittedAt > now.getTime() + MAX_FUTURE_SKEW_MS) conflict('CMMS_FLEET_CLOCK', 'The inspection time is in the future; check the device clock.');
    if (submittedAt < now.getTime() - MAX_LATE_MS) conflict('CMMS_FLEET_LATE', 'This inspection is more than a day old; inspect the equipment again.');
    const payloadSha256 = sha256(JSON.stringify(input));
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const replay = (await client.query<{ id: string; payload_sha256: string; inspected_by: string; asset_id: string }>(
        'SELECT id, payload_sha256, inspected_by, asset_id FROM gigalibs_cmms.fleet_inspections WHERE tenant_id = $1 AND client_operation_id = $2',
        [principal.tenantId, input.clientOperationId])).rows[0];
      if (replay) {
        if (replay.payload_sha256 !== payloadSha256 || replay.inspected_by !== principal.subject)
          conflict('CMMS_FLEET_OPERATION_REUSED', 'This capture id was already used for a different inspection.');
        return {
          replayed: true, inspection: await this.inspectionRow(client, principal, replay.id),
          readiness: await this.readinessRow(client, principal.tenantId, replay.asset_id, now),
        };
      }
      const asset = await this.assets.visibleAsset(client, principal, input.assetId, false);
      this.assertWrite(principal, asset, 'cmms.fleet.inspect');
      const enrollment = await this.lockEnrollment(client, principal.tenantId, input.assetId);
      const template = await this.publishedTemplate(client, principal.tenantId, enrollment.templateCode);
      if (!template) conflict('CMMS_FLEET_NO_TEMPLATE', 'This asset’s check is not published.');
      if (template.id !== input.templateId) conflict('CMMS_FLEET_TEMPLATE_CHANGED', 'The check changed; load it again and inspect.');
      const zoneOf = new Map(template.zones.flatMap((zone) => zone.items.map((item) => [item.key, zone.key] as const)));
      const order = fleetItemKeys(template.zones);
      const answered = new Map(input.results.map((item) => [item.itemKey, item]));
      if (answered.size !== order.length || order.some((key) => !answered.has(key)))
        throw new BadRequestException({ code: 'CMMS_FLEET_INCOMPLETE', message: 'Answer every item of the check, once.' });
      const photos = input.results.filter((item) => item.photoBase64).map((item) => {
        const bytes = Buffer.from(item.photoBase64!, 'base64');
        if (bytes.length < 16 || bytes.length > FLEET_PHOTO_MAX_BYTES || sniffDiagramImage(bytes) !== item.photoContentType)
          throw new BadRequestException({ code: 'CMMS_FLEET_PHOTO_INVALID', message: 'A defect photo must be a PNG, JPEG or WebP of at most 300 KB.' });
        return { itemKey: item.itemKey, contentType: item.photoContentType!, bytes, sha256: sha256(bytes) };
      });
      const minor = input.results.filter((item) => item.outcome === 'MINOR');
      const critical = input.results.filter((item) => item.outcome === 'CRITICAL');
      const result = critical.length > 0 ? 'GROUNDED' : minor.length > 0 ? 'DEFECTS' : 'PASS';
      const labelOf = new Map(template.zones.flatMap((zone) => zone.items.map((item) => [item.key, `${zone.title} — ${item.label}`] as const)));
      const describe = (items: typeof minor) => items.map((item) => `${labelOf.get(item.itemKey)}: ${item.note}`).join('\n');

      let requestId: string | null = null;
      if (minor.length > 0) {
        const request = await this.requests.submitWithClient(client, context, parseInput(CreateCmmsRequestV1Schema, {
          title: `Fleet defects: ${asset.assetTag}`.slice(0, 240),
          description: `Found on ${input.kind === 'PRE_TRIP' ? 'pre-trip' : 'post-trip'} inspection by ${principal.subject}:\n${describe(minor)}`.slice(0, 10_000),
          priority: 'MEDIUM', assetId: asset.id,
        }));
        requestId = request.id;
      }
      const inspectionId = randomUUID();
      await client.query(
        `INSERT INTO gigalibs_cmms.fleet_inspections (tenant_id, id, client_operation_id, payload_sha256, asset_id, template_id, kind,
           inspected_by, started_at, submitted_at, meter_reading, result, minor_count, critical_count, request_id, site_ref,
           department_id, certified, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, true, $18)`,
        [principal.tenantId, inspectionId, input.clientOperationId, payloadSha256, asset.id, template.id, input.kind, principal.subject,
          input.startedAt, input.submittedAt, input.meterReading ?? null, result, minor.length, critical.length, requestId,
          asset.siteRef, asset.departmentId, context.correlationId]);
      for (const [position, key] of order.entries()) {
        const item = answered.get(key)!;
        await client.query(
          `INSERT INTO gigalibs_cmms.fleet_inspection_results (tenant_id, inspection_id, item_key, zone_key, position, outcome, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [principal.tenantId, inspectionId, key, zoneOf.get(key), position, item.outcome, item.note ?? null]);
      }
      for (const photo of photos)
        await client.query(
          `INSERT INTO gigalibs_cmms.fleet_inspection_photos (tenant_id, inspection_id, item_key, content_type, bytes, sha256)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [principal.tenantId, inspectionId, photo.itemKey, photo.contentType, photo.bytes, photo.sha256]);
      await recordMutation(client, context, { action: 'CMMS_FLEET_INSPECTION_SUBMITTED', aggregateType: 'CMMS_FLEET_INSPECTION',
        aggregateId: inspectionId, aggregateVersion: 1,
        payload: { assetId: asset.id, kind: input.kind, result, minorCount: minor.length, criticalCount: critical.length, requestId } });
      if (critical.length > 0 && !(await this.openGroundingRow(client, principal.tenantId, asset.id)))
        await this.ground(client, context, asset, {
          source: 'INSPECTION', inspectionId, operationId: input.clientOperationId,
          reason: `Critical defects on ${input.kind === 'PRE_TRIP' ? 'pre-trip' : 'post-trip'} inspection:\n${describe(critical)}`.slice(0, 4000),
        });
      return {
        replayed: false, inspection: await this.inspectionRow(client, principal, inspectionId),
        readiness: await this.readinessRow(client, principal.tenantId, asset.id, now),
      };
    });
  }

  async getInspection(principal: CmmsPrincipal, inspectionId: string): Promise<FleetInspectionV1> {
    assertUuid(inspectionId, 'inspectionId');
    return this.database.withTenantTransaction(principal.tenantId, (client) => this.inspectionRow(client, principal, inspectionId));
  }

  /** Inspections in a window of at most 92 days (default: the last 30), for the history and the audit export. */
  async listInspections(principal: CmmsPrincipal, query: { assetId?: string; from?: string; to?: string }, now = new Date()) {
    const to = query.to ? new Date(query.to) : now;
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * DAY_MS);
    if (Number.isNaN(to.getTime()) || Number.isNaN(from.getTime()) || from > to || to.getTime() - from.getTime() > MAX_HISTORY_DAYS * DAY_MS)
      throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: 'Choose a window of at most 92 days.' });
    if (query.assetId) assertUuid(query.assetId, 'assetId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId, from.toISOString(), to.toISOString()];
      const where = ['i.tenant_id = $1', 'i.submitted_at >= $2', 'i.submitted_at <= $3', ...scopePredicates(principal, values, 'i.')];
      if (query.assetId) {
        values.push(query.assetId);
        where.push(`i.asset_id = $${values.length}`);
      }
      const ids = await client.query<{ id: string }>(
        `SELECT i.id FROM gigalibs_cmms.fleet_inspections i WHERE ${where.join(' AND ')} ORDER BY i.submitted_at DESC LIMIT 1000`, values);
      const items: FleetInspectionV1[] = [];
      for (const row of ids.rows) items.push(await this.inspectionRow(client, principal, row.id));
      return { from: from.toISOString(), to: to.toISOString(), items };
    });
  }

  async inspectionPhoto(principal: CmmsPrincipal, inspectionId: string, itemKey: string) {
    assertUuid(inspectionId, 'inspectionId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.inspectionRow(client, principal, inspectionId);
      const row = (await client.query<{ content_type: string; bytes: Buffer; sha256: string }>(
        'SELECT content_type, bytes, sha256 FROM gigalibs_cmms.fleet_inspection_photos WHERE tenant_id = $1 AND inspection_id = $2 AND item_key = $3',
        [principal.tenantId, inspectionId, itemKey])).rows[0];
      if (!row) notFound('The photo');
      return { contentType: row.content_type, base64: row.bytes.toString('base64'), sha256: row.sha256 };
    });
  }

  // ─── Groundings (red tags) ────────────────────────────────────────────────────────────────────────────

  async groundManually(context: CmmsCommandContext, raw: unknown): Promise<FleetGroundingV1> {
    const input = parseInput(GroundFleetAssetV1Schema, raw);
    const principal = context.principal;
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const replay = (await client.query<{ id: string; asset_id: string; grounded_by: string }>(
        'SELECT id, asset_id, grounded_by FROM gigalibs_cmms.fleet_groundings WHERE tenant_id = $1 AND client_operation_id = $2',
        [principal.tenantId, input.clientOperationId])).rows[0];
      if (replay) {
        if (replay.asset_id !== input.assetId || replay.grounded_by !== principal.subject)
          conflict('CMMS_FLEET_OPERATION_REUSED', 'This capture id was already used for a different red tag.');
        return this.groundingRow(client, principal, replay.id, false);
      }
      const asset = await this.assets.visibleAsset(client, principal, input.assetId, false);
      this.assertWrite(principal, asset, 'cmms.fleet.inspect');
      await this.lockEnrollment(client, principal.tenantId, input.assetId);
      if (await this.openGroundingRow(client, principal.tenantId, asset.id)) conflict('CMMS_FLEET_GROUNDED', 'This asset is already grounded.');
      const id = await this.ground(client, context, asset, { source: 'MANUAL', operationId: input.clientOperationId, reason: input.reason });
      return this.groundingRow(client, principal, id, false);
    });
  }

  async listGroundings(principal: CmmsPrincipal, status?: string): Promise<{ readonly items: readonly FleetGroundingV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['g.tenant_id = $1', ...scopePredicates(principal, values, 'g.'),
        status === 'ALL' ? "g.grounded_at > now() - interval '92 days'" : "g.status <> 'CLEARED'"];
      const rows = await client.query(
        `SELECT g.*, a.asset_tag, a.name AS asset_name FROM gigalibs_cmms.fleet_groundings g
           JOIN gigalibs_cmms.assets a ON a.tenant_id = g.tenant_id AND a.id = g.asset_id
          WHERE ${where.join(' AND ')} ORDER BY g.grounded_at DESC LIMIT 500`, values);
      return { items: rows.rows.map(mapGrounding) };
    });
  }

  async certifyRepair(context: CmmsCommandContext, groundingId: string, raw: unknown): Promise<FleetGroundingV1> {
    assertUuid(groundingId, 'groundingId');
    const input = parseInput(CertifyFleetRepairV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.groundingRow(client, context.principal, groundingId, true);
      this.assertWrite(context.principal, { siteRef: current.siteRef, departmentId: current.departmentId }, 'cmms.fleet.certify');
      if (current.grounding.status !== 'GROUNDED') conflict('CMMS_FLEET_STATE', 'This red tag already has a repair certificate or is cleared.');
      if (current.grounding.version !== input.expectedVersion) versionConflict('The red tag');
      await client.query(
        `UPDATE gigalibs_cmms.fleet_groundings SET status = 'REPAIRED', corrective_action = $3, certified_by = $4, certified_at = now(),
                updated_by = $4, correlation_id = $5, version = version + 1 WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, groundingId, input.correctiveAction, context.principal.subject, context.correlationId]);
      await this.audit(client, context, 'CMMS_FLEET_REPAIR_CERTIFIED', 'CMMS_FLEET_GROUNDING', groundingId, current.grounding.version + 1,
        { assetId: current.grounding.assetId });
      return this.groundingRow(client, context.principal, groundingId, false);
    });
  }

  async clearGrounding(context: CmmsCommandContext, groundingId: string, raw: unknown): Promise<FleetGroundingV1> {
    assertUuid(groundingId, 'groundingId');
    const input = parseInput(ClearFleetGroundingV1Schema, raw);
    const principal = context.principal;
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const current = await this.groundingRow(client, principal, groundingId, true);
      const grounding = current.grounding;
      this.assertWrite(principal, { siteRef: current.siteRef, departmentId: current.departmentId }, 'cmms.fleet.authorize');
      if (grounding.status === 'CLEARED') conflict('CMMS_FLEET_STATE', 'This red tag is already cleared.');
      if (grounding.version !== input.expectedVersion) versionConflict('The red tag');
      const override = grounding.status === 'GROUNDED';
      if (override && !input.override)
        conflict('CMMS_FLEET_NOT_REPAIRED', 'A mechanic certifies the repair first, or override with a reason.');
      if (!override && grounding.certifiedBy === principal.subject)
        throw new ForbiddenException({ code: 'CMMS_FLEET_FOUR_EYES', message: 'Someone other than the certifying mechanic clears the red tag.' });
      await client.query(
        `UPDATE gigalibs_cmms.fleet_groundings SET status = 'CLEARED', cleared_by = $3, cleared_at = now(), clearance_note = $4,
                override = $5, updated_by = $3, correlation_id = $6, version = version + 1 WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, groundingId, principal.subject, input.note ?? null, override, context.correlationId]);
      if (current.assetTakenOffline) {
        const asset = (await client.query<{ status: string; version: number }>(
          'SELECT status, version FROM gigalibs_cmms.assets WHERE tenant_id = $1 AND id = $2 FOR UPDATE', [principal.tenantId, grounding.assetId])).rows[0];
        if (asset?.status === 'OFFLINE') {
          await client.query(
            `UPDATE gigalibs_cmms.assets SET status = 'OPERATIONAL', version = version + 1, updated_by = $3, correlation_id = $4,
                    updated_at = now() WHERE tenant_id = $1 AND id = $2`,
            [principal.tenantId, grounding.assetId, principal.subject, context.correlationId]);
          await recordMutation(client, context, { action: 'CMMS_ASSET_RETURNED_TO_SERVICE', aggregateType: 'CMMS_ASSET',
            aggregateId: grounding.assetId, aggregateVersion: asset.version + 1, payload: { reason: 'FLEET_RED_TAG_CLEARED', groundingId } });
        }
      }
      await this.audit(client, context, override ? 'CMMS_FLEET_GROUNDING_OVERRIDDEN' : 'CMMS_FLEET_GROUNDING_CLEARED',
        'CMMS_FLEET_GROUNDING', groundingId, grounding.version + 1, { assetId: grounding.assetId });
      return this.groundingRow(client, principal, groundingId, false);
    });
  }

  // ─── Rows and helpers ─────────────────────────────────────────────────────────────────────────────────

  /** Grounds an asset: the red tag, one emergency work order raised by CMMS itself, and an operational asset taken offline. */
  private async ground(
    client: PoolClient, context: CmmsCommandContext, asset: CmmsAssetV1,
    origin: { source: 'INSPECTION' | 'MANUAL'; inspectionId?: string; operationId: string; reason: string },
  ): Promise<string> {
    const tenantId = context.principal.tenantId;
    const system = { principal: systemPrincipal(tenantId, 'fleet:red-tag', 'fleet'), correlationId: context.correlationId };
    const workOrderId = await this.workOrders.createWithClient(client, system, {
      requestKey: derivedRequestKey('fleet-red-tag', tenantId, origin.operationId),
      type: 'REACTIVE', priority: 'EMERGENCY', title: `Red tag: ${asset.assetTag} grounded`.slice(0, 240),
      description: `${origin.reason}\n\nGrounded by ${context.principal.subject}. Repair, then certify the corrective action on the red tag.`.slice(0, 10_000),
      assetId: asset.id, requiresSignature: false, tasks: [],
    }, { triggerSource: 'FLEET_DEFECT', pmScheduleId: null, pmOccurrenceAt: null });
    let takenOffline = false;
    if (asset.status === 'OPERATIONAL') {
      await client.query(
        `UPDATE gigalibs_cmms.assets SET status = 'OFFLINE', version = version + 1, updated_by = $3, correlation_id = $4, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`, [tenantId, asset.id, context.principal.subject, context.correlationId]);
      takenOffline = true;
      await recordMutation(client, context, { action: 'CMMS_ASSET_TAKEN_OFFLINE', aggregateType: 'CMMS_ASSET', aggregateId: asset.id,
        aggregateVersion: asset.version + 1, payload: { reason: 'FLEET_RED_TAG', operationId: origin.operationId } });
    }
    const id = randomUUID();
    await client.query(
      `INSERT INTO gigalibs_cmms.fleet_groundings (tenant_id, id, asset_id, source, inspection_id, client_operation_id, reason, grounded_by,
         work_order_id, asset_taken_offline, site_ref, department_id, updated_by, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $8, $13)`,
      [tenantId, id, asset.id, origin.source, origin.inspectionId ?? null, origin.source === 'MANUAL' ? origin.operationId : null,
        origin.reason, context.principal.subject, workOrderId, takenOffline, asset.siteRef, asset.departmentId, context.correlationId]);
    await recordMutation(client, context, { action: 'CMMS_FLEET_ASSET_GROUNDED', aggregateType: 'CMMS_FLEET_GROUNDING', aggregateId: id,
      aggregateVersion: 1, payload: { assetId: asset.id, source: origin.source, workOrderId } });
    return id;
  }

  private assertWrite(principal: CmmsPrincipal, target: { siteRef: string | null; departmentId: string | null }, permission: string) {
    assertWritableScope(principal, { departmentId: target.departmentId, siteRef: target.siteRef }, undefined, undefined, { permission });
  }

  private async nextRevision(client: PoolClient, tenantId: string, code: string): Promise<number> {
    return (await client.query<{ next: number }>(
      'SELECT coalesce(max(revision), 0) + 1 AS next FROM gigalibs_cmms.fleet_check_templates WHERE tenant_id = $1 AND code = $2',
      [tenantId, code])).rows[0]!.next;
  }

  private async insertDraft(insert: () => Promise<{ rows: { id: string }[] }>) {
    try {
      return (await insert()).rows[0]!.id;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
      if (code === '23505') conflict('CMMS_FLEET_DRAFT_EXISTS', 'This check already has a draft.');
      throw error;
    }
  }

  private async lockTemplate(client: PoolClient, context: CmmsCommandContext, templateId: string, status: FleetTemplateV1['status'], expectedVersion: number) {
    const current = await this.templateRow(client, context.principal.tenantId, templateId, true);
    if (current.status !== status) conflict('CMMS_FLEET_STATE', `This revision is ${current.status.toLowerCase()}.`);
    if (current.version !== expectedVersion) versionConflict('The check');
    return current;
  }

  private async templateRow(client: PoolClient, tenantId: string, templateId: string, lock: boolean): Promise<FleetTemplateV1> {
    const row = (await client.query(`SELECT * FROM gigalibs_cmms.fleet_check_templates WHERE tenant_id = $1 AND id = $2${lock ? ' FOR UPDATE' : ''}`,
      [tenantId, templateId])).rows[0];
    if (!row) notFound('The check');
    return mapTemplate(row);
  }

  private async publishedTemplate(client: PoolClient, tenantId: string, code: string): Promise<FleetTemplateV1 | null> {
    const row = (await client.query("SELECT * FROM gigalibs_cmms.fleet_check_templates WHERE tenant_id = $1 AND code = $2 AND status = 'PUBLISHED'",
      [tenantId, code])).rows[0];
    return row ? mapTemplate(row) : null;
  }

  /** Locks the asset's enrolment, which serialises inspections and red tags of one asset. */
  private async lockEnrollment(client: PoolClient, tenantId: string, assetId: string): Promise<FleetEnrollmentV1> {
    const row = (await client.query('SELECT * FROM gigalibs_cmms.fleet_enrollments WHERE tenant_id = $1 AND asset_id = $2 FOR UPDATE',
      [tenantId, assetId])).rows[0];
    if (!row) conflict('CMMS_FLEET_NOT_ENROLLED', 'This asset is not enrolled for fleet checks.');
    return mapEnrollment(row);
  }

  private async openGroundingRow(client: PoolClient, tenantId: string, assetId: string): Promise<{ id: string } | undefined> {
    return (await client.query<{ id: string }>(
      "SELECT id FROM gigalibs_cmms.fleet_groundings WHERE tenant_id = $1 AND asset_id = $2 AND status <> 'CLEARED'", [tenantId, assetId])).rows[0];
  }

  private async readinessRow(client: PoolClient, tenantId: string, assetId: string, now: Date): Promise<FleetReadinessV1> {
    const row = (await client.query(`${READINESS_SELECT} WHERE e.tenant_id = $1 AND e.asset_id = $2`, [tenantId, assetId])).rows[0];
    if (!row) notFound('The fleet enrolment');
    return mapReadiness(row, now);
  }

  private async groundingRow(client: PoolClient, principal: CmmsPrincipal, groundingId: string, lock: true):
    Promise<{ grounding: FleetGroundingV1; siteRef: string | null; departmentId: string | null; assetTakenOffline: boolean }>;
  private async groundingRow(client: PoolClient, principal: CmmsPrincipal, groundingId: string, lock: false): Promise<FleetGroundingV1>;
  private async groundingRow(client: PoolClient, principal: CmmsPrincipal, groundingId: string, lock: boolean) {
    const values: unknown[] = [principal.tenantId, groundingId];
    const where = ['g.tenant_id = $1', 'g.id = $2', ...scopePredicates(principal, values, 'g.')];
    const row = (await client.query(
      `SELECT g.*, a.asset_tag, a.name AS asset_name FROM gigalibs_cmms.fleet_groundings g
         JOIN gigalibs_cmms.assets a ON a.tenant_id = g.tenant_id AND a.id = g.asset_id
        WHERE ${where.join(' AND ')}${lock ? ' FOR UPDATE OF g' : ''}`, values)).rows[0];
    if (!row) notFound('The red tag');
    const grounding = mapGrounding(row);
    return lock ? { grounding, siteRef: row.site_ref, departmentId: row.department_id, assetTakenOffline: row.asset_taken_offline } : grounding;
  }

  private async inspectionRow(client: PoolClient, principal: CmmsPrincipal, inspectionId: string): Promise<FleetInspectionV1> {
    const values: unknown[] = [principal.tenantId, inspectionId];
    const where = ['i.tenant_id = $1', 'i.id = $2', ...scopePredicates(principal, values, 'i.')];
    const row = (await client.query(
      `SELECT i.*, a.asset_tag, t.code AS template_code, t.revision,
              (SELECT g.id FROM gigalibs_cmms.fleet_groundings g WHERE g.tenant_id = i.tenant_id AND g.inspection_id = i.id) AS grounding_id
         FROM gigalibs_cmms.fleet_inspections i
         JOIN gigalibs_cmms.assets a ON a.tenant_id = i.tenant_id AND a.id = i.asset_id
         JOIN gigalibs_cmms.fleet_check_templates t ON t.tenant_id = i.tenant_id AND t.id = i.template_id
        WHERE ${where.join(' AND ')}`, values)).rows[0];
    if (!row) notFound('The inspection');
    const results = await client.query(
      `SELECT r.*, EXISTS (SELECT 1 FROM gigalibs_cmms.fleet_inspection_photos p WHERE p.tenant_id = r.tenant_id
                AND p.inspection_id = r.inspection_id AND p.item_key = r.item_key) AS has_photo
         FROM gigalibs_cmms.fleet_inspection_results r WHERE r.tenant_id = $1 AND r.inspection_id = $2 ORDER BY r.position`,
      [principal.tenantId, inspectionId]);
    return {
      id: row.id, assetId: row.asset_id, assetTag: row.asset_tag, templateId: row.template_id, templateCode: row.template_code,
      revision: row.revision, kind: row.kind, inspectedBy: row.inspected_by, startedAt: iso(row.started_at), submittedAt: iso(row.submitted_at),
      meterReading: row.meter_reading === null ? null : Number(row.meter_reading), result: row.result, minorCount: row.minor_count,
      criticalCount: row.critical_count, requestId: row.request_id, groundingId: row.grounding_id ?? null,
      results: results.rows.map((result) => ({
        itemKey: result.item_key, zoneKey: result.zone_key, outcome: result.outcome, note: result.note, hasPhoto: result.has_photo,
      })),
    };
  }

  private audit(client: PoolClient, context: CmmsCommandContext, action: string, aggregateType: string, aggregateId: string,
    version: number, payload: Record<string, unknown>) {
    return recordMutation(client, context, { action, aggregateType, aggregateId, aggregateVersion: version, payload });
  }
}
