import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  ApprovePayRunV1Schema,
  CalculatePayRunV1Schema,
  ListPayRatesV1QuerySchema,
  ListPayRunsV1QuerySchema,
  SetPayRateV1Schema,
  VoidPayRunV1Schema,
  type EarningLineV1,
  type PayPolicyPackV1,
  type PayRateV1,
  type PayRunDetailV1,
  type PayRunV1,
  type PayRunVerificationV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import { GIGAOPS_CONFIG } from '../config.provider.js';
import type { GigaOpsRuntimeConfig } from '../runtime-config.js';
import { type CommandContext, assertUuid, conflict, iso, parse, recordMutation, translate } from '../common/commands.js';
import { WorkforceDatabaseService } from '../database/database.service.js';
import { addDays } from '../time/time.rules.js';
import { type CalculatedLine, PAY_POLICY_PACKS, type WorkedDay, calculateWeek, findPack, packInForce, packUsable, runDigest } from './pay.rules.js';

interface DayTermSnapshot {
  readonly workDate: string;
  readonly packCode: string;
  readonly packVersion: number;
  readonly hourlyRateMinor: number;
  readonly currency: string;
}

interface PersonSnapshot {
  readonly resourceId: string;
  readonly timesheetId: string;
  readonly terms: readonly DayTermSnapshot[];
}

const RUN_SELECT = `SELECT r.* FROM gigalibs_workforce.pay_runs r`;

/**
 * Pay rates, calculation runs and earning lines (WI-OI-070, ADR-0008). A run covers the week's approved
 * timesheets, freezes each person's rate and pack version per day in its snapshot, and stores its lines with a
 * digest. Approval is four-eyes and final; a calculated run can be voided and recalculated; verification
 * recomputes from the frozen inputs, so later rate changes never alter an approved run.
 */
@Injectable()
export class PayService {
  constructor(
    private readonly database: WorkforceDatabaseService,
    @Inject(GIGAOPS_CONFIG) private readonly config: Pick<GigaOpsRuntimeConfig, 'payReferencePacks'>,
  ) {}

  packs(): { readonly items: readonly PayPolicyPackV1[]; readonly referencePacksEnabled: boolean } {
    return { items: PAY_POLICY_PACKS, referencePacksEnabled: this.config.payReferencePacks };
  }

  /** Reference packs are not statutory advice; outside local and test profiles they cannot price anyone's pay. */
  private assertPackUsable(pack: PayPolicyPackV1): void {
    if (!packUsable(pack, this.config.payReferencePacks)) {
      throw new ConflictException({
        code: 'WORKFORCE_PAY_PACK_NOT_APPROVED',
        message: `${pack.code}@${pack.version} is a reference pack and is not enabled in this deployment; use a pack approved for your jurisdiction.`,
      });
    }
  }

  // ─── Rates ─────────────────────────────────────────────────────────────────────────────────────────────
  async listRates(principal: GigaOpsPrincipal, rawQuery: unknown): Promise<{ readonly items: readonly PayRateV1[] }> {
    const query = parse(ListPayRatesV1QuerySchema, rawQuery);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['p.tenant_id = $1'];
      if (query.resourceId) {
        values.push(query.resourceId);
        where.push(`p.resource_id = $${values.length}`);
      }
      const result = await client.query(
        `SELECT p.*, r.display_name AS resource_name FROM gigalibs_workforce.pay_rates p
           JOIN gigalibs_workforce.workforce_resources r ON r.tenant_id = p.tenant_id AND r.id = p.resource_id
          WHERE ${where.join(' AND ')} ORDER BY r.display_name, p.effective_from DESC LIMIT 1000`,
        values,
      );
      return { items: result.rows.map(mapRate) };
    });
  }

  /** A new rate from a date; the open rate before it closes the day before. Later rates are never rewritten. */
  async setRate(context: CommandContext, rawInput: unknown): Promise<PayRateV1> {
    const input = parse(SetPayRateV1Schema, rawInput);
    assertTenantWide(context.principal);
    const pack = packInForce(input.packCode, input.effectiveFrom);
    if (!pack) {
      throw new ConflictException({ code: 'WORKFORCE_PAY_PACK_UNKNOWN', message: `No pack ${input.packCode} is in force on ${input.effectiveFrom}.` });
    }
    this.assertPackUsable(pack);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const person = (await client.query<{ resource_type: string }>(
        `SELECT resource_type FROM gigalibs_workforce.workforce_resources WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, input.resourceId],
      )).rows[0];
      if (!person) throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The person was not found.' });
      if (person.resource_type !== 'HUMAN') {
        throw new ConflictException({ code: 'WORKFORCE_PAY_RATE_TARGET', message: 'Pay rates apply to individual people.' });
      }
      const later = await client.query(
        `SELECT 1 FROM gigalibs_workforce.pay_rates WHERE tenant_id = $1 AND resource_id = $2 AND effective_from >= $3`,
        [tenantId, input.resourceId, input.effectiveFrom],
      );
      if (later.rows[0]) {
        throw new ConflictException({ code: 'WORKFORCE_PAY_RATE_LATER_EXISTS', message: 'A rate from this date or later already exists.' });
      }
      await client.query(
        `UPDATE gigalibs_workforce.pay_rates SET effective_to = $3
          WHERE tenant_id = $1 AND resource_id = $2 AND effective_from < $4 AND (effective_to IS NULL OR effective_to >= $4)`,
        [tenantId, input.resourceId, addDays(input.effectiveFrom, -1), input.effectiveFrom],
      );
      let id: string;
      try {
        id = (await client.query<{ id: string }>(
          `INSERT INTO gigalibs_workforce.pay_rates (tenant_id, resource_id, pack_code, effective_from, hourly_rate_minor, currency, created_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [tenantId, input.resourceId, input.packCode, input.effectiveFrom, input.hourlyRateMinor, input.currency, context.principal.subject, context.correlationId],
        )).rows[0]!.id;
      } catch (error) {
        translate(error, 'This rate overlaps another rate for the person.');
      }
      await recordMutation(client, context, 'WORKFORCE_PAY_RATE_SET', 'WORKFORCE_PAY_RATE', id, 1, {
        resourceId: input.resourceId,
        packCode: input.packCode,
        effectiveFrom: input.effectiveFrom,
        hourlyRateMinor: input.hourlyRateMinor,
        currency: input.currency,
      });
      const saved = await client.query(
        `SELECT p.*, r.display_name AS resource_name FROM gigalibs_workforce.pay_rates p
           JOIN gigalibs_workforce.workforce_resources r ON r.tenant_id = p.tenant_id AND r.id = p.resource_id
          WHERE p.tenant_id = $1 AND p.id = $2`,
        [tenantId, id],
      );
      return mapRate(saved.rows[0]);
    });
  }

  // ─── Runs ──────────────────────────────────────────────────────────────────────────────────────────────
  async calculate(context: CommandContext, rawInput: unknown): Promise<PayRunDetailV1 & { readonly replayed: boolean }> {
    const input = parse(CalculatePayRunV1Schema, rawInput);
    assertTenantWide(context.principal);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const replay = (await client.query(`${RUN_SELECT} WHERE r.tenant_id = $1 AND r.request_key = $2`, [tenantId, input.requestKey])).rows[0];
      if (replay) {
        if (replay.period_start !== input.periodStart) {
          throw new ConflictException({ code: 'WORKFORCE_REQUEST_KEY_REUSED', message: 'That request key was used for another week.' });
        }
        return { ...(await this.detailWithClient(client, tenantId, replay.id)), replayed: true };
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 70))', [`${tenantId}:pay:${input.periodStart}`]);
      const live = await client.query(
        `SELECT id, status FROM gigalibs_workforce.pay_runs WHERE tenant_id = $1 AND period_start = $2 AND status <> 'VOIDED'`,
        [tenantId, input.periodStart],
      );
      if (live.rows[0]) {
        throw new ConflictException({
          code: 'WORKFORCE_PAY_RUN_EXISTS',
          message: live.rows[0].status === 'APPROVED' ? 'This week is already approved.' : 'This week has a calculated run; void it to recalculate.',
        });
      }
      const sheets = await client.query<{ id: string; resource_id: string; display_name: string }>(
        `SELECT t.id, t.resource_id, r.display_name FROM gigalibs_workforce.timesheets t
           JOIN gigalibs_workforce.workforce_resources r ON r.tenant_id = t.tenant_id AND r.id = t.resource_id
          WHERE t.tenant_id = $1 AND t.period_start = $2 AND t.status = 'APPROVED' ORDER BY t.resource_id`,
        [tenantId, input.periodStart],
      );
      if (!sheets.rows.length) {
        throw new ConflictException({ code: 'WORKFORCE_PAY_RUN_EMPTY', message: 'No approved timesheets exist for this week.' });
      }
      const rates = await client.query(
        `SELECT * FROM gigalibs_workforce.pay_rates
          WHERE tenant_id = $1 AND resource_id = ANY($2::uuid[]) AND effective_from <= $4 AND (effective_to IS NULL OR effective_to >= $3)`,
        [tenantId, sheets.rows.map((sheet) => sheet.resource_id), input.periodStart, addDays(input.periodStart, 6)],
      );
      const people: PersonSnapshot[] = [];
      const missing = new Set<string>();
      for (const sheet of sheets.rows) {
        const days = await workedDays(client, tenantId, sheet.id);
        const terms: DayTermSnapshot[] = [];
        for (const day of days) {
          const rate = rates.rows.find(
            (row) => row.resource_id === sheet.resource_id && row.effective_from <= day.workDate && (row.effective_to === null || row.effective_to >= day.workDate),
          );
          const pack = rate ? packInForce(rate.pack_code, day.workDate) : null;
          if (!rate || !pack) {
            missing.add(sheet.display_name);
            continue;
          }
          this.assertPackUsable(pack);
          terms.push({ workDate: day.workDate, packCode: pack.code, packVersion: pack.version, hourlyRateMinor: Number(rate.hourly_rate_minor), currency: rate.currency });
        }
        people.push({ resourceId: sheet.resource_id, timesheetId: sheet.id, terms });
      }
      if (missing.size) {
        throw new ConflictException({
          code: 'WORKFORCE_PAY_RATE_MISSING',
          message: `Set a pay rate covering the week for: ${[...missing].sort().join(', ')}.`,
        });
      }
      const computed = await this.compute(client, tenantId, input.periodStart, people);
      let runId: string;
      try {
        runId = (await client.query<{ id: string }>(
          `INSERT INTO gigalibs_workforce.pay_runs
             (tenant_id, request_key, period_start, period_end, people, line_count, totals, digest, snapshot, calculated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10, $11) RETURNING id`,
          [tenantId, input.requestKey, input.periodStart, addDays(input.periodStart, 6), people.length, computed.lines.length,
            JSON.stringify(totals(computed.lines)), computed.digest, JSON.stringify({ people }), context.principal.subject, context.correlationId],
        )).rows[0]!.id;
      } catch (error) {
        translate(error, 'This week already has a live pay run.');
      }
      for (const [index, line] of computed.lines.entries()) {
        await client.query(
          `INSERT INTO gigalibs_workforce.earning_lines
             (tenant_id, run_id, line_no, resource_id, timesheet_id, work_date, category, minutes, multiplier_bp, hourly_rate_minor,
              amount_minor, currency, pack_code, pack_version, rule_trace)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [tenantId, runId, index + 1, line.resourceId, line.timesheetId, line.workDate, line.category, line.minutes, line.multiplierBp,
            line.hourlyRateMinor, line.amountMinor, line.currency, line.packCode, line.packVersion, line.ruleTrace],
        );
      }
      await recordMutation(client, context, 'WORKFORCE_PAY_RUN_CALCULATED', 'WORKFORCE_PAY_RUN', runId, 1, {
        periodStart: input.periodStart,
        people: people.length,
        lines: computed.lines.length,
        digest: computed.digest,
        totals: totals(computed.lines),
      });
      return { ...(await this.detailWithClient(client, tenantId, runId)), replayed: false };
    });
  }

  async approve(context: CommandContext, runId: string, rawInput: unknown): Promise<PayRunDetailV1> {
    const input = parse(ApprovePayRunV1Schema, rawInput);
    return this.decide(context, runId, input.expectedVersion, null);
  }

  async void(context: CommandContext, runId: string, rawInput: unknown): Promise<PayRunDetailV1> {
    const input = parse(VoidPayRunV1Schema, rawInput);
    return this.decide(context, runId, input.expectedVersion, input.reason);
  }

  private async decide(context: CommandContext, runId: string, expectedVersion: number, voidReason: string | null): Promise<PayRunDetailV1> {
    assertUuid(runId, 'runId');
    assertTenantWide(context.principal);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const run = (await client.query(`${RUN_SELECT} WHERE r.tenant_id = $1 AND r.id = $2 FOR UPDATE`, [tenantId, runId])).rows[0];
      if (!run) throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The pay run was not found.' });
      if (Number(run.version) !== expectedVersion) conflict('pay run');
      if (run.status !== 'CALCULATED') {
        throw new ConflictException({ code: 'WORKFORCE_PAY_RUN_STATE', message: `A ${run.status} pay run cannot change.` });
      }
      if (voidReason === null && run.calculated_by === context.principal.subject) {
        throw new ForbiddenException({ code: 'WORKFORCE_SELF_APPROVAL', message: 'Another person must approve the run you calculated.' });
      }
      const updated =
        voidReason === null
          ? await client.query<{ version: number }>(
              `UPDATE gigalibs_workforce.pay_runs SET status = 'APPROVED', approved_by = $3, approved_at = now(), version = version + 1, correlation_id = $4, updated_at = now()
                WHERE tenant_id = $1 AND id = $2 RETURNING version`,
              [tenantId, runId, context.principal.subject, context.correlationId],
            )
          : await client.query<{ version: number }>(
              `UPDATE gigalibs_workforce.pay_runs SET status = 'VOIDED', void_reason = $3, version = version + 1, correlation_id = $4, updated_at = now()
                WHERE tenant_id = $1 AND id = $2 RETURNING version`,
              [tenantId, runId, voidReason, context.correlationId],
            );
      await recordMutation(
        client,
        context,
        voidReason === null ? 'WORKFORCE_PAY_RUN_APPROVED' : 'WORKFORCE_PAY_RUN_VOIDED',
        'WORKFORCE_PAY_RUN',
        runId,
        Number(updated.rows[0]!.version),
        { periodStart: run.period_start, digest: run.digest, ...(voidReason ? { reason: voidReason } : {}) },
      );
      return this.detailWithClient(client, tenantId, runId);
    });
  }

  async listRuns(principal: GigaOpsPrincipal, rawQuery: unknown): Promise<{ readonly items: readonly PayRunV1[] }> {
    const query = parse(ListPayRunsV1QuerySchema, rawQuery);
    assertTenantWide(principal);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['r.tenant_id = $1'];
      if (query.periodStart) {
        values.push(query.periodStart);
        where.push(`r.period_start = $${values.length}`);
      }
      if (query.status) {
        values.push(query.status);
        where.push(`r.status = $${values.length}`);
      }
      const result = await client.query(`${RUN_SELECT} WHERE ${where.join(' AND ')} ORDER BY r.period_start DESC, r.calculated_at DESC LIMIT 200`, values);
      return { items: result.rows.map(mapRun) };
    });
  }

  async run(principal: GigaOpsPrincipal, runId: string): Promise<PayRunDetailV1> {
    assertUuid(runId, 'runId');
    assertTenantWide(principal);
    return this.database.withTenantTransaction(principal.tenantId, (client) => this.detailWithClient(client, principal.tenantId, runId));
  }

  /** Recomputes the run from its frozen inputs; an identical digest proves the lines are reproducible. */
  async verify(principal: GigaOpsPrincipal, runId: string): Promise<PayRunVerificationV1> {
    assertUuid(runId, 'runId');
    assertTenantWide(principal);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const run = (await client.query(`${RUN_SELECT} WHERE r.tenant_id = $1 AND r.id = $2`, [principal.tenantId, runId])).rows[0];
      if (!run) throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The pay run was not found.' });
      const people = (run.snapshot as { people: PersonSnapshot[] }).people;
      const recomputed = await this.compute(client, principal.tenantId, run.period_start, people);
      return { runId, storedDigest: run.digest, recomputedDigest: recomputed.digest, identical: recomputed.digest === run.digest };
    });
  }

  private async compute(
    client: PoolClient,
    tenantId: string,
    periodStart: string,
    people: readonly PersonSnapshot[],
  ): Promise<{ lines: (CalculatedLine & { resourceId: string; timesheetId: string })[]; digest: string }> {
    const lines: (CalculatedLine & { resourceId: string; timesheetId: string })[] = [];
    const digestPeople = [];
    for (const person of people) {
      const days = await workedDays(client, tenantId, person.timesheetId);
      const byDate = new Map(person.terms.map((term) => [term.workDate, term]));
      const personLines = calculateWeek(days, (workDate) => {
        const term = byDate.get(workDate);
        const pack = term ? findPack(term.packCode, term.packVersion) : null;
        if (!term || !pack) throw new ConflictException({ code: 'WORKFORCE_PAY_TERMS_MISSING', message: `No frozen pay terms for ${workDate}.` });
        return { pack, hourlyRateMinor: term.hourlyRateMinor, currency: term.currency };
      });
      lines.push(...personLines.map((line) => ({ ...line, resourceId: person.resourceId, timesheetId: person.timesheetId })));
      digestPeople.push({ resourceId: person.resourceId, timesheetId: person.timesheetId, terms: person.terms, lines: personLines });
    }
    return { lines, digest: runDigest({ periodStart, people: digestPeople }) };
  }

  private async detailWithClient(client: PoolClient, tenantId: string, runId: string): Promise<PayRunDetailV1> {
    const run = (await client.query(`${RUN_SELECT} WHERE r.tenant_id = $1 AND r.id = $2`, [tenantId, runId])).rows[0];
    if (!run) throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The pay run was not found.' });
    const lines = await client.query(
      `SELECT l.*, r.display_name AS resource_name FROM gigalibs_workforce.earning_lines l
         JOIN gigalibs_workforce.workforce_resources r ON r.tenant_id = l.tenant_id AND r.id = l.resource_id
        WHERE l.tenant_id = $1 AND l.run_id = $2 ORDER BY l.line_no`,
      [tenantId, runId],
    );
    return { ...mapRun(run), lines: lines.rows.map(mapLine) };
  }
}

/** Worked minutes per day of an approved timesheet (immutable lines). */
async function workedDays(client: PoolClient, tenantId: string, timesheetId: string): Promise<WorkedDay[]> {
  const result = await client.query<{ work_date: string; minutes: number }>(
    `SELECT work_date, SUM(worked_minutes)::int AS minutes FROM gigalibs_workforce.timesheet_lines
      WHERE tenant_id = $1 AND timesheet_id = $2 GROUP BY work_date ORDER BY work_date`,
    [tenantId, timesheetId],
  );
  return result.rows.map((row) => ({ workDate: row.work_date, minutes: Number(row.minutes) }));
}

function totals(lines: readonly CalculatedLine[]): { currency: string; amountMinor: number }[] {
  const sums = new Map<string, bigint>();
  for (const line of lines) sums.set(line.currency, (sums.get(line.currency) ?? 0n) + BigInt(line.amountMinor));
  return [...sums.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, amount]) => ({ currency, amountMinor: Number(amount) }));
}

/** Pay is tenant-wide; a place-scoped member cannot calculate, approve or read it. */
function assertTenantWide(principal: GigaOpsPrincipal): void {
  if (principal.spatialScope.mode === 'SCOPED_PLACES') {
    throw new ForbiddenException({ code: 'WORKFORCE_PAY_SCOPE', message: 'Pay needs tenant-wide authority.' });
  }
}

function mapRate(row: any): PayRateV1 {
  return {
    id: row.id,
    resourceId: row.resource_id,
    resourceName: row.resource_name ?? null,
    packCode: row.pack_code,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? null,
    hourlyRateMinor: Number(row.hourly_rate_minor),
    currency: row.currency,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  };
}

function mapRun(row: any): PayRunV1 {
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    people: Number(row.people),
    lineCount: Number(row.line_count),
    totals: row.totals,
    digest: row.digest,
    calculatedBy: row.calculated_by,
    calculatedAt: iso(row.calculated_at),
    approvedBy: row.approved_by ?? null,
    approvedAt: row.approved_at ? iso(row.approved_at) : null,
    voidReason: row.void_reason ?? null,
    version: Number(row.version),
  };
}

function mapLine(row: any): EarningLineV1 {
  return {
    lineNo: Number(row.line_no),
    resourceId: row.resource_id,
    resourceName: row.resource_name ?? null,
    timesheetId: row.timesheet_id,
    workDate: row.work_date,
    category: row.category,
    minutes: Number(row.minutes),
    multiplierBp: Number(row.multiplier_bp),
    hourlyRateMinor: Number(row.hourly_rate_minor),
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    packCode: row.pack_code,
    packVersion: Number(row.pack_version),
    ruleTrace: row.rule_trace,
  };
}
