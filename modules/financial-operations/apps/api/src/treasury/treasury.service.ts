import { createHash, randomUUID } from 'node:crypto';
import {
  type BankAccountV1,
  type BankStatementV1,
  type BankStatementLineV1,
  type BankReconciliationSessionV1,
  type BankReconciliationMatchV1,
  type BankReconciliationReportV1,
  type CreateBankAccountInputV1,
  type ImportBankStatementInputV1,
  type AutoMatchInputV1,
  type ManualMatchInputV1,
  type CreateFeeAdjustmentInputV1,
  type SealReconciliationInputV1,
} from '@gigalibs/contracts';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { FinanceService } from '../finance/finance.service.js';
import { parseBankStatement } from './statement-parsers.js';

@Injectable()
export class TreasuryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly financeService: FinanceService,
  ) {}

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

  // ─── 1. Bank Accounts ────────────────────────────────────────────────────────

  async createBankAccount(
    tenantId: string,
    actor: string,
    input: CreateBankAccountInputV1,
  ): Promise<BankAccountV1> {
    const glAccount = await this.financeService.getAccount(tenantId, input.glCashAccountId);
    if (!glAccount) {
      throw new NotFoundException(`GL Cash account ${input.glCashAccountId} not found.`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    await this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      await client.query(
        `INSERT INTO ${SCHEMA}.bank_accounts (
          id, tenant_id, account_name, account_number, routing_code, iban, swift_bic,
          currency_code, gl_cash_account_id, current_cleared_balance_minor, status,
          version, created_at, updated_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE', 1, $11, $11, $12)`,
        [
          id,
          tenantId,
          input.accountName,
          input.accountNumber,
          input.routingCode || null,
          input.iban || null,
          input.swiftBic || null,
          input.currencyCode,
          input.glCashAccountId,
          input.initialBalanceMinor || '0',
          now,
          actor,
        ],
      );
    });

    return this.getBankAccount(tenantId, id);
  }

  async listBankAccounts(tenantId: string): Promise<BankAccountV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.bank_accounts
       WHERE tenant_id = $1
       ORDER BY account_name ASC`,
      [tenantId],
    );

    return res.rows.map((r: any) => this.mapBankAccountRow(r));
  }

  async getBankAccount(tenantId: string, id: string): Promise<BankAccountV1> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.bank_accounts
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Bank account ${id} not found.`);
    }
    return this.mapBankAccountRow(res.rows[0]);
  }

  // ─── 2. Statement Ingestion ──────────────────────────────────────────────────

  async importStatement(
    tenantId: string,
    _actor: string,
    input: ImportBankStatementInputV1,
  ): Promise<BankStatementV1> {
    await this.getBankAccount(tenantId, input.bankAccountId);

    const sourceChecksum = createHash('sha256')
      .update(input.rawContent + input.bankAccountId)
      .digest('hex');

    const existing = await this.query(
      tenantId,
      `SELECT id FROM ${SCHEMA}.bank_statements
       WHERE tenant_id = $1 AND bank_account_id = $2 AND source_checksum = $3`,
      [tenantId, input.bankAccountId, sourceChecksum],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException('DUPLICATE_STATEMENT_PAYLOAD: This exact bank statement has already been imported.');
    }

    const linesToInsert =
      input.parsedLines && input.parsedLines.length > 0
        ? input.parsedLines
        : parseBankStatement(input.format, input.rawContent);

    if (linesToInsert.length === 0) {
      throw new BadRequestException('Statement parsing produced zero transaction lines.');
    }

    const statementId = randomUUID();
    const now = new Date().toISOString();

    await this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      await client.query(
        `INSERT INTO ${SCHEMA}.bank_statements (
          id, tenant_id, bank_account_id, statement_number, statement_date,
          opening_balance_minor, closing_balance_minor, format, source_checksum,
          status, version, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'IMPORTED', 1, $10, $10)`,
        [
          statementId,
          tenantId,
          input.bankAccountId,
          input.statementNumber,
          input.statementDate,
          input.openingBalanceMinor,
          input.closingBalanceMinor,
          input.format,
          sourceChecksum,
          now,
        ],
      );

      for (const line of linesToInsert) {
        const lineId = randomUUID();
        await client.query(
          `INSERT INTO ${SCHEMA}.bank_statement_lines (
            id, tenant_id, statement_id, line_number, transaction_date, value_date,
            amount_minor, transaction_type, reference, check_number,
            counterparty_name, counterparty_account, description,
            match_status, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'UNMATCHED', $14)`,
          [
            lineId,
            tenantId,
            statementId,
            line.lineNumber,
            line.transactionDate,
            line.valueDate,
            line.amountMinor,
            line.transactionType,
            line.reference || null,
            line.checkNumber || null,
            line.counterpartyName || null,
            line.counterpartyAccount || null,
            line.description || null,
            now,
          ],
        );
      }
    });

    return this.getBankStatement(tenantId, statementId);
  }

  async listBankStatements(tenantId: string, bankAccountId: string): Promise<BankStatementV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT s.*, COUNT(l.id)::int as line_count
       FROM ${SCHEMA}.bank_statements s
       LEFT JOIN ${SCHEMA}.bank_statement_lines l ON l.statement_id = s.id
       WHERE s.tenant_id = $1 AND s.bank_account_id = $2
       GROUP BY s.id
       ORDER BY s.statement_date DESC`,
      [tenantId, bankAccountId],
    );

    return res.rows.map((r: any) => this.mapBankStatementRow(r));
  }

  async getBankStatement(tenantId: string, id: string): Promise<BankStatementV1> {
    const stmtRes = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.bank_statements
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (stmtRes.rows.length === 0) {
      throw new NotFoundException(`Bank statement ${id} not found.`);
    }

    const linesRes = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.bank_statement_lines
       WHERE tenant_id = $1 AND statement_id = $2
       ORDER BY line_number ASC`,
      [tenantId, id],
    );

    const stmt = this.mapBankStatementRow(stmtRes.rows[0]);
    stmt.lines = linesRes.rows.map((r: any) => this.mapBankStatementLineRow(r));
    stmt.lineCount = linesRes.rows.length;
    return stmt;
  }

  // ─── 3. Reconciliation Sessions ──────────────────────────────────────────────

  async createReconciliationSession(
    tenantId: string,
    _actor: string,
    bankAccountId: string,
    statementId: string,
    reconciliationDate: string,
  ): Promise<BankReconciliationSessionV1> {
    const bankAccount = await this.getBankAccount(tenantId, bankAccountId);
    const statement = await this.getBankStatement(tenantId, statementId);

    const clearedRes = await this.query(
      tenantId,
      `SELECT COALESCE(SUM(l.debit_amount_minor - l.credit_amount_minor), 0)::text as net_cleared
       FROM ${SCHEMA}.gl_journal_lines l
       JOIN ${SCHEMA}.gl_journals j ON j.id = l.journal_id
       WHERE l.tenant_id = $1 AND l.account_id = $2 AND j.status = 'POSTED'`,
      [tenantId, bankAccount.glCashAccountId],
    );

    const clearedBookBalanceMinor = clearedRes.rows[0]?.net_cleared || '0';
    const stmtEndingMinor = BigInt(statement.closingBalanceMinor);
    const bookBalanceMinor = BigInt(clearedBookBalanceMinor);
    const unreconciledDiff = (stmtEndingMinor - bookBalanceMinor).toString();
    const isBalanced = unreconciledDiff === '0';

    const id = randomUUID();
    const now = new Date().toISOString();

    await this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      await client.query(
        `INSERT INTO ${SCHEMA}.bank_reconciliations (
          id, tenant_id, bank_account_id, statement_id, reconciliation_date,
          statement_ending_balance_minor, cleared_book_balance_minor, unreconciled_difference_minor,
          status, version, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, $10)
        ON CONFLICT (tenant_id, bank_account_id, statement_id)
        DO UPDATE SET
          reconciliation_date = EXCLUDED.reconciliation_date,
          statement_ending_balance_minor = EXCLUDED.statement_ending_balance_minor,
          cleared_book_balance_minor = EXCLUDED.cleared_book_balance_minor,
          unreconciled_difference_minor = EXCLUDED.unreconciled_difference_minor,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at`,
        [
          id,
          tenantId,
          bankAccountId,
          statementId,
          reconciliationDate,
          statement.closingBalanceMinor,
          clearedBookBalanceMinor,
          unreconciledDiff,
          isBalanced ? 'BALANCED' : 'OPEN',
          now,
        ],
      );
    });

    return this.getReconciliationSession(tenantId, bankAccountId, statementId);
  }

  async getReconciliationSession(
    tenantId: string,
    bankAccountId: string,
    statementId: string,
  ): Promise<BankReconciliationSessionV1> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.bank_reconciliations
       WHERE tenant_id = $1 AND bank_account_id = $2 AND statement_id = $3`,
      [tenantId, bankAccountId, statementId],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException('Reconciliation session not found.');
    }

    const session = this.mapReconciliationSessionRow(res.rows[0]);
    const matchesRes = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.bank_reconciliation_matches
       WHERE tenant_id = $1 AND reconciliation_id = $2`,
      [tenantId, session.id],
    );
    session.matches = matchesRes.rows.map((r: any) => this.mapMatchRow(r));
    return session;
  }

  // ─── 4. Auto-Matching Engine ─────────────────────────────────────────────────

  async autoMatch(
    tenantId: string,
    actor: string,
    input: AutoMatchInputV1,
  ): Promise<{ matchedCount: number; updatedDifferenceMinor: string; isBalanced: boolean }> {
    const reconRes = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.bank_reconciliations
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, input.reconciliationId],
    );
    if (reconRes.rows.length === 0) {
      throw new NotFoundException(`Reconciliation ${input.reconciliationId} not found.`);
    }
    const session = reconRes.rows[0];
    if (session.status === 'SEALED') {
      throw new BadRequestException('Cannot modify a sealed reconciliation session.');
    }

    const bankAccount = await this.getBankAccount(tenantId, session.bank_account_id);

    // Fetch unmatched statement lines
    const stmtLinesRes = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.bank_statement_lines
       WHERE tenant_id = $1 AND statement_id = $2 AND match_status = 'UNMATCHED'
       ORDER BY transaction_date ASC, line_number ASC`,
      [tenantId, session.statement_id],
    );

    // Fetch unmatched GL cash lines
    const glLinesRes = await this.query(
      tenantId,
      `SELECT l.id, l.debit_amount_minor, l.credit_amount_minor, j.posting_date, j.source_document_ref as reference
       FROM ${SCHEMA}.gl_journal_lines l
       JOIN ${SCHEMA}.gl_journals j ON j.id = l.journal_id
       WHERE l.tenant_id = $1 AND l.account_id = $2 AND j.status = 'POSTED'
       AND NOT EXISTS (
         SELECT 1 FROM ${SCHEMA}.bank_reconciliation_matches m
         WHERE m.gl_journal_line_id = l.id
       )
       ORDER BY j.posting_date ASC`,
      [tenantId, bankAccount.glCashAccountId],
    );

    let matchCount = 0;
    const availableGlLines = [...glLinesRes.rows];

    for (const stmtLine of stmtLinesRes.rows) {
      const stmtAmt = BigInt(stmtLine.amount_minor);
      const isCredit = stmtAmt > 0n;
      const targetAbs = isCredit ? stmtAmt : -stmtAmt;

      // Pass 1: Exact Reference + Amount
      let matchedGlIdx = -1;
      let appliedRule: 'EXACT_REF_AMOUNT' | 'DATE_WINDOW_AMOUNT' = 'EXACT_REF_AMOUNT';

      if (stmtLine.reference && stmtLine.reference.trim() !== '') {
        matchedGlIdx = availableGlLines.findIndex((gl: any) => {
          const glAbs = isCredit ? BigInt(gl.debit_amount_minor) : BigInt(gl.credit_amount_minor);
          return glAbs === targetAbs && gl.reference && gl.reference.trim().toUpperCase() === stmtLine.reference.trim().toUpperCase();
        });
      }

      // Pass 2: Amount + Value Date Window
      if (matchedGlIdx === -1) {
        matchedGlIdx = availableGlLines.findIndex((gl: any) => {
          const glAbs = isCredit ? BigInt(gl.debit_amount_minor) : BigInt(gl.credit_amount_minor);
          if (glAbs !== targetAbs) return false;

          const stmtDate = new Date(stmtLine.transaction_date).getTime();
          const glDate = new Date(gl.posting_date).getTime();
          const diffDays = Math.abs((stmtDate - glDate) / (1000 * 60 * 60 * 24));
          return diffDays <= input.dateToleranceDays;
        });
        appliedRule = 'DATE_WINDOW_AMOUNT';
      }

      if (matchedGlIdx >= 0) {
        const glLine = availableGlLines[matchedGlIdx]!;
        availableGlLines.splice(matchedGlIdx, 1);

        const matchId = randomUUID();
        const now = new Date().toISOString();

        await this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
          await client.query(
            `INSERT INTO ${SCHEMA}.bank_reconciliation_matches (
              id, tenant_id, reconciliation_id, statement_line_id, gl_journal_line_id,
              matched_amount_minor, match_rule, matched_by, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              matchId,
              tenantId,
              session.id,
              stmtLine.id,
              glLine.id,
              targetAbs.toString(),
              appliedRule,
              actor,
              now,
            ],
          );

          await client.query(
            `UPDATE ${SCHEMA}.bank_statement_lines
             SET match_status = 'AUTO_MATCHED', matched_at = $1
             WHERE id = $2`,
            [now, stmtLine.id],
          );
        });

        matchCount++;
      }
    }

    return this.refreshReconciliationDifference(tenantId, session.id);
  }

  // ─── 5. Manual Match & Adjustment Engine ─────────────────────────────────────

  async manualMatch(
    tenantId: string,
    actor: string,
    input: ManualMatchInputV1,
  ): Promise<BankReconciliationMatchV1> {
    const sessionRes = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.bank_reconciliations
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, input.reconciliationId],
    );
    if (sessionRes.rows.length === 0 || sessionRes.rows[0].status === 'SEALED') {
      throw new BadRequestException('Reconciliation session not found or already sealed.');
    }

    const stmtLineRes = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.bank_statement_lines
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, input.statementLineId],
    );
    if (stmtLineRes.rows.length === 0) {
      throw new NotFoundException('Statement line not found.');
    }
    const stmtLine = stmtLineRes.rows[0];

    const matchId = randomUUID();
    const now = new Date().toISOString();
    const absAmt = (BigInt(stmtLine.amount_minor) < 0n ? -BigInt(stmtLine.amount_minor) : BigInt(stmtLine.amount_minor)).toString();

    await this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      await client.query(
        `INSERT INTO ${SCHEMA}.bank_reconciliation_matches (
          id, tenant_id, reconciliation_id, statement_line_id, gl_journal_line_id,
          matched_amount_minor, match_rule, matched_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          matchId,
          tenantId,
          input.reconciliationId,
          input.statementLineId,
          input.glJournalLineId,
          absAmt,
          input.matchRule,
          actor,
          now,
        ],
      );

      await client.query(
        `UPDATE ${SCHEMA}.bank_statement_lines
         SET match_status = 'MANUALLY_MATCHED', matched_at = $1
         WHERE id = $2`,
        [now, input.statementLineId],
      );
    });

    await this.refreshReconciliationDifference(tenantId, input.reconciliationId);

    const match = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.bank_reconciliation_matches WHERE id = $1`,
      [matchId],
    );
    return this.mapMatchRow(match.rows[0]);
  }

  async unmatch(tenantId: string, _actor: string, matchId: string): Promise<void> {
    const matchRes = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.bank_reconciliation_matches
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, matchId],
    );
    if (matchRes.rows.length === 0) {
      throw new NotFoundException('Match not found.');
    }
    const match = matchRes.rows[0];

    const sessionRes = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.bank_reconciliations WHERE id = $1`,
      [match.reconciliation_id],
    );
    if (sessionRes.rows[0]?.status === 'SEALED') {
      throw new BadRequestException('CANNOT_MODIFY_SEALED_RECONCILIATION: Cannot unmatch sealed sessions.');
    }

    await this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      await client.query(
        `DELETE FROM ${SCHEMA}.bank_reconciliation_matches WHERE id = $1`,
        [matchId],
      );

      await client.query(
        `UPDATE ${SCHEMA}.bank_statement_lines
         SET match_status = 'UNMATCHED', matched_at = NULL
         WHERE id = $1`,
        [match.statement_line_id],
      );
    });

    await this.refreshReconciliationDifference(tenantId, match.reconciliation_id);
  }

  async createFeeAdjustment(
    tenantId: string,
    actor: string,
    input: CreateFeeAdjustmentInputV1,
  ): Promise<BankReconciliationMatchV1> {
    const sessionRes = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.bank_reconciliations WHERE tenant_id = $1 AND id = $2`,
      [tenantId, input.reconciliationId],
    );
    if (sessionRes.rows.length === 0 || sessionRes.rows[0].status === 'SEALED') {
      throw new BadRequestException('Session not found or already sealed.');
    }
    const session = sessionRes.rows[0];

    const stmtLine = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.bank_statement_lines WHERE tenant_id = $1 AND id = $2`,
      [tenantId, input.statementLineId],
    );
    if (stmtLine.rows.length === 0) {
      throw new NotFoundException('Statement line not found.');
    }
    const line = stmtLine.rows[0];
    const bankAccount = await this.getBankAccount(tenantId, session.bank_account_id);

    const books = await this.financeService.listAccountingBooks(tenantId);
    const book = books.find((b) => b.isPrimary) || books[0];
    if (!book) {
      throw new BadRequestException('No accounting book found for fee adjustment.');
    }

    const periods = await this.financeService.listFiscalPeriods(tenantId, book.id);
    const period = periods.find((p) => p.status === 'OPEN');
    if (!period) {
      throw new BadRequestException('No open fiscal period available for fee journal.');
    }

    const feeAmt = BigInt(line.amount_minor);
    const absFee = (feeAmt < 0n ? -feeAmt : feeAmt).toString();

    const journal = await this.financeService.postJournal(tenantId, actor, {
      accountingBookId: book.id,
      fiscalPeriodId: period.id,
      postingDate: line.transaction_date,
      entryType: 'STANDARD_MANUAL',
      description: `Bank Fee Adjustment: ${input.description}`,
      // The statement line's own id: line numbers restart on every statement, so they cannot identify the source
      // (WI-OI-120c). A retried fee adjustment reuses this journal instead of posting a second one.
      sourceDocumentType: 'BANK_STATEMENT_LINE',
      sourceDocumentId: String(line.id),
      lines: [
        {
          accountId: input.expenseAccountId,
          debitAmountMinor: absFee,
          creditAmountMinor: '0',
          currencyCode: bankAccount.currencyCode,
          exchangeRate: '1.000000',
          memo: input.description,
        },
        {
          accountId: bankAccount.glCashAccountId,
          debitAmountMinor: '0',
          creditAmountMinor: absFee,
          currencyCode: bankAccount.currencyCode,
          exchangeRate: '1.000000',
          memo: `Settlement: ${input.description}`,
        },
      ],
    });

    const cashJournalLine = journal.lines.find((l) => l.accountId === bankAccount.glCashAccountId);
    if (!cashJournalLine) {
      throw new Error('Failed to resolve cash journal line.');
    }

    return this.manualMatch(tenantId, actor, {
      reconciliationId: input.reconciliationId,
      statementLineId: input.statementLineId,
      glJournalLineId: cashJournalLine.id,
      matchRule: 'FEE_ADJUSTMENT',
    });
  }

  // ─── 6. Sealing & Audit Proof ────────────────────────────────────────────────

  async sealReconciliation(
    tenantId: string,
    actor: string,
    input: SealReconciliationInputV1,
  ): Promise<BankReconciliationSessionV1> {
    const sessionRes = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.bank_reconciliations
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, input.reconciliationId],
    );
    if (sessionRes.rows.length === 0) {
      throw new NotFoundException('Reconciliation session not found.');
    }
    const session = sessionRes.rows[0];

    if (session.status === 'SEALED') {
      throw new BadRequestException('Reconciliation session is already sealed.');
    }

    if (session.unreconciled_difference_minor !== '0') {
      throw new BadRequestException(
        `CANNOT_SEAL_UNBALANCED_SESSION: Unreconciled difference is ${session.unreconciled_difference_minor} minor units. Must be 0.`,
      );
    }

    const matchesRes = await this.query(
      tenantId,
      `SELECT statement_line_id, gl_journal_line_id, matched_amount_minor
       FROM ${SCHEMA}.bank_reconciliation_matches
       WHERE tenant_id = $1 AND reconciliation_id = $2
       ORDER BY statement_line_id ASC`,
      [tenantId, input.reconciliationId],
    );

    const sealPayload = matchesRes.rows
      .map((m: any) => `${m.statement_line_id}:${m.gl_journal_line_id}:${m.matched_amount_minor}`)
      .join('|');
    const sealHash = createHash('sha256')
      .update(sealPayload || `EMPTY_SEAL:${input.reconciliationId}`)
      .digest('hex');

    const now = new Date().toISOString();

    await this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      await client.query(
        `UPDATE ${SCHEMA}.bank_reconciliations
         SET status = 'SEALED', seal_hash = $1, sealed_at = $2, sealed_by = $3, updated_at = $2
         WHERE id = $4`,
        [sealHash, now, actor, input.reconciliationId],
      );

      await client.query(
        `UPDATE ${SCHEMA}.bank_accounts
         SET current_cleared_balance_minor = $1, updated_at = $2
         WHERE id = $3`,
        [session.statement_ending_balance_minor, now, session.bank_account_id],
      );

      await client.query(
        `UPDATE ${SCHEMA}.bank_statements
         SET status = 'RECONCILED', updated_at = $1
         WHERE id = $2`,
        [now, session.statement_id],
      );

      await client.query(
        `INSERT INTO ${SCHEMA}.outbox_events (
           id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version,
           correlation_id, causation_id, schema_version, payload, status
         ) VALUES ($1, $2, 'finance.treasury', 'finance.bank.reconciliation.sealed.v1', 'bank_reconciliation', $3, 1, $3, null, 1, $4, 'PENDING')`,
        [
          randomUUID(),
          tenantId,
          input.reconciliationId,
          JSON.stringify({
            reconciliationId: input.reconciliationId,
            bankAccountId: session.bank_account_id,
            statementId: session.statement_id,
            sealHash,
            sealedBy: actor,
          }),
        ],
      );
    });

    return this.getReconciliationSession(tenantId, session.bank_account_id, session.statement_id);
  }

  async getReconciliationReport(
    tenantId: string,
    reconciliationId: string,
  ): Promise<BankReconciliationReportV1> {
    const sessionRes = await this.query(
      tenantId,
      `SELECT r.*, a.account_name, a.currency_code
       FROM ${SCHEMA}.bank_reconciliations r
       JOIN ${SCHEMA}.bank_accounts a ON a.id = r.bank_account_id
       WHERE r.tenant_id = $1 AND r.id = $2`,
      [tenantId, reconciliationId],
    );
    if (sessionRes.rows.length === 0) {
      throw new NotFoundException('Reconciliation session not found.');
    }
    const session = sessionRes.rows[0];

    const outstandingRes = await this.query(
      tenantId,
      `SELECT
        COALESCE(SUM(CASE WHEN l.debit_amount_minor > 0 THEN l.debit_amount_minor ELSE 0 END), 0)::text as outstanding_deposits,
        COALESCE(SUM(CASE WHEN l.credit_amount_minor > 0 THEN l.credit_amount_minor ELSE 0 END), 0)::text as outstanding_checks
       FROM ${SCHEMA}.gl_journal_lines l
       JOIN ${SCHEMA}.gl_journals j ON j.id = l.journal_id
       JOIN ${SCHEMA}.bank_accounts a ON a.gl_cash_account_id = l.account_id
       WHERE l.tenant_id = $1 AND a.id = $2 AND j.status = 'POSTED'
       AND NOT EXISTS (
         SELECT 1 FROM ${SCHEMA}.bank_reconciliation_matches m
         WHERE m.gl_journal_line_id = l.id
       )`,
      [tenantId, session.bank_account_id],
    );

    const deposits = outstandingRes.rows[0]?.outstanding_deposits || '0';
    const checks = outstandingRes.rows[0]?.outstanding_checks || '0';

    const stmtEnding = BigInt(session.statement_ending_balance_minor);
    const clearedBook = BigInt(session.cleared_book_balance_minor);
    const diff = session.unreconciled_difference_minor;

    return {
      reconciliationId: session.id,
      bankAccountId: session.bank_account_id,
      bankAccountName: session.account_name,
      currencyCode: session.currency_code,
      asOfDate: session.reconciliation_date,
      statementEndingBalanceMinor: stmtEnding.toString(),
      clearedBookBalanceMinor: clearedBook.toString(),
      outstandingDepositsMinor: deposits,
      outstandingChecksMinor: checks,
      adjustedBookBalanceMinor: (clearedBook + BigInt(deposits) - BigInt(checks)).toString(),
      unreconciledDifferenceMinor: diff,
      isBalanced: diff === '0',
      status: session.status,
      sealHash: session.seal_hash,
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async refreshReconciliationDifference(
    tenantId: string,
    reconciliationId: string,
  ): Promise<{ matchedCount: number; updatedDifferenceMinor: string; isBalanced: boolean }> {
    const sessionRes = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.bank_reconciliations WHERE id = $1`,
      [reconciliationId],
    );
    const session = sessionRes.rows[0];

    const matchedSumRes = await this.query(
      tenantId,
      `SELECT COALESCE(SUM(l.amount_minor), 0)::text as matched_sum, COUNT(m.id)::int as count
       FROM ${SCHEMA}.bank_reconciliation_matches m
       JOIN ${SCHEMA}.bank_statement_lines l ON l.id = m.statement_line_id
       WHERE m.tenant_id = $1 AND m.reconciliation_id = $2`,
      [tenantId, reconciliationId],
    );

    const matchedSum = BigInt(matchedSumRes.rows[0]?.matched_sum || '0');
    const statementEnding = BigInt(session.statement_ending_balance_minor);
    const updatedDifference = (statementEnding - matchedSum).toString();
    const isBalanced = updatedDifference === '0';

    await this.query(
      tenantId,
      `UPDATE ${SCHEMA}.bank_reconciliations
       SET cleared_book_balance_minor = $1, unreconciled_difference_minor = $2,
           status = CASE WHEN $3 = '0' THEN 'BALANCED' ELSE 'OPEN' END,
           updated_at = NOW()
       WHERE id = $4`,
      [matchedSum.toString(), updatedDifference, updatedDifference, reconciliationId],
    );

    return {
      matchedCount: matchedSumRes.rows[0]?.count || 0,
      updatedDifferenceMinor: updatedDifference,
      isBalanced,
    };
  }

  private mapBankAccountRow(row: Record<string, unknown>): BankAccountV1 {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      accountName: String(row.account_name),
      accountNumber: String(row.account_number),
      routingCode: row.routing_code ? String(row.routing_code) : null,
      iban: row.iban ? String(row.iban) : null,
      swiftBic: row.swift_bic ? String(row.swift_bic) : null,
      currencyCode: String(row.currency_code),
      glCashAccountId: String(row.gl_cash_account_id),
      currentClearedBalanceMinor: String(row.current_cleared_balance_minor),
      status: row.status as BankAccountV1['status'],
      version: Number(row.version),
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
      createdBy: row.created_by ? String(row.created_by) : null,
      updatedBy: row.updated_by ? String(row.updated_by) : null,
    };
  }

  private mapBankStatementRow(row: Record<string, unknown>): BankStatementV1 {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      bankAccountId: String(row.bank_account_id),
      statementNumber: String(row.statement_number),
      statementDate: String(row.statement_date).slice(0, 10),
      openingBalanceMinor: String(row.opening_balance_minor),
      closingBalanceMinor: String(row.closing_balance_minor),
      format: row.format as BankStatementV1['format'],
      sourceChecksum: String(row.source_checksum),
      status: row.status as BankStatementV1['status'],
      lineCount: row.line_count !== undefined ? Number(row.line_count) : undefined,
      version: Number(row.version),
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  private mapBankStatementLineRow(row: Record<string, unknown>): BankStatementLineV1 {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      statementId: String(row.statement_id),
      lineNumber: Number(row.line_number),
      transactionDate: String(row.transaction_date).slice(0, 10),
      valueDate: String(row.value_date).slice(0, 10),
      amountMinor: String(row.amount_minor),
      transactionType: row.transaction_type as BankStatementLineV1['transactionType'],
      reference: row.reference ? String(row.reference) : null,
      checkNumber: row.check_number ? String(row.check_number) : null,
      counterpartyName: row.counterparty_name ? String(row.counterparty_name) : null,
      counterpartyAccount: row.counterparty_account ? String(row.counterparty_account) : null,
      description: row.description ? String(row.description) : null,
      matchStatus: row.match_status as BankStatementLineV1['matchStatus'],
      matchedAt: row.matched_at ? new Date(row.matched_at as string).toISOString() : null,
      createdAt: new Date(row.created_at as string).toISOString(),
    };
  }

  private mapReconciliationSessionRow(row: Record<string, unknown>): BankReconciliationSessionV1 {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      bankAccountId: String(row.bank_account_id),
      statementId: String(row.statement_id),
      reconciliationDate: String(row.reconciliation_date).slice(0, 10),
      statementEndingBalanceMinor: String(row.statement_ending_balance_minor),
      clearedBookBalanceMinor: String(row.cleared_book_balance_minor),
      unreconciledDifferenceMinor: String(row.unreconciled_difference_minor),
      status: row.status as BankReconciliationSessionV1['status'],
      sealHash: row.seal_hash ? String(row.seal_hash) : null,
      sealedAt: row.sealed_at ? new Date(row.sealed_at as string).toISOString() : null,
      sealedBy: row.sealed_by ? String(row.sealed_by) : null,
      version: Number(row.version),
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  private mapMatchRow(row: Record<string, unknown>): BankReconciliationMatchV1 {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      reconciliationId: String(row.reconciliation_id),
      statementLineId: String(row.statement_line_id),
      glJournalLineId: String(row.gl_journal_line_id),
      matchedAmountMinor: String(row.matched_amount_minor),
      matchRule: row.match_rule as BankReconciliationMatchV1['matchRule'],
      matchedBy: String(row.matched_by),
      createdAt: new Date(row.created_at as string).toISOString(),
    };
  }
}
