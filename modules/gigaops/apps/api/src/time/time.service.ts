import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  ApproveTimesheetV1Schema,
  ListPunchesV1QuerySchema,
  ListTimesheetsV1QuerySchema,
  RecordPunchV1Schema,
  RecordTimeCorrectionV1Schema,
  RejectTimesheetV1Schema,
  ResolveTimeExceptionV1Schema,
  SearchTimeExceptionsV1Schema,
  SubmitTimesheetV1Schema,
  TimesheetPreviewV1QuerySchema,
  type GeofenceResultV1,
  type PunchV1,
  type RecordPunchV1,
  type TimeCorrectionV1,
  type TimeExceptionKindV1,
  type TimeExceptionV1,
  type TimesheetDetailV1,
  type TimesheetLineV1,
  type TimesheetPreviewV1,
  type TimesheetV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import { hasWorkforcePermission, type GigaOpsPrincipal } from '../auth/authorization.js';
import { type CommandContext, assertUuid, conflict, iso, parse, recordMutation } from '../common/commands.js';
import { WorkforceDatabaseService } from '../database/database.service.js';
import {
  ADMISSION_REFUSED,
  AdmissionGate,
  type EffectivePunch,
  type WeekComputation,
  addDays,
  computeWeek,
  localDate,
  punchTiming,
  weekStart,
} from './time.rules.js';

/** Punch transactions admitted at once per process; beyond this the device is told to retry (429). */
const MAX_PUNCHES_IN_FLIGHT = 64;
/** Corrections may reach back further than device punches, but not into history that payroll has closed. */
const MAX_CORRECTION_AGE_MS = 92 * 86_400_000;

const PUNCH_SELECT = `
  SELECT p.*, r.display_name AS resource_name,
         EXISTS (SELECT 1 FROM gigalibs_workforce.punch_voids v WHERE v.tenant_id = p.tenant_id AND v.punch_id = p.id) AS voided,
         COALESCE((SELECT array_agg(e.kind ORDER BY e.kind) FROM gigalibs_workforce.time_exceptions e
                    WHERE e.tenant_id = p.tenant_id AND e.punch_id = p.id), '{}') AS exception_kinds
    FROM gigalibs_workforce.punches p
    JOIN gigalibs_workforce.workforce_resources r ON r.tenant_id = p.tenant_id AND r.id = p.resource_id`;

const TIMESHEET_SELECT = `
  SELECT t.*, r.display_name AS resource_name, r.platform_user_id
    FROM gigalibs_workforce.timesheets t
    JOIN gigalibs_workforce.workforce_resources r ON r.tenant_id = t.tenant_id AND r.id = t.resource_id`;

const EXCEPTION_SELECT = `
  SELECT e.*, r.display_name AS resource_name, r.platform_user_id
    FROM gigalibs_workforce.time_exceptions e
    JOIN gigalibs_workforce.workforce_resources r ON r.tenant_id = e.tenant_id AND r.id = e.resource_id`;

interface Subject {
  readonly resourceId: string;
  readonly resourceName: string;
  /** The person is the signed-in user. */
  readonly own: boolean;
}

/**
 * Time and attendance (WI-OI-069). Punches are the device inbox: `(device, event)` is unique, so resends replay
 * the original. Fence, lateness and after-submission problems never refuse a punch; they raise exceptions that a
 * manager resolves. Weeks are computed from effective (not voided) punches; a submitted week is snapshotted,
 * approved four-eyes and then immutable (the database refuses any change). Corrections are append-only, carry a
 * reason code and never touch a submitted or approved week or one's own time. A per-person, per-week advisory
 * lock orders punches, corrections and submission of the same week.
 */
@Injectable()
export class TimeService {
  private readonly gate = new AdmissionGate(MAX_PUNCHES_IN_FLIGHT);

  constructor(private readonly database: WorkforceDatabaseService) {}

  // ─── Punches ───────────────────────────────────────────────────────────────────────────────────────────
  async recordPunch(context: CommandContext, rawInput: unknown): Promise<PunchV1 & { readonly replayed: boolean }> {
    const input = parse(RecordPunchV1Schema, rawInput);
    const timing = punchTiming(input.occurredAt, new Date());
    if (!timing.accepted) {
      throw new BadRequestException({
        code: timing.code,
        message: timing.code === 'WORKFORCE_PUNCH_IN_FUTURE'
          ? 'The punch time is ahead of the server clock; check the device time.'
          : 'The punch is more than 31 days old; ask a manager to record it as a correction.',
      });
    }
    const outcome = await this.gate.run(() =>
      this.database.withTenantTransaction(context.principal.tenantId, (client) => this.recordPunchWithClient(client, context, input, timing)),
    );
    if (outcome === ADMISSION_REFUSED) {
      throw new HttpException(
        { code: 'WORKFORCE_PUNCH_BUSY', message: 'Too many punches are being recorded right now; retry with the same event id.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return outcome;
  }

  private async recordPunchWithClient(
    client: PoolClient,
    context: CommandContext,
    input: RecordPunchV1,
    timing: { readonly late: boolean; readonly delayMinutes: number },
  ): Promise<PunchV1 & { readonly replayed: boolean }> {
    const tenantId = context.principal.tenantId;
    const worker = await this.ownWorker(client, context.principal);
    const byDeviceKey = `${PUNCH_SELECT} WHERE p.tenant_id = $1 AND p.device_id = $2 AND p.device_event_id = $3`;
    // A resend normally hits the unique device key on insert. With a booking, the replay is answered before the
    // booking is re-validated, so a resend never fails because the booking moved on meanwhile.
    if (input.bookingId) {
      const existing = await client.query(byDeviceKey, [tenantId, input.deviceId, input.deviceEventId]);
      if (existing.rows[0]) return replay(existing.rows[0], worker.id);
    }

    let siteRef = input.siteRef ?? null;
    if (input.bookingId) {
      const booking = await client.query<{ status: string; resource_id: string; site_ref: string | null }>(
        `SELECT b.status, b.resource_id, q.site_ref
           FROM gigalibs_workforce.bookings b
           JOIN gigalibs_workforce.work_requirements q ON q.tenant_id = b.tenant_id AND q.id = b.requirement_id
          WHERE b.tenant_id = $1 AND b.id = $2`,
        [tenantId, input.bookingId],
      );
      const row = booking.rows[0];
      if (!row || row.resource_id !== worker.id) {
        throw new BadRequestException({ code: 'WORKFORCE_BOOKING_NOT_YOURS', message: 'That booking is not one of yours.' });
      }
      if (!['CONFIRMED', 'DISPATCHED', 'ON_SITE'].includes(row.status)) {
        throw new ConflictException({ code: 'WORKFORCE_BOOKING_STATE', message: `A ${row.status} booking cannot take punches.` });
      }
      if (siteRef === null) siteRef = row.site_ref;
      else if (row.site_ref && row.site_ref !== siteRef) {
        throw new BadRequestException({ code: 'WORKFORCE_SITE_MISMATCH', message: 'The punch site differs from the booking site.' });
      }
    }

    const fence = geofenceOf(input, siteRef);
    const workDate = localDate(input.occurredAt, input.timeZone);
    await lockWeek(client, tenantId, worker.id, workDate);
    const inserted = await client.query<{ id: string; received_at: Date }>(
      `INSERT INTO gigalibs_workforce.punches
         (tenant_id, resource_id, kind, occurred_at, time_zone, work_date, source, device_id, device_event_id, site_ref, booking_id,
          latitude, longitude, accuracy_meters, geofence_result, distance_to_edge_meters, late, recorded_by, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'DEVICE', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (tenant_id, device_id, device_event_id) DO NOTHING
       RETURNING id, received_at`,
      [
        tenantId, worker.id, input.kind, input.occurredAt, input.timeZone, workDate, input.deviceId, input.deviceEventId, siteRef,
        input.bookingId ?? null, input.location?.latitude ?? null, input.location?.longitude ?? null,
        input.location?.accuracyMeters ?? null, fence.result, fence.distanceToEdgeMeters, timing.late, context.principal.subject,
        context.correlationId,
      ],
    );
    if (!inserted.rows[0]) {
      // A concurrent resend of the same event committed first.
      return replay((await client.query(byDeviceKey, [tenantId, input.deviceId, input.deviceEventId])).rows[0], worker.id);
    }
    const punchId = inserted.rows[0].id;

    const raised: { kind: TimeExceptionKindV1; details: Record<string, unknown> }[] = [];
    if (fence.result === 'OUTSIDE') {
      raised.push({ kind: 'OUT_OF_FENCE', details: { distanceToEdgeMeters: fence.distanceToEdgeMeters, accuracyMeters: input.location?.accuracyMeters ?? null } });
    }
    if (siteRef && fence.result === 'NOT_CHECKED') raised.push({ kind: 'GEOFENCE_UNVERIFIED', details: { reason: fence.reason } });
    if (siteRef && fence.result === 'NO_LOCATION') raised.push({ kind: 'LOCATION_MISSING', details: {} });
    if (timing.late) raised.push({ kind: 'LATE_PUNCH', details: { delayMinutes: timing.delayMinutes } });
    const closedWeek = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM gigalibs_workforce.timesheets
        WHERE tenant_id = $1 AND resource_id = $2 AND period_start = $3 AND status IN ('SUBMITTED', 'APPROVED')`,
      [tenantId, worker.id, weekStart(workDate)],
    );
    if (closedWeek.rows[0]) {
      raised.push({ kind: 'AFTER_SUBMISSION', details: { timesheetId: closedWeek.rows[0].id, timesheetStatus: closedWeek.rows[0].status } });
    }
    for (const exception of raised) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_workforce.time_exceptions (tenant_id, resource_id, punch_id, work_date, kind, details, site_ref, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8) RETURNING id`,
        [tenantId, worker.id, punchId, workDate, exception.kind, JSON.stringify(exception.details), siteRef, context.correlationId],
      );
      await recordMutation(client, context, 'WORKFORCE_TIME_EXCEPTION_RAISED', 'WORKFORCE_TIME_EXCEPTION', created.rows[0]!.id, 1, {
        kind: exception.kind,
        punchId,
        resourceId: worker.id,
        workDate,
      });
    }
    await recordMutation(client, context, 'WORKFORCE_PUNCH_RECORDED', 'WORKFORCE_PUNCH', punchId, 1, {
      resourceId: worker.id,
      kind: input.kind,
      occurredAt: input.occurredAt,
      workDate,
      siteRef,
      geofence: fence.result,
      late: timing.late,
    });
    return {
      id: punchId,
      resourceId: worker.id,
      resourceName: worker.display_name,
      kind: input.kind,
      occurredAt: iso(input.occurredAt),
      receivedAt: iso(inserted.rows[0].received_at),
      workDate,
      timeZone: input.timeZone,
      source: 'DEVICE',
      siteRef,
      bookingId: input.bookingId ?? null,
      geofence: fence.result,
      distanceToEdgeMeters: fence.distanceToEdgeMeters,
      late: timing.late,
      voided: false,
      exceptions: raised.map((exception) => exception.kind).sort(),
      replayed: false,
    };
  }

  async listPunches(principal: GigaOpsPrincipal, rawQuery: unknown): Promise<{ readonly items: readonly PunchV1[] }> {
    const query = parse(ListPunchesV1QuerySchema, rawQuery);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const subject = await this.subject(client, principal, query.resourceId, 'workforce.time.read');
      const values: unknown[] = [principal.tenantId, subject.resourceId, query.from, query.to];
      const where = ['p.tenant_id = $1', 'p.resource_id = $2', 'p.work_date BETWEEN $3 AND $4'];
      if (!subject.own) where.push(...sitePredicates(principal, values, 'p.'));
      const result = await client.query(`${PUNCH_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.occurred_at, p.id LIMIT 2000`, values);
      return { items: result.rows.map(mapPunch) };
    });
  }

  // ─── Timesheets ────────────────────────────────────────────────────────────────────────────────────────
  async preview(principal: GigaOpsPrincipal, rawQuery: unknown): Promise<TimesheetPreviewV1> {
    const query = parse(TimesheetPreviewV1QuerySchema, rawQuery);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const subject = await this.subject(client, principal, query.resourceId, 'workforce.time.read');
      const { punches, week } = await this.week(client, principal.tenantId, subject.resourceId, query.periodStart);
      if (!subject.own) assertWeekInScope(principal, punches, query.periodStart);
      const stored = await client.query(`${TIMESHEET_SELECT} WHERE t.tenant_id = $1 AND t.resource_id = $2 AND t.period_start = $3`, [
        principal.tenantId, subject.resourceId, query.periodStart,
      ]);
      return {
        resourceId: subject.resourceId,
        resourceName: subject.resourceName,
        periodStart: query.periodStart,
        periodEnd: addDays(query.periodStart, 6),
        lines: week.lines,
        issues: week.issues,
        openExceptions: await openExceptions(client, principal.tenantId, subject.resourceId, query.periodStart),
        workedMinutes: week.workedMinutes,
        breakMinutes: week.breakMinutes,
        timesheet: stored.rows[0] ? mapTimesheet(stored.rows[0]) : null,
      };
    });
  }

  /** Submits the computed week; a rejected week is resubmitted in place with fresh lines. */
  async submit(context: CommandContext, rawInput: unknown): Promise<TimesheetDetailV1> {
    const input = parse(SubmitTimesheetV1Schema, rawInput);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const subject = await this.subject(client, context.principal, input.resourceId, 'workforce.time.manage');
      if (subject.own && !hasPermission(context.principal, 'workforce.time.punch') && !hasPermission(context.principal, 'workforce.time.manage')) {
        throw new ForbiddenException({ code: 'WORKFORCE_TIME_FORBIDDEN', message: 'You cannot submit this timesheet.' });
      }
      await lockWeek(client, tenantId, subject.resourceId, input.periodStart);
      const { punches, week } = await this.week(client, tenantId, subject.resourceId, input.periodStart);
      if (!subject.own) assertWeekInScope(context.principal, punches, input.periodStart);
      if (week.lines.length === 0 && week.issues.length === 0) {
        throw new ConflictException({ code: 'WORKFORCE_TIMESHEET_EMPTY', message: 'There is no recorded time in this week.' });
      }
      if (week.issues.length > 0) {
        throw new ConflictException({ code: 'WORKFORCE_TIMESHEET_INCOMPLETE', message: 'Fix the punches listed before submitting.', issues: week.issues });
      }
      const open = await openExceptions(client, tenantId, subject.resourceId, input.periodStart);
      if (open > 0) {
        throw new ConflictException({ code: 'WORKFORCE_TIMESHEET_EXCEPTIONS_OPEN', message: `${open} time exception(s) must be resolved before submitting.` });
      }
      const existing = await client.query<{ id: string; status: string; version: number }>(
        `SELECT id, status, version FROM gigalibs_workforce.timesheets
          WHERE tenant_id = $1 AND resource_id = $2 AND period_start = $3 FOR UPDATE`,
        [tenantId, subject.resourceId, input.periodStart],
      );
      let timesheetId: string;
      let version: number;
      const current = existing.rows[0];
      if (current && current.status !== 'REJECTED') {
        throw new ConflictException({
          code: 'WORKFORCE_TIMESHEET_STATE',
          message: current.status === 'APPROVED' ? 'This week is approved and cannot change.' : 'This week is already submitted.',
        });
      }
      if (current) {
        await client.query(`DELETE FROM gigalibs_workforce.timesheet_lines WHERE tenant_id = $1 AND timesheet_id = $2`, [tenantId, current.id]);
        const updated = await client.query<{ version: number }>(
          `UPDATE gigalibs_workforce.timesheets
              SET status = 'SUBMITTED', worked_minutes = $3, break_minutes = $4, submitted_by = $5, submitted_at = now(),
                  decided_by = NULL, decided_at = NULL, rejection_reason = NULL, version = version + 1, correlation_id = $6, updated_at = now()
            WHERE tenant_id = $1 AND id = $2 RETURNING version`,
          [tenantId, current.id, week.workedMinutes, week.breakMinutes, context.principal.subject, context.correlationId],
        );
        timesheetId = current.id;
        version = Number(updated.rows[0]!.version);
      } else {
        const created = await client.query<{ id: string }>(
          `INSERT INTO gigalibs_workforce.timesheets
             (tenant_id, resource_id, period_start, period_end, status, worked_minutes, break_minutes, submitted_by, submitted_at, correlation_id)
           VALUES ($1, $2, $3, $4, 'SUBMITTED', $5, $6, $7, now(), $8) RETURNING id`,
          [tenantId, subject.resourceId, input.periodStart, addDays(input.periodStart, 6), week.workedMinutes, week.breakMinutes,
            context.principal.subject, context.correlationId],
        );
        timesheetId = created.rows[0]!.id;
        version = 1;
      }
      for (const [index, line] of week.lines.entries()) {
        await client.query(
          `INSERT INTO gigalibs_workforce.timesheet_lines
             (tenant_id, timesheet_id, line_no, work_date, clock_in_punch_id, clock_out_punch_id, clock_in_at, clock_out_at,
              break_minutes, worked_minutes, site_ref, booking_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [tenantId, timesheetId, index + 1, line.workDate, line.clockInPunchId, line.clockOutPunchId, line.clockInAt, line.clockOutAt,
            line.breakMinutes, line.workedMinutes, line.siteRef, line.bookingId],
        );
      }
      await recordMutation(client, context, 'WORKFORCE_TIMESHEET_SUBMITTED', 'WORKFORCE_TIMESHEET', timesheetId, version, {
        resourceId: subject.resourceId,
        periodStart: input.periodStart,
        workedMinutes: week.workedMinutes,
        breakMinutes: week.breakMinutes,
        lines: week.lines.length,
      });
      return this.detailWithClient(client, tenantId, timesheetId);
    });
  }

  async approve(context: CommandContext, timesheetId: string, rawInput: unknown): Promise<TimesheetDetailV1> {
    const input = parse(ApproveTimesheetV1Schema, rawInput);
    return this.decide(context, timesheetId, input.expectedVersion, null);
  }

  async reject(context: CommandContext, timesheetId: string, rawInput: unknown): Promise<TimesheetDetailV1> {
    const input = parse(RejectTimesheetV1Schema, rawInput);
    return this.decide(context, timesheetId, input.expectedVersion, input.reason);
  }

  /** Four-eyes decision: never by the submitter or the worker; approval needs every exception resolved. */
  private async decide(context: CommandContext, timesheetId: string, expectedVersion: number, rejection: string | null): Promise<TimesheetDetailV1> {
    assertUuid(timesheetId, 'timesheetId');
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const locked = await client.query(`${TIMESHEET_SELECT} WHERE t.tenant_id = $1 AND t.id = $2 FOR UPDATE OF t`, [tenantId, timesheetId]);
      const row = locked.rows[0];
      if (!row) throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The timesheet was not found.' });
      await this.assertTimesheetScope(client, context.principal, row);
      if (Number(row.version) !== expectedVersion) conflict('timesheet');
      if (row.status !== 'SUBMITTED') {
        throw new ConflictException({ code: 'WORKFORCE_TIMESHEET_STATE', message: `A ${row.status} timesheet cannot be decided.` });
      }
      if (row.submitted_by === context.principal.subject || row.platform_user_id === context.principal.subject) {
        throw new ForbiddenException({ code: 'WORKFORCE_SELF_APPROVAL', message: 'Another manager must decide your own or your submitted timesheet.' });
      }
      if (rejection === null) {
        const open = await openExceptions(client, tenantId, row.resource_id, row.period_start);
        if (open > 0) {
          throw new ConflictException({ code: 'WORKFORCE_TIMESHEET_EXCEPTIONS_OPEN', message: `${open} time exception(s) must be resolved before approval.` });
        }
      }
      const updated = await client.query<{ version: number }>(
        `UPDATE gigalibs_workforce.timesheets
            SET status = $3, decided_by = $4, decided_at = now(), rejection_reason = $5, version = version + 1, correlation_id = $6, updated_at = now()
          WHERE tenant_id = $1 AND id = $2 RETURNING version`,
        [tenantId, timesheetId, rejection === null ? 'APPROVED' : 'REJECTED', context.principal.subject, rejection, context.correlationId],
      );
      await recordMutation(
        client,
        context,
        rejection === null ? 'WORKFORCE_TIMESHEET_APPROVED' : 'WORKFORCE_TIMESHEET_REJECTED',
        'WORKFORCE_TIMESHEET',
        timesheetId,
        Number(updated.rows[0]!.version),
        { resourceId: row.resource_id, periodStart: row.period_start, workedMinutes: Number(row.worked_minutes), ...(rejection ? { reason: rejection } : {}) },
      );
      return this.detailWithClient(client, tenantId, timesheetId);
    });
  }

  async listTimesheets(principal: GigaOpsPrincipal, rawQuery: unknown): Promise<{ readonly items: readonly TimesheetV1[] }> {
    const query = parse(ListTimesheetsV1QuerySchema, rawQuery);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['t.tenant_id = $1'];
      if (hasPermission(principal, 'workforce.time.read')) {
        if (principal.spatialScope.mode === 'SCOPED_PLACES') {
          values.push([...principal.spatialScope.place_ids]);
          where.push(`NOT EXISTS (SELECT 1 FROM gigalibs_workforce.timesheet_lines l
                                   WHERE l.tenant_id = t.tenant_id AND l.timesheet_id = t.id
                                     AND (l.site_ref IS NULL OR NOT l.site_ref = ANY($${values.length}::uuid[])))`);
        }
      } else {
        values.push(principal.subject);
        where.push(`r.platform_user_id = $${values.length}`);
      }
      if (query.status) {
        values.push(query.status);
        where.push(`t.status = $${values.length}`);
      }
      if (query.periodStart) {
        values.push(query.periodStart);
        where.push(`t.period_start = $${values.length}`);
      }
      if (query.resourceId) {
        values.push(query.resourceId);
        where.push(`t.resource_id = $${values.length}`);
      }
      const result = await client.query(`${TIMESHEET_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.period_start DESC, r.display_name LIMIT 500`, values);
      return { items: result.rows.map(mapTimesheet) };
    });
  }

  async timesheet(principal: GigaOpsPrincipal, timesheetId: string): Promise<TimesheetDetailV1> {
    assertUuid(timesheetId, 'timesheetId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const row = (await client.query(`${TIMESHEET_SELECT} WHERE t.tenant_id = $1 AND t.id = $2`, [principal.tenantId, timesheetId])).rows[0];
      if (!row) throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The timesheet was not found.' });
      if (row.platform_user_id !== principal.subject) {
        if (!hasPermission(principal, 'workforce.time.read')) throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The timesheet was not found.' });
        await this.assertTimesheetScope(client, principal, row);
      }
      return this.detailWithClient(client, principal.tenantId, timesheetId);
    });
  }

  // ─── Corrections and exceptions ────────────────────────────────────────────────────────────────────────
  async correct(context: CommandContext, rawInput: unknown): Promise<TimeCorrectionV1> {
    const input = parse(RecordTimeCorrectionV1Schema, rawInput);
    const tenantId = context.principal.tenantId;
    if (input.punch) {
      const age = Date.now() - Date.parse(input.punch.occurredAt);
      if (age < -60_000 || age > MAX_CORRECTION_AGE_MS) {
        throw new BadRequestException({ code: 'WORKFORCE_CORRECTION_TIME', message: 'A corrected punch must be in the last 92 days and not in the future.' });
      }
    }
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const resource = (await client.query<{ id: string; platform_user_id: string | null }>(
        `SELECT id, platform_user_id FROM gigalibs_workforce.workforce_resources WHERE tenant_id = $1 AND id = $2`,
        [tenantId, input.resourceId],
      )).rows[0];
      if (!resource) throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The person was not found.' });
      if (resource.platform_user_id === context.principal.subject) {
        throw new ForbiddenException({ code: 'WORKFORCE_SELF_CORRECTION', message: 'Another manager must correct your own time.' });
      }
      let voided: { id: string; work_date: string; site_ref: string | null } | null = null;
      if (input.punchId) {
        voided = (await client.query(
          `SELECT p.id, p.work_date, p.site_ref,
                  EXISTS (SELECT 1 FROM gigalibs_workforce.punch_voids v WHERE v.tenant_id = p.tenant_id AND v.punch_id = p.id) AS voided
             FROM gigalibs_workforce.punches p WHERE p.tenant_id = $1 AND p.id = $2 AND p.resource_id = $3`,
          [tenantId, input.punchId, input.resourceId],
        )).rows[0] ?? null;
        if (!voided) throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: "The punch was not found for this person." });
        if ((voided as unknown as { voided: boolean }).voided) {
          throw new ConflictException({ code: 'WORKFORCE_PUNCH_ALREADY_VOIDED', message: 'That punch is already voided.' });
        }
      }
      const newDate = input.punch ? localDate(input.punch.occurredAt, input.punch.timeZone) : null;
      for (const site of [voided?.site_ref, input.punch ? input.punch.siteRef ?? null : undefined]) {
        if (site !== undefined && !inScope(context.principal, site)) {
          throw new ForbiddenException({ code: 'WORKFORCE_OUT_OF_SCOPE', message: 'The punch must be at one of your places.' });
        }
      }
      const weeks = [...new Set([voided?.work_date, newDate].filter((date): date is string => Boolean(date)).map(weekStart))].sort();
      for (const week of weeks) {
        await lockWeek(client, tenantId, input.resourceId, week);
        const locked = await client.query(
          `SELECT status FROM gigalibs_workforce.timesheets
            WHERE tenant_id = $1 AND resource_id = $2 AND period_start = $3 AND status IN ('SUBMITTED', 'APPROVED')`,
          [tenantId, input.resourceId, week],
        );
        if (locked.rows[0]) {
          throw new ConflictException({
            code: 'WORKFORCE_PERIOD_LOCKED',
            message: `The week of ${week} is ${locked.rows[0].status.toLowerCase()}; reject it before correcting its time.`,
          });
        }
      }
      let newPunchId: string | null = null;
      if (input.punch) {
        newPunchId = (await client.query<{ id: string }>(
          `INSERT INTO gigalibs_workforce.punches
             (tenant_id, resource_id, kind, occurred_at, time_zone, work_date, source, site_ref, geofence_result, late, recorded_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, 'CORRECTION', $7, 'NO_LOCATION', false, $8, $9) RETURNING id`,
          [tenantId, input.resourceId, input.punch.kind, input.punch.occurredAt, input.punch.timeZone, newDate, input.punch.siteRef ?? null,
            context.principal.subject, context.correlationId],
        )).rows[0]!.id;
      }
      const correction = (await client.query(
        `INSERT INTO gigalibs_workforce.time_corrections
           (tenant_id, resource_id, action, voided_punch_id, new_punch_id, reason_code, note, created_by, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [tenantId, input.resourceId, input.action, voided?.id ?? null, newPunchId, input.reasonCode, input.note, context.principal.subject, context.correlationId],
      )).rows[0];
      if (voided) {
        await client.query(`INSERT INTO gigalibs_workforce.punch_voids (tenant_id, punch_id, correction_id) VALUES ($1, $2, $3)`, [
          tenantId, voided.id, correction.id,
        ]);
        const settled = await client.query<{ id: string; version: number }>(
          `UPDATE gigalibs_workforce.time_exceptions
              SET status = 'RESOLVED', resolution = 'CORRECTED', resolution_note = $3, resolved_by = $4, resolved_at = now(),
                  version = version + 1, correlation_id = $5
            WHERE tenant_id = $1 AND punch_id = $2 AND status = 'OPEN'
            RETURNING id, version`,
          [tenantId, voided.id, `Punch voided by correction: ${input.note}`.slice(0, 500), context.principal.subject, context.correlationId],
        );
        for (const exception of settled.rows) {
          await recordMutation(client, context, 'WORKFORCE_TIME_EXCEPTION_RESOLVED', 'WORKFORCE_TIME_EXCEPTION', exception.id, Number(exception.version), {
            resolution: 'CORRECTED',
            correctionId: correction.id,
          });
        }
      }
      await recordMutation(client, context, 'WORKFORCE_TIME_CORRECTED', 'WORKFORCE_TIME_CORRECTION', correction.id, 1, {
        resourceId: input.resourceId,
        action: input.action,
        voidedPunchId: voided?.id ?? null,
        newPunchId,
        reasonCode: input.reasonCode,
      });
      return mapCorrection(correction);
    });
  }

  async listExceptions(principal: GigaOpsPrincipal, rawQuery: unknown): Promise<{ readonly items: readonly TimeExceptionV1[] }> {
    const query = parse(SearchTimeExceptionsV1Schema, rawQuery);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['e.tenant_id = $1'];
      if (hasPermission(principal, 'workforce.time.read')) {
        if (principal.spatialScope.mode === 'SCOPED_PLACES') {
          values.push(principal.subject);
          const own = `r.platform_user_id = $${values.length}`;
          where.push(`(${own} OR ${sitePredicates(principal, values, 'e.').join(' AND ')})`);
        }
      } else {
        values.push(principal.subject);
        where.push(`r.platform_user_id = $${values.length}`);
      }
      for (const [column, value] of [['e.status', query.status], ['e.resource_id', query.resourceId]] as const) {
        if (value) {
          values.push(value);
          where.push(`${column} = $${values.length}`);
        }
      }
      if (query.from) {
        values.push(query.from);
        where.push(`e.work_date >= $${values.length}`);
      }
      if (query.to) {
        values.push(query.to);
        where.push(`e.work_date <= $${values.length}`);
      }
      const result = await client.query(`${EXCEPTION_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.work_date DESC, e.created_at DESC LIMIT 500`, values);
      return { items: result.rows.map(mapException) };
    });
  }

  async resolveException(context: CommandContext, exceptionId: string, rawInput: unknown): Promise<TimeExceptionV1> {
    assertUuid(exceptionId, 'exceptionId');
    const input = parse(ResolveTimeExceptionV1Schema, rawInput);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const row = (await client.query(`${EXCEPTION_SELECT} WHERE e.tenant_id = $1 AND e.id = $2 FOR UPDATE OF e`, [tenantId, exceptionId])).rows[0];
      if (!row || !inScope(context.principal, row.site_ref)) {
        throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The exception was not found.' });
      }
      if (Number(row.version) !== input.expectedVersion) conflict('exception');
      if (row.status !== 'OPEN') throw new ConflictException({ code: 'WORKFORCE_EXCEPTION_STATE', message: 'The exception is already resolved.' });
      if (row.platform_user_id === context.principal.subject) {
        throw new ForbiddenException({ code: 'WORKFORCE_SELF_RESOLUTION', message: 'Another manager must resolve exceptions on your own time.' });
      }
      const updated = await client.query(
        `UPDATE gigalibs_workforce.time_exceptions
            SET status = 'RESOLVED', resolution = $3, resolution_note = $4, resolved_by = $5, resolved_at = now(),
                version = version + 1, correlation_id = $6
          WHERE tenant_id = $1 AND id = $2 RETURNING version`,
        [tenantId, exceptionId, input.resolution, input.note, context.principal.subject, context.correlationId],
      );
      await recordMutation(client, context, 'WORKFORCE_TIME_EXCEPTION_RESOLVED', 'WORKFORCE_TIME_EXCEPTION', exceptionId, Number(updated.rows[0].version), {
        resolution: input.resolution,
        kind: row.kind,
        resourceId: row.resource_id,
      });
      return mapException((await client.query(`${EXCEPTION_SELECT} WHERE e.tenant_id = $1 AND e.id = $2`, [tenantId, exceptionId])).rows[0]);
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────────────────────────────────
  /** The signed-in user's own active person. */
  private async ownWorker(client: PoolClient, principal: GigaOpsPrincipal): Promise<{ id: string; display_name: string }> {
    const result = await client.query<{ id: string; display_name: string; status: string; resource_type: string }>(
      `SELECT id, display_name, status, resource_type FROM gigalibs_workforce.workforce_resources WHERE tenant_id = $1 AND platform_user_id = $2`,
      [principal.tenantId, principal.subject],
    );
    const worker = result.rows[0];
    if (!worker) {
      throw new ForbiddenException({ code: 'WORKFORCE_NOT_A_WORKER', message: 'Your user is not linked to a Workforce person; ask an administrator to link it.' });
    }
    if (worker.status !== 'ACTIVE' || worker.resource_type !== 'HUMAN') {
      throw new ForbiddenException({ code: 'WORKFORCE_WORKER_INACTIVE', message: 'Your Workforce person is not an active individual.' });
    }
    return worker;
  }

  /** Whose time a request concerns: one's own (no resource id, or one's own person) or another person's with the permission. */
  private async subject(client: PoolClient, principal: GigaOpsPrincipal, resourceId: string | undefined, permission: string): Promise<Subject> {
    if (!resourceId) {
      const worker = await this.ownWorker(client, principal);
      return { resourceId: worker.id, resourceName: worker.display_name, own: true };
    }
    const row = (await client.query<{ id: string; display_name: string; platform_user_id: string | null }>(
      `SELECT id, display_name, platform_user_id FROM gigalibs_workforce.workforce_resources WHERE tenant_id = $1 AND id = $2`,
      [principal.tenantId, resourceId],
    )).rows[0];
    const own = row?.platform_user_id === principal.subject;
    if (!row || (!own && !hasPermission(principal, permission))) {
      throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The person was not found.' });
    }
    return { resourceId: row.id, resourceName: row.display_name, own };
  }

  private async week(client: PoolClient, tenantId: string, resourceId: string, periodStart: string): Promise<{ punches: EffectivePunch[]; week: WeekComputation }> {
    const result = await client.query(
      `SELECT p.id, p.kind, p.occurred_at, p.work_date, p.site_ref, p.booking_id
         FROM gigalibs_workforce.punches p
        WHERE p.tenant_id = $1 AND p.resource_id = $2 AND p.work_date BETWEEN $3 AND $4
          AND NOT EXISTS (SELECT 1 FROM gigalibs_workforce.punch_voids v WHERE v.tenant_id = p.tenant_id AND v.punch_id = p.id)`,
      [tenantId, resourceId, addDays(periodStart, -1), addDays(periodStart, 7)],
    );
    const punches: EffectivePunch[] = result.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      occurredAt: iso(row.occurred_at),
      workDate: row.work_date,
      siteRef: row.site_ref ?? null,
      bookingId: row.booking_id ?? null,
    }));
    return { punches, week: computeWeek(punches, periodStart) };
  }

  private async assertTimesheetScope(client: PoolClient, principal: GigaOpsPrincipal, row: { id: string; platform_user_id: string | null }): Promise<void> {
    if (principal.spatialScope.mode !== 'SCOPED_PLACES' || row.platform_user_id === principal.subject) return;
    const lines = await client.query<{ site_ref: string | null }>(
      `SELECT site_ref FROM gigalibs_workforce.timesheet_lines WHERE tenant_id = $1 AND timesheet_id = $2`,
      [principal.tenantId, row.id],
    );
    if (lines.rows.some((line) => !inScope(principal, line.site_ref))) {
      throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The timesheet was not found.' });
    }
  }

  private async detailWithClient(client: PoolClient, tenantId: string, timesheetId: string): Promise<TimesheetDetailV1> {
    const row = (await client.query(`${TIMESHEET_SELECT} WHERE t.tenant_id = $1 AND t.id = $2`, [tenantId, timesheetId])).rows[0];
    const lines = await client.query(
      `SELECT * FROM gigalibs_workforce.timesheet_lines WHERE tenant_id = $1 AND timesheet_id = $2 ORDER BY line_no`,
      [tenantId, timesheetId],
    );
    return { ...mapTimesheet(row), lines: lines.rows.map(mapLine) };
  }
}

function geofenceOf(input: RecordPunchV1, siteRef: string | null): { result: GeofenceResultV1; distanceToEdgeMeters: number | null; reason: string | null } {
  if (!input.location) return { result: 'NO_LOCATION', distanceToEdgeMeters: null, reason: null };
  if (!siteRef) return { result: 'UNKNOWN', distanceToEdgeMeters: null, reason: 'NO_SITE' };
  const evidence = input.geofence;
  // Evidence counts only for this punch's site; anything else is unverified.
  if (!evidence || evidence.placeRef !== siteRef || evidence.result === 'NO_LOCATION') {
    return { result: 'NOT_CHECKED', distanceToEdgeMeters: null, reason: evidence?.reason ?? 'NO_EVIDENCE' };
  }
  return { result: evidence.result, distanceToEdgeMeters: evidence.distanceToEdgeMeters, reason: evidence.reason };
}

async function lockWeek(client: PoolClient, tenantId: string, resourceId: string, date: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 69))', [`${tenantId}:${resourceId}:${weekStart(date)}`]);
}

async function openExceptions(client: PoolClient, tenantId: string, resourceId: string, periodStart: string): Promise<number> {
  const result = await client.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM gigalibs_workforce.time_exceptions
      WHERE tenant_id = $1 AND resource_id = $2 AND status = 'OPEN' AND work_date BETWEEN $3 AND $4`,
    [tenantId, resourceId, periodStart, addDays(periodStart, 6)],
  );
  return result.rows[0]!.count;
}

function replay(row: any, workerId: string): PunchV1 & { readonly replayed: boolean } {
  if (row.resource_id !== workerId) {
    throw new ConflictException({ code: 'WORKFORCE_DEVICE_EVENT_REUSED', message: 'That device event id was already used for another person.' });
  }
  return { ...mapPunch(row), replayed: true };
}

function hasPermission(principal: GigaOpsPrincipal, permission: string): boolean {
  return hasWorkforcePermission(principal.permissions, permission);
}

function inScope(principal: GigaOpsPrincipal, siteRef: string | null): boolean {
  return principal.spatialScope.mode !== 'SCOPED_PLACES' || (siteRef !== null && principal.spatialScope.place_ids.includes(siteRef));
}

function sitePredicates(principal: GigaOpsPrincipal, values: unknown[], alias: string): string[] {
  if (principal.spatialScope.mode !== 'SCOPED_PLACES') return [];
  values.push([...principal.spatialScope.place_ids]);
  return [`${alias}site_ref = ANY($${values.length}::uuid[])`];
}

function assertWeekInScope(principal: GigaOpsPrincipal, punches: readonly EffectivePunch[], periodStart: string): void {
  const periodEnd = addDays(periodStart, 6);
  if (punches.some((punch) => punch.workDate >= periodStart && punch.workDate <= periodEnd && !inScope(principal, punch.siteRef))) {
    throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The person was not found.' });
  }
}

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function mapPunch(row: any): PunchV1 {
  return {
    id: row.id,
    resourceId: row.resource_id,
    resourceName: row.resource_name ?? null,
    kind: row.kind,
    occurredAt: iso(row.occurred_at),
    receivedAt: iso(row.received_at),
    workDate: row.work_date,
    timeZone: row.time_zone,
    source: row.source,
    siteRef: row.site_ref ?? null,
    bookingId: row.booking_id ?? null,
    geofence: row.geofence_result,
    distanceToEdgeMeters: numberOrNull(row.distance_to_edge_meters),
    late: row.late === true,
    voided: row.voided === true,
    exceptions: row.exception_kinds ?? [],
  };
}

function mapTimesheet(row: any): TimesheetV1 {
  return {
    id: row.id,
    resourceId: row.resource_id,
    resourceName: row.resource_name ?? null,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    workedMinutes: Number(row.worked_minutes),
    breakMinutes: Number(row.break_minutes),
    submittedBy: row.submitted_by,
    submittedAt: iso(row.submitted_at),
    decidedBy: row.decided_by ?? null,
    decidedAt: row.decided_at ? iso(row.decided_at) : null,
    rejectionReason: row.rejection_reason ?? null,
    version: Number(row.version),
  };
}

function mapLine(row: any): TimesheetLineV1 {
  return {
    workDate: row.work_date,
    clockInPunchId: row.clock_in_punch_id,
    clockOutPunchId: row.clock_out_punch_id,
    clockInAt: iso(row.clock_in_at),
    clockOutAt: iso(row.clock_out_at),
    breakMinutes: Number(row.break_minutes),
    workedMinutes: Number(row.worked_minutes),
    siteRef: row.site_ref ?? null,
    bookingId: row.booking_id ?? null,
  };
}

function mapException(row: any): TimeExceptionV1 {
  return {
    id: row.id,
    resourceId: row.resource_id,
    resourceName: row.resource_name ?? null,
    punchId: row.punch_id ?? null,
    workDate: row.work_date,
    kind: row.kind,
    details: row.details ?? {},
    status: row.status,
    resolution: row.resolution ?? null,
    resolutionNote: row.resolution_note ?? null,
    resolvedBy: row.resolved_by ?? null,
    resolvedAt: row.resolved_at ? iso(row.resolved_at) : null,
    siteRef: row.site_ref ?? null,
    version: Number(row.version),
    createdAt: iso(row.created_at),
  };
}

function mapCorrection(row: any): TimeCorrectionV1 {
  return {
    id: row.id,
    resourceId: row.resource_id,
    action: row.action,
    voidedPunchId: row.voided_punch_id ?? null,
    newPunchId: row.new_punch_id ?? null,
    reasonCode: row.reason_code,
    note: row.note,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  };
}
