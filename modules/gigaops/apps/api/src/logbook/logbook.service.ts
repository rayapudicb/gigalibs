import { createHash } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AcceptHandoverV1Schema,
  BYPASS_ALERT_HOURS,
  ClearBypassV1Schema,
  CountersignHandoverV1Schema,
  CreateLogEntryV1Schema,
  CreateLogbookV1Schema,
  DecideBypassV1Schema,
  LOGBOOK_OUTGOING_STATEMENT,
  RefreezeHandoverV1Schema,
  RequestBypassV1Schema,
  SubmitHandoverV1Schema,
  UpdateLogbookV1Schema,
  type BypassV1,
  type CreateLogEntryResultV1,
  type HandoverPackageV1,
  type HandoverV1,
  type LogEntryV1,
  type LogbookBoardV1,
  type LogbookShiftV1,
  type LogbookV1,
  type SubmitHandoverResultV1,
} from '@gigalibs/contracts';
import {
  OrganizationReplica,
  OrganizationScopeRefusal,
  assertOrganizationWrite,
  organizationAccess,
  organizationReadCondition,
} from '@gigalibs/module-sdk';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import { type CommandContext, assertUuid, iso, parse, recordMutation, translate } from '../common/commands.js';
import { instantOf, localOf } from '../common/local-time.js';
import { WorkforceDatabaseService } from '../database/database.service.js';

// WI-OI-137 M-LOG. Workforce owns handovers (ADR-0035); the logbook's entries and bypasses are shift-bound and kept
// beside them. Entries never change; a bypass is decided by someone other than its requester; a handover is accepted by
// someone other than the outgoing operator, against exactly the active bypasses its frozen package lists.

const replica = new OrganizationReplica('gigalibs_workforce');
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const MAX_LATE_ENTRY_MS = 72 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;

type Window = { name: string; start: string; end: string };

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value as Record<string, unknown>).filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function refuse(code: string, message: string): never {
  throw new ConflictException({ code, message });
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** The shift an instant belongs to: the window that started most recently at or before it, in the logbook's zone. */
export function shiftAt(windows: readonly Window[], zone: string, instant: string): LogbookShiftV1 {
  const localDate = localOf(instant, zone).slice(0, 10);
  const epoch = Date.parse(instant);
  let best: LogbookShiftV1 | null = null;
  for (const date of [addDays(localDate, -1), localDate]) {
    for (const window of windows) {
      const startsAt = instantOf(`${date}T${window.start}`, zone);
      if (Date.parse(startsAt) > epoch) continue;
      const endsAt = instantOf(`${window.end > window.start ? date : addDays(date, 1)}T${window.end}`, zone);
      if (!best || Date.parse(startsAt) > Date.parse(best.startsAt)) best = { shiftDate: date, shiftName: window.name, startsAt, endsAt };
    }
  }
  if (!best) throw new Error('A logbook has at least one shift window.');
  return best;
}

function mapLogbook(row: Record<string, any>): LogbookV1 {
  return {
    id: row.id, code: row.code, name: row.name, departmentId: row.department_id, siteRef: row.site_ref, timeZone: row.time_zone,
    shiftWindows: row.shift_windows, active: row.active, version: row.version, updatedAt: iso(row.updated_at),
  };
}

function mapEntry(row: Record<string, any>): LogEntryV1 {
  return {
    id: row.id, logbookId: row.logbook_id, shiftDate: typeof row.shift_date === 'string' ? row.shift_date : iso(row.shift_date).slice(0, 10),
    shiftName: row.shift_name, category: row.category, text: row.text, priority: row.priority, assetRef: row.asset_ref,
    occurredAt: iso(row.occurred_at), recordedAt: iso(row.recorded_at), author: row.author, correctsEntryId: row.corrects_entry_id,
    correctedByEntryId: row.corrected_by_entry_id ?? null,
  };
}

function mapBypass(row: Record<string, any>, now = Date.now()): BypassV1 {
  const activeHours = row.status === 'AUTHORIZED' ? Math.round(((now - Date.parse(iso(row.authorized_at))) / HOUR_MS) * 10) / 10 : null;
  return {
    id: row.id, logbookId: row.logbook_id, description: row.description, assetRef: row.asset_ref, reason: row.reason,
    mitigation: row.mitigation, status: row.status, requestedBy: row.requested_by, requestedAt: iso(row.requested_at),
    plannedRemovalAt: iso(row.planned_removal_at), authorizedBy: row.authorized_by,
    authorizedAt: row.authorized_at ? iso(row.authorized_at) : null, clearedBy: row.cleared_by,
    clearedAt: row.cleared_at ? iso(row.cleared_at) : null, decisionNote: row.decision_note, activeHours,
    overdue: activeHours !== null && (activeHours > BYPASS_ALERT_HOURS || now > Date.parse(iso(row.planned_removal_at))),
    version: row.version,
  };
}

function mapHandover(row: Record<string, any>): HandoverV1 {
  return {
    id: row.id, logbookId: row.logbook_id, shiftDate: typeof row.shift_date === 'string' ? row.shift_date : iso(row.shift_date).slice(0, 10),
    shiftName: row.shift_name, status: row.status, outgoingBy: row.outgoing_by, submittedAt: iso(row.submitted_at),
    outgoingStatement: row.outgoing_statement, notes: row.notes, package: row.package, incomingBy: row.incoming_by,
    acceptedAt: row.accepted_at ? iso(row.accepted_at) : null, incomingStatement: row.incoming_statement,
    acknowledgedBypassIds: row.acknowledged_bypass_ids ?? [], supervisorBy: row.supervisor_by,
    countersignedAt: row.countersigned_at ? iso(row.countersigned_at) : null, supervisorStatement: row.supervisor_statement,
    version: row.version,
  };
}

const ENTRY_SELECT = `SELECT e.*, (SELECT c.id FROM gigalibs_workforce.logbook_entries c
  WHERE c.tenant_id = e.tenant_id AND c.corrects_entry_id = e.id ORDER BY c.recorded_at DESC LIMIT 1) AS corrected_by_entry_id
  FROM gigalibs_workforce.logbook_entries e`;

@Injectable()
export class LogbookService {
  constructor(private readonly database: WorkforceDatabaseService) {}

  // ─── Logbooks ─────────────────────────────────────────────────────────────────────────────────────────

  async listLogbooks(principal: GigaOpsPrincipal): Promise<{ readonly items: readonly LogbookV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const scope = await this.scope(client, principal, values, 'l.');
      const rows = await client.query(
        `SELECT l.* FROM gigalibs_workforce.logbooks l WHERE l.tenant_id = $1 ${scope} ORDER BY l.code LIMIT 500`, values);
      return { items: rows.rows.map(mapLogbook) };
    });
  }

  async createLogbook(context: CommandContext, raw: unknown): Promise<LogbookV1> {
    const input = parse(CreateLogbookV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      await this.assertWritable(client, context.principal, input.departmentId ?? null, input.siteRef ?? null);
      try {
        const row = (await client.query(
          `INSERT INTO gigalibs_workforce.logbooks (tenant_id, code, name, department_id, site_ref, time_zone, shift_windows,
             created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8, $9) RETURNING *`,
          [context.principal.tenantId, input.code, input.name, input.departmentId ?? null, input.siteRef ?? null, input.timeZone,
            JSON.stringify(input.shiftWindows), context.principal.subject, context.correlationId])).rows[0];
        await recordMutation(client, context, 'WORKFORCE_LOGBOOK_CREATED', 'logbook', row.id, 1, { code: input.code });
        return mapLogbook(row);
      } catch (error) {
        translate(error, 'A logbook with this code already exists.');
      }
    });
  }

  async updateLogbook(context: CommandContext, logbookId: string, raw: unknown): Promise<LogbookV1> {
    assertUuid(logbookId, 'logbookId');
    const input = parse(UpdateLogbookV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.logbookRow(client, context.principal, logbookId, true);
      await this.assertWritable(client, context.principal, current.departmentId, current.siteRef);
      if (current.version !== input.expectedVersion)
        throw new ConflictException({ code: 'WORKFORCE_VERSION_CONFLICT', message: 'The logbook was changed by another request. Reload and try again.' });
      const row = (await client.query(
        `UPDATE gigalibs_workforce.logbooks SET name = $3, shift_windows = $4::jsonb, active = $5, version = version + 1,
                updated_by = $6, correlation_id = $7, updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [context.principal.tenantId, logbookId, input.name ?? current.name, JSON.stringify(input.shiftWindows ?? current.shiftWindows),
          input.active ?? current.active, context.principal.subject, context.correlationId])).rows[0];
      await recordMutation(client, context, 'WORKFORCE_LOGBOOK_UPDATED', 'logbook', logbookId, row.version, { active: row.active });
      return mapLogbook(row);
    });
  }

  /** The live board: current shift, recent entries (this and the previous shift), bypasses and handovers. */
  async board(principal: GigaOpsPrincipal, logbookId: string, now = new Date()): Promise<LogbookBoardV1> {
    assertUuid(logbookId, 'logbookId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const logbook = await this.logbookRow(client, principal, logbookId, false);
      const currentShift = shiftAt(logbook.shiftWindows, logbook.timeZone, now.toISOString());
      const previousShift = shiftAt(logbook.shiftWindows, logbook.timeZone, new Date(Date.parse(currentShift.startsAt) - 1000).toISOString());
      const entries = await client.query(
        `${ENTRY_SELECT} WHERE e.tenant_id = $1 AND e.logbook_id = $2 AND e.occurred_at >= $3
          ORDER BY e.occurred_at DESC, e.recorded_at DESC LIMIT 200`, [principal.tenantId, logbookId, previousShift.startsAt]);
      const bypasses = await client.query(
        `SELECT * FROM gigalibs_workforce.logbook_bypasses WHERE tenant_id = $1 AND logbook_id = $2
            AND status IN ('REQUESTED', 'AUTHORIZED') ORDER BY requested_at`, [principal.tenantId, logbookId]);
      const handovers = await client.query(
        `SELECT * FROM gigalibs_workforce.logbook_handovers WHERE tenant_id = $1 AND logbook_id = $2
          ORDER BY shift_date DESC, submitted_at DESC LIMIT 5`, [principal.tenantId, logbookId]);
      const mapped = handovers.rows.map(mapHandover);
      return {
        logbook, currentShift,
        entries: entries.rows.map(mapEntry),
        activeBypasses: bypasses.rows.filter((row) => row.status === 'AUTHORIZED').map((row) => mapBypass(row, now.getTime())),
        pendingBypasses: bypasses.rows.filter((row) => row.status === 'REQUESTED').map((row) => mapBypass(row, now.getTime())),
        openHandover: mapped.find((handover) => handover.status === 'SUBMITTED') ?? null,
        lastHandover: mapped.find((handover) => handover.status !== 'SUBMITTED') ?? null,
      };
    });
  }

  // ─── Entries ──────────────────────────────────────────────────────────────────────────────────────────

  async addEntry(context: CommandContext, logbookId: string, raw: unknown, now = new Date()): Promise<CreateLogEntryResultV1> {
    assertUuid(logbookId, 'logbookId');
    const input = parse(CreateLogEntryV1Schema, raw);
    const requestSha256 = sha256(canonicalJson({ logbookId, ...input }));
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const replay = (await client.query(
        `${ENTRY_SELECT} WHERE e.tenant_id = $1 AND e.client_operation_id = $2`, [context.principal.tenantId, input.clientOperationId])).rows[0];
      if (replay) {
        if (replay.request_sha256 !== requestSha256 || replay.author !== context.principal.subject)
          refuse('WORKFORCE_OPERATION_REUSED', 'This capture id was already used for a different entry.');
        return { replayed: true, entry: mapEntry(replay) };
      }
      const logbook = await this.logbookRow(client, context.principal, logbookId, false);
      if (!logbook.active) refuse('WORKFORCE_LOGBOOK_INACTIVE', 'This logbook is closed.');
      const occurred = Date.parse(input.occurredAt);
      if (occurred > now.getTime() + MAX_FUTURE_SKEW_MS) refuse('WORKFORCE_LOGBOOK_CLOCK', 'The entry is in the future; check the device clock.');
      if (occurred < now.getTime() - MAX_LATE_ENTRY_MS) refuse('WORKFORCE_LOGBOOK_TOO_LATE', 'An entry is logged within 72 hours of the event.');
      if (input.correctsEntryId) {
        const corrected = await client.query('SELECT 1 FROM gigalibs_workforce.logbook_entries WHERE tenant_id = $1 AND id = $2 AND logbook_id = $3',
          [context.principal.tenantId, input.correctsEntryId, logbookId]);
        if (!corrected.rows[0]) throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The corrected entry was not found in this logbook.' });
      }
      const shift = shiftAt(logbook.shiftWindows, logbook.timeZone, input.occurredAt);
      const id = (await client.query<{ id: string }>(
        `INSERT INTO gigalibs_workforce.logbook_entries (tenant_id, logbook_id, client_operation_id, request_sha256, shift_date,
           shift_name, category, text, priority, asset_ref, occurred_at, author, corrects_entry_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [context.principal.tenantId, logbookId, input.clientOperationId, requestSha256, shift.shiftDate, shift.shiftName,
          input.category, input.text, input.priority, input.assetRef ?? null, input.occurredAt, context.principal.subject,
          input.correctsEntryId ?? null])).rows[0]!.id;
      await recordMutation(client, context, 'WORKFORCE_LOGBOOK_ENTRY_RECORDED', 'logbook_entry', id, 1,
        { logbookId, category: input.category, priority: input.priority, correction: Boolean(input.correctsEntryId) });
      const row = (await client.query(`${ENTRY_SELECT} WHERE e.tenant_id = $1 AND e.id = $2`, [context.principal.tenantId, id])).rows[0];
      return { replayed: false, entry: mapEntry(row) };
    });
  }

  async listEntries(principal: GigaOpsPrincipal, logbookId: string, query: { shiftDate?: string; category?: string }): Promise<{ readonly items: readonly LogEntryV1[] }> {
    assertUuid(logbookId, 'logbookId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.logbookRow(client, principal, logbookId, false);
      const values: unknown[] = [principal.tenantId, logbookId];
      const where = ['e.tenant_id = $1', 'e.logbook_id = $2'];
      if (query.shiftDate && /^\d{4}-\d{2}-\d{2}$/.test(query.shiftDate)) {
        values.push(query.shiftDate);
        where.push(`e.shift_date = $${values.length}::date`);
      }
      if (query.category) {
        values.push(query.category);
        where.push(`e.category = $${values.length}`);
      }
      const rows = await client.query(`${ENTRY_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.occurred_at DESC LIMIT 500`, values);
      return { items: rows.rows.map(mapEntry) };
    });
  }

  // ─── Bypasses ─────────────────────────────────────────────────────────────────────────────────────────

  async requestBypass(context: CommandContext, logbookId: string, raw: unknown, now = new Date()): Promise<BypassV1> {
    assertUuid(logbookId, 'logbookId');
    const input = parse(RequestBypassV1Schema, raw);
    const requestSha256 = sha256(canonicalJson({ logbookId, ...input }));
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const replay = (await client.query('SELECT * FROM gigalibs_workforce.logbook_bypasses WHERE tenant_id = $1 AND client_operation_id = $2',
        [context.principal.tenantId, input.clientOperationId])).rows[0];
      if (replay) {
        if (replay.request_sha256 !== requestSha256 || replay.requested_by !== context.principal.subject)
          refuse('WORKFORCE_OPERATION_REUSED', 'This capture id was already used for a different bypass.');
        return mapBypass(replay, now.getTime());
      }
      const logbook = await this.logbookRow(client, context.principal, logbookId, false);
      if (!logbook.active) refuse('WORKFORCE_LOGBOOK_INACTIVE', 'This logbook is closed.');
      if (Date.parse(input.plannedRemovalAt) <= now.getTime())
        refuse('WORKFORCE_BYPASS_REMOVAL_PAST', 'Give a planned removal time in the future.');
      const row = (await client.query(
        `INSERT INTO gigalibs_workforce.logbook_bypasses (tenant_id, logbook_id, client_operation_id, request_sha256, description,
           asset_ref, reason, mitigation, requested_by, planned_removal_at, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [context.principal.tenantId, logbookId, input.clientOperationId, requestSha256, input.description, input.assetRef ?? null,
          input.reason, input.mitigation, context.principal.subject, input.plannedRemovalAt, context.correlationId])).rows[0];
      await recordMutation(client, context, 'WORKFORCE_BYPASS_REQUESTED', 'logbook_bypass', row.id, 1, { logbookId });
      return mapBypass(row, now.getTime());
    });
  }

  async decideBypass(context: CommandContext, bypassId: string, raw: unknown): Promise<BypassV1> {
    assertUuid(bypassId, 'bypassId');
    const input = parse(DecideBypassV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const row = await this.bypassRow(client, context.principal, bypassId);
      if (row.status !== 'REQUESTED') refuse('WORKFORCE_BYPASS_DECIDED', 'This bypass is already decided.');
      if (row.version !== input.expectedVersion) refuse('WORKFORCE_VERSION_CONFLICT', 'The bypass was changed by another request. Reload and try again.');
      if (row.requested_by === context.principal.subject)
        throw new ForbiddenException({ code: 'WORKFORCE_BYPASS_FOUR_EYES', message: 'A bypass is decided by someone other than its requester.' });
      const updated = (await client.query(
        `UPDATE gigalibs_workforce.logbook_bypasses SET status = $3, authorized_by = $4, authorized_at = now(), decision_note = $5,
                version = version + 1, correlation_id = $6 WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [context.principal.tenantId, bypassId, input.decision === 'AUTHORIZE' ? 'AUTHORIZED' : 'REJECTED', context.principal.subject,
          input.note ?? null, context.correlationId])).rows[0];
      await recordMutation(client, context, input.decision === 'AUTHORIZE' ? 'WORKFORCE_BYPASS_AUTHORIZED' : 'WORKFORCE_BYPASS_REJECTED',
        'logbook_bypass', bypassId, updated.version, { logbookId: row.logbook_id });
      return mapBypass(updated);
    });
  }

  async clearBypass(context: CommandContext, bypassId: string, raw: unknown): Promise<BypassV1> {
    assertUuid(bypassId, 'bypassId');
    const input = parse(ClearBypassV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const row = await this.bypassRow(client, context.principal, bypassId);
      if (row.status !== 'AUTHORIZED') refuse('WORKFORCE_BYPASS_NOT_ACTIVE', 'Only an active bypass can be cleared.');
      if (row.version !== input.expectedVersion) refuse('WORKFORCE_VERSION_CONFLICT', 'The bypass was changed by another request. Reload and try again.');
      const updated = (await client.query(
        `UPDATE gigalibs_workforce.logbook_bypasses SET status = 'CLEARED', cleared_by = $3, cleared_at = now(),
                decision_note = coalesce($4, decision_note), version = version + 1, correlation_id = $5
          WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [context.principal.tenantId, bypassId, context.principal.subject, input.note ?? null, context.correlationId])).rows[0];
      await recordMutation(client, context, 'WORKFORCE_BYPASS_CLEARED', 'logbook_bypass', bypassId, updated.version, { logbookId: row.logbook_id });
      return mapBypass(updated);
    });
  }

  /** The bypass register across the logbooks the caller can see. */
  async listBypasses(principal: GigaOpsPrincipal, status?: string): Promise<{ readonly items: readonly BypassV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const scope = await this.scope(client, principal, values, 'l.');
      let filter = "AND b.status IN ('REQUESTED', 'AUTHORIZED')";
      if (status && ['REQUESTED', 'AUTHORIZED', 'CLEARED', 'REJECTED'].includes(status)) {
        values.push(status);
        filter = `AND b.status = $${values.length}`;
      }
      const rows = await client.query(
        `SELECT b.* FROM gigalibs_workforce.logbook_bypasses b
           JOIN gigalibs_workforce.logbooks l ON l.tenant_id = b.tenant_id AND l.id = b.logbook_id
          WHERE b.tenant_id = $1 ${scope} ${filter} ORDER BY b.requested_at DESC LIMIT 500`, values);
      return { items: rows.rows.map((row) => mapBypass(row)) };
    });
  }

  // ─── Handovers ────────────────────────────────────────────────────────────────────────────────────────

  async submitHandover(context: CommandContext, logbookId: string, raw: unknown, now = new Date()): Promise<SubmitHandoverResultV1> {
    assertUuid(logbookId, 'logbookId');
    const input = parse(SubmitHandoverV1Schema, raw);
    const requestSha256 = sha256(canonicalJson({ logbookId, ...input }));
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const replay = (await client.query('SELECT * FROM gigalibs_workforce.logbook_handovers WHERE tenant_id = $1 AND client_operation_id = $2',
        [context.principal.tenantId, input.clientOperationId])).rows[0];
      if (replay) {
        if (replay.request_sha256 !== requestSha256 || replay.outgoing_by !== context.principal.subject)
          refuse('WORKFORCE_OPERATION_REUSED', 'This capture id was already used for a different handover.');
        return { replayed: true, handover: mapHandover(replay) };
      }
      const logbook = await this.logbookRow(client, context.principal, logbookId, false);
      const current = shiftAt(logbook.shiftWindows, logbook.timeZone, now.toISOString());
      const previous = shiftAt(logbook.shiftWindows, logbook.timeZone, new Date(Date.parse(current.startsAt) - 1000).toISOString());
      const handedOver = [current, previous].find((shift) => shift.shiftDate === input.shiftDate && shift.shiftName === input.shiftName);
      if (!handedOver) refuse('WORKFORCE_HANDOVER_SHIFT', 'A handover is for the current or the previous shift.');
      const pkg = await this.freezePackage(client, context.principal.tenantId, logbookId, handedOver, now);
      try {
        const row = (await client.query(
          `INSERT INTO gigalibs_workforce.logbook_handovers (tenant_id, logbook_id, client_operation_id, request_sha256, shift_date,
             shift_name, outgoing_by, outgoing_statement, notes, package, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11) RETURNING *`,
          [context.principal.tenantId, logbookId, input.clientOperationId, requestSha256, input.shiftDate, input.shiftName,
            context.principal.subject, LOGBOOK_OUTGOING_STATEMENT, input.notes, JSON.stringify(pkg), context.correlationId])).rows[0];
        await recordMutation(client, context, 'WORKFORCE_HANDOVER_SUBMITTED', 'logbook_handover', row.id, 1,
          { logbookId, shiftDate: input.shiftDate, shiftName: input.shiftName, activeBypasses: pkg.activeBypasses.length });
        return { replayed: false, handover: mapHandover(row) };
      } catch (error) {
        translate(error, 'This shift already has a handover.');
      }
    });
  }

  /** The outgoing operator refreshes a submitted package (bypasses changed since it was frozen). */
  async refreezeHandover(context: CommandContext, handoverId: string, raw: unknown, now = new Date()): Promise<HandoverV1> {
    assertUuid(handoverId, 'handoverId');
    const input = parse(RefreezeHandoverV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const row = await this.handoverRow(client, context.principal, handoverId);
      if (row.status !== 'SUBMITTED') refuse('WORKFORCE_HANDOVER_ACCEPTED', 'An accepted handover cannot change.');
      if (row.version !== input.expectedVersion) refuse('WORKFORCE_VERSION_CONFLICT', 'The handover was changed by another request. Reload and try again.');
      if (row.outgoing_by !== context.principal.subject)
        throw new ForbiddenException({ code: 'WORKFORCE_HANDOVER_OUTGOING_ONLY', message: 'Only the outgoing operator refreshes the package.' });
      const handover = mapHandover(row);
      const pkg = await this.freezePackage(client, context.principal.tenantId, row.logbook_id, handover, now);
      const updated = (await client.query(
        `UPDATE gigalibs_workforce.logbook_handovers SET package = $3::jsonb, version = version + 1, correlation_id = $4
          WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [context.principal.tenantId, handoverId, JSON.stringify(pkg), context.correlationId])).rows[0];
      await recordMutation(client, context, 'WORKFORCE_HANDOVER_REFROZEN', 'logbook_handover', handoverId, updated.version, {});
      return mapHandover(updated);
    });
  }

  async acceptHandover(context: CommandContext, handoverId: string, raw: unknown): Promise<HandoverV1> {
    assertUuid(handoverId, 'handoverId');
    const input = parse(AcceptHandoverV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const row = await this.handoverRow(client, context.principal, handoverId);
      if (row.status !== 'SUBMITTED') refuse('WORKFORCE_HANDOVER_ACCEPTED', 'This handover is already accepted.');
      if (row.version !== input.expectedVersion) refuse('WORKFORCE_VERSION_CONFLICT', 'The handover was changed by another request. Reload and try again.');
      if (row.outgoing_by === context.principal.subject)
        throw new ForbiddenException({ code: 'WORKFORCE_HANDOVER_TWO_PERSON', message: 'A handover is accepted by someone other than the outgoing operator.' });
      const active = (await client.query<{ id: string }>(
        `SELECT id FROM gigalibs_workforce.logbook_bypasses WHERE tenant_id = $1 AND logbook_id = $2 AND status = 'AUTHORIZED'
          FOR SHARE`, [context.principal.tenantId, row.logbook_id])).rows.map((bypass) => bypass.id).sort();
      const frozen = (row.package as HandoverPackageV1).activeBypasses.map((bypass) => bypass.id).sort();
      if (active.join() !== frozen.join())
        refuse('WORKFORCE_HANDOVER_BYPASSES_CHANGED', 'The active bypasses changed since the package was frozen; the outgoing operator refreshes it.');
      if ([...new Set(input.acknowledgedBypassIds)].sort().join() !== active.join())
        refuse('WORKFORCE_HANDOVER_BYPASSES_UNACKNOWLEDGED', 'Acknowledge every active bypass before accepting the handover.');
      const updated = (await client.query(
        `UPDATE gigalibs_workforce.logbook_handovers SET status = 'ACCEPTED', incoming_by = $3, accepted_at = now(),
                incoming_statement = $4, acknowledged_bypass_ids = $5::uuid[], version = version + 1, correlation_id = $6
          WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [context.principal.tenantId, handoverId, context.principal.subject, input.statement, active, context.correlationId])).rows[0];
      await recordMutation(client, context, 'WORKFORCE_HANDOVER_ACCEPTED', 'logbook_handover', handoverId, updated.version,
        { logbookId: row.logbook_id, acknowledgedBypasses: active.length });
      return mapHandover(updated);
    });
  }

  async countersignHandover(context: CommandContext, handoverId: string, raw: unknown): Promise<HandoverV1> {
    assertUuid(handoverId, 'handoverId');
    const input = parse(CountersignHandoverV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const row = await this.handoverRow(client, context.principal, handoverId);
      if (row.status !== 'ACCEPTED') refuse('WORKFORCE_HANDOVER_NOT_ACCEPTED', 'Only an accepted handover is countersigned.');
      if (row.version !== input.expectedVersion) refuse('WORKFORCE_VERSION_CONFLICT', 'The handover was changed by another request. Reload and try again.');
      if (row.outgoing_by === context.principal.subject || row.incoming_by === context.principal.subject)
        throw new ForbiddenException({ code: 'WORKFORCE_HANDOVER_THIRD_PERSON', message: 'A countersign comes from someone outside the handover.' });
      const updated = (await client.query(
        `UPDATE gigalibs_workforce.logbook_handovers SET status = 'COUNTERSIGNED', supervisor_by = $3, countersigned_at = now(),
                supervisor_statement = $4, version = version + 1, correlation_id = $5 WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [context.principal.tenantId, handoverId, context.principal.subject, input.statement, context.correlationId])).rows[0];
      await recordMutation(client, context, 'WORKFORCE_HANDOVER_COUNTERSIGNED', 'logbook_handover', handoverId, updated.version, { logbookId: row.logbook_id });
      return mapHandover(updated);
    });
  }

  async listHandovers(principal: GigaOpsPrincipal, logbookId: string): Promise<{ readonly items: readonly HandoverV1[] }> {
    assertUuid(logbookId, 'logbookId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.logbookRow(client, principal, logbookId, false);
      const rows = await client.query(
        `SELECT * FROM gigalibs_workforce.logbook_handovers WHERE tenant_id = $1 AND logbook_id = $2
          ORDER BY shift_date DESC, submitted_at DESC LIMIT 100`, [principal.tenantId, logbookId]);
      return { items: rows.rows.map(mapHandover) };
    });
  }

  // ─── Rows and scope ───────────────────────────────────────────────────────────────────────────────────

  private async freezePackage(client: PoolClient, tenantId: string, logbookId: string,
    shift: { readonly shiftDate: string; readonly shiftName: string }, now: Date): Promise<HandoverPackageV1> {
    const counts = await client.query<{ category: string; count: string }>(
      `SELECT category, count(*)::text AS count FROM gigalibs_workforce.logbook_entries
        WHERE tenant_id = $1 AND logbook_id = $2 AND shift_date = $3::date AND shift_name = $4 GROUP BY category`,
      [tenantId, logbookId, shift.shiftDate, shift.shiftName]);
    const high = await client.query(
      `SELECT id, category, text, occurred_at FROM gigalibs_workforce.logbook_entries
        WHERE tenant_id = $1 AND logbook_id = $2 AND shift_date = $3::date AND shift_name = $4 AND priority = 'HIGH'
        ORDER BY occurred_at LIMIT 100`, [tenantId, logbookId, shift.shiftDate, shift.shiftName]);
    const bypasses = await client.query(
      `SELECT id, description, authorized_at, planned_removal_at, status FROM gigalibs_workforce.logbook_bypasses
        WHERE tenant_id = $1 AND logbook_id = $2 AND status IN ('REQUESTED', 'AUTHORIZED') ORDER BY authorized_at NULLS LAST`,
      [tenantId, logbookId]);
    return {
      frozenAt: now.toISOString(),
      entryCounts: Object.fromEntries(counts.rows.map((row) => [row.category, Number(row.count)])) as HandoverPackageV1['entryCounts'],
      highPriorityEntries: high.rows.map((row) => ({ id: row.id, category: row.category, text: row.text, occurredAt: iso(row.occurred_at) })),
      activeBypasses: bypasses.rows.filter((row) => row.status === 'AUTHORIZED').map((row) => ({
        id: row.id, description: row.description, authorizedAt: iso(row.authorized_at), plannedRemovalAt: iso(row.planned_removal_at) })),
      pendingBypasses: bypasses.rows.filter((row) => row.status === 'REQUESTED').length,
    };
  }

  /** SQL keeping the logbooks the caller may read: their units (or shared) and, when place-scoped, their places. */
  private async scope(client: PoolClient, principal: GigaOpsPrincipal, values: unknown[], alias: string): Promise<string> {
    const push = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    const parts: string[] = [];
    if (principal.organization) {
      const access = await organizationAccess(replica, client, principal.tenantId, principal.organization);
      const condition = organizationReadCondition(access, `${alias}department_id`, push);
      if (condition) parts.push(condition);
    }
    if (principal.spatialScope.mode === 'SCOPED_PLACES') parts.push(`${alias}site_ref = ANY(${push([...principal.spatialScope.place_ids])}::uuid[])`);
    return parts.length ? `AND ${parts.join(' AND ')}` : '';
  }

  private async assertWritable(client: PoolClient, principal: GigaOpsPrincipal, departmentId: string | null, siteRef: string | null): Promise<void> {
    if (principal.organization) {
      const access = await organizationAccess(replica, client, principal.tenantId, principal.organization);
      try {
        assertOrganizationWrite(access, departmentId);
      } catch (error) {
        if (error instanceof OrganizationScopeRefusal) throw new ForbiddenException({ code: error.code, message: error.message });
        throw error;
      }
    }
    if (principal.spatialScope.mode === 'SCOPED_PLACES' && (siteRef === null || !principal.spatialScope.place_ids.includes(siteRef)))
      throw new ForbiddenException({ code: 'WORKFORCE_OUT_OF_SCOPE', message: 'The logbook is outside your places.' });
  }

  private async logbookRow(client: PoolClient, principal: GigaOpsPrincipal, logbookId: string, lock: boolean): Promise<LogbookV1> {
    const values: unknown[] = [principal.tenantId, logbookId];
    const scope = await this.scope(client, principal, values, 'l.');
    const row = (await client.query(
      `SELECT l.* FROM gigalibs_workforce.logbooks l WHERE l.tenant_id = $1 AND l.id = $2 ${scope}${lock ? ' FOR UPDATE' : ''}`, values)).rows[0];
    if (!row) throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The logbook was not found.' });
    return mapLogbook(row);
  }

  private async bypassRow(client: PoolClient, principal: GigaOpsPrincipal, bypassId: string): Promise<Record<string, any>> {
    const row = (await client.query('SELECT * FROM gigalibs_workforce.logbook_bypasses WHERE tenant_id = $1 AND id = $2 FOR UPDATE',
      [principal.tenantId, bypassId])).rows[0];
    if (!row) throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The bypass was not found.' });
    await this.logbookRow(client, principal, row.logbook_id, false);
    return row;
  }

  private async handoverRow(client: PoolClient, principal: GigaOpsPrincipal, handoverId: string): Promise<Record<string, any>> {
    const row = (await client.query('SELECT * FROM gigalibs_workforce.logbook_handovers WHERE tenant_id = $1 AND id = $2 FOR UPDATE',
      [principal.tenantId, handoverId])).rows[0];
    if (!row) throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The handover was not found.' });
    await this.logbookRow(client, principal, row.logbook_id, false);
    return row;
  }
}
