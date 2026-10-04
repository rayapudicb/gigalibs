import { randomUUID } from 'node:crypto';
import {
  type BudgetStructureV1,
  type BudgetRevisionV1,
  type BudgetLineV1,
  type BudgetCommitmentV1,
  type BudgetCheckResultV1,
  type BudgetVarianceLineV1,
  type BudgetVarianceReportV1,
  type CreateBudgetStructureInputV1,
  type CreateBudgetRevisionInputV1,
  type CreateBudgetLineInputV1,
  type CheckBudgetAvailabilityInputV1,
  type RecordCommitmentInputV1,
  type LiquidateCommitmentInputV1,
  type ReleaseCommitmentInputV1,
  type DistributeAnnualBudgetInputV1,
  type BudgetStructureCreatedEventV1,
  type BudgetRevisionActivatedEventV1,
  type CommitmentRecordedEventV1,
  type BudgetThresholdExceededEventV1,
} from '@gigalibs/contracts';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';
import {
  distributeAnnualBudget,
  evaluateSpendAvailability,
  calculateVariance,
  computeRevisionChecksum,
} from './budgeting-engine.js';

@Injectable()
export class BudgetingService {
  constructor(private readonly database: DatabaseService) {}

  private async query<R = Record<string, any>>(
    tenantId: string,
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[] }> {
    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      const res = await client.query(text, values);
      return { rows: res.rows as R[] };
    });
  }

  // ─── 1. Budget Structures ───────────────────────────────────────────────────

  async createBudgetStructure(
    tenantId: string,
    actor: string,
    input: CreateBudgetStructureInputV1,
  ): Promise<BudgetStructureV1> {
    const existing = await this.query(
      tenantId,
      `SELECT id FROM ${SCHEMA}.budget_structures WHERE tenant_id = $1 AND code = $2`,
      [tenantId, input.code],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException(`Budget structure with code ${input.code} already exists.`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    const insertSql = `
      INSERT INTO ${SCHEMA}.budget_structures (
        id, tenant_id, code, name, description, budget_type,
        accounting_book_id, control_action, allow_overspend_threshold_pct,
        is_active, version, created_at, updated_at, created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        true, 1, $10, $11, $12, null
      ) RETURNING *;
    `;

    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      const res = await client.query(insertSql, [
        id,
        tenantId,
        input.code,
        input.name,
        input.description ?? null,
        input.budgetType,
        input.accountingBookId,
        input.controlAction,
        input.allowOverspendThresholdPct ?? 0,
        now,
        now,
        actor,
      ]);

      const event: BudgetStructureCreatedEventV1 = {
        id: randomUUID(),
        specversion: '1.0',
        time: now,
        tenantId,
        type: 'finance.budget.structure.created.v1',
        data: {
          budgetStructureId: id,
          code: input.code,
          budgetType: input.budgetType,
          accountingBookId: input.accountingBookId,
          controlAction: input.controlAction,
        },
      };

      await client.query(
        `INSERT INTO ${SCHEMA}.outbox_events (id, tenant_id, topic, event_type, payload, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
        [event.id, tenantId, TOPIC, event.type, JSON.stringify(event)],
      );

      return this.mapBudgetStructure(res.rows[0]);
    });
  }

  async getBudgetStructure(tenantId: string, id: string): Promise<BudgetStructureV1> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.budget_structures WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Budget structure ${id} not found.`);
    }
    return this.mapBudgetStructure(res.rows[0]);
  }

  async listBudgetStructures(tenantId: string): Promise<BudgetStructureV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.budget_structures WHERE tenant_id = $1 ORDER BY code ASC`,
      [tenantId],
    );
    return res.rows.map((r) => this.mapBudgetStructure(r));
  }

  // ─── 2. Budget Revisions (Maker-Checker Lifecycle) ──────────────────────────

  async createBudgetRevision(
    tenantId: string,
    _actor: string,
    input: CreateBudgetRevisionInputV1,
  ): Promise<BudgetRevisionV1> {
    const structRes = await this.query(
      tenantId,
      `SELECT id FROM ${SCHEMA}.budget_structures WHERE tenant_id = $1 AND id = $2`,
      [tenantId, input.budgetStructureId],
    );
    if (structRes.rows.length === 0) {
      throw new NotFoundException(`Budget structure ${input.budgetStructureId} not found.`);
    }

    const revNumRes = await this.query<{ next_rev: number }>(
      tenantId,
      `SELECT COALESCE(MAX(revision_number), 0) + 1 AS next_rev
       FROM ${SCHEMA}.budget_revisions
       WHERE tenant_id = $1 AND budget_structure_id = $2`,
      [tenantId, input.budgetStructureId],
    );
    const nextRevision = Number(revNumRes.rows[0]?.next_rev ?? 1);

    const id = randomUUID();
    const now = new Date().toISOString();

    const res = await this.query(
      tenantId,
      `INSERT INTO ${SCHEMA}.budget_revisions (
         id, tenant_id, budget_structure_id, revision_number, fiscal_year_id,
         status, total_allocated_minor, notes, version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, 'DRAFT', 0, $6, 1, $7, $8)
       RETURNING *;`,
      [id, tenantId, input.budgetStructureId, nextRevision, input.fiscalYearId, input.notes ?? null, now, now],
    );

    return this.mapBudgetRevision(res.rows[0]);
  }

  async getBudgetRevision(tenantId: string, id: string): Promise<BudgetRevisionV1> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.budget_revisions WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Budget revision ${id} not found.`);
    }
    return this.mapBudgetRevision(res.rows[0]);
  }

  async submitBudgetRevision(tenantId: string, actor: string, id: string): Promise<BudgetRevisionV1> {
    const rev = await this.getBudgetRevision(tenantId, id);
    if (rev.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot submit revision in status ${rev.status}. Must be DRAFT.`);
    }

    const now = new Date().toISOString();
    const res = await this.query(
      tenantId,
      `UPDATE ${SCHEMA}.budget_revisions
       SET status = 'SUBMITTED', submitted_at = $1, submitted_by = $2, updated_at = $3
       WHERE tenant_id = $4 AND id = $5
       RETURNING *;`,
      [now, actor, now, tenantId, id],
    );

    return this.mapBudgetRevision(res.rows[0]);
  }

  async approveBudgetRevision(tenantId: string, actor: string, id: string): Promise<BudgetRevisionV1> {
    const rev = await this.getBudgetRevision(tenantId, id);
    if (rev.status !== 'SUBMITTED') {
      throw new BadRequestException(`Cannot approve revision in status ${rev.status}. Must be SUBMITTED.`);
    }

    // Maker-checker invariant: Approver cannot be the submitter
    if (rev.submittedBy === actor) {
      throw new BadRequestException('Maker-checker violation: revision approver must be different from submitter.');
    }

    const now = new Date().toISOString();
    const res = await this.query(
      tenantId,
      `UPDATE ${SCHEMA}.budget_revisions
       SET status = 'APPROVED', approved_at = $1, approved_by = $2, updated_at = $3
       WHERE tenant_id = $4 AND id = $5
       RETURNING *;`,
      [now, actor, now, tenantId, id],
    );

    return this.mapBudgetRevision(res.rows[0]);
  }

  async activateBudgetRevision(tenantId: string, actor: string, id: string): Promise<BudgetRevisionV1> {
    const rev = await this.getBudgetRevision(tenantId, id);
    if (rev.status !== 'APPROVED') {
      throw new BadRequestException(`Cannot activate revision in status ${rev.status}. Must be APPROVED.`);
    }

    const now = new Date().toISOString();

    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      // Supersede any active revision for the same structure and fiscal year
      await client.query(
        `UPDATE ${SCHEMA}.budget_revisions
         SET status = 'SUPERSEDED', updated_at = $1
         WHERE tenant_id = $2 AND budget_structure_id = $3 AND fiscal_year_id = $4 AND status = 'ACTIVE'`,
        [now, tenantId, rev.budgetStructureId, rev.fiscalYearId],
      );

      // Activate this revision
      const res = await client.query(
        `UPDATE ${SCHEMA}.budget_revisions
         SET status = 'ACTIVE', activated_at = $1, activated_by = $2, updated_at = $3
         WHERE tenant_id = $4 AND id = $5
         RETURNING *;`,
        [now, actor, now, tenantId, id],
      );

      const activatedRev = this.mapBudgetRevision(res.rows[0]);

      const event: BudgetRevisionActivatedEventV1 = {
        id: randomUUID(),
        specversion: '1.0',
        time: now,
        tenantId,
        type: 'finance.budget.revision.activated.v1',
        data: {
          budgetRevisionId: id,
          budgetStructureId: rev.budgetStructureId,
          revisionNumber: rev.revisionNumber,
          totalAllocatedMinor: rev.totalAllocatedMinor,
          activatedBy: actor,
        },
      };

      await client.query(
        `INSERT INTO ${SCHEMA}.outbox_events (id, tenant_id, topic, event_type, payload, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
        [event.id, tenantId, TOPIC, event.type, JSON.stringify(event)],
      );

      return activatedRev;
    });
  }

  async freezeBudgetRevision(tenantId: string, _actor: string, id: string): Promise<BudgetRevisionV1> {
    const rev = await this.getBudgetRevision(tenantId, id);
    if (rev.status !== 'ACTIVE') {
      throw new BadRequestException(`Cannot freeze revision in status ${rev.status}. Must be ACTIVE.`);
    }

    const now = new Date().toISOString();
    const res = await this.query(
      tenantId,
      `UPDATE ${SCHEMA}.budget_revisions
       SET status = 'FROZEN', updated_at = $1
       WHERE tenant_id = $2 AND id = $3
       RETURNING *;`,
      [now, tenantId, id],
    );

    return this.mapBudgetRevision(res.rows[0]);
  }

  // ─── 3. Budget Lines & Distribution ─────────────────────────────────────────

  async createBudgetLine(
    tenantId: string,
    _actor: string,
    input: CreateBudgetLineInputV1,
  ): Promise<BudgetLineV1> {
    const rev = await this.getBudgetRevision(tenantId, input.budgetRevisionId);
    if (['ACTIVE', 'SUPERSEDED', 'FROZEN', 'CLOSED'].includes(rev.status)) {
      throw new BadRequestException(`Cannot add lines to sealed budget revision in status ${rev.status}.`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      // Check if line exists for same revision, period, account, costCenter
      const existingLine = await client.query(
        `SELECT id FROM ${SCHEMA}.budget_lines
         WHERE tenant_id = $1 AND budget_revision_id = $2 AND fiscal_period_id = $3
           AND account_id = $4 AND cost_center_id = $5`,
        [tenantId, input.budgetRevisionId, input.fiscalPeriodId, input.accountId, input.costCenterId],
      );

      let lineRow;
      if (existingLine.rows.length > 0) {
        const updateRes = await client.query(
          `UPDATE ${SCHEMA}.budget_lines
           SET allocated_amount_minor = $1, project_code = $2, updated_at = $3
           WHERE id = $4
           RETURNING *;`,
          [input.allocatedAmountMinor, input.projectCode ?? null, now, existingLine.rows[0].id],
        );
        lineRow = updateRes.rows[0];
      } else {
        const insertRes = await client.query(
          `INSERT INTO ${SCHEMA}.budget_lines (
             id, tenant_id, budget_revision_id, fiscal_period_id, account_id,
             cost_center_id, project_code, allocated_amount_minor, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *;`,
          [
            id,
            tenantId,
            input.budgetRevisionId,
            input.fiscalPeriodId,
            input.accountId,
            input.costCenterId,
            input.projectCode ?? null,
            input.allocatedAmountMinor,
            now,
            now,
          ],
        );
        lineRow = insertRes.rows[0];
      }

      await this.refreshRevisionTotalAndChecksum(client, tenantId, rev);
      return this.mapBudgetLine(lineRow);
    });
  }

  async distributeAnnualBudget(
    tenantId: string,
    _actor: string,
    input: DistributeAnnualBudgetInputV1,
  ): Promise<BudgetLineV1[]> {
    const rev = await this.getBudgetRevision(tenantId, input.budgetRevisionId);
    if (['ACTIVE', 'SUPERSEDED', 'FROZEN', 'CLOSED'].includes(rev.status)) {
      throw new BadRequestException(`Cannot distribute budget onto sealed revision in status ${rev.status}.`);
    }

    const periods = input.fiscalPeriodIds;
    const distributedAmounts = distributeAnnualBudget(
      input.annualAmountMinor,
      periods.length,
      input.distributionMethod,
    );

    const now = new Date().toISOString();

    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      const createdLines: BudgetLineV1[] = [];

      for (let i = 0; i < periods.length; i++) {
        const periodId = periods[i]!;
        const amountMinor = distributedAmounts[i]!;

        const existing = await client.query(
          `SELECT id FROM ${SCHEMA}.budget_lines
           WHERE tenant_id = $1 AND budget_revision_id = $2 AND fiscal_period_id = $3
             AND account_id = $4 AND cost_center_id = $5`,
          [tenantId, input.budgetRevisionId, periodId, input.accountId, input.costCenterId],
        );

        let lineRow;
        if (existing.rows.length > 0) {
          const res = await client.query(
            `UPDATE ${SCHEMA}.budget_lines
             SET allocated_amount_minor = $1, project_code = $2, updated_at = $3
             WHERE id = $4
             RETURNING *;`,
            [amountMinor, input.projectCode ?? null, now, existing.rows[0].id],
          );
          lineRow = res.rows[0];
        } else {
          const lineId = randomUUID();
          const res = await client.query(
            `INSERT INTO ${SCHEMA}.budget_lines (
               id, tenant_id, budget_revision_id, fiscal_period_id, account_id,
               cost_center_id, project_code, allocated_amount_minor, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *;`,
            [
              lineId,
              tenantId,
              input.budgetRevisionId,
              periodId,
              input.accountId,
              input.costCenterId,
              input.projectCode ?? null,
              amountMinor,
              now,
              now,
            ],
          );
          lineRow = res.rows[0];
        }

        createdLines.push(this.mapBudgetLine(lineRow));
      }

      await this.refreshRevisionTotalAndChecksum(client, tenantId, rev);
      return createdLines;
    });
  }

  private async refreshRevisionTotalAndChecksum(
    client: PoolClient,
    tenantId: string,
    rev: BudgetRevisionV1,
  ): Promise<void> {
    const sumRes = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(allocated_amount_minor), 0)::text AS total
       FROM ${SCHEMA}.budget_lines
       WHERE tenant_id = $1 AND budget_revision_id = $2`,
      [tenantId, rev.id],
    );
    const totalAllocated = sumRes.rows[0]?.total ?? '0';

    const allLinesRes = await client.query<{
      fiscal_period_id: string;
      account_id: string;
      cost_center_id: string;
      allocated_amount_minor: string;
    }>(
      `SELECT fiscal_period_id, account_id, cost_center_id, allocated_amount_minor::text
       FROM ${SCHEMA}.budget_lines
       WHERE tenant_id = $1 AND budget_revision_id = $2`,
      [tenantId, rev.id],
    );

    const checksumLines = allLinesRes.rows.map((r) => ({
      fiscalPeriodId: r.fiscal_period_id,
      accountId: r.account_id,
      costCenterId: r.cost_center_id,
      allocatedAmountMinor: r.allocated_amount_minor,
    }));

    const checksum = computeRevisionChecksum(rev.revisionNumber, rev.fiscalYearId, checksumLines);
    const now = new Date().toISOString();

    await client.query(
      `UPDATE ${SCHEMA}.budget_revisions
       SET total_allocated_minor = $1, checksum = $2, updated_at = $3
       WHERE tenant_id = $4 AND id = $5`,
      [totalAllocated, checksum, now, tenantId, rev.id],
    );
  }

  // ─── 4. Pre-Flight Spend Verification Gate ──────────────────────────────────

  async checkBudgetAvailability(
    tenantId: string,
    input: CheckBudgetAvailabilityInputV1,
  ): Promise<BudgetCheckResultV1> {
    // 1. Locate active budget structure for the accounting book
    const structRes = await this.query<{
      id: string;
      control_action: string;
      allow_overspend_threshold_pct: string;
    }>(
      tenantId,
      `SELECT id, control_action, allow_overspend_threshold_pct::text
       FROM ${SCHEMA}.budget_structures
       WHERE tenant_id = $1 AND accounting_book_id = $2 AND is_active = true`,
      [tenantId, input.accountingBookId],
    );

    if (structRes.rows.length === 0) {
      // No budget structure configured: allowed by default
      return {
        isAllowed: true,
        budgetLineId: null,
        allocatedAmountMinor: '0',
        actualAmountMinor: '0',
        encumberedAmountMinor: '0',
        availableAmountMinor: '0',
        requestedAmountMinor: input.requestedAmountMinor,
        resultingAvailableMinor: '0',
        controlAction: 'DISABLED',
        toleranceThresholdPct: 0,
        message: 'No budget structure active for this accounting book.',
      };
    }

    const structure = structRes.rows[0]!;
    const controlAction = structure.control_action as any;
    const tolerancePct = Number(structure.allow_overspend_threshold_pct ?? 0);

    // 2. Locate active revision for this fiscal period
    const revRes = await this.query<{ id: string }>(
      tenantId,
      `SELECT r.id
       FROM ${SCHEMA}.budget_revisions r
       JOIN ${SCHEMA}.fiscal_periods p ON p.fiscal_year_id = r.fiscal_year_id
       WHERE r.tenant_id = $1 AND r.budget_structure_id = $2 AND p.id = $3 AND r.status = 'ACTIVE'`,
      [tenantId, structure.id, input.fiscalPeriodId],
    );

    if (revRes.rows.length === 0) {
      // If control is HARD_STOP, fail-closed!
      if (controlAction === 'HARD_STOP') {
        const requested = BigInt(input.requestedAmountMinor);
        return {
          isAllowed: false,
          budgetLineId: null,
          allocatedAmountMinor: '0',
          actualAmountMinor: '0',
          encumberedAmountMinor: '0',
          availableAmountMinor: '0',
          requestedAmountMinor: input.requestedAmountMinor,
          resultingAvailableMinor: (-requested).toString(),
          controlAction,
          toleranceThresholdPct: tolerancePct,
          message: 'Spend rejected: No active budget revision found for this fiscal period.',
        };
      }
      return {
        isAllowed: true,
        budgetLineId: null,
        allocatedAmountMinor: '0',
        actualAmountMinor: '0',
        encumberedAmountMinor: '0',
        availableAmountMinor: '0',
        requestedAmountMinor: input.requestedAmountMinor,
        resultingAvailableMinor: '0',
        controlAction,
        toleranceThresholdPct: tolerancePct,
        message: 'No active budget revision found; controls not blocking.',
      };
    }

    const revisionId = revRes.rows[0]!.id;

    // 3. Find matching budget line
    const lineRes = await this.query<{ id: string; allocated_amount_minor: string }>(
      tenantId,
      `SELECT id, allocated_amount_minor::text
       FROM ${SCHEMA}.budget_lines
       WHERE tenant_id = $1 AND budget_revision_id = $2 AND fiscal_period_id = $3
         AND account_id = $4 AND cost_center_id = $5`,
      [tenantId, revisionId, input.fiscalPeriodId, input.accountId, input.costCenterId],
    );

    if (lineRes.rows.length === 0) {
      if (controlAction === 'HARD_STOP') {
        const requested = BigInt(input.requestedAmountMinor);
        return {
          isAllowed: false,
          budgetLineId: null,
          allocatedAmountMinor: '0',
          actualAmountMinor: '0',
          encumberedAmountMinor: '0',
          availableAmountMinor: '0',
          requestedAmountMinor: input.requestedAmountMinor,
          resultingAvailableMinor: (-requested).toString(),
          controlAction,
          toleranceThresholdPct: tolerancePct,
          message: 'Spend rejected: No budget line allocated for this account and cost center in this period.',
        };
      }
      return {
        isAllowed: true,
        budgetLineId: null,
        allocatedAmountMinor: '0',
        actualAmountMinor: '0',
        encumberedAmountMinor: '0',
        availableAmountMinor: '0',
        requestedAmountMinor: input.requestedAmountMinor,
        resultingAvailableMinor: '0',
        controlAction,
        toleranceThresholdPct: tolerancePct,
        message: 'No line allocated; controls not blocking.',
      };
    }

    const line = lineRes.rows[0]!;
    const lineId = line.id;
    const allocatedMinor = line.allocated_amount_minor;

    // 4. Query active commitments (encumbrances)
    const encRes = await this.query<{ total: string }>(
      tenantId,
      `SELECT COALESCE(SUM(amount_minor), 0)::text AS total
       FROM ${SCHEMA}.budget_commitments
       WHERE tenant_id = $1 AND budget_line_id = $2
         AND commitment_type IN ('PRE_COMMITMENT', 'ENCUMBRANCE')
         AND status = 'ACTIVE'`,
      [tenantId, lineId],
    );
    const encumberedMinor = encRes.rows[0]?.total ?? '0';

    // 5. Query actual expenses from commitments and GL journal entry debits
    const commitActualRes = await this.query<{ total: string }>(
      tenantId,
      `SELECT COALESCE(SUM(amount_minor), 0)::text AS total
       FROM ${SCHEMA}.budget_commitments
       WHERE tenant_id = $1 AND budget_line_id = $2
         AND commitment_type = 'ACTUAL_CONSUMPTION'
         AND status = 'LIQUIDATED'`,
      [tenantId, lineId],
    );
    const commitActualMinor = BigInt(commitActualRes.rows[0]?.total ?? '0');

    // Also check GL journal entries posted to this account/cost-center in this period
    const glRes = await this.query<{ net_debit: string }>(
      tenantId,
      `SELECT COALESCE(SUM(gjl.base_debit_amount_minor - gjl.base_credit_amount_minor), 0)::text AS net_debit
       FROM ${SCHEMA}.gl_journal_lines gjl
       JOIN ${SCHEMA}.gl_journals gj ON gj.id = gjl.journal_id
       WHERE gj.tenant_id = $1 AND gj.accounting_book_id = $2 AND gj.fiscal_period_id = $3
         AND gjl.account_id = $4 AND (gjl.dimensions->>'costCenterId' = $5 OR gjl.dimensions->>'cost_center_id' = $5) AND gj.status = 'POSTED'`,
      [tenantId, input.accountingBookId, input.fiscalPeriodId, input.accountId, input.costCenterId],
    );
    const glDebitMinor = BigInt(glRes.rows[0]?.net_debit ?? '0');
    // Take the larger of commitActual and glDebit to prevent double counting or omission
    const actualMinor = (commitActualMinor > glDebitMinor ? commitActualMinor : glDebitMinor).toString();

    // 6. Evaluate via deterministic engine
    return evaluateSpendAvailability({
      budgetLineId: lineId,
      allocatedMinorStr: allocatedMinor,
      actualMinorStr: actualMinor,
      encumberedMinorStr: encumberedMinor,
      requestedMinorStr: input.requestedAmountMinor,
      controlAction,
      toleranceThresholdPct: tolerancePct,
    });
  }

  // ─── 5. Commitment Accounting (Encumbrances & Liquidations) ─────────────────

  async recordCommitment(
    tenantId: string,
    actor: string,
    input: RecordCommitmentInputV1,
  ): Promise<BudgetCommitmentV1> {
    const lineRes = await this.query<{
      budget_revision_id: string;
      fiscal_period_id: string;
      account_id: string;
      cost_center_id: string;
      project_code: string | null;
      accounting_book_id: string;
      control_action: string;
      allow_overspend_threshold_pct: string;
    }>(
      tenantId,
      `SELECT bl.budget_revision_id, bl.fiscal_period_id, bl.account_id, bl.cost_center_id, bl.project_code,
              bs.accounting_book_id, bs.control_action, bs.allow_overspend_threshold_pct::text
       FROM ${SCHEMA}.budget_lines bl
       JOIN ${SCHEMA}.budget_revisions br ON br.id = bl.budget_revision_id
       JOIN ${SCHEMA}.budget_structures bs ON bs.id = br.budget_structure_id
       WHERE bl.tenant_id = $1 AND bl.id = $2`,
      [tenantId, input.budgetLineId],
    );

    if (lineRes.rows.length === 0) {
      throw new NotFoundException(`Budget line ${input.budgetLineId} not found.`);
    }

    const line = lineRes.rows[0]!;

    // Perform pre-flight availability check
    const check = await this.checkBudgetAvailability(tenantId, {
      accountingBookId: line.accounting_book_id,
      fiscalPeriodId: line.fiscal_period_id,
      accountId: line.account_id,
      costCenterId: line.cost_center_id,
      projectCode: line.project_code ?? undefined,
      requestedAmountMinor: input.amountMinor,
    });

    if (!check.isAllowed) {
      throw new BadRequestException(check.message);
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `INSERT INTO ${SCHEMA}.budget_commitments (
           id, tenant_id, budget_line_id, source_document_type, source_document_id,
           document_number, commitment_type, amount_minor, status, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, $10)
         RETURNING *;`,
        [
          id,
          tenantId,
          input.budgetLineId,
          input.sourceDocumentType,
          input.sourceDocumentId,
          input.documentNumber,
          input.commitmentType,
          input.amountMinor,
          now,
          now,
        ],
      );

      const commitment = this.mapBudgetCommitment(res.rows[0]);

      // Emit commitment event
      const event: CommitmentRecordedEventV1 = {
        id: randomUUID(),
        specversion: '1.0',
        time: now,
        tenantId,
        type: 'finance.budget.commitment.recorded.v1',
        data: {
          commitmentId: id,
          budgetLineId: input.budgetLineId,
          sourceDocumentType: input.sourceDocumentType,
          documentNumber: input.documentNumber,
          commitmentType: input.commitmentType,
          amountMinor: input.amountMinor,
        },
      };

      await client.query(
        `INSERT INTO ${SCHEMA}.outbox_events (id, tenant_id, topic, event_type, payload, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
        [event.id, tenantId, TOPIC, event.type, JSON.stringify(event)],
      );

      // If spend was allowed but exceeded baseline threshold, emit threshold exceeded event
      if (BigInt(check.resultingAvailableMinor) < 0n) {
        const thresholdEvent: BudgetThresholdExceededEventV1 = {
          id: randomUUID(),
          specversion: '1.0',
          time: now,
          tenantId,
          type: 'finance.budget.threshold.exceeded.v1',
          data: {
            budgetLineId: input.budgetLineId,
            allocatedAmountMinor: check.allocatedAmountMinor,
            totalCommittedMinor: (BigInt(check.actualAmountMinor) + BigInt(check.encumberedAmountMinor)).toString(),
            requestedAmountMinor: input.amountMinor,
            controlAction: check.controlAction,
            attemptedBy: actor,
          },
        };

        await client.query(
          `INSERT INTO ${SCHEMA}.outbox_events (id, tenant_id, topic, event_type, payload, status)
           VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
          [thresholdEvent.id, tenantId, TOPIC, thresholdEvent.type, JSON.stringify(thresholdEvent)],
        );
      }

      return commitment;
    });
  }

  async liquidateCommitment(
    tenantId: string,
    _actor: string,
    input: LiquidateCommitmentInputV1,
  ): Promise<{ original: BudgetCommitmentV1; liquidation: BudgetCommitmentV1 }> {
    const origRes = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.budget_commitments WHERE tenant_id = $1 AND id = $2`,
      [tenantId, input.commitmentId],
    );

    if (origRes.rows.length === 0) {
      throw new NotFoundException(`Budget commitment ${input.commitmentId} not found.`);
    }

    const orig = origRes.rows[0];
    if (orig.status !== 'ACTIVE') {
      throw new BadRequestException(`Cannot liquidate commitment in status ${orig.status}. Must be ACTIVE.`);
    }

    const now = new Date().toISOString();
    const liqId = randomUUID();

    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      // 1. Mark original commitment as LIQUIDATED
      const origUpdate = await client.query(
        `UPDATE ${SCHEMA}.budget_commitments
         SET status = 'LIQUIDATED', updated_at = $1
         WHERE tenant_id = $2 AND id = $3
         RETURNING *;`,
        [now, tenantId, input.commitmentId],
      );

      // 2. Insert ACTUAL_CONSUMPTION commitment representing the AP Bill
      const liqRes = await client.query(
        `INSERT INTO ${SCHEMA}.budget_commitments (
           id, tenant_id, budget_line_id, source_document_type, source_document_id,
           document_number, commitment_type, amount_minor, status, created_at, updated_at
         ) VALUES ($1, $2, $3, 'AP_BILL', $4, $5, 'ACTUAL_CONSUMPTION', $6, 'LIQUIDATED', $7, $8)
         RETURNING *;`,
        [
          liqId,
          tenantId,
          orig.budget_line_id,
          input.apBillId,
          `BILL-${orig.document_number}`,
          input.actualAmountMinor,
          now,
          now,
        ],
      );

      return {
        original: this.mapBudgetCommitment(origUpdate.rows[0]),
        liquidation: this.mapBudgetCommitment(liqRes.rows[0]),
      };
    });
  }

  async releaseCommitment(
    tenantId: string,
    _actor: string,
    input: ReleaseCommitmentInputV1,
  ): Promise<BudgetCommitmentV1> {
    const origRes = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.budget_commitments WHERE tenant_id = $1 AND id = $2`,
      [tenantId, input.commitmentId],
    );

    if (origRes.rows.length === 0) {
      throw new NotFoundException(`Budget commitment ${input.commitmentId} not found.`);
    }

    const orig = origRes.rows[0];
    if (orig.status !== 'ACTIVE') {
      throw new BadRequestException(`Cannot release commitment in status ${orig.status}. Must be ACTIVE.`);
    }

    const now = new Date().toISOString();
    const res = await this.query(
      tenantId,
      `UPDATE ${SCHEMA}.budget_commitments
       SET status = 'CANCELLED', updated_at = $1
       WHERE tenant_id = $2 AND id = $3
       RETURNING *;`,
      [now, tenantId, input.commitmentId],
    );

    return this.mapBudgetCommitment(res.rows[0]);
  }

  // ─── 6. Real-Time Variance Reporting ────────────────────────────────────────

  async getBudgetVarianceReport(
    tenantId: string,
    budgetRevisionId: string,
  ): Promise<BudgetVarianceReportV1> {
    const rev = await this.getBudgetRevision(tenantId, budgetRevisionId);

    const linesRes = await this.query<{
      id: string;
      account_id: string;
      cost_center_id: string;
      fiscal_period_id: string;
      allocated_amount_minor: string;
    }>(
      tenantId,
      `SELECT id, account_id, cost_center_id, fiscal_period_id, allocated_amount_minor::text
       FROM ${SCHEMA}.budget_lines
       WHERE tenant_id = $1 AND budget_revision_id = $2
       ORDER BY fiscal_period_id ASC, cost_center_id ASC`,
      [tenantId, budgetRevisionId],
    );

    let totalAllocatedMinor = 0n;
    let totalEncumberedMinor = 0n;
    let totalActualMinor = 0n;
    const varianceLines: BudgetVarianceLineV1[] = [];

    for (const line of linesRes.rows) {
      const encRes = await this.query<{ total: string }>(
        tenantId,
        `SELECT COALESCE(SUM(amount_minor), 0)::text AS total
         FROM ${SCHEMA}.budget_commitments
         WHERE tenant_id = $1 AND budget_line_id = $2
           AND commitment_type IN ('PRE_COMMITMENT', 'ENCUMBRANCE')
           AND status = 'ACTIVE'`,
        [tenantId, line.id],
      );
      const encMinor = encRes.rows[0]?.total ?? '0';

      const actRes = await this.query<{ total: string }>(
        tenantId,
        `SELECT COALESCE(SUM(amount_minor), 0)::text AS total
         FROM ${SCHEMA}.budget_commitments
         WHERE tenant_id = $1 AND budget_line_id = $2
           AND commitment_type = 'ACTUAL_CONSUMPTION'
           AND status = 'LIQUIDATED'`,
        [tenantId, line.id],
      );
      const actMinor = actRes.rows[0]?.total ?? '0';

      const lineVar = calculateVariance(
        line.id,
        line.account_id,
        line.cost_center_id,
        line.fiscal_period_id,
        line.allocated_amount_minor,
        encMinor,
        actMinor,
      );

      totalAllocatedMinor += BigInt(line.allocated_amount_minor);
      totalEncumberedMinor += BigInt(encMinor);
      totalActualMinor += BigInt(actMinor);

      varianceLines.push(lineVar);
    }

    const totalConsumed = totalActualMinor + totalEncumberedMinor;
    const totalAvailableMinor = totalAllocatedMinor - totalConsumed;
    const netVarianceMinor = totalAllocatedMinor - totalConsumed;

    let overallBurnRatePct = 0;
    if (totalAllocatedMinor > 0n) {
      overallBurnRatePct = Number((totalConsumed * 10000n) / totalAllocatedMinor) / 100;
    } else if (totalConsumed > 0n) {
      overallBurnRatePct = 100;
    }

    return {
      budgetRevisionId: rev.id,
      fiscalYearId: rev.fiscalYearId,
      totalAllocatedMinor: totalAllocatedMinor.toString(),
      totalEncumberedMinor: totalEncumberedMinor.toString(),
      totalActualMinor: totalActualMinor.toString(),
      totalAvailableMinor: totalAvailableMinor.toString(),
      netVarianceMinor: netVarianceMinor.toString(),
      overallBurnRatePct,
      lines: varianceLines,
    };
  }

  // ─── Row Mappers ────────────────────────────────────────────────────────────

  private mapBudgetStructure(row: any): BudgetStructureV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      code: row.code,
      name: row.name,
      description: row.description ?? null,
      budgetType: row.budget_type,
      accountingBookId: row.accounting_book_id,
      controlAction: row.control_action,
      allowOverspendThresholdPct: Number(row.allow_overspend_threshold_pct ?? 0),
      isActive: row.is_active,
      version: row.version,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      createdBy: row.created_by ?? null,
      updatedBy: row.updated_by ?? null,
    };
  }

  private mapBudgetRevision(row: any): BudgetRevisionV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      budgetStructureId: row.budget_structure_id,
      revisionNumber: row.revision_number,
      fiscalYearId: row.fiscal_year_id,
      status: row.status,
      totalAllocatedMinor: row.total_allocated_minor?.toString() ?? '0',
      checksum: row.checksum ?? null,
      notes: row.notes ?? null,
      submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
      submittedBy: row.submitted_by ?? null,
      approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
      approvedBy: row.approved_by ?? null,
      activatedAt: row.activated_at ? new Date(row.activated_at).toISOString() : null,
      activatedBy: row.activated_by ?? null,
      version: row.version,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapBudgetLine(row: any): BudgetLineV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      budgetRevisionId: row.budget_revision_id,
      fiscalPeriodId: row.fiscal_period_id,
      accountId: row.account_id,
      costCenterId: row.cost_center_id,
      projectCode: row.project_code ?? null,
      allocatedAmountMinor: row.allocated_amount_minor?.toString() ?? '0',
      revisedAmountMinor: row.revised_amount_minor?.toString() ?? null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapBudgetCommitment(row: any): BudgetCommitmentV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      budgetLineId: row.budget_line_id,
      sourceDocumentType: row.source_document_type,
      sourceDocumentId: row.source_document_id,
      documentNumber: row.document_number,
      commitmentType: row.commitment_type,
      amountMinor: row.amount_minor?.toString() ?? '0',
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
