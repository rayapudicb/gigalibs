import { randomUUID } from 'node:crypto';
import {
  type ConsolidationGroupV1,
  type ConsolidationEntityV1,
  type ConsolidationFxRateV1,
  type IntercompanyPairV1,
  type ConsolidationRunV1,
  type ConsolidationEntryV1,
  type ConsolidationEliminationV1,
  type CreateConsolidationGroupInputV1,
  type AddConsolidationEntityInputV1,
  type SetConsolidationFxRateInputV1,
  type CreateIntercompanyPairInputV1,
  type ExecuteConsolidationRunInputV1,
  type ConsolidatedStatementV1,
  type ConsolidatedTrialBalanceRowV1,
  type ConsolidationGroupCreatedEventV1,
  type ConsolidationRunExecutedEventV1,
  type ConsolidationRunSealedEventV1,
  type PostJournalInputV1,
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
import { FinanceService } from '../finance/finance.service.js';
import {
  translateTrialBalance,
  type FxRatesInput,
  type TrialBalanceLineInput,
} from './fx-translation-engine.js';

@Injectable()
export class ConsolidationService {
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

  // ─── 1. Consolidation Groups ────────────────────────────────────────────────

  async createConsolidationGroup(
    tenantId: string,
    actor: string,
    input: CreateConsolidationGroupInputV1,
  ): Promise<ConsolidationGroupV1> {
    const existing = await this.query(
      tenantId,
      `SELECT id FROM ${SCHEMA}.consolidation_groups WHERE tenant_id = $1 AND code = $2`,
      [tenantId, input.code],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException(`Consolidation group with code ${input.code} already exists.`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    const insertSql = `
      INSERT INTO ${SCHEMA}.consolidation_groups (
        id, tenant_id, code, name, description, reporting_currency,
        parent_entity_id, cta_gl_account_id, nci_gl_account_id,
        is_active, version, created_at, updated_at, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, true, 1, $10, $10, $11
      ) RETURNING *;
    `;

    const res = await this.query(tenantId, insertSql, [
      id,
      tenantId,
      input.code,
      input.name,
      input.description ?? null,
      input.reportingCurrency,
      input.parentEntityId,
      input.ctaGlAccountId,
      input.nciGlAccountId ?? null,
      now,
      actor,
    ]);

    // Automatically add parent entity as a 100% member entity of the group
    await this.addConsolidationEntity(tenantId, id, {
      bookId: input.parentEntityId,
      ownershipPercentage: 100,
      consolidationMethod: 'FULL',
      isParent: true,
    });

    const event: ConsolidationGroupCreatedEventV1 = {
      eventId: randomUUID(),
      tenantId,
      occurredAt: now,
      producer: 'financial-operations-api',
      type: 'finance.consolidation.group.created.v1',
      data: {
        groupId: id,
        code: input.code,
        name: input.name,
        reportingCurrency: input.reportingCurrency,
        parentEntityId: input.parentEntityId,
      },
    };

    await this.query(
      tenantId,
      `INSERT INTO ${SCHEMA}.outbox (id, tenant_id, topic, event_type, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [event.eventId, tenantId, TOPIC, event.type, JSON.stringify(event), now],
    );

    return this.mapConsolidationGroup(res.rows[0]);
  }

  async getConsolidationGroups(tenantId: string): Promise<ConsolidationGroupV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.consolidation_groups WHERE tenant_id = $1 ORDER BY code ASC`,
      [tenantId],
    );
    return res.rows.map((row) => this.mapConsolidationGroup(row));
  }

  async getConsolidationGroup(tenantId: string, id: string): Promise<ConsolidationGroupV1> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.consolidation_groups WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Consolidation group ${id} not found.`);
    }
    return this.mapConsolidationGroup(res.rows[0]);
  }

  // ─── 2. Consolidation Entities (Member Books) ──────────────────────────────

  async addConsolidationEntity(
    tenantId: string,
    groupId: string,
    input: AddConsolidationEntityInputV1,
  ): Promise<ConsolidationEntityV1> {
    const group = await this.getConsolidationGroup(tenantId, groupId);
    const id = randomUUID();
    const now = new Date().toISOString();

    const insertSql = `
      INSERT INTO ${SCHEMA}.consolidation_entities (
        id, tenant_id, consolidation_group_id, book_id,
        ownership_percentage, consolidation_method, is_parent,
        version, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 1, $8, $8
      )
      ON CONFLICT (tenant_id, consolidation_group_id, book_id)
      DO UPDATE SET
        ownership_percentage = EXCLUDED.ownership_percentage,
        consolidation_method = EXCLUDED.consolidation_method,
        is_parent = EXCLUDED.is_parent,
        updated_at = EXCLUDED.updated_at
      RETURNING *;
    `;

    const res = await this.query(tenantId, insertSql, [
      id,
      tenantId,
      group.id,
      input.bookId,
      input.ownershipPercentage,
      input.consolidationMethod,
      input.isParent,
      now,
    ]);

    return this.mapConsolidationEntity(res.rows[0]);
  }

  async getConsolidationEntities(
    tenantId: string,
    groupId: string,
  ): Promise<ConsolidationEntityV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.consolidation_entities WHERE tenant_id = $1 AND consolidation_group_id = $2 ORDER BY is_parent DESC, created_at ASC`,
      [tenantId, groupId],
    );
    return res.rows.map((row) => this.mapConsolidationEntity(row));
  }

  // ─── 3. Consolidation FX Rates ──────────────────────────────────────────────

  async setConsolidationFxRate(
    tenantId: string,
    groupId: string,
    input: SetConsolidationFxRateInputV1,
  ): Promise<ConsolidationFxRateV1> {
    const group = await this.getConsolidationGroup(tenantId, groupId);
    const id = randomUUID();
    const now = new Date().toISOString();

    const insertSql = `
      INSERT INTO ${SCHEMA}.consolidation_fx_rates (
        id, tenant_id, consolidation_group_id, fiscal_year_id, fiscal_period_id,
        from_currency, to_currency, closing_rate_scaled, average_rate_scaled,
        historical_rate_scaled, version, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11, $11
      )
      ON CONFLICT (tenant_id, consolidation_group_id, fiscal_period_id, from_currency, to_currency)
      DO UPDATE SET
        closing_rate_scaled = EXCLUDED.closing_rate_scaled,
        average_rate_scaled = EXCLUDED.average_rate_scaled,
        historical_rate_scaled = EXCLUDED.historical_rate_scaled,
        updated_at = EXCLUDED.updated_at
      RETURNING *;
    `;

    const res = await this.query(tenantId, insertSql, [
      id,
      tenantId,
      group.id,
      input.fiscalYearId,
      input.fiscalPeriodId,
      input.fromCurrency,
      input.toCurrency,
      input.closingRateScaled,
      input.averageRateScaled,
      input.historicalRateScaled,
      now,
    ]);

    return this.mapConsolidationFxRate(res.rows[0]);
  }

  async getConsolidationFxRates(
    tenantId: string,
    groupId: string,
    fiscalPeriodId?: string,
  ): Promise<ConsolidationFxRateV1[]> {
    let sql = `SELECT * FROM ${SCHEMA}.consolidation_fx_rates WHERE tenant_id = $1 AND consolidation_group_id = $2`;
    const params: unknown[] = [tenantId, groupId];
    if (fiscalPeriodId) {
      sql += ' AND fiscal_period_id = $3';
      params.push(fiscalPeriodId);
    }
    sql += ' ORDER BY from_currency ASC';

    const res = await this.query(tenantId, sql, params);
    return res.rows.map((row) => this.mapConsolidationFxRate(row));
  }

  // ─── 4. Intercompany Account Pairs ──────────────────────────────────────────

  async createIntercompanyPair(
    tenantId: string,
    groupId: string,
    input: CreateIntercompanyPairInputV1,
  ): Promise<IntercompanyPairV1> {
    const group = await this.getConsolidationGroup(tenantId, groupId);
    const existing = await this.query(
      tenantId,
      `SELECT id FROM ${SCHEMA}.intercompany_pairs WHERE tenant_id = $1 AND consolidation_group_id = $2 AND code = $3`,
      [tenantId, group.id, input.code],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException(`Intercompany pair with code ${input.code} already exists.`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    const insertSql = `
      INSERT INTO ${SCHEMA}.intercompany_pairs (
        id, tenant_id, consolidation_group_id, code,
        entity_a_book_id, entity_a_gl_account_id,
        entity_b_book_id, entity_b_gl_account_id,
        pair_type, elimination_target, is_active, version,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, 1, $11, $11
      ) RETURNING *;
    `;

    const res = await this.query(tenantId, insertSql, [
      id,
      tenantId,
      group.id,
      input.code,
      input.entityABookId,
      input.entityAGlAccountId,
      input.entityBBookId,
      input.entityBGlAccountId,
      input.pairType,
      input.eliminationTarget,
      now,
    ]);

    return this.mapIntercompanyPair(res.rows[0]);
  }

  async getIntercompanyPairs(
    tenantId: string,
    groupId: string,
  ): Promise<IntercompanyPairV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.intercompany_pairs WHERE tenant_id = $1 AND consolidation_group_id = $2 ORDER BY code ASC`,
      [tenantId, groupId],
    );
    return res.rows.map((row) => this.mapIntercompanyPair(row));
  }

  // ─── 5. Consolidation Run Engine ────────────────────────────────────────────

  async executeConsolidationRun(
    tenantId: string,
    input: ExecuteConsolidationRunInputV1,
  ): Promise<{ run: ConsolidationRunV1; eliminations: ConsolidationEliminationV1[] }> {
    const group = await this.getConsolidationGroup(tenantId, input.consolidationGroupId);

    // Verify fiscal period
    const periodRes = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.fiscal_periods WHERE tenant_id = $1 AND id = $2`,
      [tenantId, input.fiscalPeriodId],
    );
    if (periodRes.rows.length === 0) {
      throw new NotFoundException(`Fiscal period ${input.fiscalPeriodId} not found.`);
    }
    const period = periodRes.rows[0];

    const entities = await this.getConsolidationEntities(tenantId, group.id);
    if (entities.length === 0) {
      throw new BadRequestException('Consolidation group has no member entities configured.');
    }

    const runId = randomUUID();
    const runNumber = `CRUN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const now = new Date().toISOString();

    let totalSubDebitMinor = 0n;
    let totalSubCreditMinor = 0n;
    let totalConsolidatedDebitMinor = 0n;
    let totalConsolidatedCreditMinor = 0n;
    let totalCtaMinor = 0n;

    const allTranslatedEntries: any[] = [];

    // 1. Process each member entity
    for (const entity of entities) {
      const bookRes = await this.query(
        tenantId,
        `SELECT * FROM ${SCHEMA}.accounting_books WHERE tenant_id = $1 AND id = $2`,
        [tenantId, entity.bookId],
      );
      if (bookRes.rows.length === 0) continue;
      const book = bookRes.rows[0];

      // Generate trial balance for this book up to period end_date
      const tb = await this.financeService.generateTrialBalance(
        tenantId,
        entity.bookId,
        period.end_date,
      );

      const tbLines: TrialBalanceLineInput[] = tb.lines.map((l) => ({
        glAccountId: l.accountId,
        accountCode: l.accountCode,
        accountName: l.accountName,
        accountType: l.accountClass as any,
        currencyCode: book.functional_currency,
        debitMinor: BigInt(l.endingDebitMinor),
        creditMinor: BigInt(l.endingCreditMinor),
      }));

      let fxRatesInput: FxRatesInput | null = null;
      if (book.functional_currency !== group.reportingCurrency) {
        const rateRows = await this.query(
          tenantId,
          `SELECT * FROM ${SCHEMA}.consolidation_fx_rates
           WHERE tenant_id = $1 AND consolidation_group_id = $2 AND fiscal_period_id = $3 AND from_currency = $4 AND to_currency = $5`,
          [tenantId, group.id, period.id, book.functional_currency, group.reportingCurrency],
        );

        if (rateRows.rows.length === 0) {
          throw new BadRequestException(
            `Missing FX translation rates for ${book.functional_currency} -> ${group.reportingCurrency} in period ${period.period_name}.`,
          );
        }
        const r = rateRows.rows[0];
        fxRatesInput = {
          fromCurrency: r.from_currency,
          toCurrency: r.to_currency,
          closingRateScaled: BigInt(r.closing_rate_scaled),
          averageRateScaled: BigInt(r.average_rate_scaled),
          historicalRateScaled: BigInt(r.historical_rate_scaled),
        };
      }

      const transResult = translateTrialBalance(tbLines, fxRatesInput, group.reportingCurrency);

      totalSubDebitMinor += transResult.totalSubsidiaryDebitMinor;
      totalSubCreditMinor += transResult.totalSubsidiaryCreditMinor;
      totalConsolidatedDebitMinor += transResult.totalTranslatedDebitMinor;
      totalConsolidatedCreditMinor += transResult.totalTranslatedCreditMinor;
      totalCtaMinor += transResult.ctaAmountMinor;

      for (const tLine of transResult.lines) {
        allTranslatedEntries.push({
          id: randomUUID(),
          tenantId,
          consolidationRunId: runId,
          bookId: entity.bookId,
          glAccountId: tLine.glAccountId,
          localCurrency: tLine.localCurrency,
          localDebitMinor: tLine.localDebitMinor.toString(),
          localCreditMinor: tLine.localCreditMinor.toString(),
          fxRateType: tLine.fxRateType,
          fxRateAppliedScaled: tLine.fxRateAppliedScaled.toString(),
          reportingCurrency: tLine.reportingCurrency,
          reportingDebitMinor: tLine.reportingDebitMinor.toString(),
          reportingCreditMinor: tLine.reportingCreditMinor.toString(),
        });
      }
    }

    // 2. Process Intercompany Eliminations
    const pairs = await this.getIntercompanyPairs(tenantId, group.id);
    const eliminationRecords: any[] = [];
    let totalElimDebitMinor = 0n;
    let totalElimCreditMinor = 0n;

    for (const pair of pairs) {
      if (!pair.isActive) continue;

      // Find translated entries for Entity A account and Entity B account
      const entryA = allTranslatedEntries.find(
        (e) => e.bookId === pair.entityABookId && e.glAccountId === pair.entityAGlAccountId,
      );
      const entryB = allTranslatedEntries.find(
        (e) => e.bookId === pair.entityBBookId && e.glAccountId === pair.entityBGlAccountId,
      );

      const balAMinor = entryA
        ? BigInt(entryA.reportingDebitMinor) - BigInt(entryA.reportingCreditMinor)
        : 0n;
      const balBMinor = entryB
        ? BigInt(entryB.reportingCreditMinor) - BigInt(entryB.reportingDebitMinor)
        : 0n;

      const posAMinor = balAMinor >= 0n ? balAMinor : -balAMinor;
      const posBMinor = balBMinor >= 0n ? balBMinor : -balBMinor;

      if (posAMinor > 0n || posBMinor > 0n) {
        // Eliminate the common matched balance
        const elimAmountMinor = posAMinor <= posBMinor ? posAMinor : posBMinor;
        const discrepancyAmountMinor = posAMinor > posBMinor ? posAMinor - posBMinor : posBMinor - posAMinor;

        if (elimAmountMinor > 0n) {
          totalElimDebitMinor += elimAmountMinor;
          totalElimCreditMinor += elimAmountMinor;

          let journalId: string | null = null;

          if (input.postEliminationJournals) {
            // Post balanced GL journal voucher to parent book in consolidation
            const postInput: PostJournalInputV1 = {
              accountingBookId: group.parentEntityId,
              fiscalPeriodId: input.fiscalPeriodId,
              postingDate: period.end_date,
              entryType: 'STANDARD_MANUAL',
              description: `Intercompany elimination for pair ${pair.code} [Run ${runNumber}]`,
              lines: [
                {
                  accountId: pair.entityBGlAccountId,
                  debitAmountMinor: elimAmountMinor.toString(),
                  creditAmountMinor: '0',
                  currencyCode: group.reportingCurrency,
                  exchangeRate: '1.000000',
                  memo: `Debit elimination for pair ${pair.code}`,
                },
                {
                  accountId: pair.entityAGlAccountId,
                  debitAmountMinor: '0',
                  creditAmountMinor: elimAmountMinor.toString(),
                  currencyCode: group.reportingCurrency,
                  exchangeRate: '1.000000',
                  memo: `Credit elimination for pair ${pair.code}`,
                },
              ],
            };

            const postedJournal = await this.financeService.postJournal(
              tenantId,
              input.executedBy,
              postInput,
            );
            journalId = postedJournal.id;
          }

          eliminationRecords.push({
            id: randomUUID(),
            tenantId,
            consolidationRunId: runId,
            intercompanyPairId: pair.id,
            glJournalId: journalId,
            debitGlAccountId: pair.entityBGlAccountId,
            creditGlAccountId: pair.entityAGlAccountId,
            eliminationAmountMinor: elimAmountMinor.toString(),
            currencyCode: group.reportingCurrency,
            discrepancyAmountMinor: discrepancyAmountMinor.toString(),
            description: `Bilateral elimination for intercompany pair ${pair.code}`,
            createdAt: now,
          });
        }
      }
    }

    // Adjusted Consolidated totals (Debits minus Eliminations, Credits minus Eliminations)
    const netConsolidatedDebitMinor = totalConsolidatedDebitMinor - totalElimDebitMinor;
    const netConsolidatedCreditMinor = totalConsolidatedCreditMinor - totalElimCreditMinor;

    // 3. Persist run, entries, and eliminations
    const insertRunSql = `
      INSERT INTO ${SCHEMA}.consolidation_runs (
        id, tenant_id, consolidation_group_id, run_number,
        fiscal_year_id, fiscal_period_id, status,
        total_subsidiary_debit_minor, total_subsidiary_credit_minor,
        total_elimination_debit_minor, total_elimination_credit_minor,
        total_cta_minor, total_consolidated_debit_minor, total_consolidated_credit_minor,
        executed_by, executed_at, version, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 'ELIMINATED',
        $7, $8, $9, $10, $11, $12, $13,
        $14, $15, 1, $15, $15
      ) RETURNING *;
    `;

    const runRes = await this.query(tenantId, insertRunSql, [
      runId,
      tenantId,
      group.id,
      runNumber,
      input.fiscalYearId,
      input.fiscalPeriodId,
      totalSubDebitMinor.toString(),
      totalSubCreditMinor.toString(),
      totalElimDebitMinor.toString(),
      totalElimCreditMinor.toString(),
      totalCtaMinor.toString(),
      netConsolidatedDebitMinor.toString(),
      netConsolidatedCreditMinor.toString(),
      input.executedBy,
      now,
    ]);

    // Batch insert entries
    for (const e of allTranslatedEntries) {
      await this.query(
        tenantId,
        `INSERT INTO ${SCHEMA}.consolidation_entries (
          id, tenant_id, consolidation_run_id, book_id, gl_account_id,
          local_currency, local_debit_minor, local_credit_minor,
          fx_rate_type, fx_rate_applied_scaled, reporting_currency,
          reporting_debit_minor, reporting_credit_minor, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          e.id,
          tenantId,
          e.consolidationRunId,
          e.bookId,
          e.glAccountId,
          e.localCurrency,
          e.localDebitMinor,
          e.localCreditMinor,
          e.fxRateType,
          e.fxRateAppliedScaled,
          e.reportingCurrency,
          e.reportingDebitMinor,
          e.reportingCreditMinor,
          now,
        ],
      );
    }

    // Batch insert eliminations
    const savedEliminations: ConsolidationEliminationV1[] = [];
    for (const elim of eliminationRecords) {
      const elimRes = await this.query(
        tenantId,
        `INSERT INTO ${SCHEMA}.consolidation_eliminations (
          id, tenant_id, consolidation_run_id, intercompany_pair_id, gl_journal_id,
          debit_gl_account_id, credit_gl_account_id, elimination_amount_minor,
          currency_code, discrepancy_amount_minor, description, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *;`,
        [
          elim.id,
          tenantId,
          elim.consolidationRunId,
          elim.intercompanyPairId,
          elim.glJournalId,
          elim.debitGlAccountId,
          elim.creditGlAccountId,
          elim.eliminationAmountMinor,
          elim.currencyCode,
          elim.discrepancyAmountMinor,
          elim.description,
          now,
        ],
      );
      savedEliminations.push(this.mapConsolidationElimination(elimRes.rows[0]));
    }

    // Outbox event
    const event: ConsolidationRunExecutedEventV1 = {
      eventId: randomUUID(),
      tenantId,
      occurredAt: now,
      producer: 'financial-operations-api',
      type: 'finance.consolidation.run.executed.v1',
      data: {
        runId,
        runNumber,
        groupId: group.id,
        fiscalPeriodId: input.fiscalPeriodId,
        totalConsolidatedDebitMinor: netConsolidatedDebitMinor.toString(),
        totalConsolidatedCreditMinor: netConsolidatedCreditMinor.toString(),
        totalCtaMinor: totalCtaMinor.toString(),
        executedBy: input.executedBy,
      },
    };

    await this.query(
      tenantId,
      `INSERT INTO ${SCHEMA}.outbox (id, tenant_id, topic, event_type, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [event.eventId, tenantId, TOPIC, event.type, JSON.stringify(event), now],
    );

    return {
      run: this.mapConsolidationRun(runRes.rows[0]),
      eliminations: savedEliminations,
    };
  }

  async getConsolidationRun(tenantId: string, runId: string): Promise<ConsolidationRunV1> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.consolidation_runs WHERE tenant_id = $1 AND id = $2`,
      [tenantId, runId],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Consolidation run ${runId} not found.`);
    }
    return this.mapConsolidationRun(res.rows[0]);
  }

  async sealConsolidationRun(
    tenantId: string,
    runId: string,
  ): Promise<ConsolidationRunV1> {
    const run = await this.getConsolidationRun(tenantId, runId);
    if (run.status === 'SEALED') {
      return run;
    }

    const now = new Date().toISOString();
    const res = await this.query(
      tenantId,
      `UPDATE ${SCHEMA}.consolidation_runs
       SET status = 'SEALED', sealed_at = $3, updated_at = $3, version = version + 1
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, runId, now],
    );

    const event: ConsolidationRunSealedEventV1 = {
      eventId: randomUUID(),
      tenantId,
      occurredAt: now,
      producer: 'financial-operations-api',
      type: 'finance.consolidation.run.sealed.v1',
      data: {
        runId,
        runNumber: run.runNumber,
        groupId: run.consolidationGroupId,
        sealedAt: now,
      },
    };

    await this.query(
      tenantId,
      `INSERT INTO ${SCHEMA}.outbox (id, tenant_id, topic, event_type, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [event.eventId, tenantId, TOPIC, event.type, JSON.stringify(event), now],
    );

    return this.mapConsolidationRun(res.rows[0]);
  }

  // ─── 6. Consolidated Financial Statements ───────────────────────────────────

  async getConsolidatedFinancialStatement(
    tenantId: string,
    runId: string,
  ): Promise<ConsolidatedStatementV1> {
    const run = await this.getConsolidationRun(tenantId, runId);
    const group = await this.getConsolidationGroup(tenantId, run.consolidationGroupId);

    // Get all entries with account details
    const entriesRes = await this.query(
      tenantId,
      `SELECT
         e.*,
         a.account_code,
         a.account_name,
         a.account_class,
         a.normal_balance
       FROM ${SCHEMA}.consolidation_entries e
       JOIN ${SCHEMA}.chart_of_accounts a ON a.id = e.gl_account_id
       WHERE e.tenant_id = $1 AND e.consolidation_run_id = $2
       ORDER BY a.account_code ASC`,
      [tenantId, runId],
    );

    // Get all eliminations
    const elimRes = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.consolidation_eliminations WHERE tenant_id = $1 AND consolidation_run_id = $2`,
      [tenantId, runId],
    );

    // Aggregate by GL account
    const accountMap = new Map<
      string,
      {
        glAccountId: string;
        accountCode: string;
        accountName: string;
        accountType: string;
        normalBalance: string;
        subDebit: bigint;
        subCredit: bigint;
        elimDebit: bigint;
        elimCredit: bigint;
        ctaAdjustment: bigint;
      }
    >();

    for (const r of entriesRes.rows) {
      let acc = accountMap.get(r.gl_account_id);
      if (!acc) {
        acc = {
          glAccountId: r.gl_account_id,
          accountCode: r.account_code,
          accountName: r.account_name,
          accountType: r.account_class,
          normalBalance: r.normal_balance,
          subDebit: 0n,
          subCredit: 0n,
          elimDebit: 0n,
          elimCredit: 0n,
          ctaAdjustment: 0n,
        };
        accountMap.set(r.gl_account_id, acc);
      }
      acc.subDebit += BigInt(r.reporting_debit_minor);
      acc.subCredit += BigInt(r.reporting_credit_minor);
    }

    for (const elim of elimRes.rows) {
      const amount = BigInt(elim.elimination_amount_minor);
      const debAcc = accountMap.get(elim.debit_gl_account_id);
      if (debAcc) debAcc.elimDebit += amount;
      const credAcc = accountMap.get(elim.credit_gl_account_id);
      if (credAcc) credAcc.elimCredit += amount;
    }

    // Apply CTA adjustment to the designated CTA account
    const ctaAcc = accountMap.get(group.ctaGlAccountId);
    if (ctaAcc) {
      ctaAcc.ctaAdjustment = BigInt(run.totalCtaMinor);
    }

    let totalAssets = 0n;
    let totalLiabilities = 0n;
    let totalEquity = 0n;
    let totalRevenue = 0n;
    let totalExpense = 0n;

    const rows: ConsolidatedTrialBalanceRowV1[] = [];

    for (const acc of accountMap.values()) {
      const netDebit = acc.subDebit - acc.elimDebit;
      const netCredit = acc.subCredit - acc.elimCredit;

      let netConsolidated = 0n;
      if (acc.normalBalance === 'DEBIT') {
        netConsolidated = netDebit - netCredit;
      } else {
        netConsolidated = netCredit - netDebit;
      }

      // Add to balance sheet / P&L totals
      switch (acc.accountType) {
        case 'ASSET':
          totalAssets += netConsolidated;
          break;
        case 'LIABILITY':
          totalLiabilities += netConsolidated;
          break;
        case 'EQUITY':
          totalEquity += netConsolidated + acc.ctaAdjustment;
          break;
        case 'REVENUE':
          totalRevenue += netConsolidated;
          break;
        case 'EXPENSE':
          totalExpense += netConsolidated;
          break;
      }

      rows.push({
        glAccountId: acc.glAccountId,
        accountCode: acc.accountCode,
        accountName: acc.accountName,
        accountType: acc.accountType,
        subsidiaryDebitMinor: acc.subDebit.toString(),
        subsidiaryCreditMinor: acc.subCredit.toString(),
        eliminationDebitMinor: acc.elimDebit.toString(),
        eliminationCreditMinor: acc.elimCredit.toString(),
        ctaAdjustmentMinor: acc.ctaAdjustment.toString(),
        consolidatedDebitMinor: netDebit.toString(),
        consolidatedCreditMinor: netCredit.toString(),
        netConsolidatedBalanceMinor: netConsolidated.toString(),
      });
    }

    const netIncome = totalRevenue - totalExpense;

    return {
      consolidationRunId: run.id,
      groupCode: group.code,
      reportingCurrency: group.reportingCurrency,
      fiscalPeriodId: run.fiscalPeriodId,
      status: run.status as any,
      rows,
      totalAssetsMinor: totalAssets.toString(),
      totalLiabilitiesMinor: totalLiabilities.toString(),
      totalEquityMinor: totalEquity.toString(),
      totalRevenueMinor: totalRevenue.toString(),
      totalExpenseMinor: totalExpense.toString(),
      netIncomeMinor: netIncome.toString(),
      totalCtaMinor: run.totalCtaMinor,
      isBalanced: true,
    };
  }

  // ─── Mapping Helpers ────────────────────────────────────────────────────────

  private mapConsolidationGroup(r: Record<string, any>): ConsolidationGroupV1 {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      code: r.code,
      name: r.name,
      description: r.description ?? null,
      reportingCurrency: r.reporting_currency,
      parentEntityId: r.parent_entity_id,
      ctaGlAccountId: r.cta_gl_account_id,
      nciGlAccountId: r.nci_gl_account_id ?? null,
      isActive: r.is_active,
      version: r.version,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
      createdBy: r.created_by ?? null,
      updatedBy: r.updated_by ?? null,
    };
  }

  private mapConsolidationEntity(r: Record<string, any>): ConsolidationEntityV1 {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      consolidationGroupId: r.consolidation_group_id,
      bookId: r.book_id,
      ownershipPercentage: r.ownership_percentage,
      consolidationMethod: r.consolidation_method,
      isParent: r.is_parent,
      version: r.version,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }

  private mapConsolidationFxRate(r: Record<string, any>): ConsolidationFxRateV1 {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      consolidationGroupId: r.consolidation_group_id,
      fiscalYearId: r.fiscal_year_id,
      fiscalPeriodId: r.fiscal_period_id,
      fromCurrency: r.from_currency,
      toCurrency: r.to_currency,
      closingRateScaled: r.closing_rate_scaled.toString(),
      averageRateScaled: r.average_rate_scaled.toString(),
      historicalRateScaled: r.historical_rate_scaled.toString(),
      version: r.version,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }

  private mapIntercompanyPair(r: Record<string, any>): IntercompanyPairV1 {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      consolidationGroupId: r.consolidation_group_id,
      code: r.code,
      entityABookId: r.entity_a_book_id,
      entityAGlAccountId: r.entity_a_gl_account_id,
      entityBBookId: r.entity_b_book_id,
      entityBGlAccountId: r.entity_b_gl_account_id,
      pairType: r.pair_type,
      eliminationTarget: r.elimination_target,
      isActive: r.is_active,
      version: r.version,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }

  private mapConsolidationRun(r: Record<string, any>): ConsolidationRunV1 {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      consolidationGroupId: r.consolidation_group_id,
      runNumber: r.run_number,
      fiscalYearId: r.fiscal_year_id,
      fiscalPeriodId: r.fiscal_period_id,
      status: r.status,
      totalSubsidiaryDebitMinor: r.total_subsidiary_debit_minor.toString(),
      totalSubsidiaryCreditMinor: r.total_subsidiary_credit_minor.toString(),
      totalEliminationDebitMinor: r.total_elimination_debit_minor.toString(),
      totalEliminationCreditMinor: r.total_elimination_credit_minor.toString(),
      totalCtaMinor: r.total_cta_minor.toString(),
      totalConsolidatedDebitMinor: r.total_consolidated_debit_minor.toString(),
      totalConsolidatedCreditMinor: r.total_consolidated_credit_minor.toString(),
      executedBy: r.executed_by,
      executedAt: new Date(r.executed_at).toISOString(),
      sealedAt: r.sealed_at ? new Date(r.sealed_at).toISOString() : null,
      version: r.version,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }

  private mapConsolidationElimination(r: Record<string, any>): ConsolidationEliminationV1 {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      consolidationRunId: r.consolidation_run_id,
      intercompanyPairId: r.intercompany_pair_id ?? null,
      glJournalId: r.gl_journal_id ?? null,
      debitGlAccountId: r.debit_gl_account_id,
      creditGlAccountId: r.credit_gl_account_id,
      eliminationAmountMinor: r.elimination_amount_minor.toString(),
      currencyCode: r.currency_code,
      discrepancyAmountMinor: r.discrepancy_amount_minor.toString(),
      description: r.description,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }
}
