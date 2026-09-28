import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AcknowledgePayExportV1Schema,
  CreatePayExportV1Schema,
  type PayExportReconciliationV1,
  type PayExportV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import { type CommandContext, assertUuid, conflict, iso, parse, recordMutation } from '../common/commands.js';
import { WorkforceDatabaseService } from '../database/database.service.js';
import { type ExportLine, buildPayrollCsv, controlTotals, reconcile, sha256 } from './pay-export.rules.js';

const EXPORT_SELECT = `SELECT e.*, r.period_start FROM gigalibs_workforce.pay_exports e
  JOIN gigalibs_workforce.pay_runs r ON r.tenant_id = e.tenant_id AND r.id = e.run_id`;

/**
 * Payroll exports of approved runs (WI-OI-071). One export per run and format, built from the immutable earning
 * lines; the stored file never changes (database trigger). Reconciliation re-parses the stored file against the
 * run; acknowledgement needs the target's matching control totals and a second person.
 */
@Injectable()
export class PayExportService {
  constructor(private readonly database: WorkforceDatabaseService) {}

  async create(context: CommandContext, runId: string, rawInput: unknown): Promise<PayExportV1 & { readonly replayed: boolean }> {
    assertUuid(runId, 'runId');
    const input = parse(CreatePayExportV1Schema, rawInput);
    assertTenantWide(context.principal);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const run = (await client.query(`SELECT * FROM gigalibs_workforce.pay_runs WHERE tenant_id = $1 AND id = $2 FOR SHARE`, [tenantId, runId])).rows[0];
      if (!run) throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The pay run was not found.' });
      if (run.status !== 'APPROVED') {
        throw new ConflictException({ code: 'WORKFORCE_PAY_RUN_NOT_APPROVED', message: 'Only an approved pay run can be exported.' });
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 71))', [`${tenantId}:export:${runId}:${input.format}`]);
      const existing = (await client.query(`${EXPORT_SELECT} WHERE e.tenant_id = $1 AND e.run_id = $2 AND e.format = $3`, [tenantId, runId, input.format])).rows[0];
      if (existing) return { ...mapExport(existing), replayed: true };
      const lines = await exportLines(client, tenantId, runId);
      const file = buildPayrollCsv({ id: runId, periodStart: run.period_start }, lines);
      if (!sameTotals(file.totals, run.totals)) {
        throw new ConflictException({ code: 'WORKFORCE_PAY_RUN_TOTALS', message: 'The run lines do not add up to its totals; the export was not created.' });
      }
      const id = (await client.query<{ id: string }>(
        `INSERT INTO gigalibs_workforce.pay_exports (tenant_id, run_id, format, content, file_sha256, line_count, totals, created_by, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9) RETURNING id`,
        [tenantId, runId, input.format, file.content, file.sha256, file.lineCount, JSON.stringify(file.totals), context.principal.subject, context.correlationId],
      )).rows[0]!.id;
      await recordMutation(client, context, 'WORKFORCE_PAY_EXPORT_CREATED', 'WORKFORCE_PAY_EXPORT', id, 1, {
        runId,
        format: input.format,
        fileSha256: file.sha256,
        lineCount: file.lineCount,
        totals: file.totals,
      });
      return { ...mapExport((await client.query(`${EXPORT_SELECT} WHERE e.tenant_id = $1 AND e.id = $2`, [tenantId, id])).rows[0]), replayed: false };
    });
  }

  async list(principal: GigaOpsPrincipal, runId: string | undefined): Promise<{ readonly items: readonly PayExportV1[] }> {
    assertTenantWide(principal);
    if (runId) assertUuid(runId, 'runId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const result = runId
        ? await client.query(`${EXPORT_SELECT} WHERE e.tenant_id = $1 AND e.run_id = $2 ORDER BY e.created_at DESC`, [principal.tenantId, runId])
        : await client.query(`${EXPORT_SELECT} WHERE e.tenant_id = $1 ORDER BY e.created_at DESC LIMIT 200`, [principal.tenantId]);
      return { items: result.rows.map(mapExport) };
    });
  }

  async get(principal: GigaOpsPrincipal, exportId: string): Promise<PayExportV1> {
    return mapExport(await this.row(principal, exportId));
  }

  async file(principal: GigaOpsPrincipal, exportId: string): Promise<{ readonly content: string; readonly sha256: string; readonly name: string }> {
    const row = await this.row(principal, exportId);
    return { content: row.content, sha256: row.file_sha256, name: `payroll-${row.period_start}-${row.run_id.slice(0, 8)}.csv` };
  }

  async reconciliation(principal: GigaOpsPrincipal, exportId: string): Promise<PayExportReconciliationV1> {
    assertUuid(exportId, 'exportId');
    assertTenantWide(principal);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const row = (await client.query(`${EXPORT_SELECT} WHERE e.tenant_id = $1 AND e.id = $2`, [principal.tenantId, exportId])).rows[0];
      if (!row) throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The export was not found.' });
      const lines = await exportLines(client, principal.tenantId, row.run_id);
      const result = reconcile(row.content, lines);
      const fileSha256Matches = sha256(row.content) === row.file_sha256;
      return {
        exportId,
        runId: row.run_id,
        fileSha256Matches,
        lineCountMatches: result.lineCountMatches,
        linesMatch: result.linesMatch,
        totalsMatch: result.totalsMatch,
        reconciled: fileSha256Matches && result.lineCountMatches && result.linesMatch && result.totalsMatch,
        lineCount: result.lineCount,
        totals: result.totals,
      };
    });
  }

  /** Records the target's import; refused (and audited) unless its control totals match the export exactly. */
  async acknowledge(context: CommandContext, exportId: string, rawInput: unknown): Promise<PayExportV1> {
    assertUuid(exportId, 'exportId');
    const input = parse(AcknowledgePayExportV1Schema, rawInput);
    assertTenantWide(context.principal);
    const tenantId = context.principal.tenantId;
    const outcome = await this.database.withTenantTransaction(tenantId, async (client) => {
      const row = (await client.query(`${EXPORT_SELECT} WHERE e.tenant_id = $1 AND e.id = $2 FOR UPDATE OF e`, [tenantId, exportId])).rows[0];
      if (!row) throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The export was not found.' });
      if (Number(row.version) !== input.expectedVersion) conflict('export');
      if (row.status !== 'READY') throw new ConflictException({ code: 'WORKFORCE_EXPORT_STATE', message: 'The export is already acknowledged.' });
      if (row.created_by === context.principal.subject) {
        throw new ForbiddenException({ code: 'WORKFORCE_SELF_ACKNOWLEDGEMENT', message: 'Another person must confirm the import of the export you created.' });
      }
      const reported = controlTotals(input.reportedTotals.map((total) => ({ currency: total.currency, amountMinor: total.amountMinor })));
      const matches = input.reportedLineCount === Number(row.line_count) && sameTotals(reported.totals, row.totals);
      const payload = { targetReference: input.targetReference, reportedLineCount: input.reportedLineCount, reportedTotals: reported.totals };
      if (!matches) {
        // A refused attempt changes nothing, so it is audit evidence only (no outbox fact); every attempt is kept.
        await client.query(
          `INSERT INTO gigalibs_workforce.audit_events (id, tenant_id, actor_subject, action, entity_type, entity_id, correlation_id, payload)
           VALUES ($1, $2, $3, 'WORKFORCE_PAY_EXPORT_RECONCILIATION_FAILED', 'WORKFORCE_PAY_EXPORT', $4, $5, $6::jsonb)`,
          [randomUUID(), tenantId, context.principal.subject, exportId, context.correlationId, JSON.stringify(payload)],
        );
        return { refused: true as const, expected: { lineCount: Number(row.line_count), totals: row.totals } };
      }
      const updated = await client.query<{ version: number }>(
        `UPDATE gigalibs_workforce.pay_exports
            SET status = 'ACKNOWLEDGED', target_reference = $3, reported = $4::jsonb, acknowledged_by = $5, acknowledged_at = now(),
                version = version + 1, correlation_id = $6
          WHERE tenant_id = $1 AND id = $2 RETURNING version`,
        [tenantId, exportId, input.targetReference, JSON.stringify(payload), context.principal.subject, context.correlationId],
      );
      await recordMutation(client, context, 'WORKFORCE_PAY_EXPORT_ACKNOWLEDGED', 'WORKFORCE_PAY_EXPORT', exportId, Number(updated.rows[0]!.version), payload);
      return { refused: false as const, export: mapExport((await client.query(`${EXPORT_SELECT} WHERE e.tenant_id = $1 AND e.id = $2`, [tenantId, exportId])).rows[0]) };
    });
    if (outcome.refused) {
      throw new ConflictException({
        code: 'WORKFORCE_EXPORT_UNRECONCILED',
        message: 'The reported line count or totals differ from the export; the import was not confirmed.',
        expected: outcome.expected,
      });
    }
    return outcome.export;
  }

  private async row(principal: GigaOpsPrincipal, exportId: string): Promise<any> {
    assertUuid(exportId, 'exportId');
    assertTenantWide(principal);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const row = (await client.query(`${EXPORT_SELECT} WHERE e.tenant_id = $1 AND e.id = $2`, [principal.tenantId, exportId])).rows[0];
      if (!row) throw new NotFoundException({ code: 'WORKFORCE_NOT_FOUND', message: 'The export was not found.' });
      return row;
    });
  }
}

async function exportLines(client: PoolClient, tenantId: string, runId: string): Promise<ExportLine[]> {
  const result = await client.query(
    `SELECT l.*, r.reference_code, r.display_name FROM gigalibs_workforce.earning_lines l
       JOIN gigalibs_workforce.workforce_resources r ON r.tenant_id = l.tenant_id AND r.id = l.resource_id
      WHERE l.tenant_id = $1 AND l.run_id = $2 ORDER BY l.line_no`,
    [tenantId, runId],
  );
  return result.rows.map((row) => ({
    lineNo: Number(row.line_no),
    personReference: row.reference_code,
    personName: row.display_name,
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
  }));
}

/** Totals per currency are equal, independent of order and of how JSONB stored the keys. */
function sameTotals(
  left: readonly { readonly currency: string; readonly amountMinor: number }[],
  right: readonly { readonly currency: string; readonly amountMinor: number | string }[],
): boolean {
  const key = (items: readonly { readonly currency: string; readonly amountMinor: number | string }[]) =>
    items.map((item) => `${item.currency}:${Number(item.amountMinor)}`).sort().join('|');
  return left.length === right.length && key(left) === key(right);
}

function assertTenantWide(principal: GigaOpsPrincipal): void {
  if (principal.spatialScope.mode === 'SCOPED_PLACES') {
    throw new ForbiddenException({ code: 'WORKFORCE_PAY_SCOPE', message: 'Pay needs tenant-wide authority.' });
  }
}

function mapExport(row: any): PayExportV1 {
  return {
    id: row.id,
    runId: row.run_id,
    periodStart: row.period_start,
    format: row.format,
    status: row.status,
    lineCount: Number(row.line_count),
    totals: row.totals,
    fileSha256: row.file_sha256,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    targetReference: row.target_reference ?? null,
    acknowledgedBy: row.acknowledged_by ?? null,
    acknowledgedAt: row.acknowledged_at ? iso(row.acknowledged_at) : null,
    version: Number(row.version),
  };
}
