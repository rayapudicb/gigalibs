import { createHash, randomUUID } from 'node:crypto';
import {
  type AccountV1,
  type AccountingBookV1,
  type BalanceSheetReportV1,
  type BalanceSheetSectionItemV1,
  type CreateAccountInputV1,
  type CreateAccountingBookInputV1,
  type CreateFiscalPeriodInputV1,
  type CreateFiscalYearInputV1,
  type FiscalPeriodLockedEventV1,
  type FiscalPeriodV1,
  type FiscalYearV1,
  type IncomeStatementReportV1,
  type JournalLineV1,
  type JournalPostedEventV1,
  type JournalReversedEventV1,
  type JournalV1,
  type PostJournalInputV1,
  type ReverseJournalInputV1,
  type TrialBalanceLineV1,
  type TrialBalanceReportV1,
  type UpdateAccountInputV1,
  type UpdatePeriodStatusInputV1,
} from '@gigalibs/contracts';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { appendOutboxEvent } from '../outbox.js';

@Injectable()
export class FinanceService {
  constructor(private readonly database: DatabaseService) {}

  private async query<R = Record<string, any>>(tenantId: string, text: string, values?: unknown[]): Promise<{ rows: R[] }> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const res = await client.query(text, values);
      return { rows: res.rows as R[] };
    });
  }

  // ─── 1. Accounting Books ───────────────────────────────────────────────────

  async createAccountingBook(
    tenantId: string,
    actorId: string,
    input: CreateAccountingBookInputV1,
  ): Promise<AccountingBookV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      if (input.isPrimary) {
        await client.query(
          `UPDATE ${SCHEMA}.accounting_books SET is_primary = false WHERE tenant_id = $1 AND is_primary = true`,
          [tenantId],
        );
      }

      const res = await client.query(
        `INSERT INTO ${SCHEMA}.accounting_books (
          tenant_id, book_code, book_name, legal_entity_party_id, currency_code, costing_method, is_primary, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
        RETURNING *`,
        [
          tenantId,
          input.bookCode,
          input.bookName,
          input.legalEntityPartyId,
          input.currencyCode,
          input.costingMethod ?? 'STANDARD',
          input.isPrimary ?? false,
        ],
      );

      const book = this.mapAccountingBook(res.rows[0]);
      await this.writeAudit(client, tenantId, 'accounting_book', book.id, 'CREATE', actorId, input);
      return book;
    });
  }

  async listAccountingBooks(tenantId: string): Promise<AccountingBookV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.accounting_books WHERE tenant_id = $1 ORDER BY is_primary DESC, book_code ASC`,
      [tenantId],
    );
    return res.rows.map(this.mapAccountingBook);
  }

  async getAccountingBook(tenantId: string, bookId: string): Promise<AccountingBookV1> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.accounting_books WHERE tenant_id = $1 AND id = $2`,
      [tenantId, bookId],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Accounting book ${bookId} not found`);
    }
    return this.mapAccountingBook(res.rows[0]);
  }

  // ─── 2. Chart of Accounts ───────────────────────────────────────────────────

  async createAccount(tenantId: string, actorId: string, input: CreateAccountInputV1): Promise<AccountV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      // Validate book exists
      const bookRes = await client.query(
        `SELECT id FROM ${SCHEMA}.accounting_books WHERE tenant_id = $1 AND id = $2`,
        [tenantId, input.accountingBookId],
      );
      if (bookRes.rows.length === 0) {
        throw new NotFoundException(`Accounting book ${input.accountingBookId} not found`);
      }

      // Validate parent account if provided
      if (input.parentAccountId) {
        const parentRes = await client.query(
          `SELECT id, accounting_book_id FROM ${SCHEMA}.chart_of_accounts WHERE tenant_id = $1 AND id = $2`,
          [tenantId, input.parentAccountId],
        );
        if (parentRes.rows.length === 0) {
          throw new NotFoundException(`Parent account ${input.parentAccountId} not found`);
        }
        if (parentRes.rows[0].accounting_book_id !== input.accountingBookId) {
          throw new BadRequestException('Parent account must belong to the same accounting book');
        }
      }

      const res = await client.query(
        `INSERT INTO ${SCHEMA}.chart_of_accounts (
          tenant_id, accounting_book_id, account_code, account_name, account_class, account_subtype,
          normal_balance, parent_account_id, is_reconcilable, is_subledger_control, is_system_reserved, active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
        RETURNING *`,
        [
          tenantId,
          input.accountingBookId,
          input.accountCode,
          input.accountName,
          input.accountClass,
          input.accountSubtype,
          input.normalBalance,
          input.parentAccountId ?? null,
          input.isReconcilable ?? false,
          input.isSubledgerControl ?? false,
          input.isSystemReserved ?? false,
        ],
      );

      const account = this.mapAccount(res.rows[0]);
      await this.writeAudit(client, tenantId, 'chart_of_accounts', account.id, 'CREATE', actorId, input);
      return account;
    });
  }

  async listAccounts(tenantId: string, bookId: string): Promise<AccountV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.chart_of_accounts WHERE tenant_id = $1 AND accounting_book_id = $2 ORDER BY account_code ASC`,
      [tenantId, bookId],
    );
    return res.rows.map(this.mapAccount);
  }

  async getAccount(tenantId: string, accountId: string): Promise<AccountV1> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.chart_of_accounts WHERE tenant_id = $1 AND id = $2`,
      [tenantId, accountId],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }
    return this.mapAccount(res.rows[0]);
  }

  async updateAccount(
    tenantId: string,
    actorId: string,
    accountId: string,
    input: UpdateAccountInputV1,
  ): Promise<AccountV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const current = await this.getAccount(tenantId, accountId);
      if (current.version !== input.expectedVersion) {
        throw new ConflictException(`Version conflict: expected ${input.expectedVersion}, found ${current.version}`);
      }

      const updates: string[] = ['version = version + 1', 'updated_at = clock_timestamp()'];
      const values: unknown[] = [tenantId, accountId];
      let paramIndex = 3;

      if (input.accountName !== undefined) {
        updates.push(`account_name = $${paramIndex++}`);
        values.push(input.accountName);
      }
      if (input.parentAccountId !== undefined) {
        updates.push(`parent_account_id = $${paramIndex++}`);
        values.push(input.parentAccountId);
      }
      if (input.isReconcilable !== undefined) {
        updates.push(`is_reconcilable = $${paramIndex++}`);
        values.push(input.isReconcilable);
      }
      if (input.active !== undefined) {
        updates.push(`active = $${paramIndex++}`);
        values.push(input.active);
      }

      const res = await client.query(
        `UPDATE ${SCHEMA}.chart_of_accounts
            SET ${updates.join(', ')}
          WHERE tenant_id = $1 AND id = $2
      RETURNING *`,
        values,
      );

      const account = this.mapAccount(res.rows[0]);
      await this.writeAudit(client, tenantId, 'chart_of_accounts', accountId, 'UPDATE', actorId, input);
      return account;
    });
  }

  // ─── 3. Fiscal Years & Periods ──────────────────────────────────────────────

  async createFiscalYear(tenantId: string, actorId: string, input: CreateFiscalYearInputV1): Promise<FiscalYearV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const res = await client.query(
        `INSERT INTO ${SCHEMA}.fiscal_years (
          tenant_id, accounting_book_id, year_name, start_date, end_date, status
        ) VALUES ($1, $2, $3, $4, $5, 'OPEN')
        RETURNING *`,
        [tenantId, input.accountingBookId, input.yearName, input.startDate, input.endDate],
      );
      const year = this.mapFiscalYear(res.rows[0]);
      await this.writeAudit(client, tenantId, 'fiscal_year', year.id, 'CREATE', actorId, input);
      return year;
    });
  }

  async createFiscalPeriod(tenantId: string, actorId: string, input: CreateFiscalPeriodInputV1): Promise<FiscalPeriodV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const res = await client.query(
        `INSERT INTO ${SCHEMA}.fiscal_periods (
          tenant_id, fiscal_year_id, accounting_book_id, period_number, period_name, start_date, end_date, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN')
        RETURNING *`,
        [
          tenantId,
          input.fiscalYearId,
          input.accountingBookId,
          input.periodNumber,
          input.periodName,
          input.startDate,
          input.endDate,
        ],
      );
      const period = this.mapFiscalPeriod(res.rows[0]);
      await this.writeAudit(client, tenantId, 'fiscal_period', period.id, 'CREATE', actorId, input);
      return period;
    });
  }

  async generateStandardPeriods(
    tenantId: string,
    actorId: string,
    bookId: string,
    yearNumber: number,
  ): Promise<{ year: FiscalYearV1; periods: FiscalPeriodV1[] }> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const yearName = `FY-${yearNumber}`;
      const startDate = `${yearNumber}-01-01`;
      const endDate = `${yearNumber}-12-31`;

      const yearRes = await client.query(
        `INSERT INTO ${SCHEMA}.fiscal_years (
          tenant_id, accounting_book_id, year_name, start_date, end_date, status
        ) VALUES ($1, $2, $3, $4, $5, 'OPEN')
        RETURNING *`,
        [tenantId, bookId, yearName, startDate, endDate],
      );
      const year = this.mapFiscalYear(yearRes.rows[0]);

      const periods: FiscalPeriodV1[] = [];
      for (let month = 1; month <= 12; month++) {
        const mm = month.toString().padStart(2, '0');
        const pStart = `${yearNumber}-${mm}-01`;
        // Last day of month
        const lastDay = new Date(yearNumber, month, 0).getDate().toString().padStart(2, '0');
        const pEnd = `${yearNumber}-${mm}-${lastDay}`;
        const pName = `${yearName}-${mm}`;

        const pRes = await client.query(
          `INSERT INTO ${SCHEMA}.fiscal_periods (
            tenant_id, fiscal_year_id, accounting_book_id, period_number, period_name, start_date, end_date, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN')
          RETURNING *`,
          [tenantId, year.id, bookId, month, pName, pStart, pEnd],
        );
        periods.push(this.mapFiscalPeriod(pRes.rows[0]));
      }

      await this.writeAudit(client, tenantId, 'fiscal_year', year.id, 'GENERATE_PERIODS', actorId, {
        yearNumber,
        periodCount: periods.length,
      });

      return { year, periods };
    });
  }

  async listFiscalPeriods(tenantId: string, bookId: string): Promise<FiscalPeriodV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.fiscal_periods WHERE tenant_id = $1 AND accounting_book_id = $2 ORDER BY start_date ASC`,
      [tenantId, bookId],
    );
    return res.rows.map(this.mapFiscalPeriod);
  }

  async getFiscalPeriod(tenantId: string, periodId: string): Promise<FiscalPeriodV1> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.fiscal_periods WHERE tenant_id = $1 AND id = $2`,
      [tenantId, periodId],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Fiscal period ${periodId} not found`);
    }
    return this.mapFiscalPeriod(res.rows[0]);
  }

  async updatePeriodStatus(
    tenantId: string,
    actorId: string,
    periodId: string,
    input: UpdatePeriodStatusInputV1,
  ): Promise<FiscalPeriodV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const current = await this.getFiscalPeriod(tenantId, periodId);
      if (current.status === 'LOCKED' && input.status !== 'LOCKED') {
        throw new BadRequestException('Cannot reopen or modify a LOCKED fiscal period');
      }

      const res = await client.query(
        `UPDATE ${SCHEMA}.fiscal_periods
            SET status = $3, version = version + 1, updated_at = clock_timestamp()
          WHERE tenant_id = $1 AND id = $2
      RETURNING *`,
        [tenantId, periodId, input.status],
      );

      const period = this.mapFiscalPeriod(res.rows[0]);

      if (input.status === 'LOCKED') {
        const lockEvent: FiscalPeriodLockedEventV1 = {
          specversion: '1.0',
          id: randomUUID(),
          source: 'gigalibs.financial-operations',
          type: 'finance.period.locked.v1',
          tenantId,
          subject: `fiscal-period/${period.id}`,
          time: new Date().toISOString(),
          correlationId: randomUUID(),
          data: {
            fiscalPeriodId: period.id,
            periodName: period.periodName,
            accountingBookId: period.accountingBookId,
            lockedAt: new Date().toISOString(),
            lockedBy: actorId,
          },
        };
        await this.writeOutbox(client, tenantId, 'fiscal_period', period.id, lockEvent);
      }

      await this.writeAudit(client, tenantId, 'fiscal_period', periodId, 'UPDATE_STATUS', actorId, input);
      return period;
    });
  }

  async findPeriodForDate(tenantId: string, bookId: string, postingDate: string): Promise<FiscalPeriodV1> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.fiscal_periods
        WHERE tenant_id = $1
          AND accounting_book_id = $2
          AND start_date <= $3
          AND end_date >= $3
        LIMIT 1`,
      [tenantId, bookId, postingDate],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`No fiscal period covers posting date ${postingDate} for book ${bookId}`);
    }
    const period = this.mapFiscalPeriod(res.rows[0]);
    if (period.status === 'LOCKED') {
      throw new BadRequestException(`Fiscal period ${period.periodName} is LOCKED for posting date ${postingDate}`);
    }
    return period;
  }

  // ─── 4. Double-Entry General Ledger Journals & Fact Lines ──────────────────

  /**
   * Posts a balanced journal. Pass `client` to post inside the caller's transaction, so a subledger command and its
   * journal commit or roll back together (WI-OI-120c, audit P0-09). A journal for a source document is created at
   * most once per book and entry type: a retry or a redelivered event returns the journal already posted.
   */
  async postJournal(
    tenantId: string,
    actorId: string,
    input: PostJournalInputV1,
    client?: PoolClient,
  ): Promise<JournalV1> {
    if (client) return this.postJournalInTransaction(client, tenantId, actorId, input);
    return this.database.withTenantTransaction(tenantId, (transaction) =>
      this.postJournalInTransaction(transaction, tenantId, actorId, input),
    );
  }

  private async postJournalInTransaction(
    client: PoolClient,
    tenantId: string,
    actorId: string,
    input: PostJournalInputV1,
  ): Promise<JournalV1> {
    // 0. Exactly once per source document, book and entry type (unique index uq_gl_journals_source_document).
    if (input.sourceDocumentId) {
      const existing = await client.query(
        `SELECT * FROM ${SCHEMA}.gl_journals
          WHERE tenant_id = $1 AND accounting_book_id = $2 AND source_document_type IS NOT DISTINCT FROM $3
            AND source_document_id = $4 AND entry_type = $5`,
        [
          tenantId,
          input.accountingBookId,
          input.sourceDocumentType ?? null,
          input.sourceDocumentId,
          input.entryType ?? 'STANDARD_MANUAL',
        ],
      );
      if (existing.rows.length > 0) {
        const lineRows = await client.query(
          `SELECT * FROM ${SCHEMA}.gl_journal_lines WHERE tenant_id = $1 AND journal_id = $2 ORDER BY line_number`,
          [tenantId, existing.rows[0].id],
        );
        return this.mapJournal(
          existing.rows[0],
          lineRows.rows.map((row) => this.mapJournalLine(row)),
        );
      }
    }

    // 1. Verify period is open
    const periodRes = await client.query(
      `SELECT * FROM ${SCHEMA}.fiscal_periods WHERE tenant_id = $1 AND id = $2`,
      [tenantId, input.fiscalPeriodId],
    );
    if (periodRes.rows.length === 0) {
      throw new NotFoundException(`Fiscal period ${input.fiscalPeriodId} not found`);
    }
    const period = this.mapFiscalPeriod(periodRes.rows[0]);
    if (period.status === 'LOCKED') {
      throw new BadRequestException(`Cannot post to a LOCKED fiscal period (${period.periodName})`);
    }

    // 2. Verify book currency
    const bookRes = await client.query(
      `SELECT currency_code FROM ${SCHEMA}.accounting_books WHERE tenant_id = $1 AND id = $2`,
      [tenantId, input.accountingBookId],
    );
    if (bookRes.rows.length === 0) {
      throw new NotFoundException(`Accounting book ${input.accountingBookId} not found`);
    }
    const bookCurrency = bookRes.rows[0].currency_code;

    // 3. Mathematical validation of balance using exact BigInt integer minor units
    let totalDebitBigInt = 0n;
    let totalCreditBigInt = 0n;

    for (const line of input.lines) {
      const d = BigInt(line.debitAmountMinor ?? '0');
      const c = BigInt(line.creditAmountMinor ?? '0');
      if (d < 0n || c < 0n) {
        throw new BadRequestException('Debit and credit amounts must be non-negative');
      }
      if (d > 0n && c > 0n) {
        throw new BadRequestException('A single journal line cannot have both debit and credit');
      }
      if (d === 0n && c === 0n) {
        throw new BadRequestException('Each line must have either a positive debit or credit');
      }
      totalDebitBigInt += d;
      totalCreditBigInt += c;
    }

    if (totalDebitBigInt !== totalCreditBigInt) {
      throw new BadRequestException(
        `Journal is out of balance: total debits (${totalDebitBigInt}) != total credits (${totalCreditBigInt})`,
      );
    }
    if (totalDebitBigInt === 0n) {
      throw new BadRequestException('Journal must have positive debit/credit totals');
    }

    // 4. Generate journal number. The transaction-scoped lock stops two concurrent postings from taking the same
    //    number (WI-OI-120c).
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${SCHEMA}:journal-number:${tenantId}`]);
    const jnlCountRes = await client.query(
      `SELECT COUNT(*) FROM ${SCHEMA}.gl_journals WHERE tenant_id = $1`,
      [tenantId],
    );
    const seq = (parseInt(jnlCountRes.rows[0].count, 10) + 1).toString().padStart(6, '0');
    const journalNumber = `JNL-${input.postingDate.replace(/-/g, '')}-${seq}`;

    // 5. Insert journal header
    const jnlRes = await client.query(
      `INSERT INTO ${SCHEMA}.gl_journals (
        tenant_id, journal_number, accounting_book_id, fiscal_period_id, posting_date,
        entry_type, source_document_type, source_document_id, description, status,
        total_debit_minor, total_credit_minor, posted_at, posted_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'POSTED', $10, $11, clock_timestamp(), $12)
      RETURNING *`,
      [
        tenantId,
        journalNumber,
        input.accountingBookId,
        input.fiscalPeriodId,
        input.postingDate,
        input.entryType ?? 'STANDARD_MANUAL',
        input.sourceDocumentType ?? null,
        input.sourceDocumentId ?? null,
        input.description,
        totalDebitBigInt.toString(),
        totalCreditBigInt.toString(),
        actorId,
      ],
    );
    const journalId = jnlRes.rows[0].id;

    // 6. Insert journal lines
    const lines: JournalLineV1[] = [];
    let lineNum = 1;

    for (const line of input.lines) {
      const curCode = line.currencyCode ?? bookCurrency;
      const exRate = line.exchangeRate ?? '1.000000';
      const dMinor = BigInt(line.debitAmountMinor ?? '0').toString();
      const cMinor = BigInt(line.creditAmountMinor ?? '0').toString();

      const lineRes = await client.query(
        `INSERT INTO ${SCHEMA}.gl_journal_lines (
          tenant_id, journal_id, line_number, account_id,
          debit_amount_minor, credit_amount_minor, currency_code, exchange_rate,
          base_debit_amount_minor, base_credit_amount_minor, memo, dimensions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          tenantId,
          journalId,
          lineNum++,
          line.accountId,
          dMinor,
          cMinor,
          curCode,
          exRate,
          dMinor, // Base minor = line minor for functional currency
          cMinor,
          line.memo ?? null,
          JSON.stringify(line.dimensions ?? {}),
        ],
      );
      lines.push(this.mapJournalLine(lineRes.rows[0]));
    }

    const journal = this.mapJournal(jnlRes.rows[0], lines);

    // 7. Emit JournalPostedEventV1 outbox fact
    const postedEvent: JournalPostedEventV1 = {
      specversion: '1.0',
      id: randomUUID(),
      source: 'gigalibs.financial-operations',
      type: 'finance.journal.posted.v1',
      tenantId,
      subject: `journal/${journal.id}`,
      time: new Date().toISOString(),
      correlationId: randomUUID(),
      data: {
        journalId: journal.id,
        journalNumber: journal.journalNumber,
        accountingBookId: journal.accountingBookId,
        fiscalPeriodId: journal.fiscalPeriodId,
        postingDate: journal.postingDate,
        entryType: journal.entryType,
        totalDebitMinor: journal.totalDebitMinor,
        totalCreditMinor: journal.totalCreditMinor,
        postedAt: journal.postedAt ?? new Date().toISOString(),
        postedBy: actorId,
      },
    };
    await this.writeOutbox(client, tenantId, 'journal', journal.id, postedEvent);

    await this.writeAudit(client, tenantId, 'gl_journal', journal.id, 'POST', actorId, {
      journalNumber,
      totalMinor: journal.totalDebitMinor,
      linesCount: lines.length,
    });

    return journal;
  }

  // ─── 5. Immutable Reversals (reverseCorrectIt) ──────────────────────────────

  async reverseJournal(
    tenantId: string,
    actorId: string,
    input: ReverseJournalInputV1,
  ): Promise<{ original: JournalV1; reversal: JournalV1 }> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      // 1. Fetch original journal with lines
      const original = await this.getJournal(tenantId, input.journalId);
      if (original.status !== 'POSTED') {
        throw new BadRequestException(`Cannot reverse journal ${input.journalId} in status ${original.status}`);
      }

      // 2. Resolve fiscal period for reversal date
      const revPeriod = input.fiscalPeriodId
        ? await this.getFiscalPeriod(tenantId, input.fiscalPeriodId)
        : await this.findPeriodForDate(tenantId, original.accountingBookId, input.reversalPostingDate);

      if (revPeriod.status === 'LOCKED') {
        throw new BadRequestException(`Reversal fiscal period (${revPeriod.periodName}) is LOCKED`);
      }

      // 3. Generate reversal journal number
      const jnlCountRes = await client.query(
        `SELECT COUNT(*) FROM ${SCHEMA}.gl_journals WHERE tenant_id = $1`,
        [tenantId],
      );
      const seq = (parseInt(jnlCountRes.rows[0].count, 10) + 1).toString().padStart(6, '0');
      const revJournalNumber = `REV-${input.reversalPostingDate.replace(/-/g, '')}-${seq}`;

      // 4. Create reversal journal header
      const revJnlRes = await client.query(
        `INSERT INTO ${SCHEMA}.gl_journals (
          tenant_id, journal_number, accounting_book_id, fiscal_period_id, posting_date,
          entry_type, source_document_type, source_document_id, description, status,
          total_debit_minor, total_credit_minor, reversed_journal_id, posted_at, posted_by
        ) VALUES ($1, $2, $3, $4, $5, 'REVERSAL', 'GL_JOURNAL', $6, $7, 'POSTED', $8, $9, $10, clock_timestamp(), $11)
        RETURNING *`,
        [
          tenantId,
          revJournalNumber,
          original.accountingBookId,
          revPeriod.id,
          input.reversalPostingDate,
          original.id,
          `Reversal of ${original.journalNumber}: ${input.reason}`,
          original.totalDebitMinor,
          original.totalCreditMinor,
          original.id,
          actorId,
        ],
      );
      const revJournalId = revJnlRes.rows[0].id;

      // 5. Swap debits and credits on every line
      const revLines: JournalLineV1[] = [];
      let lineNum = 1;
      for (const line of original.lines) {
        // Swap debits and credits!
        const swappedDebit = line.creditAmountMinor;
        const swappedCredit = line.debitAmountMinor;
        const swappedBaseDebit = line.baseCreditAmountMinor;
        const swappedBaseCredit = line.baseDebitAmountMinor;

        const revLineRes = await client.query(
          `INSERT INTO ${SCHEMA}.gl_journal_lines (
            tenant_id, journal_id, line_number, account_id,
            debit_amount_minor, credit_amount_minor, currency_code, exchange_rate,
            base_debit_amount_minor, base_credit_amount_minor, memo, dimensions
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *`,
          [
            tenantId,
            revJournalId,
            lineNum++,
            line.accountId,
            swappedDebit,
            swappedCredit,
            line.currencyCode,
            line.exchangeRate,
            swappedBaseDebit,
            swappedBaseCredit,
            `Reversal of Line ${line.lineNumber}: ${line.memo ?? ''}`.trim(),
            JSON.stringify(line.dimensions ?? {}),
          ],
        );
        revLines.push(this.mapJournalLine(revLineRes.rows[0]));
      }

      // 6. Update original journal status to REVERSED
      await client.query(
        `UPDATE ${SCHEMA}.gl_journals
            SET status = 'REVERSED', version = version + 1, updated_at = clock_timestamp()
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, original.id],
      );

      const reversalJournal = this.mapJournal(revJnlRes.rows[0], revLines);

      // 7. Emit JournalReversedEventV1 outbox fact
      const revEvent: JournalReversedEventV1 = {
        specversion: '1.0',
        id: randomUUID(),
        source: 'gigalibs.financial-operations',
        type: 'finance.journal.reversed.v1',
        tenantId,
        subject: `journal/${original.id}`,
        time: new Date().toISOString(),
        correlationId: randomUUID(),
        data: {
          reversalJournalId: reversalJournal.id,
          reversalJournalNumber: reversalJournal.journalNumber,
          originalJournalId: original.id,
          accountingBookId: original.accountingBookId,
          fiscalPeriodId: revPeriod.id,
          postingDate: input.reversalPostingDate,
          reversedAt: new Date().toISOString(),
          reversedBy: actorId,
          reason: input.reason,
        },
      };
      await this.writeOutbox(client, tenantId, 'journal', reversalJournal.id, revEvent);

      await this.writeAudit(client, tenantId, 'gl_journal', original.id, 'REVERSE', actorId, {
        reversalJournalId: reversalJournal.id,
        reversalJournalNumber: revJournalNumber,
        reason: input.reason,
      });

      const updatedOriginal = await this.getJournal(tenantId, original.id);
      return { original: updatedOriginal, reversal: reversalJournal };
    });
  }

  async listJournals(tenantId: string, bookId: string, limit = 100): Promise<JournalV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.gl_journals WHERE tenant_id = $1 AND accounting_book_id = $2 ORDER BY posting_date DESC, created_at DESC LIMIT $3`,
      [tenantId, bookId, limit],
    );

    const journals: JournalV1[] = [];
    for (const row of res.rows) {
      const linesRes = await this.query(
        tenantId,
        `SELECT l.*, a.account_code, a.account_name
           FROM ${SCHEMA}.gl_journal_lines l
           JOIN ${SCHEMA}.chart_of_accounts a ON a.id = l.account_id
          WHERE l.tenant_id = $1 AND l.journal_id = $2
          ORDER BY l.line_number ASC`,
        [tenantId, row.id],
      );
      journals.push(this.mapJournal(row, linesRes.rows.map(this.mapJournalLine)));
    }
    return journals;
  }

  async getJournal(tenantId: string, journalId: string): Promise<JournalV1> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.gl_journals WHERE tenant_id = $1 AND id = $2`,
      [tenantId, journalId],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Journal ${journalId} not found`);
    }

    const linesRes = await this.query(
      tenantId,
      `SELECT l.*, a.account_code, a.account_name
         FROM ${SCHEMA}.gl_journal_lines l
         JOIN ${SCHEMA}.chart_of_accounts a ON a.id = l.account_id
        WHERE l.tenant_id = $1 AND l.journal_id = $2
        ORDER BY l.line_number ASC`,
      [tenantId, journalId],
    );

    return this.mapJournal(res.rows[0], linesRes.rows.map(this.mapJournalLine));
  }

  // ─── 6. Subledger Ingestion Handlers (AP, AR, Inventory) ────────────────────

  async ingestSubledgerEvent(
    tenantId: string,
    consumerName: string,
    messageId: string,
    eventType: string,
    sourceModule: string,
    sourceVersion: number,
    correlationId: string,
    payload: Record<string, unknown>,
    handler: (client: PoolClient) => Promise<JournalV1>,
  ): Promise<{ status: 'PROCESSED' | 'DUPLICATE'; journal?: JournalV1 }> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const payloadSha = createHash('sha256').update(JSON.stringify(payload)).digest('hex');

      // 1. Check inbox deduplication
      const existing = await client.query(
        `SELECT id, status FROM ${SCHEMA}.inbox_receipts WHERE tenant_id = $1 AND consumer_name = $2 AND message_id = $3`,
        [tenantId, consumerName, messageId],
      );
      if (existing.rows.length > 0) {
        return { status: 'DUPLICATE' };
      }

      // 2. Insert inbox receipt
      const receiptId = randomUUID();
      await client.query(
        `INSERT INTO ${SCHEMA}.inbox_receipts (
          id, tenant_id, consumer_name, message_id, event_type, source_module, source_version, correlation_id, payload_sha256, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PROCESSING')`,
        [receiptId, tenantId, consumerName, messageId, eventType, sourceModule, sourceVersion, correlationId, payloadSha],
      );

      // 3. Execute domain posting
      const journal = await handler(client);

      // 4. Mark inbox receipt processed
      await client.query(
        `UPDATE ${SCHEMA}.inbox_receipts SET status = 'PROCESSED', processed_at = clock_timestamp() WHERE id = $1`,
        [receiptId],
      );

      return { status: 'PROCESSED', journal };
    });
  }

  // ─── 7. Financial Statements & Reporting Engine ─────────────────────────────

  async generateTrialBalance(tenantId: string, bookId: string, asOfDate: string): Promise<TrialBalanceReportV1> {
    const book = await this.getAccountingBook(tenantId, bookId);

    const query = `
      SELECT
        a.id AS account_id,
        a.account_code,
        a.account_name,
        a.account_class,
        a.account_subtype,
        a.normal_balance,
        COALESCE(SUM(l.base_debit_amount_minor), 0) AS debit_turnover_minor,
        COALESCE(SUM(l.base_credit_amount_minor), 0) AS credit_turnover_minor
      FROM ${SCHEMA}.chart_of_accounts a
      LEFT JOIN ${SCHEMA}.gl_journal_lines l ON l.account_id = a.id AND l.tenant_id = a.tenant_id
      LEFT JOIN ${SCHEMA}.gl_journals j ON j.id = l.journal_id AND j.status IN ('POSTED', 'REVERSED') AND j.posting_date <= $3
      WHERE a.tenant_id = $1
        AND a.accounting_book_id = $2
        AND a.active = true
      GROUP BY a.id, a.account_code, a.account_name, a.account_class, a.account_subtype, a.normal_balance
      ORDER BY a.account_code ASC
    `;

    const res = await this.query(tenantId, query, [tenantId, bookId, asOfDate]);

    let totalDebits = 0n;
    let totalCredits = 0n;

    const lines: TrialBalanceLineV1[] = res.rows.map((r: Record<string, any>) => {
      const dTurnover = BigInt(r.debit_turnover_minor);
      const cTurnover = BigInt(r.credit_turnover_minor);
      const net = dTurnover - cTurnover;

      let endingDebit = 0n;
      let endingCredit = 0n;

      if (r.normal_balance === 'DEBIT') {
        if (net >= 0n) endingDebit = net;
        else endingCredit = -net;
      } else {
        if (net <= 0n) endingCredit = -net;
        else endingDebit = net;
      }

      totalDebits += endingDebit;
      totalCredits += endingCredit;

      return {
        accountId: r.account_id,
        accountCode: r.account_code,
        accountName: r.account_name,
        accountClass: r.account_class,
        accountSubtype: r.account_subtype,
        normalBalance: r.normal_balance,
        debitTurnoverMinor: dTurnover.toString(),
        creditTurnoverMinor: cTurnover.toString(),
        endingDebitMinor: endingDebit.toString(),
        endingCreditMinor: endingCredit.toString(),
      };
    });

    return {
      accountingBookId: book.id,
      bookCode: book.bookCode,
      currencyCode: book.currencyCode,
      asOfDate,
      lines,
      totalDebitsMinor: totalDebits.toString(),
      totalCreditsMinor: totalCredits.toString(),
      isBalanced: totalDebits === totalCredits,
    };
  }

  async generateBalanceSheet(tenantId: string, bookId: string, asOfDate: string): Promise<BalanceSheetReportV1> {
    const book = await this.getAccountingBook(tenantId, bookId);
    const tb = await this.generateTrialBalance(tenantId, bookId, asOfDate);

    const assetItems: BalanceSheetSectionItemV1[] = [];
    const liabilityItems: BalanceSheetSectionItemV1[] = [];
    const equityItems: BalanceSheetSectionItemV1[] = [];

    let totalAssets = 0n;
    let totalLiabilities = 0n;
    let totalEquity = 0n;
    let retainedEarnings = 0n;

    for (const line of tb.lines) {
      const d = BigInt(line.endingDebitMinor);
      const c = BigInt(line.endingCreditMinor);

      if (line.accountClass === 'ASSET') {
        const bal = d - c;
        totalAssets += bal;
        assetItems.push({
          accountId: line.accountId,
          accountCode: line.accountCode,
          accountName: line.accountName,
          amountMinor: bal.toString(),
        });
      } else if (line.accountClass === 'LIABILITY') {
        const bal = c - d;
        totalLiabilities += bal;
        liabilityItems.push({
          accountId: line.accountId,
          accountCode: line.accountCode,
          accountName: line.accountName,
          amountMinor: bal.toString(),
        });
      } else if (line.accountClass === 'EQUITY') {
        const bal = c - d;
        totalEquity += bal;
        equityItems.push({
          accountId: line.accountId,
          accountCode: line.accountCode,
          accountName: line.accountName,
          amountMinor: bal.toString(),
        });
      } else if (line.accountClass === 'REVENUE') {
        retainedEarnings += c - d;
      } else if (line.accountClass === 'EXPENSE') {
        retainedEarnings -= d - c;
      }
    }

    if (retainedEarnings !== 0n) {
      equityItems.push({
        accountId: '00000000-0000-0000-0000-000000000000',
        accountCode: '3999',
        accountName: 'Current Period Net Earnings',
        amountMinor: retainedEarnings.toString(),
      });
      totalEquity += retainedEarnings;
    }

    return {
      accountingBookId: book.id,
      bookCode: book.bookCode,
      currencyCode: book.currencyCode,
      asOfDate,
      assets: {
        totalMinor: totalAssets.toString(),
        sections: [{ sectionName: 'Total Assets', totalMinor: totalAssets.toString(), items: assetItems }],
      },
      liabilities: {
        totalMinor: totalLiabilities.toString(),
        sections: [{ sectionName: 'Total Liabilities', totalMinor: totalLiabilities.toString(), items: liabilityItems }],
      },
      equity: {
        totalMinor: totalEquity.toString(),
        sections: [{ sectionName: 'Total Equity', totalMinor: totalEquity.toString(), items: equityItems }],
      },
      isBalanced: totalAssets === totalLiabilities + totalEquity,
    };
  }

  async generateIncomeStatement(
    tenantId: string,
    bookId: string,
    fromDate: string,
    toDate: string,
  ): Promise<IncomeStatementReportV1> {
    const book = await this.getAccountingBook(tenantId, bookId);

    const query = `
      SELECT
        a.id AS account_id,
        a.account_code,
        a.account_name,
        a.account_class,
        a.account_subtype,
        COALESCE(SUM(l.base_debit_amount_minor), 0) AS debit_turnover_minor,
        COALESCE(SUM(l.base_credit_amount_minor), 0) AS credit_turnover_minor
      FROM ${SCHEMA}.chart_of_accounts a
      JOIN ${SCHEMA}.gl_journal_lines l ON l.account_id = a.id AND l.tenant_id = a.tenant_id
      JOIN ${SCHEMA}.gl_journals j ON j.id = l.journal_id AND j.status IN ('POSTED', 'REVERSED')
      WHERE a.tenant_id = $1
        AND a.accounting_book_id = $2
        AND a.account_class IN ('REVENUE', 'EXPENSE')
        AND j.posting_date >= $3
        AND j.posting_date <= $4
      GROUP BY a.id, a.account_code, a.account_name, a.account_class, a.account_subtype
      ORDER BY a.account_code ASC
    `;

    const res = await this.query(tenantId, query, [tenantId, bookId, fromDate, toDate]);

    const revenueItems: BalanceSheetSectionItemV1[] = [];
    const cogsItems: BalanceSheetSectionItemV1[] = [];
    const opexItems: BalanceSheetSectionItemV1[] = [];

    let totalRevenues = 0n;
    let totalCogs = 0n;
    let totalOpex = 0n;

    for (const r of res.rows) {
      const d = BigInt(r.debit_turnover_minor);
      const c = BigInt(r.credit_turnover_minor);

      if (r.account_class === 'REVENUE') {
        const net = c - d;
        totalRevenues += net;
        revenueItems.push({
          accountId: r.account_id,
          accountCode: r.account_code,
          accountName: r.account_name,
          amountMinor: net.toString(),
        });
      } else if (r.account_subtype === 'COST_OF_GOODS_SOLD') {
        const net = d - c;
        totalCogs += net;
        cogsItems.push({
          accountId: r.account_id,
          accountCode: r.account_code,
          accountName: r.account_name,
          amountMinor: net.toString(),
        });
      } else {
        const net = d - c;
        totalOpex += net;
        opexItems.push({
          accountId: r.account_id,
          accountCode: r.account_code,
          accountName: r.account_name,
          amountMinor: net.toString(),
        });
      }
    }

    const grossProfit = totalRevenues - totalCogs;
    const operatingIncome = grossProfit - totalOpex;
    const netIncome = operatingIncome;

    return {
      accountingBookId: book.id,
      bookCode: book.bookCode,
      currencyCode: book.currencyCode,
      fromDate,
      toDate,
      revenues: {
        totalMinor: totalRevenues.toString(),
        items: revenueItems,
      },
      costOfGoodsSold: {
        totalMinor: totalCogs.toString(),
        items: cogsItems,
      },
      grossProfitMinor: grossProfit.toString(),
      operatingExpenses: {
        totalMinor: totalOpex.toString(),
        items: opexItems,
      },
      operatingIncomeMinor: operatingIncome.toString(),
      netIncomeMinor: netIncome.toString(),
    };
  }

  // ─── Helpers & Mappers ──────────────────────────────────────────────────────

  mapAccountingBook(row: Record<string, unknown>): AccountingBookV1 {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      bookCode: row.book_code as string,
      bookName: row.book_name as string,
      legalEntityPartyId: row.legal_entity_party_id as string,
      currencyCode: row.currency_code as string,
      costingMethod: row.costing_method as 'STANDARD' | 'FIFO' | 'AVERAGE',
      isPrimary: Boolean(row.is_primary),
      status: row.status as 'ACTIVE' | 'INACTIVE',
      version: Number(row.version),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  mapAccount(row: Record<string, unknown>): AccountV1 {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      accountingBookId: row.accounting_book_id as string,
      accountCode: row.account_code as string,
      accountName: row.account_name as string,
      accountClass: row.account_class as any,
      accountSubtype: row.account_subtype as any,
      normalBalance: row.normal_balance as any,
      parentAccountId: (row.parent_account_id as string) || null,
      isReconcilable: Boolean(row.is_reconcilable),
      isSubledgerControl: Boolean(row.is_subledger_control),
      isSystemReserved: Boolean(row.is_system_reserved),
      active: Boolean(row.active),
      version: Number(row.version),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  private mapFiscalYear(row: Record<string, unknown>): FiscalYearV1 {
    const start = row.start_date instanceof Date ? row.start_date.toISOString().split('T')[0] : String(row.start_date);
    const end = row.end_date instanceof Date ? row.end_date.toISOString().split('T')[0] : String(row.end_date);
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      accountingBookId: row.accounting_book_id as string,
      yearName: row.year_name as string,
      startDate: start,
      endDate: end,
      status: row.status as any,
      version: Number(row.version),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  mapFiscalPeriod(row: Record<string, unknown>): FiscalPeriodV1 {
    const start = row.start_date instanceof Date ? row.start_date.toISOString().split('T')[0] : String(row.start_date);
    const end = row.end_date instanceof Date ? row.end_date.toISOString().split('T')[0] : String(row.end_date);
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      fiscalYearId: row.fiscal_year_id as string,
      accountingBookId: row.accounting_book_id as string,
      periodNumber: Number(row.period_number),
      periodName: row.period_name as string,
      startDate: start,
      endDate: end,
      status: row.status as any,
      version: Number(row.version),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  mapJournalLine(row: Record<string, unknown>): JournalLineV1 {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      journalId: row.journal_id as string,
      lineNumber: Number(row.line_number),
      accountId: row.account_id as string,
      accountCode: (row.account_code as string) || undefined,
      accountName: (row.account_name as string) || undefined,
      debitAmountMinor: String(row.debit_amount_minor),
      creditAmountMinor: String(row.credit_amount_minor),
      currencyCode: row.currency_code as string,
      exchangeRate: String(row.exchange_rate),
      baseDebitAmountMinor: String(row.base_debit_amount_minor),
      baseCreditAmountMinor: String(row.base_credit_amount_minor),
      memo: (row.memo as string) || null,
      dimensions: typeof row.dimensions === 'string' ? JSON.parse(row.dimensions) : ((row.dimensions as Record<string, unknown>) || {}),
      createdAt: (row.created_at as Date).toISOString(),
    };
  }

  mapJournal(row: Record<string, unknown>, lines: JournalLineV1[]): JournalV1 {
    const pDate = row.posting_date instanceof Date ? row.posting_date.toISOString().split('T')[0] : String(row.posting_date);
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      journalNumber: row.journal_number as string,
      accountingBookId: row.accounting_book_id as string,
      fiscalPeriodId: row.fiscal_period_id as string,
      postingDate: pDate,
      entryType: row.entry_type as any,
      sourceDocumentType: (row.source_document_type as string) || null,
      sourceDocumentId: (row.source_document_id as string) || null,
      description: row.description as string,
      status: row.status as any,
      totalDebitMinor: String(row.total_debit_minor),
      totalCreditMinor: String(row.total_credit_minor),
      reversedJournalId: (row.reversed_journal_id as string) || null,
      lines,
      version: Number(row.version),
      postedAt: row.posted_at ? (row.posted_at as Date).toISOString() : null,
      postedBy: (row.posted_by as string) || null,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  private async writeAudit(
    client: PoolClient,
    tenantId: string,
    entityType: string,
    entityId: string,
    action: string,
    actorId: string,
    payload: unknown,
  ): Promise<void> {
    await client.query(
      `INSERT INTO ${SCHEMA}.audit_events (tenant_id, entity_type, entity_id, action, actor_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, entityType, entityId, action, actorId, JSON.stringify(payload ?? {})],
    );
  }

  private async writeOutbox(
    client: PoolClient,
    tenantId: string,
    aggregateType: string,
    aggregateId: string,
    event: { id: string; type: string; correlationId: string; causationId?: string; data: unknown },
  ): Promise<void> {
    // WI-OI-120c: the next aggregate version per record, so repeated events for one record never collide.
    await appendOutboxEvent(client, tenantId, {
      id: event.id,
      type: event.type,
      aggregateType,
      aggregateId,
      correlationId: event.correlationId,
      causationId: event.causationId ?? null,
      data: event.data,
    });
  }
}
