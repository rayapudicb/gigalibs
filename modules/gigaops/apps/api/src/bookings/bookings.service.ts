import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  BOOKING_TRANSITIONS,
  CancelWorkRequirementV1Schema,
  ChangeBookingStatusV1Schema,
  CreateBookingV1Schema,
  CreateWorkRequirementV1Schema,
  ListBookingsV1QuerySchema,
  ListWorkRequirementsV1QuerySchema,
  PROFICIENCY_RANK,
  type BookingCandidateV1,
  type BookingStatusV1,
  type BookingV1,
  type CreateWorkRequirementV1,
  type RequiredCapabilityV1,
  type WorkRequirementDetailV1,
  type WorkRequirementV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import { AvailabilityService } from '../availability/availability.service.js';
import { type CommandContext, assertUuid, bumpVersion, conflict, iso, parse, recordMutation, translate } from '../common/commands.js';
import { WorkforceDatabaseService } from '../database/database.service.js';

const MAX_CANDIDATES = 200;

/**
 * Demand requirements and bookings (WI-OI-067). A booking passes four guards inside one transaction: the
 * requirement is locked and not yet fully staffed; the person holds every required capability at the minimum
 * proficiency for the whole window; the person is available (or an authorised override is recorded); and the
 * database refuses any overlapping live booking for the same person.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly database: WorkforceDatabaseService,
    private readonly availability: AvailabilityService,
  ) {}

  // ─── Requirements ──────────────────────────────────────────────────────────────────────────────────────
  async listRequirements(principal: GigaOpsPrincipal, rawQuery: unknown): Promise<{ readonly items: readonly WorkRequirementV1[] }> {
    const query = parse(ListWorkRequirementsV1QuerySchema, rawQuery);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['r.tenant_id = $1', ...placePredicates(principal, values, 'r.')];
      if (query.status) {
        values.push(query.status);
        where.push(`r.status = $${values.length}`);
      }
      if (query.siteRef) {
        values.push(query.siteRef);
        where.push(`r.site_ref = $${values.length}`);
      }
      if (query.from) {
        values.push(query.from);
        where.push(`r.ends_at > $${values.length}`);
      }
      if (query.to) {
        values.push(query.to);
        where.push(`r.starts_at < $${values.length}`);
      }
      const result = await client.query(`${REQUIREMENT_SELECT} WHERE ${where.join(' AND ')} ORDER BY r.starts_at ASC, r.id LIMIT 500`, values);
      return { items: result.rows.map(mapRequirement) };
    });
  }

  async getRequirement(principal: GigaOpsPrincipal, requirementId: string): Promise<WorkRequirementDetailV1> {
    assertUuid(requirementId, 'requirementId');
    return this.database.withTenantTransaction(principal.tenantId, (client) => this.requirementDetail(client, principal, requirementId));
  }

  /** A repeated request key returns the requirement it created; one live requirement per external source record. */
  async createRequirement(context: CommandContext, rawInput: unknown): Promise<WorkRequirementDetailV1 & { readonly replayed: boolean }> {
    const input = parse(CreateWorkRequirementV1Schema, rawInput);
    assertPlaceScope(context.principal, input.siteRef ?? null);
    return this.database.withTenantTransaction(context.principal.tenantId, (client) => this.createRequirementWithClient(client, context, input));
  }

  /** Creates (or replays) a requirement inside the caller's transaction; the CMMS inbox uses this directly. */
  async createRequirementWithClient(
    client: PoolClient,
    context: CommandContext,
    input: CreateWorkRequirementV1,
  ): Promise<WorkRequirementDetailV1 & { readonly replayed: boolean }> {
    const tenantId = context.principal.tenantId;
    const siteRef = input.siteRef ?? null;
    const existing = await client.query<{ id: string }>(`SELECT id FROM gigalibs_workforce.work_requirements WHERE tenant_id = $1 AND request_key = $2`, [tenantId, input.requestKey]);
    if (existing.rows[0]) return { ...(await this.requirementDetail(client, context.principal, existing.rows[0].id)), replayed: true };
    await assertCapabilitiesExist(client, tenantId, input.requiredCapabilities);
    let id: string;
    try {
      await client.query('SAVEPOINT create_requirement');
      const created = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_workforce.work_requirements
           (tenant_id, request_key, title, source_type, source_ref, site_ref, starts_at, ends_at, headcount, required_capabilities,
            created_by, updated_by, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $11, $12) RETURNING id`,
        [
          tenantId,
          input.requestKey,
          input.title,
          input.sourceType,
          input.sourceRef ?? null,
          siteRef,
          input.startsAt,
          input.endsAt,
          input.headcount,
          JSON.stringify(input.requiredCapabilities),
          context.principal.subject,
          context.correlationId,
        ],
      );
      await client.query('RELEASE SAVEPOINT create_requirement');
      id = created.rows[0]!.id;
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT create_requirement').catch(() => undefined);
      translate(error, 'This source already has a live requirement, or the request is being processed; retry to receive it.');
    }
    await recordMutation(client, context, 'WORKFORCE_WORK_REQUIREMENT_REQUESTED', 'WORKFORCE_WORK_REQUIREMENT', id, 1, {
      requestKey: input.requestKey,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef ?? null,
      siteRef,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      headcount: input.headcount,
      requiredCapabilities: input.requiredCapabilities,
    });
    return { ...(await this.requirementDetail(client, context.principal, id)), replayed: false };
  }

  /** Cancels a requirement and its bookings that have not started work; refused while someone is on site. */
  async cancelRequirement(context: CommandContext, requirementId: string, rawInput: unknown): Promise<WorkRequirementDetailV1> {
    assertUuid(requirementId, 'requirementId');
    const input = parse(CancelWorkRequirementV1Schema, rawInput);
    return this.database.withTenantTransaction(context.principal.tenantId, (client) =>
      this.cancelRequirementWithClient(client, context, requirementId, input.expectedVersion, input.reason),
    );
  }

  /** Cancellation inside the caller's transaction; `expectedVersion` null means "whatever is current" (inbox). */
  async cancelRequirementWithClient(
    client: PoolClient,
    context: CommandContext,
    requirementId: string,
    expectedVersion: number | null,
    reason: string,
  ): Promise<WorkRequirementDetailV1> {
    const tenantId = context.principal.tenantId;
    const requirement = await this.lockRequirement(client, context.principal, requirementId);
    if (expectedVersion !== null && Number(requirement.version) !== expectedVersion) conflict('requirement');
    if (requirement.status === 'CANCELLED') throw new ConflictException({ code: 'WORKFORCE_REQUIREMENT_STATE', message: 'The requirement is already cancelled.' });
    const onSite = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM gigalibs_workforce.bookings WHERE tenant_id = $1 AND requirement_id = $2 AND status = 'ON_SITE'`,
      [tenantId, requirementId],
    );
    if (onSite.rows[0]!.count > 0) {
      throw new ConflictException({ code: 'WORKFORCE_REQUIREMENT_IN_PROGRESS', message: 'Someone is on site; complete their booking first.' });
    }
    const open = await client.query<{ id: string; status: BookingStatusV1 }>(
      `SELECT id, status FROM gigalibs_workforce.bookings
        WHERE tenant_id = $1 AND requirement_id = $2 AND status IN ('DRAFT', 'CONFIRMED', 'DISPATCHED') FOR UPDATE`,
      [tenantId, requirementId],
    );
    for (const booking of open.rows) {
      await this.moveBooking(client, context, booking.id, booking.status, 'CANCELLED', `Requirement cancelled: ${reason}`.slice(0, 500));
    }
    await client.query(`UPDATE gigalibs_workforce.work_requirements SET status = 'CANCELLED' WHERE tenant_id = $1 AND id = $2`, [tenantId, requirementId]);
    const version = await bumpVersion(client, context, 'work_requirements', requirementId);
    await recordMutation(client, context, 'WORKFORCE_WORK_REQUIREMENT_CANCELLED', 'WORKFORCE_WORK_REQUIREMENT', requirementId, version, {
      reason,
      cancelledBookings: open.rows.length,
      requestKey: requirement.request_key,
      sourceType: requirement.source_type,
      sourceRef: requirement.source_ref ?? null,
    });
    return this.requirementDetail(client, context.principal, requirementId);
  }

  /** Active people ranked by fit: qualified and fully available first, then by available minutes. */
  async candidates(principal: GigaOpsPrincipal, requirementId: string): Promise<{ readonly items: readonly BookingCandidateV1[] }> {
    assertUuid(requirementId, 'requirementId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const requirement = await this.visibleRequirement(client, principal, requirementId);
      const startsAt = iso(requirement.starts_at);
      const endsAt = iso(requirement.ends_at);
      const windowMinutes = Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000);
      const people = await client.query<{ id: string; display_name: string }>(
        `SELECT id, display_name FROM gigalibs_workforce.workforce_resources
          WHERE tenant_id = $1 AND resource_type = 'HUMAN' AND status = 'ACTIVE' ORDER BY display_name LIMIT ${MAX_CANDIDATES}`,
        [principal.tenantId],
      );
      const required = (requirement.required_capabilities ?? []) as RequiredCapabilityV1[];
      const items: BookingCandidateV1[] = [];
      for (const person of people.rows) {
        const missing = await missingCapabilities(client, principal.tenantId, person.id, required, startsAt, endsAt);
        const window = await this.availability.availabilityWithClient(client, principal.tenantId, person.id, startsAt, endsAt);
        const overlap = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM gigalibs_workforce.bookings
            WHERE tenant_id = $1 AND resource_id = $2 AND status <> 'CANCELLED' AND starts_at < $4 AND ends_at > $3`,
          [principal.tenantId, person.id, startsAt, endsAt],
        );
        items.push({
          resourceId: person.id,
          resourceName: person.display_name,
          qualified: missing.length === 0,
          missingCapabilities: missing,
          available: window.availableMinutes >= windowMinutes,
          conflictingBooking: overlap.rows[0]!.count > 0,
          availableMinutes: window.availableMinutes,
        });
      }
      items.sort(
        (left, right) =>
          Number(right.qualified && right.available && !right.conflictingBooking) - Number(left.qualified && left.available && !left.conflictingBooking) ||
          Number(right.qualified) - Number(left.qualified) ||
          right.availableMinutes - left.availableMinutes,
      );
      return { items };
    });
  }

  // ─── Bookings ──────────────────────────────────────────────────────────────────────────────────────────
  async listBookings(principal: GigaOpsPrincipal, rawQuery: unknown): Promise<{ readonly items: readonly BookingV1[] }> {
    const query = parse(ListBookingsV1QuerySchema, rawQuery);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['b.tenant_id = $1', ...placePredicates(principal, values, 'r.')];
      for (const [column, value] of [['resource_id', query.resourceId], ['requirement_id', query.requirementId]] as const) {
        if (value) {
          values.push(value);
          where.push(`b.${column} = $${values.length}`);
        }
      }
      if (query.from) {
        values.push(query.from);
        where.push(`b.ends_at > $${values.length}`);
      }
      if (query.to) {
        values.push(query.to);
        where.push(`b.starts_at < $${values.length}`);
      }
      const result = await client.query(`${BOOKING_SELECT} WHERE ${where.join(' AND ')} ORDER BY b.starts_at ASC, b.id LIMIT 1000`, values);
      return { items: result.rows.map(mapBooking) };
    });
  }

  async createBooking(context: CommandContext, rawInput: unknown): Promise<BookingV1 & { readonly replayed: boolean }> {
    const input = parse(CreateBookingV1Schema, rawInput);
    const tenantId = context.principal.tenantId;
    if (input.overrideReason && !hasPermission(context.principal, 'workforce.bookings.override')) {
      throw new ForbiddenException({ code: 'WORKFORCE_OVERRIDE_NOT_ALLOWED', message: 'Booking despite unavailability needs the override permission.' });
    }
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const replay = await client.query(`${BOOKING_SELECT} WHERE b.tenant_id = $1 AND b.request_key = $2`, [tenantId, input.requestKey]);
      if (replay.rows[0]) {
        if (replay.rows[0].requirement_id !== input.requirementId || replay.rows[0].resource_id !== input.resourceId) {
          throw new ConflictException({ code: 'WORKFORCE_REQUEST_KEY_REUSED', message: 'This request key was used for a different booking.' });
        }
        return { ...mapBooking(replay.rows[0]), replayed: true };
      }

      // Guard 1: the requirement is locked, live, and not yet fully staffed.
      const requirement = await this.lockRequirement(client, context.principal, input.requirementId);
      assertPlaceScope(context.principal, requirement.site_ref ?? null);
      if (requirement.status !== 'OPEN') {
        throw new ConflictException({
          code: requirement.status === 'FILLED' ? 'WORKFORCE_REQUIREMENT_FILLED' : 'WORKFORCE_REQUIREMENT_STATE',
          message: requirement.status === 'FILLED' ? 'The requirement is fully staffed.' : 'The requirement is cancelled.',
        });
      }
      const startsAt = input.startsAt ?? iso(requirement.starts_at);
      const endsAt = input.endsAt ?? iso(requirement.ends_at);
      if (Date.parse(startsAt) < new Date(requirement.starts_at).getTime() || Date.parse(endsAt) > new Date(requirement.ends_at).getTime()) {
        throw new BadRequestException({ code: 'WORKFORCE_BOOKING_OUTSIDE_REQUIREMENT', message: 'A booking must fall within its requirement window.' });
      }
      const booked = await liveBookingCount(client, tenantId, input.requirementId);
      if (booked >= Number(requirement.headcount)) {
        throw new ConflictException({ code: 'WORKFORCE_REQUIREMENT_FILLED', message: 'The requirement is fully staffed.' });
      }

      // Guard 2: a person, qualified for the whole window.
      const resource = await client.query<{ resource_type: string; status: string; display_name: string }>(
        `SELECT resource_type, status, display_name FROM gigalibs_workforce.workforce_resources WHERE tenant_id = $1 AND id = $2`,
        [tenantId, input.resourceId],
      );
      if (!resource.rows[0]) throw new NotFoundException('The person was not found.');
      if (resource.rows[0].resource_type !== 'HUMAN' || resource.rows[0].status !== 'ACTIVE') {
        throw new BadRequestException({ code: 'WORKFORCE_NOT_A_PERSON', message: 'Only an active person can be booked.' });
      }
      const missing = await missingCapabilities(client, tenantId, input.resourceId, (requirement.required_capabilities ?? []) as RequiredCapabilityV1[], startsAt, endsAt);
      if (missing.length > 0) {
        throw new UnprocessableEntityException({
          code: 'WORKFORCE_NOT_QUALIFIED',
          message: `Missing or insufficient for the whole window: ${missing.join(', ')}.`,
          missingCapabilities: missing,
        });
      }

      // Guard 3: available for the whole window, unless an authorised override is recorded.
      const window = await this.availability.availabilityWithClient(client, tenantId, input.resourceId, startsAt, endsAt);
      const windowMinutes = Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000);
      if (window.availableMinutes < windowMinutes && !input.overrideReason) {
        throw new ConflictException({
          code: 'WORKFORCE_NOT_AVAILABLE',
          message: `Available for ${window.availableMinutes} of ${windowMinutes} minutes.`,
          blocked: window.blocked,
        });
      }

      // Guard 4: the database refuses an overlapping live booking for the same person.
      let row;
      try {
        const created = await client.query(
          `INSERT INTO gigalibs_workforce.bookings
             (tenant_id, request_key, requirement_id, resource_id, starts_at, ends_at, override_reason, created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9) RETURNING id`,
          [tenantId, input.requestKey, input.requirementId, input.resourceId, startsAt, endsAt, window.availableMinutes < windowMinutes ? input.overrideReason : null, context.principal.subject, context.correlationId],
        );
        row = created.rows[0];
      } catch (error) {
        translate(error, 'This person already has a booking in that time.');
      }
      await client.query(
        `INSERT INTO gigalibs_workforce.booking_events (tenant_id, booking_id, from_status, to_status, actor_subject, reason, correlation_id)
         VALUES ($1, $2, NULL, 'DRAFT', $3, $4, $5)`,
        [tenantId, row.id, context.principal.subject, input.overrideReason ?? null, context.correlationId],
      );
      if (booked + 1 >= Number(requirement.headcount)) {
        await client.query(`UPDATE gigalibs_workforce.work_requirements SET status = 'FILLED' WHERE tenant_id = $1 AND id = $2`, [tenantId, input.requirementId]);
        const version = await bumpVersion(client, context, 'work_requirements', input.requirementId);
        await recordMutation(client, context, 'WORKFORCE_WORK_REQUIREMENT_FILLED', 'WORKFORCE_WORK_REQUIREMENT', input.requirementId, version, { headcount: Number(requirement.headcount) });
      }
      await recordMutation(client, context, 'WORKFORCE_RESOURCE_BOOKING_CREATED', 'WORKFORCE_BOOKING', row.id, 1, {
        requirementId: input.requirementId,
        sourceType: requirement.source_type,
        sourceRef: requirement.source_ref ?? null,
        resourceId: input.resourceId,
        resourceName: resource.rows[0].display_name,
        siteRef: requirement.site_ref ?? null,
        startsAt,
        endsAt,
        override: window.availableMinutes < windowMinutes,
      });
      const result = await client.query(`${BOOKING_SELECT} WHERE b.tenant_id = $1 AND b.id = $2`, [tenantId, row.id]);
      return { ...mapBooking(result.rows[0]), replayed: false };
    });
  }

  async changeBookingStatus(context: CommandContext, bookingId: string, rawInput: unknown): Promise<BookingV1> {
    assertUuid(bookingId, 'bookingId');
    const input = parse(ChangeBookingStatusV1Schema, rawInput);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const values: unknown[] = [tenantId, bookingId];
      const where = ['b.tenant_id = $1', 'b.id = $2', ...placePredicates(context.principal, values, 'r.')];
      const locked = await client.query(
        `SELECT b.*, r.site_ref FROM gigalibs_workforce.bookings b
           JOIN gigalibs_workforce.work_requirements r ON r.tenant_id = b.tenant_id AND r.id = b.requirement_id
          WHERE ${where.join(' AND ')} FOR UPDATE OF b`,
        values,
      );
      const booking = locked.rows[0];
      if (!booking) throw new NotFoundException('The booking was not found.');
      if (Number(booking.version) !== input.expectedVersion) conflict('booking');
      if (!BOOKING_TRANSITIONS[booking.status as BookingStatusV1].includes(input.status)) {
        throw new ConflictException({ code: 'WORKFORCE_INVALID_TRANSITION', message: `A ${booking.status} booking cannot move to ${input.status}.` });
      }
      await this.moveBooking(client, context, bookingId, booking.status, input.status, input.reason ?? null);
      if (input.status === 'CANCELLED') await this.reopenIfUnderstaffed(client, context, booking.requirement_id);
      const result = await client.query(`${BOOKING_SELECT} WHERE b.tenant_id = $1 AND b.id = $2`, [tenantId, bookingId]);
      return mapBooking(result.rows[0]);
    });
  }

  // ─── Internals ─────────────────────────────────────────────────────────────────────────────────────────
  private async moveBooking(client: PoolClient, context: CommandContext, bookingId: string, from: BookingStatusV1, to: BookingStatusV1, reason: string | null): Promise<void> {
    await client.query(
      `UPDATE gigalibs_workforce.bookings SET status = $3, cancel_reason = COALESCE($4, cancel_reason) WHERE tenant_id = $1 AND id = $2`,
      [context.principal.tenantId, bookingId, to, to === 'CANCELLED' ? reason : null],
    );
    await client.query(
      `INSERT INTO gigalibs_workforce.booking_events (tenant_id, booking_id, from_status, to_status, actor_subject, reason, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [context.principal.tenantId, bookingId, from, to, context.principal.subject, reason, context.correlationId],
    );
    const version = await bumpVersion(client, context, 'bookings', bookingId);
    const snapshot = await client.query(
      `SELECT b.requirement_id, b.resource_id, b.starts_at, b.ends_at, r.source_type, r.source_ref, res.display_name
         FROM gigalibs_workforce.bookings b
         JOIN gigalibs_workforce.work_requirements r ON r.tenant_id = b.tenant_id AND r.id = b.requirement_id
         JOIN gigalibs_workforce.workforce_resources res ON res.tenant_id = b.tenant_id AND res.id = b.resource_id
        WHERE b.tenant_id = $1 AND b.id = $2`,
      [context.principal.tenantId, bookingId],
    );
    const row = snapshot.rows[0];
    await recordMutation(client, context, 'WORKFORCE_RESOURCE_BOOKING_STATUS_CHANGED', 'WORKFORCE_BOOKING', bookingId, version, {
      from,
      to,
      reason,
      requirementId: row.requirement_id,
      sourceType: row.source_type,
      sourceRef: row.source_ref ?? null,
      resourceId: row.resource_id,
      resourceName: row.display_name,
      startsAt: iso(row.starts_at),
      endsAt: iso(row.ends_at),
    });
  }

  private async reopenIfUnderstaffed(client: PoolClient, context: CommandContext, requirementId: string): Promise<void> {
    const requirement = await client.query(`SELECT status, headcount FROM gigalibs_workforce.work_requirements WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [context.principal.tenantId, requirementId]);
    const row = requirement.rows[0];
    if (row?.status !== 'FILLED') return;
    if ((await liveBookingCount(client, context.principal.tenantId, requirementId)) < Number(row.headcount)) {
      await client.query(`UPDATE gigalibs_workforce.work_requirements SET status = 'OPEN' WHERE tenant_id = $1 AND id = $2`, [context.principal.tenantId, requirementId]);
      const version = await bumpVersion(client, context, 'work_requirements', requirementId);
      await recordMutation(client, context, 'WORKFORCE_WORK_REQUIREMENT_REOPENED', 'WORKFORCE_WORK_REQUIREMENT', requirementId, version, {});
    }
  }

  private async lockRequirement(client: PoolClient, principal: GigaOpsPrincipal, requirementId: string): Promise<any> {
    assertUuid(requirementId, 'requirementId');
    const values: unknown[] = [principal.tenantId, requirementId];
    const where = ['r.tenant_id = $1', 'r.id = $2', ...placePredicates(principal, values, 'r.')];
    const result = await client.query(`SELECT r.* FROM gigalibs_workforce.work_requirements r WHERE ${where.join(' AND ')} FOR UPDATE`, values);
    if (!result.rows[0]) throw new NotFoundException('The requirement was not found.');
    return result.rows[0];
  }

  private async visibleRequirement(client: PoolClient, principal: GigaOpsPrincipal, requirementId: string): Promise<any> {
    const values: unknown[] = [principal.tenantId, requirementId];
    const where = ['r.tenant_id = $1', 'r.id = $2', ...placePredicates(principal, values, 'r.')];
    const result = await client.query(`SELECT r.* FROM gigalibs_workforce.work_requirements r WHERE ${where.join(' AND ')}`, values);
    if (!result.rows[0]) throw new NotFoundException('The requirement was not found.');
    return result.rows[0];
  }

  private async requirementDetail(client: PoolClient, principal: GigaOpsPrincipal, requirementId: string): Promise<WorkRequirementDetailV1> {
    const values: unknown[] = [principal.tenantId, requirementId];
    const where = ['r.tenant_id = $1', 'r.id = $2', ...placePredicates(principal, values, 'r.')];
    const requirement = await client.query(`${REQUIREMENT_SELECT} WHERE ${where.join(' AND ')}`, values);
    if (!requirement.rows[0]) throw new NotFoundException('The requirement was not found.');
    const bookings = await client.query(`${BOOKING_SELECT} WHERE b.tenant_id = $1 AND b.requirement_id = $2 ORDER BY b.starts_at, b.id`, [principal.tenantId, requirementId]);
    return { ...mapRequirement(requirement.rows[0]), bookings: bookings.rows.map(mapBooking) };
  }
}

const REQUIREMENT_SELECT = `
  SELECT r.*, (SELECT COUNT(*)::int FROM gigalibs_workforce.bookings b
                WHERE b.tenant_id = r.tenant_id AND b.requirement_id = r.id AND b.status <> 'CANCELLED') AS booked_count
    FROM gigalibs_workforce.work_requirements r`;

const BOOKING_SELECT = `
  SELECT b.*, r.title AS requirement_title, r.site_ref, res.display_name AS resource_name
    FROM gigalibs_workforce.bookings b
    JOIN gigalibs_workforce.work_requirements r ON r.tenant_id = b.tenant_id AND r.id = b.requirement_id
    JOIN gigalibs_workforce.workforce_resources res ON res.tenant_id = b.tenant_id AND res.id = b.resource_id`;

async function liveBookingCount(client: PoolClient, tenantId: string, requirementId: string): Promise<number> {
  const result = await client.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM gigalibs_workforce.bookings WHERE tenant_id = $1 AND requirement_id = $2 AND status <> 'CANCELLED'`,
    [tenantId, requirementId],
  );
  return result.rows[0]!.count;
}

/** Codes of required capabilities the person lacks at the minimum proficiency for the whole window. */
async function missingCapabilities(
  client: PoolClient,
  tenantId: string,
  resourceId: string,
  required: readonly RequiredCapabilityV1[],
  startsAt: string,
  endsAt: string,
): Promise<string[]> {
  if (required.length === 0) return [];
  const held = await client.query<{ capability_definition_id: string; proficiency: string; code: string }>(
    `SELECT rc.capability_definition_id, rc.proficiency, c.code
       FROM gigalibs_workforce.resource_capabilities rc
       JOIN gigalibs_workforce.capability_definitions c ON c.tenant_id = rc.tenant_id AND c.id = rc.capability_definition_id
      WHERE rc.tenant_id = $1 AND rc.resource_id = $2 AND rc.status = 'ACTIVE' AND c.status = 'ACTIVE'
        AND rc.valid_from <= $3 AND (rc.expires_at IS NULL OR rc.expires_at >= $4)`,
    [tenantId, resourceId, startsAt, endsAt],
  );
  const codes = await client.query<{ id: string; code: string }>(
    `SELECT id, code FROM gigalibs_workforce.capability_definitions WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
    [tenantId, required.map((item) => item.capabilityDefinitionId)],
  );
  const codeOf = new Map(codes.rows.map((row) => [row.id, row.code]));
  return qualificationGaps(required, held.rows.map((row) => ({ capabilityDefinitionId: row.capability_definition_id, proficiency: row.proficiency })))
    .map((id) => codeOf.get(id) ?? id);
}

/** Pure rule (unit-tested): required capability ids not held at the minimum proficiency. */
export function qualificationGaps(
  required: readonly RequiredCapabilityV1[],
  held: readonly { readonly capabilityDefinitionId: string; readonly proficiency: string }[],
): string[] {
  return required
    .filter((need) => {
      const rank = PROFICIENCY_RANK[need.minimumProficiency] ?? 1;
      return !held.some((have) => have.capabilityDefinitionId === need.capabilityDefinitionId && (PROFICIENCY_RANK[have.proficiency] ?? 0) >= rank);
    })
    .map((need) => need.capabilityDefinitionId);
}

async function assertCapabilitiesExist(client: PoolClient, tenantId: string, required: readonly RequiredCapabilityV1[]): Promise<void> {
  if (required.length === 0) return;
  const found = await client.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM gigalibs_workforce.capability_definitions WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status = 'ACTIVE'`,
    [tenantId, required.map((item) => item.capabilityDefinitionId)],
  );
  if (found.rows[0]!.count !== required.length) {
    throw new BadRequestException({ code: 'WORKFORCE_CAPABILITY_UNKNOWN', message: 'Every required capability must be an active capability of this tenant.' });
  }
}

function placePredicates(principal: GigaOpsPrincipal, values: unknown[], alias: string): string[] {
  if (principal.spatialScope.mode !== 'SCOPED_PLACES') return [];
  values.push([...principal.spatialScope.place_ids]);
  return [`${alias}site_ref = ANY($${values.length}::uuid[])`];
}

function assertPlaceScope(principal: GigaOpsPrincipal, siteRef: string | null): void {
  if (principal.spatialScope.mode === 'SCOPED_PLACES' && (siteRef === null || !principal.spatialScope.place_ids.includes(siteRef))) {
    throw new ForbiddenException({ code: 'WORKFORCE_OUT_OF_SCOPE', message: 'The work must be at one of your places.' });
  }
}

function hasPermission(principal: GigaOpsPrincipal, permission: string): boolean {
  return principal.permissions.includes('*') || principal.permissions.includes('workforce:*') || principal.permissions.includes(permission);
}

function mapRequirement(row: any): WorkRequirementV1 {
  return {
    id: row.id,
    title: row.title,
    sourceType: row.source_type,
    sourceRef: row.source_ref ?? null,
    siteRef: row.site_ref ?? null,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    headcount: Number(row.headcount),
    bookedCount: Number(row.booked_count ?? 0),
    requiredCapabilities: row.required_capabilities ?? [],
    status: row.status,
    version: Number(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapBooking(row: any): BookingV1 {
  return {
    id: row.id,
    requirementId: row.requirement_id,
    requirementTitle: row.requirement_title ?? null,
    resourceId: row.resource_id,
    resourceName: row.resource_name ?? null,
    siteRef: row.site_ref ?? null,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    status: row.status,
    overrideReason: row.override_reason ?? null,
    cancelReason: row.cancel_reason ?? null,
    version: Number(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
