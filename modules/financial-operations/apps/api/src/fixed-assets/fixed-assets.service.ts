import { randomUUID } from 'node:crypto';
import {
  type FixedAssetClassV1,
  type FixedAssetV1,
  type AssetDepreciationScheduleV1,
  type AssetDepreciationRunV1,
  type AssetDisposalV1,
  type CreateFixedAssetClassInputV1,
  type CreateFixedAssetInputV1,
  type CapitalizeFixedAssetInputV1,
  type ExecuteDepreciationRunInputV1,
  type DisposeFixedAssetInputV1,
  type PostJournalInputV1,
  type AssetCapitalizedEventV1,
  type DepreciationRunPostedEventV1,
  type AssetDisposedEventV1,
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
import { calculateDepreciationSchedule } from './depreciation-calculator.js';

@Injectable()
export class FixedAssetsService {
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

  // ─── 1. Fixed Asset Classes ──────────────────────────────────────────────────

  async createAssetClass(
    tenantId: string,
    input: CreateFixedAssetClassInputV1,
  ): Promise<FixedAssetClassV1> {
    const existing = await this.query(
      tenantId,
      `SELECT id FROM ${SCHEMA}.fixed_asset_classes WHERE tenant_id = $1 AND code = $2`,
      [tenantId, input.code],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException(`Fixed asset class with code ${input.code} already exists.`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `INSERT INTO ${SCHEMA}.fixed_asset_classes (
          id, tenant_id, code, name, description, depreciation_method,
          default_useful_life_months, default_salvage_percentage,
          asset_gl_account_id, depreciation_expense_gl_account_id,
          accumulated_depreciation_gl_account_id, disposal_gain_loss_gl_account_id,
          is_active, version, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, 1, $13, $13)
        RETURNING *`,
        [
          id,
          tenantId,
          input.code,
          input.name,
          input.description ?? null,
          input.depreciationMethod ?? 'STRAIGHT_LINE',
          input.defaultUsefulLifeMonths,
          input.defaultSalvagePercentage ?? 0,
          input.assetGlAccountId,
          input.depreciationExpenseGlAccountId,
          input.accumulatedDepreciationGlAccountId,
          input.disposalGainLossGlAccountId,
          now,
        ],
      );

      return this.mapAssetClass(res.rows[0]);
    });
  }

  async listAssetClasses(tenantId: string): Promise<FixedAssetClassV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.fixed_asset_classes WHERE tenant_id = $1 ORDER BY code ASC`,
      [tenantId],
    );
    return res.rows.map((row) => this.mapAssetClass(row));
  }

  async getAssetClass(tenantId: string, id: string): Promise<FixedAssetClassV1> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.fixed_asset_classes WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Fixed asset class ${id} not found.`);
    }
    return this.mapAssetClass(res.rows[0]);
  }

  // ─── 2. Fixed Assets Register ────────────────────────────────────────────────

  async createFixedAsset(
    tenantId: string,
    actor: string,
    input: CreateFixedAssetInputV1,
  ): Promise<FixedAssetV1> {
    const assetClass = await this.getAssetClass(tenantId, input.assetClassId);

    const existing = await this.query(
      tenantId,
      `SELECT id FROM ${SCHEMA}.fixed_assets WHERE tenant_id = $1 AND asset_code = $2`,
      [tenantId, input.assetCode],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException(`Fixed asset with code ${input.assetCode} already exists.`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const usefulLife = input.usefulLifeMonths ?? assetClass.defaultUsefulLifeMonths;
    const deprMethod = input.depreciationMethod ?? assetClass.depreciationMethod;

    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `INSERT INTO ${SCHEMA}.fixed_assets (
          id, tenant_id, asset_code, asset_name, description, asset_class_id,
          status, acquisition_date, capitalization_date, currency_code,
          acquisition_cost_minor, salvage_value_minor, useful_life_months,
          depreciation_method, convention, current_book_value_minor,
          accumulated_depreciation_minor, physical_asset_ref, asset_tag,
          serial_number, org_unit_id, place_id, custodian_party_id,
          version, created_at, updated_at, created_by, updated_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          'DRAFT', $7, $8, $9,
          $10, $11, $12,
          $13, $14, $10,
          0, $15, $16,
          $17, $18, $19, $20,
          1, $21, $21, $22, null
        ) RETURNING *`,
        [
          id,
          tenantId,
          input.assetCode,
          input.assetName,
          input.description ?? null,
          input.assetClassId,
          input.acquisitionDate,
          input.capitalizationDate ?? null,
          input.currencyCode ?? 'USD',
          input.acquisitionCostMinor,
          input.salvageValueMinor ?? '0',
          usefulLife,
          deprMethod,
          input.convention ?? 'FULL_MONTH',
          input.physicalAssetRef ?? null,
          input.assetTag ?? null,
          input.serialNumber ?? null,
          input.orgUnitId ?? null,
          input.placeId ?? null,
          input.custodianPartyId ?? null,
          now,
          actor,
        ],
      );

      return this.mapFixedAsset(res.rows[0]);
    });
  }

  async capitalizeFixedAsset(
    tenantId: string,
    actor: string,
    assetId: string,
    input: CapitalizeFixedAssetInputV1,
  ): Promise<FixedAssetV1> {
    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      const assetRes = await client.query(
        `SELECT a.*, c.asset_gl_account_id, c.depreciation_expense_gl_account_id, c.accumulated_depreciation_gl_account_id
         FROM ${SCHEMA}.fixed_assets a
         JOIN ${SCHEMA}.fixed_asset_classes c ON c.id = a.asset_class_id
         WHERE a.tenant_id = $1 AND a.id = $2 FOR UPDATE`,
        [tenantId, assetId],
      );
      if (assetRes.rows.length === 0) {
        throw new NotFoundException(`Fixed asset ${assetId} not found.`);
      }

      const assetRow = assetRes.rows[0];
      if (assetRow.status !== 'DRAFT') {
        throw new BadRequestException(`Asset ${assetId} is already in ${assetRow.status} status and cannot be capitalized.`);
      }

      // 1. Fetch upcoming open fiscal periods for depreciation scheduling
      const periodsRes = await client.query(
        `SELECT id, period_name, start_date, end_date
         FROM ${SCHEMA}.fiscal_periods
         WHERE tenant_id = $1 AND start_date >= $2
         ORDER BY start_date ASC
         LIMIT $3`,
        [tenantId, input.capitalizationDate, Math.max(1, assetRow.useful_life_months)],
      );

      const periodInputs = periodsRes.rows.map((r, idx) => ({
        periodId: r.id,
        periodNumber: idx + 1,
        scheduleDate: r.end_date instanceof Date ? r.end_date.toISOString().split('T')[0] : String(r.end_date).split('T')[0],
      }));

      // 2. Generate projected schedule
      if (periodInputs.length > 0 && assetRow.useful_life_months > 0) {
        const calculatedLines = calculateDepreciationSchedule({
          acquisitionCostMinor: assetRow.acquisition_cost_minor.toString(),
          salvageValueMinor: assetRow.salvage_value_minor.toString(),
          usefulLifeMonths: assetRow.useful_life_months,
          depreciationMethod: assetRow.depreciation_method,
          periods: periodInputs,
        });

        // Delete existing draft schedules if any
        await client.query(
          `DELETE FROM ${SCHEMA}.asset_depreciation_schedules WHERE tenant_id = $1 AND asset_id = $2`,
          [tenantId, assetId],
        );

        for (const line of calculatedLines) {
          await client.query(
            `INSERT INTO ${SCHEMA}.asset_depreciation_schedules (
              id, tenant_id, asset_id, fiscal_period_id, period_number,
              schedule_date, depreciation_amount_minor, accumulated_depreciation_minor,
              book_value_minor, status, version, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, $4,
              $5, $6, $7,
              $8, 'PROJECTED', 1, NOW(), NOW()
            )`,
            [
              tenantId,
              assetId,
              line.periodId,
              line.periodNumber,
              line.scheduleDate,
              line.depreciationAmountMinor,
              line.accumulatedDepreciationMinor,
              line.bookValueMinor,
            ],
          );
        }
      }

      // 3. Update asset status to CAPITALIZED
      const now = new Date().toISOString();
      const updatedRes = await client.query(
        `UPDATE ${SCHEMA}.fixed_assets
         SET status = 'CAPITALIZED', capitalization_date = $1, updated_at = NOW(), updated_by = $2, version = version + 1
         WHERE tenant_id = $3 AND id = $4
         RETURNING *`,
        [input.capitalizationDate, actor, tenantId, assetId],
      );

      const capitalizedAsset = this.mapFixedAsset(updatedRes.rows[0]);

      // 4. Emit CloudEvent to Outbox
      const event: AssetCapitalizedEventV1 = {
        id: randomUUID(),
        source: 'gigalibs.finance.fixed-assets',
        specversion: '1.0',
        datacontenttype: 'application/json',
        time: now,
        tenantid: tenantId,
        correlationid: randomUUID(),
        type: 'finance.asset.capitalized.v1',
        data: {
          assetId: capitalizedAsset.id,
          assetCode: capitalizedAsset.assetCode,
          assetClassId: capitalizedAsset.assetClassId,
          acquisitionCostMinor: capitalizedAsset.acquisitionCostMinor,
          capitalizationDate: input.capitalizationDate,
        },
      };

      await this.writeOutbox(
        client,
        tenantId,
        TOPIC,
        'finance.asset.capitalized.v1',
        'fixed_asset',
        capitalizedAsset.id,
        capitalizedAsset.version,
        event.correlationid ?? randomUUID(),
        event,
      );

      return capitalizedAsset;
    });
  }

  async listFixedAssets(tenantId: string, status?: string): Promise<FixedAssetV1[]> {
    let sql = `SELECT * FROM ${SCHEMA}.fixed_assets WHERE tenant_id = $1`;
    const params: unknown[] = [tenantId];
    if (status) {
      sql += ' AND status = $2';
      params.push(status);
    }
    sql += ' ORDER BY asset_code ASC';

    const res = await this.query(tenantId, sql, params);
    return res.rows.map((row) => this.mapFixedAsset(row));
  }

  async getFixedAsset(tenantId: string, id: string): Promise<FixedAssetV1> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.fixed_assets WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Fixed asset ${id} not found.`);
    }
    return this.mapFixedAsset(res.rows[0]);
  }

  // ─── 3. Depreciation Schedules & Periodic Run Engine ──────────────────────────

  async getAssetSchedules(tenantId: string, assetId: string): Promise<AssetDepreciationScheduleV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.asset_depreciation_schedules
       WHERE tenant_id = $1 AND asset_id = $2
       ORDER BY period_number ASC`,
      [tenantId, assetId],
    );
    return res.rows.map((row) => this.mapDepreciationSchedule(row));
  }

  async executeDepreciationRun(
    tenantId: string,
    actor: string,
    input: ExecuteDepreciationRunInputV1,
  ): Promise<AssetDepreciationRunV1> {
    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      // 1. Validate fiscal period
      const periodRes = await client.query(
        `SELECT p.*, b.id as book_id, b.currency_code
         FROM ${SCHEMA}.fiscal_periods p
         JOIN ${SCHEMA}.accounting_books b ON b.id = p.accounting_book_id
         WHERE p.tenant_id = $1 AND p.id = $2`,
        [tenantId, input.fiscalPeriodId],
      );
      if (periodRes.rows.length === 0) {
        throw new NotFoundException(`Fiscal period ${input.fiscalPeriodId} not found.`);
      }
      const periodRow = periodRes.rows[0];

      // 2. Find eligible projected schedule lines for this period
      const schedulesRes = await client.query(
        `SELECT s.id as schedule_id, s.asset_id, s.depreciation_amount_minor, s.period_number,
                a.asset_code, a.asset_class_id, a.current_book_value_minor, a.accumulated_depreciation_minor, a.salvage_value_minor,
                c.depreciation_expense_gl_account_id, c.accumulated_depreciation_gl_account_id
         FROM ${SCHEMA}.asset_depreciation_schedules s
         JOIN ${SCHEMA}.fixed_assets a ON a.id = s.asset_id
         JOIN ${SCHEMA}.fixed_asset_classes c ON c.id = a.asset_class_id
         WHERE s.tenant_id = $1 AND s.fiscal_period_id = $2 AND s.status = 'PROJECTED'
           AND a.status IN ('CAPITALIZED', 'DEPRECIATING')
         ORDER BY a.asset_code ASC
         FOR UPDATE OF s, a`,
        [tenantId, input.fiscalPeriodId],
      );

      if (schedulesRes.rows.length === 0) {
        throw new BadRequestException(`No pending projected depreciation schedules found for period ${periodRow.period_name}.`);
      }

      // 3. Aggregate totals by asset class for GL Journal Lines
      const classTotals = new Map<string, {
        expenseAccountId: string;
        accumAccountId: string;
        totalMinor: bigint;
      }>();

      let runTotalMinor = 0n;
      const assetIds = new Set<string>();

      for (const row of schedulesRes.rows) {
        const amount = BigInt(row.depreciation_amount_minor);
        if (amount <= 0n) continue;

        runTotalMinor += amount;
        assetIds.add(row.asset_id);

        const classId = row.asset_class_id;
        const current = classTotals.get(classId) ?? {
          expenseAccountId: row.depreciation_expense_gl_account_id,
          accumAccountId: row.accumulated_depreciation_gl_account_id,
          totalMinor: 0n,
        };
        current.totalMinor += amount;
        classTotals.set(classId, current);
      }

      if (runTotalMinor === 0n) {
        throw new BadRequestException('Total depreciation amount for this period is zero.');
      }

      // 4. Construct balanced double-entry GL journal
      const journalLines: Array<{
        accountId: string;
        debitAmountMinor: string;
        creditAmountMinor: string;
        currencyCode: string;
        exchangeRate: string;
        memo: string;
      }> = [];

      for (const [, val] of classTotals.entries()) {
        const amountStr = val.totalMinor.toString();
        // Debit: Depreciation Expense
        journalLines.push({
          accountId: val.expenseAccountId,
          debitAmountMinor: amountStr,
          creditAmountMinor: '0',
          currencyCode: periodRow.currency_code,
          exchangeRate: '1.000000',
          memo: `Depreciation run ${periodRow.period_name} - expense`,
        });
        // Credit: Accumulated Depreciation
        journalLines.push({
          accountId: val.accumAccountId,
          debitAmountMinor: '0',
          creditAmountMinor: amountStr,
          currencyCode: periodRow.currency_code,
          exchangeRate: '1.000000',
          memo: `Depreciation run ${periodRow.period_name} - accumulated`,
        });
      }

      // The run id is the journal's source document, so the journal drills through to this run (WI-OI-120c).
      const runId = randomUUID();
      const postJournalInput: PostJournalInputV1 = {
        accountingBookId: periodRow.book_id,
        fiscalPeriodId: input.fiscalPeriodId,
        postingDate: input.runDate,
        entryType: 'STANDARD_MANUAL',
        description: `Periodic Depreciation Run for ${periodRow.period_name}`,
        sourceDocumentType: 'DEPRECIATION_RUN',
        sourceDocumentId: runId,
        lines: journalLines,
      };

      const journal = await this.financeService.postJournal(tenantId, actor, postJournalInput, client);

      // 5. Update schedules to POSTED and update fixed asset balances
      for (const row of schedulesRes.rows) {
        const amount = BigInt(row.depreciation_amount_minor);
        await client.query(
          `UPDATE ${SCHEMA}.asset_depreciation_schedules
           SET status = 'POSTED', journal_entry_id = $1, updated_at = NOW(), version = version + 1
           WHERE id = $2`,
          [journal.id, row.schedule_id],
        );

        const newAccum = BigInt(row.accumulated_depreciation_minor) + amount;
        const newBookValue = BigInt(row.current_book_value_minor) - amount;
        const isFullyDepreciated = newBookValue <= BigInt(row.salvage_value_minor);
        const newStatus = isFullyDepreciated ? 'FULLY_DEPRECIATED' : 'DEPRECIATING';

        await client.query(
          `UPDATE ${SCHEMA}.fixed_assets
           SET accumulated_depreciation_minor = $1, current_book_value_minor = $2,
               status = $3, updated_at = NOW(), updated_by = $4, version = version + 1
           WHERE id = $5`,
          [newAccum.toString(), newBookValue.toString(), newStatus, actor, row.asset_id],
        );
      }

      // 6. Record Asset Depreciation Run
      const runCode = `DEPR-${periodRow.period_name}-${Date.now().toString().slice(-4)}`;
      const now = new Date().toISOString();

      const runRes = await client.query(
        `INSERT INTO ${SCHEMA}.asset_depreciation_runs (
          id, tenant_id, run_code, fiscal_period_id, run_date,
          total_depreciation_amount_minor, asset_count, journal_entry_id,
          status, notes, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'POSTED', $9, $10)
        RETURNING *`,
        [
          runId,
          tenantId,
          runCode,
          input.fiscalPeriodId,
          input.runDate,
          runTotalMinor.toString(),
          assetIds.size,
          journal.id,
          input.notes ?? null,
          now,
        ],
      );

      const run = this.mapDepreciationRun(runRes.rows[0]);

      // 7. Emit CloudEvent to Outbox
      const event: DepreciationRunPostedEventV1 = {
        id: randomUUID(),
        source: 'gigalibs.finance.fixed-assets',
        specversion: '1.0',
        datacontenttype: 'application/json',
        time: now,
        tenantid: tenantId,
        correlationid: randomUUID(),
        type: 'finance.depreciation.run.posted.v1',
        data: {
          runId: run.id,
          runCode: run.runCode,
          fiscalPeriodId: run.fiscalPeriodId,
          totalDepreciationAmountMinor: run.totalDepreciationAmountMinor,
          assetCount: run.assetCount,
          journalEntryId: journal.id,
        },
      };

      await this.writeOutbox(
        client,
        tenantId,
        TOPIC,
        'finance.depreciation.run.posted.v1',
        'depreciation_run',
        run.id,
        1,
        event.correlationid ?? randomUUID(),
        event,
      );

      return run;
    });
  }

  // ─── 4. Asset Disposal & Retirement Engine ──────────────────────────────────

  async disposeFixedAsset(
    tenantId: string,
    actor: string,
    assetId: string,
    input: DisposeFixedAssetInputV1,
  ): Promise<AssetDisposalV1> {
    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      const assetRes = await client.query(
        `SELECT a.*, c.asset_gl_account_id, c.accumulated_depreciation_gl_account_id, c.disposal_gain_loss_gl_account_id
         FROM ${SCHEMA}.fixed_assets a
         JOIN ${SCHEMA}.fixed_asset_classes c ON c.id = a.asset_class_id
         WHERE a.tenant_id = $1 AND a.id = $2 FOR UPDATE`,
        [tenantId, assetId],
      );
      if (assetRes.rows.length === 0) {
        throw new NotFoundException(`Fixed asset ${assetId} not found.`);
      }

      const assetRow = assetRes.rows[0];
      if (['DISPOSED', 'WRITTEN_OFF'].includes(assetRow.status)) {
        throw new BadRequestException(`Asset ${assetRow.asset_code} is already disposed or written off.`);
      }

      // 1. Resolve fiscal period for disposal date
      const bookRes = await client.query(
        `SELECT id, currency_code FROM ${SCHEMA}.accounting_books WHERE tenant_id = $1 AND is_primary = true LIMIT 1`,
        [tenantId],
      );
      if (bookRes.rows.length === 0) {
        throw new NotFoundException('Primary accounting book not found.');
      }
      const book = bookRes.rows[0];
      const period = await this.financeService.findPeriodForDate(tenantId, book.id, input.disposalDate);

      // 2. Mathematical exact calculation of gain / loss
      // Net Book Value = Cost - Accumulated
      const costMinor = BigInt(assetRow.acquisition_cost_minor);
      const accumMinor = BigInt(assetRow.accumulated_depreciation_minor);
      const nbvMinor = BigInt(assetRow.current_book_value_minor);
      const proceedsMinor = BigInt(input.proceedsAmountMinor ?? '0');
      const gainLossMinor = proceedsMinor - nbvMinor; // positive = gain, negative = loss

      // 3. Construct balanced disposal journal lines
      const journalLines: Array<{
        accountId: string;
        debitAmountMinor: string;
        creditAmountMinor: string;
        currencyCode: string;
        exchangeRate: string;
        memo: string;
      }> = [];

      // Debit: Accumulated Depreciation (clearing it to 0)
      if (accumMinor > 0n) {
        journalLines.push({
          accountId: assetRow.accumulated_depreciation_gl_account_id,
          debitAmountMinor: accumMinor.toString(),
          creditAmountMinor: '0',
          currencyCode: book.currency_code,
          exchangeRate: '1.000000',
          memo: `Disposal ${assetRow.asset_code} - clear accumulated depreciation`,
        });
      }

      // Debit: Cash/Bank proceeds (if proceeds > 0)
      if (proceedsMinor > 0n) {
        let cashGlAccountId = assetRow.disposal_gain_loss_gl_account_id;
        if (input.clearingBankAccountId) {
          const bankRes = await client.query(
            `SELECT gl_cash_account_id FROM ${SCHEMA}.bank_accounts WHERE tenant_id = $1 AND id = $2`,
            [tenantId, input.clearingBankAccountId],
          );
          if (bankRes.rows.length > 0) {
            cashGlAccountId = bankRes.rows[0].gl_cash_account_id;
          }
        }
        journalLines.push({
          accountId: cashGlAccountId,
          debitAmountMinor: proceedsMinor.toString(),
          creditAmountMinor: '0',
          currencyCode: book.currency_code,
          exchangeRate: '1.000000',
          memo: `Disposal ${assetRow.asset_code} - disposal proceeds`,
        });
      }

      // Credit: Fixed Asset Cost (clearing original cost to 0)
      journalLines.push({
        accountId: assetRow.asset_gl_account_id,
        debitAmountMinor: '0',
        creditAmountMinor: costMinor.toString(),
        currencyCode: book.currency_code,
        exchangeRate: '1.000000',
        memo: `Disposal ${assetRow.asset_code} - derecognize asset cost`,
      });

      // Gain / Loss balancing entry
      if (gainLossMinor > 0n) {
        // Credit: Gain on Disposal
        journalLines.push({
          accountId: assetRow.disposal_gain_loss_gl_account_id,
          debitAmountMinor: '0',
          creditAmountMinor: gainLossMinor.toString(),
          currencyCode: book.currency_code,
          exchangeRate: '1.000000',
          memo: `Disposal ${assetRow.asset_code} - gain on sale`,
        });
      } else if (gainLossMinor < 0n) {
        // Debit: Loss on Disposal
        const lossMinor = -gainLossMinor;
        journalLines.push({
          accountId: assetRow.disposal_gain_loss_gl_account_id,
          debitAmountMinor: lossMinor.toString(),
          creditAmountMinor: '0',
          currencyCode: book.currency_code,
          exchangeRate: '1.000000',
          memo: `Disposal ${assetRow.asset_code} - loss on disposal`,
        });
      }

      const postJournalInput: PostJournalInputV1 = {
        accountingBookId: book.id,
        fiscalPeriodId: period.id,
        postingDate: input.disposalDate,
        entryType: 'STANDARD_MANUAL',
        description: `Disposal of Fixed Asset ${assetRow.asset_code} (${input.disposalType})`,
        sourceDocumentType: 'ASSET_DISPOSAL',
        sourceDocumentId: assetId,
        lines: journalLines,
      };

      const journal = await this.financeService.postJournal(tenantId, actor, postJournalInput, client);

      // 4. Update asset status and cancel future projected schedules
      const newStatus = input.disposalType === 'SALE' ? 'DISPOSED' : 'WRITTEN_OFF';
      await client.query(
        `UPDATE ${SCHEMA}.fixed_assets
         SET status = $1, current_book_value_minor = 0, updated_at = NOW(), updated_by = $2, version = version + 1
         WHERE id = $3`,
        [newStatus, actor, assetId],
      );

      await client.query(
        `UPDATE ${SCHEMA}.asset_depreciation_schedules
         SET status = 'REVERSED', updated_at = NOW()
         WHERE tenant_id = $1 AND asset_id = $2 AND status = 'PROJECTED'`,
        [tenantId, assetId],
      );

      // 5. Insert Asset Disposal record
      const disposalId = randomUUID();
      const now = new Date().toISOString();

      const disposalRes = await client.query(
        `INSERT INTO ${SCHEMA}.asset_disposals (
          id, tenant_id, asset_id, disposal_date, disposal_type,
          proceeds_amount_minor, net_book_value_minor, gain_loss_amount_minor,
          clearing_bank_account_id, journal_entry_id, notes, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          disposalId,
          tenantId,
          assetId,
          input.disposalDate,
          input.disposalType,
          proceedsMinor.toString(),
          nbvMinor.toString(),
          gainLossMinor.toString(),
          input.clearingBankAccountId ?? null,
          journal.id,
          input.notes ?? null,
          now,
        ],
      );

      const disposal = this.mapAssetDisposal(disposalRes.rows[0]);

      // 6. Emit CloudEvent to Outbox
      const event: AssetDisposedEventV1 = {
        id: randomUUID(),
        source: 'gigalibs.finance.fixed-assets',
        specversion: '1.0',
        datacontenttype: 'application/json',
        time: now,
        tenantid: tenantId,
        correlationid: randomUUID(),
        type: 'finance.asset.disposed.v1',
        data: {
          assetId,
          disposalId: disposal.id,
          disposalType: input.disposalType,
          proceedsAmountMinor: disposal.proceedsAmountMinor,
          netBookValueMinor: disposal.netBookValueMinor,
          gainLossAmountMinor: disposal.gainLossAmountMinor,
          journalEntryId: journal.id,
        },
      };

      await this.writeOutbox(
        client,
        tenantId,
        TOPIC,
        'finance.asset.disposed.v1',
        'asset_disposal',
        disposal.id,
        1,
        event.correlationid ?? randomUUID(),
        event,
      );

      return disposal;
    });
  }

  // ─── 5. Helper Mappers & Outbox Writer ────────────────────────────────────────

  private async writeOutbox(
    client: PoolClient,
    tenantId: string,
    topic: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    aggregateVersion: number,
    correlationId: string,
    payload: unknown,
  ): Promise<void> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO ${SCHEMA}.outbox_events (
        id, tenant_id, topic, event_type, aggregate_type, aggregate_id,
        aggregate_version, correlation_id, schema_version, payload, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, 'PENDING')`,
      [
        id,
        tenantId,
        topic,
        eventType,
        aggregateType,
        aggregateId,
        aggregateVersion,
        correlationId,
        JSON.stringify(payload),
      ],
    );
  }

  private mapAssetClass(row: any): FixedAssetClassV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      code: row.code,
      name: row.name,
      description: row.description ?? null,
      depreciationMethod: row.depreciation_method,
      defaultUsefulLifeMonths: Number(row.default_useful_life_months),
      defaultSalvagePercentage: Number(row.default_salvage_percentage),
      assetGlAccountId: row.asset_gl_account_id,
      depreciationExpenseGlAccountId: row.depreciation_expense_gl_account_id,
      accumulatedDepreciationGlAccountId: row.accumulated_depreciation_gl_account_id,
      disposalGainLossGlAccountId: row.disposal_gain_loss_gl_account_id,
      isActive: Boolean(row.is_active),
      version: Number(row.version),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }

  private mapFixedAsset(row: any): FixedAssetV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      assetCode: row.asset_code,
      assetName: row.asset_name,
      description: row.description ?? null,
      assetClassId: row.asset_class_id,
      status: row.status,
      acquisitionDate: row.acquisition_date instanceof Date ? row.acquisition_date.toISOString().split('T')[0] : String(row.acquisition_date).split('T')[0],
      capitalizationDate: row.capitalization_date ? (row.capitalization_date instanceof Date ? row.capitalization_date.toISOString().split('T')[0] : String(row.capitalization_date).split('T')[0]) : null,
      currencyCode: row.currency_code,
      acquisitionCostMinor: row.acquisition_cost_minor.toString(),
      salvageValueMinor: row.salvage_value_minor.toString(),
      usefulLifeMonths: Number(row.useful_life_months),
      depreciationMethod: row.depreciation_method,
      convention: row.convention,
      currentBookValueMinor: row.current_book_value_minor.toString(),
      accumulatedDepreciationMinor: row.accumulated_depreciation_minor.toString(),
      physicalAssetRef: row.physical_asset_ref ?? null,
      assetTag: row.asset_tag ?? null,
      serialNumber: row.serial_number ?? null,
      orgUnitId: row.org_unit_id ?? null,
      placeId: row.place_id ?? null,
      custodianPartyId: row.custodian_party_id ?? null,
      version: Number(row.version),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      createdBy: row.created_by ?? null,
      updatedBy: row.updated_by ?? null,
    };
  }

  private mapDepreciationSchedule(row: any): AssetDepreciationScheduleV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      assetId: row.asset_id,
      fiscalPeriodId: row.fiscal_period_id,
      periodNumber: Number(row.period_number),
      scheduleDate: row.schedule_date instanceof Date ? row.schedule_date.toISOString().split('T')[0] : String(row.schedule_date).split('T')[0],
      depreciationAmountMinor: row.depreciation_amount_minor.toString(),
      accumulatedDepreciationMinor: row.accumulated_depreciation_minor.toString(),
      bookValueMinor: row.book_value_minor.toString(),
      status: row.status,
      journalEntryId: row.journal_entry_id ?? null,
      version: Number(row.version),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }

  private mapDepreciationRun(row: any): AssetDepreciationRunV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      runCode: row.run_code,
      fiscalPeriodId: row.fiscal_period_id,
      runDate: row.run_date instanceof Date ? row.run_date.toISOString().split('T')[0] : String(row.run_date).split('T')[0],
      totalDepreciationAmountMinor: row.total_depreciation_amount_minor.toString(),
      assetCount: Number(row.asset_count),
      journalEntryId: row.journal_entry_id ?? null,
      status: row.status,
      notes: row.notes ?? null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
  }

  private mapAssetDisposal(row: any): AssetDisposalV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      assetId: row.asset_id,
      disposalDate: row.disposal_date instanceof Date ? row.disposal_date.toISOString().split('T')[0] : String(row.disposal_date).split('T')[0],
      disposalType: row.disposal_type,
      proceedsAmountMinor: row.proceeds_amount_minor.toString(),
      netBookValueMinor: row.net_book_value_minor.toString(),
      gainLossAmountMinor: row.gain_loss_amount_minor.toString(),
      clearingBankAccountId: row.clearing_bank_account_id ?? null,
      journalEntryId: row.journal_entry_id,
      notes: row.notes ?? null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
  }
}
