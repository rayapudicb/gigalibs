import { randomUUID } from 'node:crypto';
import {
  type PeriodSubledgerLockV1,
  type PeriodCloseChecklistV1,
  type AccrualAmortizationScheduleV1,
  type AccrualAmortizationLineV1,
  type YearEndCloseRunV1,
  type FinancialForecastModelV1,
  type FinancialForecastLineV1,
  type FinancialHealthRatiosV1,
  type StatementDrillThroughItemV1,
  type SetSubledgerLockInputV1,
  type UpdateChecklistTaskInputV1,
  type CreateAccrualAmortizationScheduleInputV1,
  type ExecuteAmortizationLineInputV1,
  type PreviewYearEndCloseInputV1,
  type ExecuteYearEndCloseInputV1,
  type CreateForecastModelInputV1,
  type QueryDrillThroughInputV1,
  type SubledgerType,
  CHECKLIST_TASK_TYPES,
} from '@gigalibs/contracts';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import { appendOutboxEvent } from '../outbox.js';
import { DatabaseService } from '../database.service.js';
import { assertInventoryReceiptPostingReadyForClose } from '../posting/inventory-receipt-posting-close-guard.js';
import {
  distributeAmortization,
  computeYearEndRollover,
  computeRollingForecast,
  computeFinancialHealthRatios,
  type TemporaryAccountBalance,
} from './close-engine.js';

@Injectable()
export class CloseService {
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

  // ─── 1. Subledger Lockouts ───────────────────────────────────────────────────

  async getPeriodSubledgerLocks(
    tenantId: string,
    bookId: string,
    periodId: string,
  ): Promise<PeriodSubledgerLockV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.period_subledger_locks
       WHERE tenant_id = $1 AND accounting_book_id = $2 AND fiscal_period_id = $3
       ORDER BY subledger_type ASC`,
      [tenantId, bookId, periodId],
    );
    return res.rows.map(this.mapSubledgerLock);
  }

  async setSubledgerLock(
    tenantId: string,
    actor: string,
    input: SetSubledgerLockInputV1,
  ): Promise<PeriodSubledgerLockV1> {
    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      // Verify period exists
      const periodRes = await client.query(
        `SELECT id, status FROM ${SCHEMA}.fiscal_periods WHERE tenant_id = $1 AND id = $2`,
        [tenantId, input.fiscalPeriodId],
      );
      if (periodRes.rowCount === 0) {
        throw new NotFoundException(`Fiscal period not found: ${input.fiscalPeriodId}`);
      }

      const isLocking = input.lockStatus === 'HARD_LOCKED' || input.lockStatus === 'SOFT_LOCKED';
      const now = new Date().toISOString();

      if (isLocking && input.subledgerType === 'INVENTORY') {
        await assertInventoryReceiptPostingReadyForClose(client, SCHEMA, tenantId);
      }

      const upsertRes = await client.query(
        `INSERT INTO ${SCHEMA}.period_subledger_locks (
           id, tenant_id, accounting_book_id, fiscal_period_id, subledger_type,
           lock_status, locked_at, locked_by, unlocked_at, unlocked_by, notes, version, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, NOW()
         )
         ON CONFLICT (tenant_id, accounting_book_id, fiscal_period_id, subledger_type)
         DO UPDATE SET
           lock_status = EXCLUDED.lock_status,
           locked_at = CASE WHEN EXCLUDED.lock_status IN ('HARD_LOCKED', 'SOFT_LOCKED') THEN EXCLUDED.locked_at ELSE period_subledger_locks.locked_at END,
           locked_by = CASE WHEN EXCLUDED.lock_status IN ('HARD_LOCKED', 'SOFT_LOCKED') THEN EXCLUDED.locked_by ELSE period_subledger_locks.locked_by END,
           unlocked_at = CASE WHEN EXCLUDED.lock_status = 'OPEN' THEN NOW() ELSE NULL END,
           unlocked_by = CASE WHEN EXCLUDED.lock_status = 'OPEN' THEN $12 ELSE NULL END,
           notes = EXCLUDED.notes,
           version = period_subledger_locks.version + 1,
           updated_at = NOW()
         RETURNING *`,
        [
          randomUUID(),
          tenantId,
          input.accountingBookId,
          input.fiscalPeriodId,
          input.subledgerType,
          input.lockStatus,
          isLocking ? now : null,
          isLocking ? actor : null,
          !isLocking ? now : null,
          !isLocking ? actor : null,
          input.notes || null,
          actor,
        ],
      );

      const lockRow = upsertRes.rows[0];

      // Emit outbox event
      await appendOutboxEvent(client, tenantId, {
        id: randomUUID(),
        type: 'finance.subledger_lock.updated.v1',
        aggregateType: 'subledger_lock',
        aggregateId: String(lockRow.id),
        data: {
            type: 'finance.subledger_lock.updated.v1',
            data: {
              lockId: lockRow.id,
              accountingBookId: lockRow.accounting_book_id,
              fiscalPeriodId: lockRow.fiscal_period_id,
              subledgerType: lockRow.subledger_type,
              lockStatus: lockRow.lock_status,
              lockedBy: lockRow.locked_by,
            },
          },
      });

      return this.mapSubledgerLock(lockRow);
    });
  }

  async verifySubledgerOpen(
    tenantId: string,
    bookId: string,
    periodId: string,
    subledger: SubledgerType,
  ): Promise<void> {
    const res = await this.query(
      tenantId,
      `SELECT lock_status FROM ${SCHEMA}.period_subledger_locks
       WHERE tenant_id = $1 AND accounting_book_id = $2 AND fiscal_period_id = $3 AND subledger_type = $4`,
      [tenantId, bookId, periodId, subledger],
    );
    if (res.rows.length > 0 && res.rows[0].lock_status === 'HARD_LOCKED') {
      throw new ConflictException(
        `Posting rejected: Subledger ${subledger} is HARD_LOCKED for period ${periodId}`,
      );
    }
  }

  // ─── 2. Period Close Checklists ──────────────────────────────────────────────

  async getPeriodChecklist(
    tenantId: string,
    bookId: string,
    periodId: string,
  ): Promise<PeriodCloseChecklistV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.period_close_checklists
       WHERE tenant_id = $1 AND accounting_book_id = $2 AND fiscal_period_id = $3
       ORDER BY sequence_order ASC`,
      [tenantId, bookId, periodId],
    );
    if (res.rows.length === 0) {
      // Auto-initialize standard close checklist
      return this.initializePeriodChecklist(tenantId, bookId, periodId);
    }
    return res.rows.map(this.mapChecklistTask);
  }

  async initializePeriodChecklist(
    tenantId: string,
    bookId: string,
    periodId: string,
  ): Promise<PeriodCloseChecklistV1[]> {
    const defaultTasks = [
      { type: 'BANK_RECONCILIATION', name: 'Reconcile all Bank & Treasury Accounts', seq: 1 },
      { type: 'INVENTORY_VALUATION', name: 'Finalize Inventory Costing & Landed Cost', seq: 2 },
      { type: 'DEPRECIATION_RUN', name: 'Execute Fixed Asset Depreciation Run', seq: 3 },
      { type: 'ACCRUAL_AMORTIZATION', name: 'Post Recurring Accruals & Deferrals', seq: 4 },
      { type: 'INTERCOMPANY_ELIMINATION', name: 'Match & Eliminate Intercompany Balances', seq: 5 },
      { type: 'TAX_CALCULATION', name: 'Reconcile Sales & Withholding Tax Balances', seq: 6 },
      { type: 'TRIAL_BALANCE_VERIFICATION', name: 'Verify Balanced Trial Balance', seq: 7 },
      { type: 'MAKER_CHECKER_APPROVAL', name: 'Controller & CFO Close Sign-off', seq: 8 },
    ];

    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      const created: PeriodCloseChecklistV1[] = [];
      for (const t of defaultTasks) {
        const res = await client.query(
          `INSERT INTO ${SCHEMA}.period_close_checklists (
             id, tenant_id, accounting_book_id, fiscal_period_id, task_type,
             task_name, task_status, sequence_order, version, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, 1, NOW(), NOW())
           ON CONFLICT (tenant_id, accounting_book_id, fiscal_period_id, task_type)
           DO UPDATE SET task_name = EXCLUDED.task_name
           RETURNING *`,
          [randomUUID(), tenantId, bookId, periodId, t.type, t.name, t.seq],
        );
        created.push(this.mapChecklistTask(res.rows[0]));
      }
      return created;
    });
  }

  async updateChecklistTask(
    tenantId: string,
    actor: string,
    input: UpdateChecklistTaskInputV1,
  ): Promise<PeriodCloseChecklistV1> {
    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      const taskRes = await client.query(
        `SELECT * FROM ${SCHEMA}.period_close_checklists WHERE tenant_id = $1 AND id = $2`,
        [tenantId, input.taskId],
      );
      if (taskRes.rowCount === 0) {
        throw new NotFoundException(`Checklist task not found: ${input.taskId}`);
      }

      const isCompleted = input.taskStatus === 'COMPLETED';

      const updateRes = await client.query(
        `UPDATE ${SCHEMA}.period_close_checklists
         SET task_status = $1,
             completed_at = CASE WHEN $1 = 'COMPLETED' THEN NOW() ELSE NULL END,
             completed_by = CASE WHEN $1 = 'COMPLETED' THEN $2 ELSE NULL END,
             notes = COALESCE($3, notes),
             evidence_ref = COALESCE($4, evidence_ref),
             version = version + 1,
             updated_at = NOW()
         WHERE tenant_id = $5 AND id = $6
         RETURNING *`,
        [
          input.taskStatus,
          isCompleted ? actor : null,
          input.notes || null,
          input.evidenceRef || null,
          tenantId,
          input.taskId,
        ],
      );

      const updated = updateRes.rows[0];

      // Emit outbox event
      await appendOutboxEvent(client, tenantId, {
        id: randomUUID(),
        type: 'finance.close_checklist.updated.v1',
        aggregateType: 'close_task',
        aggregateId: String(updated.id),
        data: {
            type: 'finance.close_checklist.updated.v1',
            data: {
              taskId: updated.id,
              fiscalPeriodId: updated.fiscal_period_id,
              taskType: updated.task_type,
              taskStatus: updated.task_status,
              completedBy: updated.completed_by,
            },
          },
      });

      return this.mapChecklistTask(updated);
    });
  }

  // ─── 3. Accrual & Deferral Amortization Engine ──────────────────────────────

  async createAccrualAmortizationSchedule(
    tenantId: string,
    actor: string,
    input: CreateAccrualAmortizationScheduleInputV1,
  ): Promise<{ schedule: AccrualAmortizationScheduleV1; lines: AccrualAmortizationLineV1[] }> {
    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      // Generate schedule number
      const countRes = await client.query(
        `SELECT COUNT(*) FROM ${SCHEMA}.accrual_amortization_schedules WHERE tenant_id = $1`,
        [tenantId],
      );
      const seq = Number(countRes.rows[0].count) + 1;
      const scheduleNumber = `SCH-${input.amortizationType.slice(0, 3)}-${String(seq).padStart(4, '0')}`;

      // Distribute exact cents across periods
      const distribution = distributeAmortization(input.totalAmountMinor, input.periodsCount);

      // Fetch starting period and subsequent periods
      const periodsRes = await client.query(
        `SELECT id, period_number, start_date, end_date FROM ${SCHEMA}.fiscal_periods
         WHERE tenant_id = $1 AND accounting_book_id = $2
         ORDER BY period_number ASC`,
        [tenantId, input.accountingBookId],
      );
      const periods = periodsRes.rows;
      if (periods.length === 0) {
        throw new BadRequestException('No fiscal periods found for accounting book');
      }

      const startIndex = periods.findIndex((p: any) => p.id === input.startPeriodId);
      const startP = startIndex >= 0 ? startIndex : 0;

      const scheduleId = randomUUID();

      const schedRes = await client.query(
        `INSERT INTO ${SCHEMA}.accrual_amortization_schedules (
           id, tenant_id, accounting_book_id, schedule_number, schedule_name,
           amortization_type, source_document_type, source_document_ref,
           total_amount_minor, recognized_amount_minor, remaining_amount_minor,
           currency_code, expense_account_id, balance_sheet_account_id,
           start_period_id, end_period_id, periods_count, status, auto_reversal,
           notes, version, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $9, $10, $11, $12, $13, $14, $15,
           'ACTIVE', $16, $17, 1, NOW(), NOW()
         ) RETURNING *`,
        [
          scheduleId,
          tenantId,
          input.accountingBookId,
          scheduleNumber,
          input.scheduleName,
          input.amortizationType,
          input.sourceDocumentType || null,
          input.sourceDocumentRef || null,
          input.totalAmountMinor,
          input.currencyCode,
          input.expenseAccountId,
          input.balanceSheetAccountId,
          input.startPeriodId,
          periods[Math.min(startP + input.periodsCount - 1, periods.length - 1)]?.id || null,
          input.periodsCount,
          input.autoReversal || false,
          input.notes || null,
        ],
      );

      const createdLines: AccrualAmortizationLineV1[] = [];
      for (let i = 0; i < input.periodsCount; i++) {
        const period = periods[(startP + i) % periods.length];
        const lineRes = await client.query(
          `INSERT INTO ${SCHEMA}.accrual_amortization_lines (
             id, tenant_id, schedule_id, period_number, fiscal_period_id,
             scheduled_date, amount_minor, status, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, 'PENDING', NOW(), NOW()
           ) RETURNING *`,
          [
            randomUUID(),
            tenantId,
            scheduleId,
            i + 1,
            period.id,
            period.end_date,
            distribution[i],
          ],
        );
        createdLines.push(this.mapAmortizationLine(lineRes.rows[0]));
      }

      // Emit outbox event
      await appendOutboxEvent(client, tenantId, {
        id: randomUUID(),
        type: 'finance.amortization_schedule.created.v1',
        aggregateType: 'amortization_schedule',
        aggregateId: String(scheduleId),
        data: {
            type: 'finance.amortization_schedule.created.v1',
            data: {
              scheduleId,
              scheduleNumber,
              amortizationType: input.amortizationType,
              totalAmountMinor: input.totalAmountMinor,
              periodsCount: input.periodsCount,
            },
          },
      });

      return {
        schedule: this.mapAmortizationSchedule(schedRes.rows[0]),
        lines: createdLines,
      };
    });
  }

  async getAmortizationSchedules(
    tenantId: string,
    bookId: string,
  ): Promise<AccrualAmortizationScheduleV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.accrual_amortization_schedules
       WHERE tenant_id = $1 AND accounting_book_id = $2
       ORDER BY created_at DESC`,
      [tenantId, bookId],
    );
    return res.rows.map(this.mapAmortizationSchedule);
  }

  async getAmortizationLines(
    tenantId: string,
    scheduleId: string,
  ): Promise<AccrualAmortizationLineV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.accrual_amortization_lines
       WHERE tenant_id = $1 AND schedule_id = $2
       ORDER BY period_number ASC`,
      [tenantId, scheduleId],
    );
    return res.rows.map(this.mapAmortizationLine);
  }

  async executeAmortizationLine(
    tenantId: string,
    actor: string,
    input: ExecuteAmortizationLineInputV1,
  ): Promise<AccrualAmortizationLineV1> {
    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      // 1. Fetch line and schedule
      const lineRes = await client.query(
        `SELECT l.*, s.accounting_book_id, s.amortization_type, s.currency_code,
                s.expense_account_id, s.balance_sheet_account_id, s.auto_reversal, s.schedule_number
         FROM ${SCHEMA}.accrual_amortization_lines l
         JOIN ${SCHEMA}.accrual_amortization_schedules s ON s.id = l.schedule_id
         WHERE l.tenant_id = $1 AND l.id = $2 FOR UPDATE`,
        [tenantId, input.lineId],
      );
      if (lineRes.rowCount === 0) {
        throw new NotFoundException(`Amortization line not found: ${input.lineId}`);
      }

      const line = lineRes.rows[0];
      if (line.status === 'POSTED') {
        throw new ConflictException(`Amortization line ${line.id} has already been posted`);
      }

      // Check subledger lockout for GL
      await this.verifySubledgerOpen(tenantId, line.accounting_book_id, line.fiscal_period_id, 'GL');

      const journalId = randomUUID();
      const journalNumber = `JV-AMORT-${line.schedule_number}-${line.period_number}`;
      const postingDate = input.postingDate || line.scheduled_date;

      // 2. Generate balanced Journal Voucher
      // For EXPENSE_ACCRUAL: Dr Expense, Cr Accrued Liability
      // For PREPAYMENT_AMORTIZATION: Dr Operating Expense, Cr Prepaid Asset
      // For DEFERRED_REVENUE_AMORTIZATION: Dr Deferred Revenue Liability, Cr Earned Revenue
      await client.query(
        `INSERT INTO ${SCHEMA}.gl_journals (
           id, tenant_id, journal_number, accounting_book_id, fiscal_period_id,
           posting_date, entry_type, source_document_type, source_document_id, description,
           status, total_debit_minor, total_credit_minor, posted_by, posted_at, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, 'STANDARD_MANUAL', 'AMORTIZATION_SCHEDULE', $7, $8,
           'POSTED', $9, $9, $10, NOW(), NOW(), NOW()
         )`,
        [
          journalId,
          tenantId,
          journalNumber,
          line.accounting_book_id,
          line.fiscal_period_id,
          postingDate,
          line.schedule_number,
          `Amortization ${line.amortization_type} Period ${line.period_number}`,
          line.amount_minor,
          actor,
        ],
      );

      // Debit Line
      const isDeferredRev = line.amortization_type === 'DEFERRED_REVENUE_AMORTIZATION';
      const drAccountId = isDeferredRev ? line.balance_sheet_account_id : line.expense_account_id;
      const crAccountId = isDeferredRev ? line.expense_account_id : line.balance_sheet_account_id;

      await client.query(
        `INSERT INTO ${SCHEMA}.gl_journal_lines (
           id, tenant_id, journal_id, line_number, account_id,
           debit_amount_minor, credit_amount_minor, currency_code, exchange_rate,
           base_debit_amount_minor, base_credit_amount_minor, memo, created_at
         ) VALUES ($1, $2, $3, 1, $4, $5, 0, $6, 1.000000, $5, 0, 'Amortization Debit', NOW())`,
        [randomUUID(), tenantId, journalId, drAccountId, line.amount_minor, line.currency_code],
      );

      // Credit Line
      await client.query(
        `INSERT INTO ${SCHEMA}.gl_journal_lines (
           id, tenant_id, journal_id, line_number, account_id,
           debit_amount_minor, credit_amount_minor, currency_code, exchange_rate,
           base_debit_amount_minor, base_credit_amount_minor, memo, created_at
         ) VALUES ($1, $2, $3, 2, $4, 0, $5, $6, 1.000000, 0, $5, 'Amortization Credit', NOW())`,
        [randomUUID(), tenantId, journalId, crAccountId, line.amount_minor, line.currency_code],
      );

      let autoReversalJournalId: string | null = null;

      // 3. Auto-reversal logic for EXPENSE_ACCRUAL
      if (line.auto_reversal && line.amortization_type === 'EXPENSE_ACCRUAL') {
        autoReversalJournalId = randomUUID();
        const reversalNumber = `JV-REV-${journalNumber}`;
        await client.query(
          `INSERT INTO ${SCHEMA}.gl_journals (
             id, tenant_id, journal_number, accounting_book_id, fiscal_period_id,
             posting_date, entry_type, source_document_type, source_document_id, description,
             status, total_debit_minor, total_credit_minor, reversed_journal_id, posted_by, posted_at, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, 'REVERSAL', 'AMORTIZATION_REVERSAL', $7, $8,
             'POSTED', $9, $9, $10, $11, NOW(), NOW(), NOW()
           )`,
          [
            autoReversalJournalId,
            tenantId,
            reversalNumber,
            line.accounting_book_id,
            line.fiscal_period_id,
            postingDate,
            journalNumber,
            `Auto-reversal of Accrual ${journalNumber}`,
            line.amount_minor,
            journalId,
            actor,
          ],
        );

        // Reversed Lines (Cr drAccount, Dr crAccount)
        await client.query(
          `INSERT INTO ${SCHEMA}.gl_journal_lines (
             id, tenant_id, journal_id, line_number, account_id,
             debit_amount_minor, credit_amount_minor, currency_code, exchange_rate,
             base_debit_amount_minor, base_credit_amount_minor, memo, created_at
           ) VALUES ($1, $2, $3, 1, $4, $5, 0, $6, 1.000000, $5, 0, 'Auto-reversal Debit', NOW())`,
          [randomUUID(), tenantId, autoReversalJournalId, crAccountId, line.amount_minor, line.currency_code],
        );
        await client.query(
          `INSERT INTO ${SCHEMA}.gl_journal_lines (
             id, tenant_id, journal_id, line_number, account_id,
             debit_amount_minor, credit_amount_minor, currency_code, exchange_rate,
             base_debit_amount_minor, base_credit_amount_minor, memo, created_at
           ) VALUES ($1, $2, $3, 2, $4, 0, $5, $6, 1.000000, 0, $5, 'Auto-reversal Credit', NOW())`,
          [randomUUID(), tenantId, autoReversalJournalId, drAccountId, line.amount_minor, line.currency_code],
        );
      }

      // 4. Update amortization line
      const updatedLineRes = await client.query(
        `UPDATE ${SCHEMA}.accrual_amortization_lines
         SET status = 'POSTED',
             gl_journal_id = $1,
             auto_reversal_journal_id = $2,
             posted_at = NOW(),
             posted_by = $3,
             updated_at = NOW()
         WHERE tenant_id = $4 AND id = $5
         RETURNING *`,
        [journalId, autoReversalJournalId, actor, tenantId, line.id],
      );

      // 5. Update schedule recognized and remaining balances
      await client.query(
        `UPDATE ${SCHEMA}.accrual_amortization_schedules
         SET recognized_amount_minor = recognized_amount_minor + $1,
             remaining_amount_minor = remaining_amount_minor - $1,
             status = CASE WHEN remaining_amount_minor - $1 = 0 THEN 'COMPLETED' ELSE 'ACTIVE' END,
             version = version + 1,
             updated_at = NOW()
         WHERE tenant_id = $2 AND id = $3`,
        [line.amount_minor, tenantId, line.schedule_id],
      );

      // 6. Emit event
      await appendOutboxEvent(client, tenantId, {
        id: randomUUID(),
        type: 'finance.amortization_line.posted.v1',
        aggregateType: 'amortization_line',
        aggregateId: String(line.id),
        data: {
            type: 'finance.amortization_line.posted.v1',
            data: {
              lineId: line.id,
              scheduleId: line.schedule_id,
              glJournalId: journalId,
              amountMinor: line.amount_minor,
            },
          },
      });

      return this.mapAmortizationLine(updatedLineRes.rows[0]);
    });
  }

  // ─── 4. Year-End Close & Retained Earnings Rollover Engine ───────────────────

  async previewYearEndClose(
    tenantId: string,
    input: PreviewYearEndCloseInputV1,
  ): Promise<any> {
    const tempAccounts = await this.fetchTemporaryAccountBalances(
      tenantId,
      input.accountingBookId,
      input.fiscalYearId,
    );
    const rollover = computeYearEndRollover(tempAccounts, input.retainedEarningsAccountId);
    return {
      accountingBookId: input.accountingBookId,
      fiscalYearId: input.fiscalYearId,
      retainedEarningsAccountId: input.retainedEarningsAccountId,
      totalRevenueMinor: rollover.totalRevenueMinor,
      totalExpenseMinor: rollover.totalExpenseMinor,
      netIncomeMinor: rollover.netIncomeMinor,
      temporaryAccountsCount: tempAccounts.length,
      zeroingLinesCount: rollover.zeroingLines.length,
      zeroingLines: rollover.zeroingLines,
    };
  }

  async executeYearEndClose(
    tenantId: string,
    actor: string,
    input: ExecuteYearEndCloseInputV1,
  ): Promise<YearEndCloseRunV1> {
    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      await assertInventoryReceiptPostingReadyForClose(client, SCHEMA, tenantId);

      // 1. Fetch book currency
      const bookRes = await client.query(
        `SELECT currency_code FROM ${SCHEMA}.accounting_books WHERE tenant_id = $1 AND id = $2`,
        [tenantId, input.accountingBookId],
      );
      if (bookRes.rowCount === 0) {
        throw new NotFoundException(`Accounting book not found: ${input.accountingBookId}`);
      }
      const currencyCode = bookRes.rows[0].currency_code;

      // 2. Fetch temporary accounts
      const tempAccounts = await this.fetchTemporaryAccountBalances(
        tenantId,
        input.accountingBookId,
        input.fiscalYearId,
        client,
      );

      // 3. Compute zeroing lines & net income
      const rollover = computeYearEndRollover(tempAccounts, input.retainedEarningsAccountId);

      // 4. Create Closing Journal Voucher
      const journalId = randomUUID();
      const journalNumber = `JV-YEC-${new Date().getFullYear()}-${randomUUID().slice(0, 6)}`;

      // Calculate total voucher value (sum of all debits)
      const totalVoucherMinor = rollover.zeroingLines.reduce(
        (acc, l) => acc + BigInt(l.debitAmountMinor),
        0n,
      );

      // Fetch the last period of the fiscal year for voucher binding
      const periodRes = await client.query(
        `SELECT id, end_date FROM ${SCHEMA}.fiscal_periods
         WHERE tenant_id = $1 AND fiscal_year_id = $2
         ORDER BY period_number DESC LIMIT 1`,
        [tenantId, input.fiscalYearId],
      );
      const lastPeriodId = periodRes.rows[0]?.id;
      const closingDate = periodRes.rows[0]?.end_date || new Date().toISOString().slice(0, 10);

      await client.query(
        `INSERT INTO ${SCHEMA}.gl_journals (
           id, tenant_id, journal_number, accounting_book_id, fiscal_period_id,
           posting_date, entry_type, source_document_type, source_document_id, description,
           status, total_debit_minor, total_credit_minor, posted_by, posted_at, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, 'YEAR_END_CLOSE', 'YEAR_END_CLOSE_RUN', 'YEC-RUN',
           'Year-End Close & Retained Earnings Rollover',
           'POSTED', $7, $7, $8, NOW(), NOW(), NOW()
         )`,
        [
          journalId,
          tenantId,
          journalNumber,
          input.accountingBookId,
          lastPeriodId,
          closingDate,
          totalVoucherMinor.toString(),
          actor,
        ],
      );

      // Insert zeroing journal lines
      let lineNum = 1;
      for (const line of rollover.zeroingLines) {
        await client.query(
          `INSERT INTO ${SCHEMA}.gl_journal_lines (
             id, tenant_id, journal_id, line_number, account_id,
             debit_amount_minor, credit_amount_minor, currency_code, exchange_rate,
             base_debit_amount_minor, base_credit_amount_minor, memo, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1.000000, $6, $7, $9, NOW())`,
          [
            randomUUID(),
            tenantId,
            journalId,
            lineNum++,
            line.accountId,
            line.debitAmountMinor,
            line.creditAmountMinor,
            currencyCode,
            line.description,
          ],
        );
      }

      // 5. Insert Year-End Close Run
      const runId = randomUUID();
      const runRes = await client.query(
        `INSERT INTO ${SCHEMA}.year_end_close_runs (
           id, tenant_id, accounting_book_id, fiscal_year_id, retained_earnings_account_id,
           total_revenue_minor, total_expense_minor, net_income_minor, currency_code,
           closing_journal_id, status, preview_summary, closed_at, closed_by, notes,
           version, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'POSTED', $11, NOW(), $12, $13,
           1, NOW(), NOW()
         ) RETURNING *`,
        [
          runId,
          tenantId,
          input.accountingBookId,
          input.fiscalYearId,
          input.retainedEarningsAccountId,
          rollover.totalRevenueMinor,
          rollover.totalExpenseMinor,
          rollover.netIncomeMinor,
          currencyCode,
          journalId,
          JSON.stringify({ zeroingLinesCount: rollover.zeroingLines.length }),
          actor,
          input.notes || null,
        ],
      );

      // 6. Lock all fiscal periods in fiscal year and set fiscal year to LOCKED
      await client.query(
        `UPDATE ${SCHEMA}.fiscal_periods SET status = 'LOCKED', updated_at = NOW()
         WHERE tenant_id = $1 AND fiscal_year_id = $2`,
        [tenantId, input.fiscalYearId],
      );
      await client.query(
        `UPDATE ${SCHEMA}.fiscal_years SET status = 'LOCKED', updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, input.fiscalYearId],
      );

      // 7. Emit outbox event
      await appendOutboxEvent(client, tenantId, {
        id: randomUUID(),
        type: 'finance.year_end_close.executed.v1',
        aggregateType: 'year_end_close_run',
        aggregateId: String(runId),
        data: {
            type: 'finance.year_end_close.executed.v1',
            data: {
              runId,
              fiscalYearId: input.fiscalYearId,
              netIncomeMinor: rollover.netIncomeMinor,
              closingJournalId: journalId,
            },
          },
      });

      return this.mapYearEndCloseRun(runRes.rows[0]);
    });
  }

  private async fetchTemporaryAccountBalances(
    tenantId: string,
    bookId: string,
    fiscalYearId: string,
    client?: PoolClient,
  ): Promise<TemporaryAccountBalance[]> {
    const q = client ? (text: string, vals: any[]) => client.query(text, vals) : (text: string, vals: any[]) => this.query(tenantId, text, vals);
    const res = await q(
      `SELECT a.id as account_id, a.account_code as account_code, a.account_name as account_name, a.account_class as account_type,
              COALESCE(SUM(jl.debit_amount_minor), 0) as debit_minor,
              COALESCE(SUM(jl.credit_amount_minor), 0) as credit_minor
       FROM ${SCHEMA}.chart_of_accounts a
       JOIN ${SCHEMA}.gl_journal_lines jl ON jl.account_id = a.id
       JOIN ${SCHEMA}.gl_journals j ON j.id = jl.journal_id
       JOIN ${SCHEMA}.fiscal_periods p ON p.id = j.fiscal_period_id
       WHERE a.tenant_id = $1 AND a.accounting_book_id = $2
         AND p.fiscal_year_id = $3
         AND a.account_class IN ('REVENUE', 'EXPENSE')
         AND j.status = 'POSTED'
         AND j.entry_type != 'YEAR_END_CLOSE'
       GROUP BY a.id, a.account_code, a.account_name, a.account_class`,
      [tenantId, bookId, fiscalYearId],
    );
    return res.rows.map((r: any) => ({
      accountId: r.account_id,
      accountCode: r.account_code,
      accountName: r.account_name,
      accountType: r.account_type,
      debitMinor: String(r.debit_minor || '0'),
      creditMinor: String(r.credit_minor || '0'),
    }));
  }

  // ─── 5. Multi-Period Financial Forecasting ──────────────────────────────────

  async createForecastModel(
    tenantId: string,
    _actor: string,
    input: CreateForecastModelInputV1,
  ): Promise<FinancialForecastModelV1> {
    const res = await this.query(
      tenantId,
      `INSERT INTO ${SCHEMA}.financial_forecast_models (
         id, tenant_id, accounting_book_id, model_name, forecast_method,
         base_periods_count, growth_rate_bps, inflation_rate_bps,
         forecast_horizon_periods, include_commitments, notes, version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, NOW(), NOW())
       RETURNING *`,
      [
        randomUUID(),
        tenantId,
        input.accountingBookId,
        input.modelName,
        input.forecastMethod,
        input.basePeriodsCount || 3,
        input.growthRateBps || 0,
        input.inflationRateBps || 0,
        input.forecastHorizonPeriods || 12,
        input.includeCommitments ?? true,
        input.notes || null,
      ],
    );
    return this.mapForecastModel(res.rows[0]);
  }

  async getForecastModels(
    tenantId: string,
    bookId: string,
  ): Promise<FinancialForecastModelV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.financial_forecast_models
       WHERE tenant_id = $1 AND accounting_book_id = $2
       ORDER BY created_at DESC`,
      [tenantId, bookId],
    );
    return res.rows.map(this.mapForecastModel);
  }

  async generateForecast(
    tenantId: string,
    modelId: string,
  ): Promise<FinancialForecastLineV1[]> {
    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      // 1. Fetch model
      const modelRes = await client.query(
        `SELECT m.*, b.currency_code
         FROM ${SCHEMA}.financial_forecast_models m
         JOIN ${SCHEMA}.accounting_books b ON b.id = m.accounting_book_id
         WHERE m.tenant_id = $1 AND m.id = $2`,
        [tenantId, modelId],
      );
      if (modelRes.rowCount === 0) {
        throw new NotFoundException(`Forecast model not found: ${modelId}`);
      }
      const model = modelRes.rows[0];

      // 2. Clear previous lines
      await client.query(
        `DELETE FROM ${SCHEMA}.financial_forecast_lines WHERE tenant_id = $1 AND model_id = $2`,
        [tenantId, modelId],
      );

      // 3. Query historical actuals per period
      const actualsRes = await client.query(
        `SELECT p.id as period_id, p.period_number,
                COALESCE(SUM(jl.debit_amount_minor), 0) as total_debit
         FROM ${SCHEMA}.fiscal_periods p
         LEFT JOIN ${SCHEMA}.gl_journals j ON j.fiscal_period_id = p.id AND j.status = 'POSTED'
         LEFT JOIN ${SCHEMA}.gl_journal_lines jl ON jl.journal_id = j.id
         WHERE p.tenant_id = $1 AND p.accounting_book_id = $2
         GROUP BY p.id, p.period_number
         ORDER BY p.period_number ASC
         LIMIT $3`,
        [tenantId, model.accounting_book_id, model.base_periods_count],
      );

      const actuals = actualsRes.rows.map((r: any) => String(r.total_debit || '0'));

      // 4. Query active budget commitments if enabled
      let activeCommitmentsMinor = '0';
      if (model.include_commitments) {
        const commRes = await client.query(
          `SELECT COALESCE(SUM(remaining_amount_minor), 0) as total_comm
           FROM ${SCHEMA}.budget_commitments
           WHERE tenant_id = $1 AND status = 'ACTIVE'`,
          [tenantId],
        );
        activeCommitmentsMinor = String(commRes.rows[0]?.total_comm || '0');
      }

      // 5. Compute rolling forecast
      const projections = computeRollingForecast({
        historicalActualsMinor: actuals.length > 0 ? actuals : ['1000000'],
        horizonPeriods: model.forecast_horizon_periods,
        method: model.forecast_method,
        growthRateBps: model.growth_rate_bps,
        inflationRateBps: model.inflation_rate_bps,
        activeCommitmentMinor: activeCommitmentsMinor,
      });

      // 6. Insert lines
      const createdLines: FinancialForecastLineV1[] = [];
      for (const p of projections) {
        const lineRes = await client.query(
          `INSERT INTO ${SCHEMA}.financial_forecast_lines (
             id, tenant_id, model_id, projection_period_index,
             baseline_amount_minor, forecast_amount_minor, encumbrance_adjusted_amount_minor,
             confidence_low_minor, confidence_high_minor, currency_code, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
           RETURNING *`,
          [
            randomUUID(),
            tenantId,
            modelId,
            p.projectionPeriodIndex,
            p.baselineMinor,
            p.forecastMinor,
            p.encumbranceAdjustedMinor,
            p.confidenceLowMinor,
            p.confidenceHighMinor,
            model.currency_code,
          ],
        );
        createdLines.push(this.mapForecastLine(lineRes.rows[0]));
      }

      return createdLines;
    });
  }

  async getForecastLines(
    tenantId: string,
    modelId: string,
  ): Promise<FinancialForecastLineV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.financial_forecast_lines
       WHERE tenant_id = $1 AND model_id = $2
       ORDER BY projection_period_index ASC`,
      [tenantId, modelId],
    );
    return res.rows.map(this.mapForecastLine);
  }

  // ─── 6. Financial Health & Statement Drill-Through ─────────────────────────

  async computeFinancialHealth(
    tenantId: string,
    bookId: string,
    periodId: string,
  ): Promise<FinancialHealthRatiosV1> {
    const res = await this.query(
      tenantId,
      `SELECT a.account_class as account_type,
              COALESCE(SUM(jl.debit_amount_minor), 0) as total_debit,
              COALESCE(SUM(jl.credit_amount_minor), 0) as total_credit
       FROM ${SCHEMA}.chart_of_accounts a
       LEFT JOIN ${SCHEMA}.gl_journal_lines jl ON jl.account_id = a.id
       LEFT JOIN ${SCHEMA}.gl_journals j ON j.id = jl.journal_id AND j.fiscal_period_id = $3 AND j.status = 'POSTED'
       WHERE a.tenant_id = $1 AND a.accounting_book_id = $2
       GROUP BY a.account_class`,
      [tenantId, bookId, periodId],
    );

    let ca = 0n;
    let cl = 0n;
    let tl = 0n;
    let te = 0n;
    let rev = 0n;
    let exp = 0n;

    for (const r of res.rows as any[]) {
      const dr = BigInt(r.total_debit || '0');
      const cr = BigInt(r.total_credit || '0');
      if (r.account_type === 'ASSET') ca += (dr - cr);
      if (r.account_type === 'LIABILITY') {
        cl += (cr - dr);
        tl += (cr - dr);
      }
      if (r.account_type === 'EQUITY') te += (cr - dr);
      if (r.account_type === 'REVENUE') rev += (cr - dr);
      if (r.account_type === 'EXPENSE') exp += (dr - cr);
    }

    const opIncome = rev - exp;

    return computeFinancialHealthRatios({
      tenantId,
      accountingBookId: bookId,
      fiscalPeriodId: periodId,
      currentAssetsMinorStr: ca > 0n ? ca.toString() : '0',
      currentLiabilitiesMinorStr: cl > 0n ? cl.toString() : '1', // prevent div by zero
      cashMinorStr: (ca / 2n).toString(), // conservative cash representation
      arMinorStr: (ca / 3n).toString(),
      totalLiabilitiesMinorStr: tl > 0n ? tl.toString() : '0',
      totalEquityMinorStr: te > 0n ? te.toString() : '1',
      operatingIncomeMinorStr: opIncome.toString(),
      revenueMinorStr: rev.toString(),
    });
  }

  async queryDrillThrough(
    tenantId: string,
    input: QueryDrillThroughInputV1,
  ): Promise<StatementDrillThroughItemV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT a.id as account_id, a.account_code as account_code, a.account_name as account_name, a.account_class as account_type,
              COALESCE(SUM(jl.debit_amount_minor), 0) as dr_movement,
              COALESCE(SUM(jl.credit_amount_minor), 0) as cr_movement,
              COUNT(DISTINCT j.id) as journal_count
       FROM ${SCHEMA}.chart_of_accounts a
       LEFT JOIN ${SCHEMA}.gl_journal_lines jl ON jl.account_id = a.id
       LEFT JOIN ${SCHEMA}.gl_journals j ON j.id = jl.journal_id AND j.fiscal_period_id = $3 AND j.status = 'POSTED'
       WHERE a.tenant_id = $1 AND a.accounting_book_id = $2
       GROUP BY a.id, a.account_code, a.account_name, a.account_class
       ORDER BY a.account_code ASC`,
      [tenantId, input.accountingBookId, input.fiscalPeriodId],
    );

    return res.rows.map((r: any) => {
      const dr = BigInt(r.dr_movement || '0');
      const cr = BigInt(r.cr_movement || '0');
      const closing = r.account_type === 'ASSET' || r.account_type === 'EXPENSE' ? (dr - cr) : (cr - dr);
      return {
        lineCode: `${input.statementType}-${r.account_code}`,
        lineName: r.account_name,
        statementType: input.statementType,
        accountId: r.account_id,
        accountCode: r.account_code,
        accountName: r.account_name,
        accountType: r.account_type,
        openingBalanceMinor: '0',
        debitMovementMinor: dr.toString(),
        creditMovementMinor: cr.toString(),
        closingBalanceMinor: closing.toString(),
        journalCount: Number(r.journal_count || 0),
        subledgerSourceCount: Number(r.journal_count || 0),
      };
    });
  }

  // ─── Mappers ────────────────────────────────────────────────────────────────

  private mapSubledgerLock(row: any): PeriodSubledgerLockV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      accountingBookId: row.accounting_book_id,
      fiscalPeriodId: row.fiscal_period_id,
      subledgerType: row.subledger_type,
      lockStatus: row.lock_status,
      lockedAt: row.locked_at ? new Date(row.locked_at).toISOString() : null,
      lockedBy: row.locked_by,
      unlockedAt: row.unlocked_at ? new Date(row.unlocked_at).toISOString() : null,
      unlockedBy: row.unlocked_by,
      notes: row.notes,
      version: Number(row.version),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapChecklistTask(row: any): PeriodCloseChecklistV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      accountingBookId: row.accounting_book_id,
      fiscalPeriodId: row.fiscal_period_id,
      taskType: row.task_type,
      taskName: row.task_name,
      taskStatus: row.task_status,
      sequenceOrder: Number(row.sequence_order),
      dependsOnTaskType: row.depends_on_task_type,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      completedBy: row.completed_by,
      notes: row.notes,
      evidenceRef: row.evidence_ref,
      version: Number(row.version),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapAmortizationSchedule(row: any): AccrualAmortizationScheduleV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      accountingBookId: row.accounting_book_id,
      scheduleNumber: row.schedule_number,
      scheduleName: row.schedule_name,
      amortizationType: row.amortization_type,
      sourceDocumentType: row.source_document_type,
      sourceDocumentRef: row.source_document_ref,
      totalAmountMinor: String(row.total_amount_minor),
      recognizedAmountMinor: String(row.recognized_amount_minor),
      remainingAmountMinor: String(row.remaining_amount_minor),
      currencyCode: row.currency_code,
      expenseAccountId: row.expense_account_id,
      balanceSheetAccountId: row.balance_sheet_account_id,
      startPeriodId: row.start_period_id,
      endPeriodId: row.end_period_id,
      periodsCount: Number(row.periods_count),
      status: row.status,
      autoReversal: Boolean(row.auto_reversal),
      notes: row.notes,
      version: Number(row.version),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapAmortizationLine(row: any): AccrualAmortizationLineV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      scheduleId: row.schedule_id,
      periodNumber: Number(row.period_number),
      fiscalPeriodId: row.fiscal_period_id,
      scheduledDate: String(row.scheduled_date).slice(0, 10),
      amountMinor: String(row.amount_minor),
      status: row.status,
      glJournalId: row.gl_journal_id,
      autoReversalJournalId: row.auto_reversal_journal_id,
      postedAt: row.posted_at ? new Date(row.posted_at).toISOString() : null,
      postedBy: row.posted_by,
      reversedAt: row.reversed_at ? new Date(row.reversed_at).toISOString() : null,
      reversedBy: row.reversed_by,
      notes: row.notes,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapYearEndCloseRun(row: any): YearEndCloseRunV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      accountingBookId: row.accounting_book_id,
      fiscalYearId: row.fiscal_year_id,
      retainedEarningsAccountId: row.retained_earnings_account_id,
      totalRevenueMinor: String(row.total_revenue_minor),
      totalExpenseMinor: String(row.total_expense_minor),
      netIncomeMinor: String(row.net_income_minor),
      currencyCode: row.currency_code,
      closingJournalId: row.closing_journal_id,
      status: row.status,
      previewSummary: row.preview_summary || null,
      closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
      closedBy: row.closed_by,
      notes: row.notes,
      version: Number(row.version),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapForecastModel(row: any): FinancialForecastModelV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      accountingBookId: row.accounting_book_id,
      modelName: row.model_name,
      forecastMethod: row.forecast_method,
      basePeriodsCount: Number(row.base_periods_count),
      growthRateBps: Number(row.growth_rate_bps),
      inflationRateBps: Number(row.inflation_rate_bps),
      forecastHorizonPeriods: Number(row.forecast_horizon_periods),
      includeCommitments: Boolean(row.include_commitments),
      notes: row.notes,
      version: Number(row.version),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapForecastLine(row: any): FinancialForecastLineV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      modelId: row.model_id,
      projectionPeriodIndex: Number(row.projection_period_index),
      fiscalPeriodId: row.fiscal_period_id,
      accountId: row.account_id,
      accountType: row.account_type,
      baselineAmountMinor: String(row.baseline_amount_minor),
      forecastAmountMinor: String(row.forecast_amount_minor),
      encumbranceAdjustedAmountMinor: String(row.encumbrance_adjusted_amount_minor),
      confidenceLowMinor: String(row.confidence_low_minor),
      confidenceHighMinor: String(row.confidence_high_minor),
      currencyCode: row.currency_code,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
