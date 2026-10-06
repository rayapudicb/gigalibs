import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AddCalendarClosureV1Schema,
  AvailabilityQueryV1Schema,
  CreateAbsenceTypeV1Schema,
  CreateAvailabilityPatternV1Schema,
  CreateWorkingCalendarV1Schema,
  DecideAbsenceV1Schema,
  EndAvailabilityPatternV1Schema,
  ListAbsencesV1QuerySchema,
  RequestAbsenceV1Schema,
  UpdateAbsenceTypeV1Schema,
  WEEKDAYS,
  type AbsenceTypeV1,
  type AbsenceV1,
  type AvailabilityPatternV1,
  type AvailabilityV1,
  type WeeklySlotV1,
  type WorkingCalendarV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import {
  type CommandContext,
  assertUuid,
  bumpVersion,
  conflict,
  iso,
  parse,
  recordMutation,
  translate,
} from '../common/commands.js';
import { WorkforceDatabaseService } from '../database/database.service.js';

export interface Interval {
  readonly start: number;
  readonly end: number;
}

/**
 * Availability, absences and working calendars (WI-OI-066). Patterns and closures are local wall-clock rules
 * expanded by PostgreSQL in each pattern's IANA time zone (daylight-saving correct); availability is computed
 * on demand as scheduled time minus approved absences and calendar closures. Decisions are four-eyes.
 */
@Injectable()
export class AvailabilityService {
  constructor(private readonly database: WorkforceDatabaseService) {}

  // ─── Patterns ──────────────────────────────────────────────────────────────────────────────────────────
  async listPatterns(principal: GigaOpsPrincipal, resourceId: string): Promise<{ readonly items: readonly AvailabilityPatternV1[] }> {
    assertUuid(resourceId, 'resourceId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const result = await client.query(
        `SELECT * FROM gigalibs_workforce.availability_patterns WHERE tenant_id = $1 AND resource_id = $2 ORDER BY effective_from DESC`,
        [principal.tenantId, resourceId],
      );
      return { items: result.rows.map(mapPattern) };
    });
  }

  async createPattern(context: CommandContext, rawInput: unknown): Promise<AvailabilityPatternV1> {
    const input = parse(CreateAvailabilityPatternV1Schema, rawInput);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await assertPerson(client, tenantId, input.resourceId);
      let id: string;
      try {
        const created = await client.query<{ id: string }>(
          `INSERT INTO gigalibs_workforce.availability_patterns
             (tenant_id, resource_id, effective_from, effective_to, time_zone, weekly_slots, created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $7, $8) RETURNING id`,
          [tenantId, input.resourceId, input.effectiveFrom, input.effectiveTo ?? null, input.timeZone, JSON.stringify(input.weeklySlots), context.principal.subject, context.correlationId],
        );
        id = created.rows[0]!.id;
      } catch (error) {
        translate(error, 'This person already has a working pattern for part of that period; end it first.');
      }
      await recordMutation(client, context, 'WORKFORCE_AVAILABILITY_PATTERN_SET', 'WORKFORCE_AVAILABILITY_PATTERN', id, 1, {
        resourceId: input.resourceId,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        timeZone: input.timeZone,
        weeklyMinutes: weeklyMinutes(input.weeklySlots),
      });
      return this.pattern(client, tenantId, id);
    });
  }

  /** Ends an open or later-ending pattern on a date, so a new pattern can follow it. */
  async endPattern(context: CommandContext, patternId: string, rawInput: unknown): Promise<AvailabilityPatternV1> {
    assertUuid(patternId, 'patternId');
    const input = parse(EndAvailabilityPatternV1Schema, rawInput);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const current = await client.query(
        `SELECT * FROM gigalibs_workforce.availability_patterns WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, patternId],
      );
      const pattern = current.rows[0];
      if (!pattern) throw new NotFoundException('The working pattern was not found.');
      if (Number(pattern.version) !== input.expectedVersion) conflict('working pattern');
      if (input.effectiveTo <= String(pattern.effective_from) || (pattern.effective_to && input.effectiveTo > String(pattern.effective_to))) {
        throw new BadRequestException({ code: 'WORKFORCE_VALIDATION_FAILED', message: 'The end must fall after the start and not extend the pattern.' });
      }
      await client.query(`UPDATE gigalibs_workforce.availability_patterns SET effective_to = $3 WHERE tenant_id = $1 AND id = $2`, [tenantId, patternId, input.effectiveTo]);
      const version = await bumpVersion(client, context, 'availability_patterns', patternId);
      await recordMutation(client, context, 'WORKFORCE_AVAILABILITY_PATTERN_ENDED', 'WORKFORCE_AVAILABILITY_PATTERN', patternId, version, {
        resourceId: pattern.resource_id,
        effectiveTo: input.effectiveTo,
      });
      return this.pattern(client, tenantId, patternId);
    });
  }

  // ─── Absence types ─────────────────────────────────────────────────────────────────────────────────────
  async listAbsenceTypes(principal: GigaOpsPrincipal): Promise<{ readonly items: readonly AbsenceTypeV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const result = await client.query(`SELECT * FROM gigalibs_workforce.absence_types WHERE tenant_id = $1 ORDER BY status, name`, [principal.tenantId]);
      return { items: result.rows.map(mapAbsenceType) };
    });
  }

  async createAbsenceType(context: CommandContext, rawInput: unknown): Promise<AbsenceTypeV1> {
    const input = parse(CreateAbsenceTypeV1Schema, rawInput);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      let row;
      try {
        const created = await client.query(
          `INSERT INTO gigalibs_workforce.absence_types (tenant_id, code, name, paid, requires_approval, created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $6, $7) RETURNING *`,
          [tenantId, input.code, input.name, input.paid, input.requiresApproval, context.principal.subject, context.correlationId],
        );
        row = created.rows[0];
      } catch (error) {
        translate(error, `An absence type with code ${input.code} already exists.`);
      }
      await recordMutation(client, context, 'WORKFORCE_ABSENCE_TYPE_CREATED', 'WORKFORCE_ABSENCE_TYPE', row.id, 1, {
        code: input.code,
        paid: input.paid,
        requiresApproval: input.requiresApproval,
      });
      return mapAbsenceType(row);
    });
  }

  async updateAbsenceType(context: CommandContext, typeId: string, rawInput: unknown): Promise<AbsenceTypeV1> {
    assertUuid(typeId, 'absenceTypeId');
    const input = parse(UpdateAbsenceTypeV1Schema, rawInput);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const current = await client.query(`SELECT * FROM gigalibs_workforce.absence_types WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [tenantId, typeId]);
      const type = current.rows[0];
      if (!type) throw new NotFoundException('The absence type was not found.');
      if (Number(type.version) !== input.expectedVersion) conflict('absence type');
      await client.query(
        `UPDATE gigalibs_workforce.absence_types SET name = $3, paid = $4, requires_approval = $5, status = $6 WHERE tenant_id = $1 AND id = $2`,
        [tenantId, typeId, input.name ?? type.name, input.paid ?? type.paid, input.requiresApproval ?? type.requires_approval, input.status ?? type.status],
      );
      const version = await bumpVersion(client, context, 'absence_types', typeId);
      await recordMutation(client, context, 'WORKFORCE_ABSENCE_TYPE_UPDATED', 'WORKFORCE_ABSENCE_TYPE', typeId, version, {
        changed: Object.keys(input).filter((key) => key !== 'expectedVersion'),
      });
      const updated = await client.query(`SELECT * FROM gigalibs_workforce.absence_types WHERE tenant_id = $1 AND id = $2`, [tenantId, typeId]);
      return mapAbsenceType(updated.rows[0]);
    });
  }

  // ─── Absences ──────────────────────────────────────────────────────────────────────────────────────────
  async listAbsences(principal: GigaOpsPrincipal, rawQuery: unknown): Promise<{ readonly items: readonly AbsenceV1[] }> {
    const query = parse(ListAbsencesV1QuerySchema, rawQuery);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['a.tenant_id = $1'];
      if (query.resourceId) {
        values.push(query.resourceId);
        where.push(`a.resource_id = $${values.length}`);
      }
      if (query.status) {
        values.push(query.status);
        where.push(`a.status = $${values.length}`);
      }
      if (query.from) {
        values.push(query.from);
        where.push(`a.ends_at > $${values.length}`);
      }
      if (query.to) {
        values.push(query.to);
        where.push(`a.starts_at < $${values.length}`);
      }
      const result = await client.query(`${ABSENCE_SELECT} WHERE ${where.join(' AND ')} ORDER BY a.starts_at DESC LIMIT 500`, values);
      return { items: result.rows.map(mapAbsence) };
    });
  }

  /** Requests an absence; a type that needs no approval is approved at once, attributed to the requester. */
  async requestAbsence(context: CommandContext, rawInput: unknown): Promise<AbsenceV1> {
    const input = parse(RequestAbsenceV1Schema, rawInput);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await assertPerson(client, tenantId, input.resourceId);
      const type = await client.query(`SELECT * FROM gigalibs_workforce.absence_types WHERE tenant_id = $1 AND id = $2`, [tenantId, input.absenceTypeId]);
      if (!type.rows[0]) throw new NotFoundException('The absence type was not found.');
      if (type.rows[0].status !== 'ACTIVE') throw new ConflictException({ code: 'WORKFORCE_ABSENCE_TYPE_INACTIVE', message: 'The absence type is inactive.' });
      const autoApproved = type.rows[0].requires_approval === false;
      let id: string;
      try {
        const created = await client.query<{ id: string }>(
          `INSERT INTO gigalibs_workforce.absences
             (tenant_id, resource_id, absence_type_id, starts_at, ends_at, status, note, requested_by, decided_by, decided_at,
              decision_reason, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $12, $10, $11) RETURNING id`,
          [
            tenantId,
            input.resourceId,
            input.absenceTypeId,
            input.startsAt,
            input.endsAt,
            autoApproved ? 'APPROVED' : 'REQUESTED',
            input.note ?? null,
            context.principal.subject,
            autoApproved ? context.principal.subject : null,
            autoApproved ? 'No approval required for this type.' : null,
            context.correlationId,
            autoApproved ? new Date().toISOString() : null,
          ],
        );
        id = created.rows[0]!.id;
      } catch (error) {
        translate(error, 'This person already has an absence requested or approved for part of that time.');
      }
      await recordMutation(client, context, 'WORKFORCE_ABSENCE_REQUESTED', 'WORKFORCE_ABSENCE', id, 1, {
        resourceId: input.resourceId,
        absenceTypeId: input.absenceTypeId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: autoApproved ? 'APPROVED' : 'REQUESTED',
      });
      return this.absence(client, tenantId, id);
    });
  }

  /** Approves or rejects a request. The decider must be someone other than the requester (four-eyes). */
  async decideAbsence(context: CommandContext, absenceId: string, decision: 'APPROVED' | 'REJECTED', rawInput: unknown): Promise<AbsenceV1> {
    assertUuid(absenceId, 'absenceId');
    const input = parse(DecideAbsenceV1Schema, rawInput);
    if (decision === 'REJECTED' && !input.reason) {
      throw new BadRequestException({ code: 'WORKFORCE_VALIDATION_FAILED', message: 'A rejection needs a reason.' });
    }
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const absence = await lockAbsence(client, tenantId, absenceId, input.expectedVersion);
      if (absence.status !== 'REQUESTED') {
        throw new ConflictException({ code: 'WORKFORCE_ABSENCE_STATE', message: `The absence is already ${absence.status.toLowerCase()}.` });
      }
      if (absence.requested_by === context.principal.subject) {
        throw new ForbiddenException({ code: 'WORKFORCE_FOUR_EYES', message: 'Someone other than the requester must decide this absence.' });
      }
      // WI-OI-120n (security review): nor may anyone decide an absence of their own person, whoever requested it.
      const person = await client.query<{ platform_user_id: string | null }>(
        `SELECT platform_user_id FROM gigalibs_workforce.workforce_resources WHERE tenant_id = $1 AND id = $2`,
        [tenantId, absence.resource_id],
      );
      if (person.rows[0]?.platform_user_id === context.principal.subject) {
        throw new ForbiddenException({ code: 'WORKFORCE_FOUR_EYES', message: 'Another manager must decide an absence of your own.' });
      }
      await client.query(
        `UPDATE gigalibs_workforce.absences SET status = $3, decided_by = $4, decided_at = now(), decision_reason = $5 WHERE tenant_id = $1 AND id = $2`,
        [tenantId, absenceId, decision, context.principal.subject, input.reason ?? null],
      );
      const version = await bumpVersion(client, context, 'absences', absenceId);
      await recordMutation(client, context, `WORKFORCE_ABSENCE_${decision}`, 'WORKFORCE_ABSENCE', absenceId, version, {
        resourceId: absence.resource_id,
        startsAt: iso(absence.starts_at),
        endsAt: iso(absence.ends_at),
      });
      return this.absence(client, tenantId, absenceId);
    });
  }

  /** Withdraws a request, or an approved absence that has not started. */
  async cancelAbsence(context: CommandContext, absenceId: string, rawInput: unknown): Promise<AbsenceV1> {
    assertUuid(absenceId, 'absenceId');
    const input = parse(DecideAbsenceV1Schema, rawInput);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const absence = await lockAbsence(client, tenantId, absenceId, input.expectedVersion);
      const startedApproved = absence.status === 'APPROVED' && new Date(absence.starts_at).getTime() <= Date.now();
      if (!['REQUESTED', 'APPROVED'].includes(absence.status) || startedApproved) {
        throw new ConflictException({ code: 'WORKFORCE_ABSENCE_STATE', message: 'Only a request, or an approved absence that has not started, can be cancelled.' });
      }
      await client.query(
        `UPDATE gigalibs_workforce.absences SET status = 'CANCELLED', decision_reason = COALESCE($3, decision_reason) WHERE tenant_id = $1 AND id = $2`,
        [tenantId, absenceId, input.reason ?? null],
      );
      const version = await bumpVersion(client, context, 'absences', absenceId);
      await recordMutation(client, context, 'WORKFORCE_ABSENCE_CANCELLED', 'WORKFORCE_ABSENCE', absenceId, version, { resourceId: absence.resource_id });
      return this.absence(client, tenantId, absenceId);
    });
  }

  // ─── Calendars ─────────────────────────────────────────────────────────────────────────────────────────
  async listCalendars(principal: GigaOpsPrincipal): Promise<{ readonly items: readonly WorkingCalendarV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const calendars = await client.query(`SELECT * FROM gigalibs_workforce.working_calendars WHERE tenant_id = $1 ORDER BY site_ref NULLS FIRST, name`, [principal.tenantId]);
      const closures = await client.query(
        `SELECT * FROM gigalibs_workforce.calendar_closures WHERE tenant_id = $1 AND status = 'ACTIVE' ORDER BY closure_date`,
        [principal.tenantId],
      );
      return { items: calendars.rows.map((row) => mapCalendar(row, closures.rows.filter((closure) => closure.calendar_id === row.id))) };
    });
  }

  async createCalendar(context: CommandContext, rawInput: unknown): Promise<WorkingCalendarV1> {
    const input = parse(CreateWorkingCalendarV1Schema, rawInput);
    assertCalendarScope(context.principal, input.siteRef ?? null);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      let row;
      try {
        const created = await client.query(
          `INSERT INTO gigalibs_workforce.working_calendars (tenant_id, code, name, site_ref, created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $5, $6) RETURNING *`,
          [tenantId, input.code, input.name, input.siteRef ?? null, context.principal.subject, context.correlationId],
        );
        row = created.rows[0];
      } catch (error) {
        translate(error, input.siteRef ? 'That site already has a calendar, or the code is taken.' : 'The tenant already has a tenant-wide calendar, or the code is taken.');
      }
      await recordMutation(client, context, 'WORKFORCE_CALENDAR_CREATED', 'WORKFORCE_CALENDAR', row.id, 1, { code: input.code, siteRef: input.siteRef ?? null });
      return mapCalendar(row, []);
    });
  }

  async addClosure(context: CommandContext, calendarId: string, rawInput: unknown): Promise<WorkingCalendarV1> {
    assertUuid(calendarId, 'calendarId');
    const input = parse(AddCalendarClosureV1Schema, rawInput);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const calendar = await this.lockCalendar(client, context, calendarId);
      try {
        await client.query(
          `INSERT INTO gigalibs_workforce.calendar_closures (tenant_id, calendar_id, closure_date, label, created_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [tenantId, calendarId, input.closureDate, input.label, context.principal.subject, context.correlationId],
        );
      } catch (error) {
        translate(error, `The calendar already closes on ${input.closureDate}.`);
      }
      const version = await bumpVersion(client, context, 'working_calendars', calendarId);
      await recordMutation(client, context, 'WORKFORCE_CALENDAR_CLOSURE_ADDED', 'WORKFORCE_CALENDAR', calendarId, version, {
        closureDate: input.closureDate,
        siteRef: calendar.site_ref,
      });
      return this.calendar(client, tenantId, calendarId);
    });
  }

  /** Withdraws a closure (the record stays as history). */
  async withdrawClosure(context: CommandContext, calendarId: string, closureId: string): Promise<WorkingCalendarV1> {
    assertUuid(calendarId, 'calendarId');
    assertUuid(closureId, 'closureId');
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await this.lockCalendar(client, context, calendarId);
      const updated = await client.query<{ closure_date: string }>(
        `UPDATE gigalibs_workforce.calendar_closures SET status = 'WITHDRAWN'
          WHERE tenant_id = $1 AND calendar_id = $2 AND id = $3 AND status = 'ACTIVE' RETURNING closure_date`,
        [tenantId, calendarId, closureId],
      );
      if (updated.rowCount === 0) throw new NotFoundException('The closure was not found or is already withdrawn.');
      const version = await bumpVersion(client, context, 'working_calendars', calendarId);
      await recordMutation(client, context, 'WORKFORCE_CALENDAR_CLOSURE_WITHDRAWN', 'WORKFORCE_CALENDAR', calendarId, version, {
        closureDate: String(updated.rows[0]!.closure_date),
      });
      return this.calendar(client, tenantId, calendarId);
    });
  }

  // ─── Availability ──────────────────────────────────────────────────────────────────────────────────────
  /**
   * Scheduled working intervals in [from, to), minus approved absences and closures of the tenant calendar and of
   * the calendar for the site of the position the person holds that day. Requested absences are reported but do
   * not block until approved.
   */
  async availability(principal: GigaOpsPrincipal, rawQuery: unknown): Promise<AvailabilityV1> {
    const query = parse(AvailabilityQueryV1Schema, rawQuery);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertPerson(client, principal.tenantId, query.resourceId, false);
      return this.availabilityWithClient(client, principal.tenantId, query.resourceId, query.from, query.to);
    });
  }

  /** The availability computation inside the caller's transaction (bookings evaluate it while locked). */
  async availabilityWithClient(client: PoolClient, tenantId: string, resourceId: string, windowStart: string, windowEnd: string): Promise<AvailabilityV1> {
    const from = Date.parse(windowStart);
    const to = Date.parse(windowEnd);
    {
      const query = { resourceId };
      const values = [tenantId, resourceId, windowStart, windowEnd];
      const slots = await client.query<{ starts_at: Date; ends_at: Date }>(
        `WITH days AS (
           SELECT d::date AS day
             FROM generate_series((($3::timestamptz AT TIME ZONE 'UTC')::date - 2)::timestamp,
                                  (($4::timestamptz AT TIME ZONE 'UTC')::date + 2)::timestamp, interval '1 day') d
         )
         SELECT (days.day + s.start::time) AT TIME ZONE p.time_zone AS starts_at,
                ((CASE WHEN s."end"::time <= s.start::time AND s."end" <> '24:00' THEN days.day + 1 ELSE days.day END)
                   + s."end"::time) AT TIME ZONE p.time_zone AS ends_at
           FROM gigalibs_workforce.availability_patterns p
           CROSS JOIN LATERAL jsonb_to_recordset(p.weekly_slots) AS s(day text, start text, "end" text)
           JOIN days ON extract(isodow FROM days.day)::int = array_position($5::text[], s.day)
          WHERE p.tenant_id = $1 AND p.resource_id = $2
            AND days.day >= p.effective_from AND (p.effective_to IS NULL OR days.day < p.effective_to)`,
        [...values, [...WEEKDAYS]],
      );
      const closures = await client.query<{ starts_at: Date; ends_at: Date; label: string }>(
        `SELECT DISTINCT c.label,
                (c.closure_date::timestamp) AT TIME ZONE p.time_zone AS starts_at,
                ((c.closure_date + 1)::timestamp) AT TIME ZONE p.time_zone AS ends_at
           FROM gigalibs_workforce.calendar_closures c
           JOIN gigalibs_workforce.working_calendars wc ON wc.tenant_id = c.tenant_id AND wc.id = c.calendar_id
           JOIN gigalibs_workforce.availability_patterns p
             ON p.tenant_id = c.tenant_id AND p.resource_id = $2
            AND c.closure_date >= p.effective_from AND (p.effective_to IS NULL OR c.closure_date < p.effective_to)
          WHERE c.tenant_id = $1 AND c.status = 'ACTIVE'
            AND c.closure_date BETWEEN ($3::timestamptz AT TIME ZONE 'UTC')::date - 2 AND ($4::timestamptz AT TIME ZONE 'UTC')::date + 2
            AND (wc.site_ref IS NULL OR EXISTS (
                  SELECT 1 FROM gigalibs_workforce.engagements e
                    JOIN gigalibs_workforce.positions pos ON pos.tenant_id = e.tenant_id AND pos.id = e.position_id
                   WHERE e.tenant_id = c.tenant_id AND e.resource_id = $2 AND e.status <> 'CANCELLED'
                     AND e.start_date <= c.closure_date AND (e.end_date IS NULL OR e.end_date > c.closure_date)
                     AND pos.site_ref = wc.site_ref))`,
        values,
      );
      const absences = await client.query<{ starts_at: Date; ends_at: Date; status: string; type_name: string }>(
        `SELECT a.starts_at, a.ends_at, a.status, t.name AS type_name
           FROM gigalibs_workforce.absences a
           JOIN gigalibs_workforce.absence_types t ON t.tenant_id = a.tenant_id AND t.id = a.absence_type_id
          WHERE a.tenant_id = $1 AND a.resource_id = $2 AND a.status IN ('REQUESTED', 'APPROVED')
            AND a.starts_at < $4 AND a.ends_at > $3`,
        values,
      );
      const blockers = [
        ...closures.rows.map((row) => ({ start: row.starts_at.getTime(), end: row.ends_at.getTime(), reason: 'CLOSURE' as const, label: row.label })),
        ...absences.rows
          .filter((row) => row.status === 'APPROVED')
          .map((row) => ({ start: row.starts_at.getTime(), end: row.ends_at.getTime(), reason: 'ABSENCE' as const, label: row.type_name })),
      ];
      const computed = computeAvailability(
        slots.rows.map((row) => ({ start: row.starts_at.getTime(), end: row.ends_at.getTime() })),
        blockers,
        { start: from, end: to },
      );
      return {
        resourceId: query.resourceId,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        available: computed.available.map(toIso),
        blocked: computed.blocked.map((item) => ({ ...toIso(item), reason: item.reason, label: item.label })),
        pendingAbsences: absences.rows
          .filter((row) => row.status === 'REQUESTED')
          .map((row) => toIso({ start: Math.max(row.starts_at.getTime(), from), end: Math.min(row.ends_at.getTime(), to) })),
        scheduledMinutes: computed.scheduledMinutes,
        availableMinutes: computed.availableMinutes,
      };
    }
  }

  // ─── Reads and locks ───────────────────────────────────────────────────────────────────────────────────
  private async pattern(client: PoolClient, tenantId: string, id: string): Promise<AvailabilityPatternV1> {
    const result = await client.query(`SELECT * FROM gigalibs_workforce.availability_patterns WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
    return mapPattern(result.rows[0]);
  }

  private async absence(client: PoolClient, tenantId: string, id: string): Promise<AbsenceV1> {
    const result = await client.query(`${ABSENCE_SELECT} WHERE a.tenant_id = $1 AND a.id = $2`, [tenantId, id]);
    return mapAbsence(result.rows[0]);
  }

  private async calendar(client: PoolClient, tenantId: string, id: string): Promise<WorkingCalendarV1> {
    const calendar = await client.query(`SELECT * FROM gigalibs_workforce.working_calendars WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
    const closures = await client.query(
      `SELECT * FROM gigalibs_workforce.calendar_closures WHERE tenant_id = $1 AND calendar_id = $2 AND status = 'ACTIVE' ORDER BY closure_date`,
      [tenantId, id],
    );
    return mapCalendar(calendar.rows[0], closures.rows);
  }

  private async lockCalendar(client: PoolClient, context: CommandContext, calendarId: string): Promise<any> {
    const result = await client.query(
      `SELECT * FROM gigalibs_workforce.working_calendars WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [context.principal.tenantId, calendarId],
    );
    if (!result.rows[0]) throw new NotFoundException('The calendar was not found.');
    assertCalendarScope(context.principal, result.rows[0].site_ref ?? null);
    return result.rows[0];
  }
}

// ─── Pure interval arithmetic (unit-tested) ──────────────────────────────────────────────────────────────

/** Sorts and merges overlapping or touching intervals. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals.filter((item) => item.end > item.start).sort((left, right) => left.start - right.start);
  const merged: Interval[] = [];
  for (const item of sorted) {
    const last = merged.at(-1);
    if (last && item.start <= last.end) merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, item.end) };
    else merged.push({ ...item });
  }
  return merged;
}

/**
 * Scheduled time clipped to the window, then each blocker removes what is still available; a blocked piece is
 * attributed to the first blocker that removes it, so overlapping blockers are never counted twice.
 */
export function computeAvailability<Reason extends string>(
  slots: readonly Interval[],
  blockers: readonly (Interval & { readonly reason: Reason; readonly label: string })[],
  window: Interval,
): {
  available: Interval[];
  blocked: (Interval & { reason: Reason; label: string })[];
  scheduledMinutes: number;
  availableMinutes: number;
} {
  const scheduled = mergeIntervals(
    slots.map((slot) => ({ start: Math.max(slot.start, window.start), end: Math.min(slot.end, window.end) })),
  );
  let available = scheduled;
  const blocked: (Interval & { reason: Reason; label: string })[] = [];
  for (const blocker of [...blockers].sort((left, right) => left.start - right.start)) {
    const next: Interval[] = [];
    for (const piece of available) {
      const overlapStart = Math.max(piece.start, blocker.start);
      const overlapEnd = Math.min(piece.end, blocker.end);
      if (overlapStart >= overlapEnd) {
        next.push(piece);
        continue;
      }
      blocked.push({ start: overlapStart, end: overlapEnd, reason: blocker.reason, label: blocker.label });
      if (piece.start < overlapStart) next.push({ start: piece.start, end: overlapStart });
      if (overlapEnd < piece.end) next.push({ start: overlapEnd, end: piece.end });
    }
    available = next;
  }
  const minutesOf = (items: readonly Interval[]) => Math.round(items.reduce((sum, item) => sum + (item.end - item.start), 0) / 60_000);
  return {
    available,
    blocked: blocked.sort((left, right) => left.start - right.start),
    scheduledMinutes: minutesOf(scheduled),
    availableMinutes: minutesOf(available),
  };
}

export function weeklyMinutes(slots: readonly WeeklySlotV1[]): number {
  const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return slots.reduce((sum, slot) => {
    const start = toMinutes(slot.start);
    const end = toMinutes(slot.end);
    return sum + (end > start ? end - start : 1440 - start + end);
  }, 0);
}

const toIso = (item: Interval) => ({ start: new Date(item.start).toISOString(), end: new Date(item.end).toISOString() });

const ABSENCE_SELECT = `
  SELECT a.*, r.display_name AS resource_name, t.name AS type_name, t.paid
    FROM gigalibs_workforce.absences a
    JOIN gigalibs_workforce.workforce_resources r ON r.tenant_id = a.tenant_id AND r.id = a.resource_id
    JOIN gigalibs_workforce.absence_types t ON t.tenant_id = a.tenant_id AND t.id = a.absence_type_id`;

async function assertPerson(client: PoolClient, tenantId: string, resourceId: string, requireActive = true): Promise<void> {
  const result = await client.query<{ resource_type: string; status: string }>(
    `SELECT resource_type, status FROM gigalibs_workforce.workforce_resources WHERE tenant_id = $1 AND id = $2`,
    [tenantId, resourceId],
  );
  const resource = result.rows[0];
  if (!resource) throw new NotFoundException('The person was not found.');
  if (resource.resource_type !== 'HUMAN') {
    throw new BadRequestException({ code: 'WORKFORCE_NOT_A_PERSON', message: 'Availability and absence apply to people, not teams or pools.' });
  }
  if (requireActive && resource.status !== 'ACTIVE') throw new ConflictException({ code: 'WORKFORCE_RESOURCE_INACTIVE', message: 'The person is inactive.' });
}

async function lockAbsence(client: PoolClient, tenantId: string, absenceId: string, expectedVersion: number): Promise<any> {
  const result = await client.query(`SELECT * FROM gigalibs_workforce.absences WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [tenantId, absenceId]);
  const absence = result.rows[0];
  if (!absence) throw new NotFoundException('The absence was not found.');
  if (Number(absence.version) !== expectedVersion) conflict('absence');
  return absence;
}

/** Site calendars follow place scope; only an unscoped manager maintains the tenant-wide calendar. */
function assertCalendarScope(principal: GigaOpsPrincipal, siteRef: string | null): void {
  if (principal.spatialScope.mode !== 'SCOPED_PLACES') return;
  if (siteRef === null || !principal.spatialScope.place_ids.includes(siteRef)) {
    throw new ForbiddenException({ code: 'WORKFORCE_OUT_OF_SCOPE', message: 'You can only maintain calendars for your places.' });
  }
}

function mapPattern(row: any): AvailabilityPatternV1 {
  const slots = (row.weekly_slots ?? []) as WeeklySlotV1[];
  return {
    id: row.id,
    resourceId: row.resource_id,
    effectiveFrom: String(row.effective_from),
    effectiveTo: row.effective_to === null ? null : String(row.effective_to),
    timeZone: row.time_zone,
    weeklySlots: slots,
    weeklyMinutes: weeklyMinutes(slots),
    version: Number(row.version),
    createdAt: iso(row.created_at),
  };
}

function mapAbsenceType(row: any): AbsenceTypeV1 {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    paid: row.paid === true,
    requiresApproval: row.requires_approval === true,
    status: row.status,
    version: Number(row.version),
  };
}

function mapAbsence(row: any): AbsenceV1 {
  return {
    id: row.id,
    resourceId: row.resource_id,
    resourceName: row.resource_name ?? null,
    absenceTypeId: row.absence_type_id,
    absenceTypeName: row.type_name ?? null,
    paid: row.paid === true,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    status: row.status,
    note: row.note ?? null,
    requestedBy: row.requested_by,
    decidedBy: row.decided_by ?? null,
    decidedAt: row.decided_at ? iso(row.decided_at) : null,
    decisionReason: row.decision_reason ?? null,
    version: Number(row.version),
    createdAt: iso(row.created_at),
  };
}

function mapCalendar(row: any, closures: readonly any[]): WorkingCalendarV1 {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    siteRef: row.site_ref ?? null,
    closures: closures.map((closure) => ({ id: closure.id, closureDate: String(closure.closure_date), label: closure.label, status: closure.status })),
    version: Number(row.version),
  };
}

