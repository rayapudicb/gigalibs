import { createHash, randomUUID } from 'node:crypto';
import {
  CloseHazardV1Schema,
  HAZARD_PHOTO_MAX_BYTES,
  HAZARD_TRIAGE_HOURS,
  InvestigationV1InputSchema,
  LiftStopWorkV1Schema,
  ReportHazardV1Schema,
  TriageHazardV1Schema,
  holdsPermission,
  sniffDiagramImage,
  type HazardInsightsV1,
  type HazardInvestigationV1,
  type HazardReportV1,
  type ReportHazardResultV1,
  type StopWorkAlertV1,
} from '@gigalibs/contracts';
import { type ModuleCommandContext, type ModulePrincipal, moduleErrors, recordMutation } from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';

// WI-OI-141 M-INC (ADR-0036). Anyone with report rights reports in seconds; triage is by someone other than the
// reporter; a STOP_WORK report raises one alert that each person acknowledges once and someone other than the
// reporter lifts with a reason. Reporters see their own reports; the safety team reads all of them.

// Typed explicitly so the never-returning helpers narrow (TypeScript needs an explicit type for that).
export const errors: ReturnType<typeof moduleErrors> = moduleErrors('SAFETY_OPERATIONS', 'Safety Operations');
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const MAX_LATE_MS = 7 * 86_400_000;
const HOUR_MS = 3_600_000;
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const iso = (value: Date | string) => new Date(value).toISOString();
const isoOrNull = (value: Date | string | null) => (value ? iso(value) : null);
const outbox = { schema: SCHEMA, topic: TOPIC };

function conflict(code: string, message: string): never {
  throw new ConflictException({ code: `SAFETY_OPERATIONS_${code}`, message });
}

@Injectable()
export class HazardsService {
  constructor(private readonly database: DatabaseService) {}

  async report(context: ModuleCommandContext, raw: unknown, now = new Date()): Promise<ReportHazardResultV1> {
    const input = errors.parseInput(ReportHazardV1Schema, raw);
    const { tenantId, subject } = context.principal;
    const observed = Date.parse(input.observedAt);
    if (observed > now.getTime() + MAX_FUTURE_SKEW_MS) conflict('CLOCK', 'The time seen is in the future; check the device clock.');
    if (observed < now.getTime() - MAX_LATE_MS) conflict('LATE', 'Report hazards within a week of seeing them; older events go to the safety team directly.');
    let photo: { bytes: Buffer; sha256: string } | null = null;
    if (input.photoBase64) {
      const bytes = Buffer.from(input.photoBase64, 'base64');
      if (bytes.length < 16 || bytes.length > HAZARD_PHOTO_MAX_BYTES || sniffDiagramImage(bytes) !== input.photoContentType)
        throw new BadRequestException({ code: 'SAFETY_OPERATIONS_PHOTO_INVALID', message: 'The photo must be a PNG, JPEG or WebP of at most 300 KB.' });
      photo = { bytes, sha256: sha256(bytes) };
    }
    const payloadSha256 = sha256(JSON.stringify(input));
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const replay = (await client.query<{ id: string; payload_sha256: string }>(
        `SELECT id, payload_sha256 FROM ${SCHEMA}.hazard_reports WHERE tenant_id = $1 AND reported_by = $2 AND client_operation_id = $3`,
        [tenantId, subject, input.clientOperationId])).rows[0];
      if (replay) {
        if (replay.payload_sha256 !== payloadSha256) conflict('OPERATION_REUSED', 'This capture id was already used for a different report.');
        return { replayed: true, report: await this.reportRow(client, context.principal, replay.id) };
      }
      const counter = await client.query<{ last_value: string }>(
        `INSERT INTO ${SCHEMA}.hazard_counters AS c (tenant_id, last_value) VALUES ($1, 1)
         ON CONFLICT (tenant_id) DO UPDATE SET last_value = c.last_value + 1 RETURNING last_value`, [tenantId]);
      const reference = `HZ-${String(counter.rows[0]!.last_value).padStart(6, '0')}`;
      const id = randomUUID();
      const due = new Date(now.getTime() + HAZARD_TRIAGE_HOURS[input.severity] * HOUR_MS);
      await client.query(
        `INSERT INTO ${SCHEMA}.hazard_reports (id, tenant_id, reference, client_operation_id, payload_sha256, severity, category,
           description, area, site_ref, asset_ref, reported_by, observed_at, received_at, triage_due_at, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [id, tenantId, reference, input.clientOperationId, payloadSha256, input.severity, input.category, input.description, input.area,
          input.siteRef ?? null, input.assetRef ?? null, subject, input.observedAt, now, due, context.correlationId]);
      if (photo)
        await client.query(
          `INSERT INTO ${SCHEMA}.hazard_photos (report_id, tenant_id, content_type, bytes, sha256) VALUES ($1, $2, $3, $4, $5)`,
          [id, tenantId, input.photoContentType, photo.bytes, photo.sha256]);
      await recordMutation(client, outbox, context, { action: 'HAZARD_REPORTED', aggregateType: 'hazard-report', aggregateId: id,
        aggregateVersion: 1, payload: { reference, severity: input.severity, category: input.category, area: input.area } });
      if (input.severity === 'STOP_WORK') {
        const alertId = randomUUID();
        await client.query(
          `INSERT INTO ${SCHEMA}.stop_work_alerts (id, tenant_id, report_id, area, raised_by, raised_at, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`, [alertId, tenantId, id, input.area, subject, now, context.correlationId]);
        await recordMutation(client, outbox, context, { action: 'STOP_WORK_RAISED', aggregateType: 'stop-work-alert', aggregateId: alertId,
          aggregateVersion: 1, payload: { reportId: id, reference, area: input.area } });
      }
      return { replayed: false, report: await this.reportRow(client, context.principal, id) };
    });
  }

  /** The caller's own reports of the last 90 days. */
  mine(principal: ModulePrincipal): Promise<{ items: HazardReportV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const ids = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.hazard_reports WHERE tenant_id = $1 AND reported_by = $2 AND received_at > now() - interval '90 days'
          ORDER BY received_at DESC LIMIT 100`, [principal.tenantId, principal.subject]);
      return this.rows(client, principal, ids.rows.map((row) => row.id));
    });
  }

  /** Every report of the last 180 days for the safety team, optionally by status or severity. */
  list(principal: ModulePrincipal, query: { status?: string; severity?: string }): Promise<{ items: HazardReportV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['tenant_id = $1', "received_at > now() - interval '180 days'"];
      if (query.status && ['REPORTED', 'TRIAGED', 'CLOSED'].includes(query.status)) {
        values.push(query.status);
        where.push(`status = $${values.length}`);
      }
      if (query.severity && ['GOOD_CATCH', 'UNSAFE_CONDITION', 'STOP_WORK'].includes(query.severity)) {
        values.push(query.severity);
        where.push(`severity = $${values.length}`);
      }
      const ids = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.hazard_reports WHERE ${where.join(' AND ')} ORDER BY triage_due_at, received_at DESC LIMIT 500`, values);
      return this.rows(client, principal, ids.rows.map((row) => row.id));
    });
  }

  get(principal: ModulePrincipal, reportId: string): Promise<HazardReportV1> {
    errors.assertUuid(reportId, 'reportId');
    return this.database.withTenantTransaction(principal.tenantId, (client) => this.visible(client, principal, reportId));
  }

  photo(principal: ModulePrincipal, reportId: string): Promise<{ contentType: string; base64: string; sha256: string }> {
    errors.assertUuid(reportId, 'reportId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.visible(client, principal, reportId);
      const row = (await client.query<{ content_type: string; bytes: Buffer; sha256: string }>(
        `SELECT content_type, bytes, sha256 FROM ${SCHEMA}.hazard_photos WHERE tenant_id = $1 AND report_id = $2`,
        [principal.tenantId, reportId])).rows[0];
      if (!row) errors.notFound('Photo');
      return { contentType: row.content_type, base64: row.bytes.toString('base64'), sha256: row.sha256 };
    });
  }

  triage(context: ModuleCommandContext, reportId: string, raw: unknown): Promise<HazardReportV1> {
    errors.assertUuid(reportId, 'reportId');
    const input = errors.parseInput(TriageHazardV1Schema, raw);
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const current = await this.lock(client, context.principal, reportId, input.expectedVersion);
      if (current.status !== 'REPORTED') conflict('STATE', 'This report is already triaged.');
      if (current.reportedBy === subject)
        throw new ForbiddenException({ code: 'SAFETY_OPERATIONS_FOUR_EYES', message: 'Someone other than the reporter triages a report.' });
      await client.query(
        `UPDATE ${SCHEMA}.hazard_reports SET status = 'TRIAGED', likelihood = $3, consequence = $4, route = $5, triage_note = $6,
                triaged_by = $7, triaged_at = now(), version = version + 1, correlation_id = $8, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, reportId, input.likelihood, input.consequence, input.route, input.note ?? null, subject, context.correlationId]);
      await recordMutation(client, outbox, context, { action: 'HAZARD_TRIAGED', aggregateType: 'hazard-report', aggregateId: reportId,
        aggregateVersion: current.version + 1, payload: { route: input.route, riskScore: input.likelihood * input.consequence } });
      return this.reportRow(client, context.principal, reportId);
    });
  }

  close(context: ModuleCommandContext, reportId: string, raw: unknown): Promise<HazardReportV1> {
    errors.assertUuid(reportId, 'reportId');
    const input = errors.parseInput(CloseHazardV1Schema, raw);
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const current = await this.lock(client, context.principal, reportId, input.expectedVersion);
      if (current.status !== 'TRIAGED') conflict('STATE', current.status === 'CLOSED' ? 'This report is closed.' : 'Triage the report first.');
      if (current.stopWork?.status === 'OPEN') conflict('STOP_WORK_OPEN', 'Lift the stop-work alert before closing the report.');
      if (current.route === 'INVESTIGATION' && !current.investigation?.completedAt)
        conflict('INVESTIGATION_OPEN', 'Complete the investigation before closing the report.');
      await client.query(
        `UPDATE ${SCHEMA}.hazard_reports SET status = 'CLOSED', resolution = $3, closed_by = $4, closed_at = now(), version = version + 1,
                correlation_id = $5, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, reportId, input.resolution, subject, context.correlationId]);
      await recordMutation(client, outbox, context, { action: 'HAZARD_CLOSED', aggregateType: 'hazard-report', aggregateId: reportId,
        aggregateVersion: current.version + 1, payload: {} });
      return this.reportRow(client, context.principal, reportId);
    });
  }

  saveInvestigation(context: ModuleCommandContext, reportId: string, raw: unknown): Promise<HazardReportV1> {
    errors.assertUuid(reportId, 'reportId');
    const input = errors.parseInput(InvestigationV1InputSchema, raw);
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const report = await this.visible(client, context.principal, reportId);
      if (report.status !== 'TRIAGED' || report.route !== 'INVESTIGATION')
        conflict('STATE', 'Only a report routed to investigation and not yet closed is investigated.');
      const existing = (await client.query<{ version: number; completed_at: Date | null }>(
        `SELECT version, completed_at FROM ${SCHEMA}.hazard_investigations WHERE tenant_id = $1 AND report_id = $2 FOR UPDATE`,
        [tenantId, reportId])).rows[0];
      if ((existing?.version ?? 0) !== input.expectedVersion) errors.versionConflict('Investigation');
      if (existing?.completed_at) conflict('INVESTIGATION_COMPLETE', 'This investigation is complete.');
      const values = [reportId, tenantId, JSON.stringify(input.whys), input.rootCause, JSON.stringify(input.contributingFactors), subject,
        input.complete ? new Date() : null, context.correlationId];
      if (existing)
        await client.query(
          `UPDATE ${SCHEMA}.hazard_investigations SET whys = $3::jsonb, root_cause = $4, contributing_factors = $5::jsonb, investigator = $6,
                  completed_at = $7, correlation_id = $8, version = version + 1, updated_at = now() WHERE report_id = $1 AND tenant_id = $2`, values);
      else
        await client.query(
          `INSERT INTO ${SCHEMA}.hazard_investigations (report_id, tenant_id, whys, root_cause, contributing_factors, investigator,
             completed_at, correlation_id) VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7, $8)`, values);
      await recordMutation(client, outbox, context, { action: input.complete ? 'HAZARD_INVESTIGATION_COMPLETED' : 'HAZARD_INVESTIGATION_SAVED',
        aggregateType: 'hazard-investigation', aggregateId: reportId, aggregateVersion: (existing?.version ?? 0) + 1, payload: {} });
      return this.reportRow(client, context.principal, reportId);
    });
  }

  /** Stop-work alerts still open; everyone who may report sees them. */
  openAlerts(principal: ModulePrincipal): Promise<{ items: StopWorkAlertV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const ids = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.stop_work_alerts WHERE tenant_id = $1 AND status = 'OPEN' ORDER BY raised_at DESC LIMIT 100`,
        [principal.tenantId]);
      const items: StopWorkAlertV1[] = [];
      for (const row of ids.rows) items.push(await this.alertRow(client, principal, row.id));
      return { items };
    });
  }

  acknowledge(context: ModuleCommandContext, alertId: string): Promise<StopWorkAlertV1> {
    errors.assertUuid(alertId, 'alertId');
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const alert = await this.alertRow(client, context.principal, alertId);
      if (alert.status !== 'OPEN') conflict('STOP_WORK_LIFTED', 'This stop-work alert is already lifted.');
      const inserted = await client.query(
        `INSERT INTO ${SCHEMA}.stop_work_acknowledgements (alert_id, tenant_id, subject) VALUES ($1, $2, $3)
         ON CONFLICT (alert_id, subject) DO NOTHING`, [alertId, tenantId, subject]);
      if (inserted.rowCount)
        await recordMutation(client, outbox, context, { action: 'STOP_WORK_ACKNOWLEDGED', aggregateType: 'stop-work-acknowledgement',
          aggregateId: `${alertId}:${subject}`.slice(0, 128), aggregateVersion: 1, payload: { alertId } });
      return this.alertRow(client, context.principal, alertId);
    });
  }

  lift(context: ModuleCommandContext, alertId: string, raw: unknown): Promise<StopWorkAlertV1> {
    errors.assertUuid(alertId, 'alertId');
    const input = errors.parseInput(LiftStopWorkV1Schema, raw);
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const row = (await client.query<{ status: string; version: number; raised_by: string }>(
        `SELECT status, version, raised_by FROM ${SCHEMA}.stop_work_alerts WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, alertId])).rows[0];
      if (!row) errors.notFound('Stop-work alert');
      if (row.status !== 'OPEN') conflict('STOP_WORK_LIFTED', 'This stop-work alert is already lifted.');
      if (row.version !== input.expectedVersion) errors.versionConflict('Stop-work alert');
      if (row.raised_by === subject)
        throw new ForbiddenException({ code: 'SAFETY_OPERATIONS_FOUR_EYES', message: 'Someone other than the person who stopped the work lifts it.' });
      await client.query(
        `UPDATE ${SCHEMA}.stop_work_alerts SET status = 'LIFTED', lifted_by = $3, lifted_at = now(), lift_reason = $4, version = version + 1,
                correlation_id = $5 WHERE tenant_id = $1 AND id = $2`, [tenantId, alertId, subject, input.reason, context.correlationId]);
      await recordMutation(client, outbox, context, { action: 'STOP_WORK_LIFTED', aggregateType: 'stop-work-alert', aggregateId: alertId,
        aggregateVersion: row.version + 1, payload: { reason: input.reason } });
      return this.alertRow(client, context.principal, alertId);
    });
  }

  /** Counts by area and category over a window of at most a year (default 90 days), and overdue triage now. */
  insights(principal: ModulePrincipal, days = 90, now = new Date()): Promise<HazardInsightsV1> {
    const window = Math.min(365, Math.max(1, Math.floor(days) || 90));
    const from = new Date(now.getTime() - window * 86_400_000);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const totals = (await client.query<{ total: number; overdue: number }>(
        `SELECT count(*) FILTER (WHERE received_at >= $2)::int AS total,
                count(*) FILTER (WHERE status = 'REPORTED' AND triage_due_at < $3)::int AS overdue
           FROM ${SCHEMA}.hazard_reports WHERE tenant_id = $1`, [principal.tenantId, from, now])).rows[0]!;
      const byArea = await client.query<{ area: string; count: number; stop_work: number }>(
        `SELECT area, count(*)::int AS count, count(*) FILTER (WHERE severity = 'STOP_WORK')::int AS stop_work
           FROM ${SCHEMA}.hazard_reports WHERE tenant_id = $1 AND received_at >= $2 GROUP BY area ORDER BY count DESC, area LIMIT 50`,
        [principal.tenantId, from]);
      const byCategory = await client.query<{ category: HazardReportV1['category']; count: number }>(
        `SELECT category, count(*)::int AS count FROM ${SCHEMA}.hazard_reports WHERE tenant_id = $1 AND received_at >= $2
          GROUP BY category ORDER BY count DESC, category`, [principal.tenantId, from]);
      return {
        from: from.toISOString(), to: now.toISOString(), total: totals.total, overdueTriage: totals.overdue,
        byArea: byArea.rows.map((row) => ({ area: row.area, count: row.count, stopWork: row.stop_work })),
        byCategory: byCategory.rows.map((row) => ({ category: row.category, count: row.count })),
      };
    });
  }

  // ─── Rows ─────────────────────────────────────────────────────────────────────────────────────────────

  /** A report the caller may see: their own, or any for the safety team. */
  private async visible(client: PoolClient, principal: ModulePrincipal, reportId: string): Promise<HazardReportV1> {
    const report = await this.reportRow(client, principal, reportId);
    if (report.reportedBy !== principal.subject && !holdsPermission(principal.permissions, 'safety-operations.hazards.read'))
      errors.notFound('Hazard report');
    return report;
  }

  private async lock(client: PoolClient, principal: ModulePrincipal, reportId: string, expectedVersion: number): Promise<HazardReportV1> {
    const row = (await client.query<{ version: number }>(
      `SELECT version FROM ${SCHEMA}.hazard_reports WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [principal.tenantId, reportId])).rows[0];
    if (!row) errors.notFound('Hazard report');
    if (row.version !== expectedVersion) errors.versionConflict('Hazard report');
    return this.reportRow(client, principal, reportId);
  }

  private async rows(client: PoolClient, principal: ModulePrincipal, ids: readonly string[]): Promise<{ items: HazardReportV1[] }> {
    const items: HazardReportV1[] = [];
    for (const id of ids) items.push(await this.reportRow(client, principal, id));
    return { items };
  }

  private async reportRow(client: PoolClient, principal: ModulePrincipal, reportId: string): Promise<HazardReportV1> {
    const row = (await client.query(
      `SELECT r.*, EXISTS (SELECT 1 FROM ${SCHEMA}.hazard_photos p WHERE p.tenant_id = r.tenant_id AND p.report_id = r.id) AS has_photo,
              (SELECT a.id FROM ${SCHEMA}.stop_work_alerts a WHERE a.tenant_id = r.tenant_id AND a.report_id = r.id) AS alert_id
         FROM ${SCHEMA}.hazard_reports r WHERE r.tenant_id = $1 AND r.id = $2`, [principal.tenantId, reportId])).rows[0];
    if (!row) errors.notFound('Hazard report');
    const investigation = (await client.query(
      `SELECT * FROM ${SCHEMA}.hazard_investigations WHERE tenant_id = $1 AND report_id = $2`, [principal.tenantId, reportId])).rows[0];
    return {
      id: row.id, reference: row.reference, severity: row.severity, category: row.category, description: row.description, area: row.area,
      siteRef: row.site_ref, assetRef: row.asset_ref, reportedBy: row.reported_by, observedAt: iso(row.observed_at),
      receivedAt: iso(row.received_at), triageDueAt: iso(row.triage_due_at), status: row.status, likelihood: row.likelihood,
      consequence: row.consequence, riskScore: row.likelihood && row.consequence ? row.likelihood * row.consequence : null,
      route: row.route, triagedBy: row.triaged_by, triageNote: row.triage_note, resolution: row.resolution, closedBy: row.closed_by,
      hasPhoto: row.has_photo, stopWork: row.alert_id ? await this.alertRow(client, principal, row.alert_id) : null,
      investigation: investigation ? this.mapInvestigation(investigation) : null, version: row.version,
    };
  }

  private mapInvestigation(row: Record<string, any>): HazardInvestigationV1 {
    return {
      reportId: row.report_id, whys: row.whys, rootCause: row.root_cause, contributingFactors: row.contributing_factors,
      investigator: row.investigator, completedAt: isoOrNull(row.completed_at), version: row.version,
    };
  }

  private async alertRow(client: PoolClient, principal: ModulePrincipal, alertId: string): Promise<StopWorkAlertV1> {
    const row = (await client.query(
      `SELECT a.*, (SELECT count(*) FROM ${SCHEMA}.stop_work_acknowledgements k WHERE k.alert_id = a.id)::int AS acknowledgements,
              EXISTS (SELECT 1 FROM ${SCHEMA}.stop_work_acknowledgements k WHERE k.alert_id = a.id AND k.subject = $3) AS mine
         FROM ${SCHEMA}.stop_work_alerts a WHERE a.tenant_id = $1 AND a.id = $2`, [principal.tenantId, alertId, principal.subject])).rows[0];
    if (!row) errors.notFound('Stop-work alert');
    return {
      id: row.id, reportId: row.report_id, area: row.area, status: row.status, raisedAt: iso(row.raised_at),
      acknowledgements: row.acknowledgements, acknowledgedByMe: row.mine, liftedBy: row.lifted_by, liftedAt: isoOrNull(row.lifted_at),
      liftReason: row.lift_reason, version: row.version,
    };
  }
}
