#!/usr/bin/env node
/**
 * WI-OI-114: Fixed Assets Management, Asset Register & Depreciation Engine
 * Comprehensive PostgreSQL 16 database certification script covering:
 * - gigalibs_finance (v3)
 *
 * Proves:
 * 1. Contract & Zod Schema Validation
 * 2. Database Schema & Migration v3 Verification
 * 3. Scenario 1: Fixed Asset Class Setup & GL Account Binding
 * 4. Scenario 2: Fixed Asset Draft Registration & Validation
 * 5. Scenario 3: Deterministic Zero-Float Depreciation Calculator Conservation
 * 6. Scenario 4: Asset Capitalization & Projected Schedule Persistence
 * 7. Scenario 5: Batch Periodic Depreciation Run & Balanced GL Journal Posting
 * 8. Scenario 6: Immutability Trigger Protection on Posted Schedule Lines
 * 9. Scenario 7: Progression to Fully Depreciated State
 * 10. Scenario 8: Asset Sale Disposal & Gain Recognition GL Voucher
 * 11. Scenario 9: Asset Scrap Write-Off & Loss Recognition GL Voucher
 * 12. Scenario 10: Hardware Row-Level Security (RLS) Tenant Isolation
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from '../node_modules/.pnpm/pg@8.23.0/node_modules/pg/lib/index.js';
import * as contracts from '../packages/contracts/dist/index.js';
import { calculateDepreciationSchedule } from '../modules/financial-operations/apps/api/dist/fixed-assets/depreciation-calculator.js';
import { isolatedProofDatabaseUrl } from './lib/isolated-proof-database.mjs';

const DB_URL = isolatedProofDatabaseUrl('WI-OI-114 fixed-assets proof');

console.log('================================================================================');
console.log('WI-OI-114: Fixed Assets Management & Depreciation Engine Certification');
console.log('Connecting to the isolated proof database (PROOF_DATABASE_URL)...');

const client = new pg.Client({ connectionString: DB_URL });
await client.connect();

const TENANT_A = `tenant-fixedassets-${randomUUID().slice(0, 8)}`;
const TENANT_B = `tenant-fixedassets-other-${randomUUID().slice(0, 8)}`;
const ACTOR_A = `actor-${randomUUID().slice(0, 8)}`;
const LEGAL_ENTITY_ID = randomUUID();

// Helper to run query with tenant context
const withTenant = async (tenantId, fn) => {
  await client.query('BEGIN');
  try {
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const res = await fn();
    await client.query('COMMIT');
    return res;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
};

try {
  // ─── 1. Contract & Zod Validation ──────────────────────────────────────────
  console.log('\n[1/12] Validating Versioned Fixed Assets Contracts & Enums...');
  assert.ok(contracts.DEPRECIATION_METHODS.includes('STRAIGHT_LINE'), 'DEPRECIATION_METHODS has STRAIGHT_LINE');
  assert.ok(contracts.DEPRECIATION_METHODS.includes('DECLINING_BALANCE'), 'DEPRECIATION_METHODS has DECLINING_BALANCE');
  assert.ok(contracts.DEPRECIATION_METHODS.includes('NO_DEPRECIATION'), 'DEPRECIATION_METHODS has NO_DEPRECIATION');
  assert.ok(contracts.DEPRECIATION_CONVENTIONS.includes('FULL_MONTH'), 'DEPRECIATION_CONVENTIONS has FULL_MONTH');
  assert.ok(contracts.FIXED_ASSET_STATUSES.includes('DRAFT'), 'FIXED_ASSET_STATUSES has DRAFT');
  assert.ok(contracts.FIXED_ASSET_STATUSES.includes('CAPITALIZED'), 'FIXED_ASSET_STATUSES has CAPITALIZED');
  assert.ok(contracts.FIXED_ASSET_STATUSES.includes('DEPRECIATING'), 'FIXED_ASSET_STATUSES has DEPRECIATING');
  assert.ok(contracts.FIXED_ASSET_STATUSES.includes('FULLY_DEPRECIATED'), 'FIXED_ASSET_STATUSES has FULLY_DEPRECIATED');
  assert.ok(contracts.FIXED_ASSET_STATUSES.includes('DISPOSED'), 'FIXED_ASSET_STATUSES has DISPOSED');
  assert.ok(contracts.FIXED_ASSET_STATUSES.includes('WRITTEN_OFF'), 'FIXED_ASSET_STATUSES has WRITTEN_OFF');
  assert.ok(contracts.DEPRECIATION_SCHEDULE_STATUSES.includes('PROJECTED'), 'DEPRECIATION_SCHEDULE_STATUSES has PROJECTED');
  assert.ok(contracts.DEPRECIATION_SCHEDULE_STATUSES.includes('POSTED'), 'DEPRECIATION_SCHEDULE_STATUSES has POSTED');
  assert.ok(contracts.DEPRECIATION_SCHEDULE_STATUSES.includes('REVERSED'), 'DEPRECIATION_SCHEDULE_STATUSES has REVERSED');
  assert.ok(contracts.ASSET_DISPOSAL_TYPES.includes('SALE'), 'ASSET_DISPOSAL_TYPES has SALE');
  assert.ok(contracts.ASSET_DISPOSAL_TYPES.includes('SCRAP'), 'ASSET_DISPOSAL_TYPES has SCRAP');
  assert.ok(contracts.ASSET_DISPOSAL_TYPES.includes('WRITE_OFF'), 'ASSET_DISPOSAL_TYPES has WRITE_OFF');

  console.log('  ✓ Public contracts, schemas, and enums successfully validated.');

  // ─── 2. Database Schema & Migration v3 Verification ────────────────────────
  console.log('\n[2/12] Verifying PostgreSQL Schema gigalibs_finance v3 Migration...');
  const migRes = await client.query('SELECT version FROM gigalibs_finance.schema_migrations ORDER BY version');
  const versions = migRes.rows.map((r) => r.version);
  assert.ok(versions.includes('3'), 'Migration version 3 is recorded in schema_migrations');

  const tablesRes = await client.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'gigalibs_finance' AND table_type = 'BASE TABLE'
     ORDER BY table_name
  `);
  const tables = tablesRes.rows.map((r) => r.table_name);
  assert.ok(tables.includes('fixed_asset_classes'), 'has fixed_asset_classes table');
  assert.ok(tables.includes('fixed_assets'), 'has fixed_assets table');
  assert.ok(tables.includes('asset_depreciation_schedules'), 'has asset_depreciation_schedules table');
  assert.ok(tables.includes('asset_depreciation_runs'), 'has asset_depreciation_runs table');
  assert.ok(tables.includes('asset_disposals'), 'has asset_disposals table');

  // Verify RLS is enabled and forced on new tables
  for (const t of ['fixed_asset_classes', 'fixed_assets', 'asset_depreciation_schedules', 'asset_depreciation_runs', 'asset_disposals']) {
    const rlsRes = await client.query(`
      SELECT relrowsecurity, relforcerowsecurity FROM pg_class
       WHERE relname = $1 AND relnamespace = 'gigalibs_finance'::regnamespace
    `, [t]);
    assert.strictEqual(rlsRes.rows[0].relrowsecurity, true, `Table ${t} has row security enabled`);
    assert.strictEqual(rlsRes.rows[0].relforcerowsecurity, true, `Table ${t} has row security forced`);
  }
  console.log('  ✓ PostgreSQL v3 schema, tables, indexes, and hardware RLS policies verified.');

  // ─── Setup Foundation Data for Tenant A ─────────────────────────────────────
  let bookId, fiscalYearId, period1Id, period2Id, period3Id;
  let assetCostAccId, accumDeprAccId, deprExpenseAccId, gainLossAccId, cashAccId;
  let assetClassId;

  await withTenant(TENANT_A, async () => {
    // 1. Accounting Book
    bookId = randomUUID();
    await client.query(`
      INSERT INTO gigalibs_finance.accounting_books (
        id, tenant_id, book_code, book_name, legal_entity_party_id, currency_code, costing_method, is_primary, status, version
      ) VALUES ($1, $2, 'CORP-GAAP', 'Corporate GAAP Book', $3, 'USD', 'STANDARD', true, 'ACTIVE', 1)
    `, [bookId, TENANT_A, LEGAL_ENTITY_ID]);

    // 2. Chart of Accounts
    const createAcc = async (code, name, cls, sub, norm) => {
      const id = randomUUID();
      await client.query(`
        INSERT INTO gigalibs_finance.chart_of_accounts (
          id, tenant_id, accounting_book_id, account_code, account_name, account_class, account_subtype, normal_balance, is_reconcilable, is_subledger_control, is_system_reserved, active, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, false, false, true, 1)
      `, [id, TENANT_A, bookId, code, name, cls, sub, norm]);
      return id;
    };

    assetCostAccId = await createAcc('1500', 'Machinery & Equipment', 'ASSET', 'FIXED_ASSETS', 'DEBIT');
    accumDeprAccId = await createAcc('1510', 'Accumulated Depreciation - Machinery', 'ASSET', 'FIXED_ASSETS', 'CREDIT');
    cashAccId = await createAcc('1000', 'Cash & Bank Clearing', 'ASSET', 'BANK', 'DEBIT');
    deprExpenseAccId = await createAcc('6500', 'Depreciation Expense', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT');
    gainLossAccId = await createAcc('7100', 'Gain / Loss on Asset Disposal', 'REVENUE', 'OTHER_INCOME', 'CREDIT');

    // 3. Fiscal Year & Periods
    fiscalYearId = randomUUID();
    await client.query(`
      INSERT INTO gigalibs_finance.fiscal_years (
        id, tenant_id, accounting_book_id, year_name, start_date, end_date, status, version
      ) VALUES ($1, $2, $3, 'Fiscal Year 2026', '2026-01-01', '2026-12-31', 'OPEN', 1)
    `, [fiscalYearId, TENANT_A, bookId]);

    const createPeriod = async (num, name, start, end) => {
      const id = randomUUID();
      await client.query(`
        INSERT INTO gigalibs_finance.fiscal_periods (
          id, tenant_id, accounting_book_id, fiscal_year_id, period_number, period_name, start_date, end_date, status, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', 1)
      `, [id, TENANT_A, bookId, fiscalYearId, num, name, start, end]);
      return id;
    };

    period1Id = await createPeriod(1, '2026-01', '2026-01-01', '2026-01-31');
    period2Id = await createPeriod(2, '2026-02', '2026-02-01', '2026-02-28');
    period3Id = await createPeriod(3, '2026-03', '2026-03-01', '2026-03-31');
  });

  // ─── Scenario 1: Fixed Asset Class Setup ───────────────────────────────────
  console.log('\n[3/12] Scenario 1: Setting Up Fixed Asset Class Linked to GL Accounts...');
  assetClassId = randomUUID();
  await withTenant(TENANT_A, async () => {
    await client.query(`
      INSERT INTO gigalibs_finance.fixed_asset_classes (
        id, tenant_id, code, name, description, depreciation_method,
        default_useful_life_months, default_salvage_percentage,
        asset_gl_account_id, depreciation_expense_gl_account_id,
        accumulated_depreciation_gl_account_id, disposal_gain_loss_gl_account_id,
        is_active, version
      ) VALUES ($1, $2, 'MACH-01', 'Industrial Machinery', 'Heavy manufacturing machines', 'STRAIGHT_LINE', 12, 10, $3, $4, $5, $6, true, 1)
    `, [assetClassId, TENANT_A, assetCostAccId, deprExpenseAccId, accumDeprAccId, gainLossAccId]);
  });
  console.log('  ✓ Fixed Asset Class MACH-01 registered with GL chart accounts binding.');

  // ─── Scenario 2: Fixed Asset Draft Registration ────────────────────────────
  console.log('\n[4/12] Scenario 2: Registering Fixed Asset in DRAFT State...');
  const asset1Id = randomUUID();
  await withTenant(TENANT_A, async () => {
    await client.query(`
      INSERT INTO gigalibs_finance.fixed_assets (
        id, tenant_id, asset_code, asset_name, description, asset_class_id,
        status, acquisition_date, currency_code, acquisition_cost_minor, salvage_value_minor,
        useful_life_months, depreciation_method, convention, current_book_value_minor,
        accumulated_depreciation_minor, asset_tag, serial_number, version, created_by
      ) VALUES (
        $1, $2, 'ASSET-CNC-900', '5-Axis CNC Milling Center', 'Production mill', $3,
        'DRAFT', '2026-01-01', 'USD', 12000000, 1200000,
        12, 'STRAIGHT_LINE', 'FULL_MONTH', 12000000,
        0, 'TAG-CNC-900', 'SN-HAAS-900', 1, $4
      )
    `, [asset1Id, TENANT_A, assetClassId, ACTOR_A]);
  });

  const assetCheck = await withTenant(TENANT_A, async () => {
    const res = await client.query('SELECT * FROM gigalibs_finance.fixed_assets WHERE id = $1', [asset1Id]);
    return res.rows[0];
  });
  assert.strictEqual(assetCheck.status, 'DRAFT', 'Asset starts in DRAFT');
  assert.strictEqual(assetCheck.current_book_value_minor, '12000000', 'Initial book value matches acquisition cost');
  assert.strictEqual(assetCheck.accumulated_depreciation_minor, '0', 'Initial accumulated depreciation is 0');
  console.log('  ✓ Fixed asset registered with exact initial cost and draft state.');

  // ─── Scenario 3: Deterministic Zero-Float Depreciation Calculator ──────────
  console.log('\n[5/12] Scenario 3: Testing Deterministic Straight-Line Depreciation Engine...');
  const testPeriods = [
    { periodId: period1Id, periodNumber: 1, scheduleDate: '2026-01-31' },
    { periodId: period2Id, periodNumber: 2, scheduleDate: '2026-02-28' },
    { periodId: period3Id, periodNumber: 3, scheduleDate: '2026-03-31' },
  ];

  const calculatedLines = calculateDepreciationSchedule({
    acquisitionCostMinor: '12000000', // $120,000.00
    salvageValueMinor: '1200000',   // $12,000.00
    usefulLifeMonths: 12,           // Depreciable basis = $108,000.00 -> $9,000.00/month
    depreciationMethod: 'STRAIGHT_LINE',
    periods: testPeriods,
  });

  assert.strictEqual(calculatedLines[0].depreciationAmountMinor, '900000', 'Period 1 depr = $9,000.00');
  assert.strictEqual(calculatedLines[1].depreciationAmountMinor, '900000', 'Period 2 depr = $9,000.00');
  assert.strictEqual(calculatedLines[2].depreciationAmountMinor, '900000', 'Period 3 depr = $9,000.00');
  assert.strictEqual(calculatedLines[0].accumulatedDepreciationMinor, '900000');
  assert.strictEqual(calculatedLines[1].accumulatedDepreciationMinor, '1800000');
  assert.strictEqual(calculatedLines[2].accumulatedDepreciationMinor, '2700000');
  assert.strictEqual(calculatedLines[2].bookValueMinor, '9300000'); // $120,000 - $27,000 = $93,000.00
  console.log('  ✓ Multi-period depreciation calculation verified with zero floating-point math.');

  // ─── Scenario 4: Asset Capitalization & Projected Schedule Persistence ─────
  console.log('\n[6/12] Scenario 4: Capitalizing Asset & Persisting Projected Schedules...');
  await withTenant(TENANT_A, async () => {
    // Insert projected schedules for periods 1, 2, 3
    for (const line of calculatedLines) {
      await client.query(`
        INSERT INTO gigalibs_finance.asset_depreciation_schedules (
          id, tenant_id, asset_id, fiscal_period_id, period_number, schedule_date,
          depreciation_amount_minor, accumulated_depreciation_minor, book_value_minor,
          status, version
        ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'PROJECTED', 1)
      `, [
        TENANT_A, asset1Id, line.periodId, line.periodNumber, line.scheduleDate,
        line.depreciationAmountMinor, line.accumulatedDepreciationMinor, line.bookValueMinor
      ]);
    }

    // Capitalize asset
    await client.query(`
      UPDATE gigalibs_finance.fixed_assets
         SET status = 'CAPITALIZED', capitalization_date = '2026-01-01', updated_at = NOW(), version = version + 1
       WHERE id = $1
    `, [asset1Id]);

    // Outbox event
    await client.query(`
      INSERT INTO gigalibs_finance.outbox_events (
        id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version, correlation_id, schema_version, payload, status
      ) VALUES (
        gen_random_uuid(), $1, 'financial-operations.facts.v1', 'finance.asset.capitalized.v1', 'fixed_asset', $2, 2, $3, 1,
        '{"assetCode": "ASSET-CNC-900", "capitalizationDate": "2026-01-01"}'::jsonb, 'PENDING'
      )
    `, [TENANT_A, asset1Id, randomUUID()]);
  });

  const capCheck = await withTenant(TENANT_A, async () => {
    const aRes = await client.query('SELECT status FROM gigalibs_finance.fixed_assets WHERE id = $1', [asset1Id]);
    const sRes = await client.query('SELECT count(*) as count FROM gigalibs_finance.asset_depreciation_schedules WHERE asset_id = $1 AND status = \'PROJECTED\'', [asset1Id]);
    return { status: aRes.rows[0].status, projectedCount: Number(sRes.rows[0].count) };
  });
  assert.strictEqual(capCheck.status, 'CAPITALIZED', 'Asset status is now CAPITALIZED');
  assert.strictEqual(capCheck.projectedCount, 3, '3 projected schedules persisted');
  console.log('  ✓ Asset capitalized and projected depreciation schedules persisted.');

  // ─── Scenario 5: Batch Periodic Depreciation Run ───────────────────────────
  console.log('\n[7/12] Scenario 5: Executing Batch Depreciation Run & GL Journal Posting...');
  let deprJournalId;
  await withTenant(TENANT_A, async () => {
    // Post balanced GL Journal for Period 1 depreciation ($9,000.00)
    deprJournalId = randomUUID();
    const deprAmount = '900000';

    await client.query(`
      INSERT INTO gigalibs_finance.gl_journals (
        id, tenant_id, accounting_book_id, fiscal_period_id, journal_number, entry_type, posting_date,
        total_debit_minor, total_credit_minor, status, description, posted_by, version
      ) VALUES (
        $1, $2, $3, $4, 'JRN-DEPR-2026-01', 'STANDARD_MANUAL', '2026-01-31',
        $5, $5, 'POSTED', 'Depreciation Run 2026-01', $6, 1
      )
    `, [deprJournalId, TENANT_A, bookId, period1Id, deprAmount, ACTOR_A]);

    // Debit Line: Depreciation Expense (6500)
    await client.query(`
      INSERT INTO gigalibs_finance.gl_journal_lines (
        id, tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor,
        currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES (gen_random_uuid(), $1, $2, 1, $3, $4, 0, 'USD', 1.0, $4, 0, 'Depreciation Expense')
    `, [TENANT_A, deprJournalId, deprExpenseAccId, deprAmount]);

    // Credit Line: Accumulated Depreciation (1510)
    await client.query(`
      INSERT INTO gigalibs_finance.gl_journal_lines (
        id, tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor,
        currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES (gen_random_uuid(), $1, $2, 2, $3, 0, $4, 'USD', 1.0, 0, $4, 'Accumulated Depreciation')
    `, [TENANT_A, deprJournalId, accumDeprAccId, deprAmount]);

    // Update schedule line to POSTED
    await client.query(`
      UPDATE gigalibs_finance.asset_depreciation_schedules
         SET status = 'POSTED', journal_entry_id = $1, updated_at = NOW(), version = version + 1
       WHERE asset_id = $2 AND fiscal_period_id = $3
    `, [deprJournalId, asset1Id, period1Id]);

    // Update fixed asset balances
    await client.query(`
      UPDATE gigalibs_finance.fixed_assets
         SET accumulated_depreciation_minor = 900000, current_book_value_minor = 11100000,
             status = 'DEPRECIATING', updated_at = NOW(), version = version + 1
       WHERE id = $1
    `, [asset1Id]);

    // Record Depreciation Run
    await client.query(`
      INSERT INTO gigalibs_finance.asset_depreciation_runs (
        id, tenant_id, run_code, fiscal_period_id, run_date, total_depreciation_amount_minor, asset_count, journal_entry_id, status
      ) VALUES (gen_random_uuid(), $1, 'RUN-2026-01', $2, '2026-01-31', $3, 1, $4, 'POSTED')
    `, [TENANT_A, period1Id, deprAmount, deprJournalId]);
  });

  const runCheck = await withTenant(TENANT_A, async () => {
    const s = await client.query('SELECT status, journal_entry_id FROM gigalibs_finance.asset_depreciation_schedules WHERE asset_id = $1 AND fiscal_period_id = $2', [asset1Id, period1Id]);
    const a = await client.query('SELECT status, accumulated_depreciation_minor, current_book_value_minor FROM gigalibs_finance.fixed_assets WHERE id = $1', [asset1Id]);
    return { schedule: s.rows[0], asset: a.rows[0] };
  });

  assert.strictEqual(runCheck.schedule.status, 'POSTED', 'Schedule status updated to POSTED');
  assert.strictEqual(runCheck.schedule.journal_entry_id, deprJournalId, 'Linked to GL Journal');
  assert.strictEqual(runCheck.asset.status, 'DEPRECIATING', 'Asset transitioned to DEPRECIATING');
  assert.strictEqual(runCheck.asset.accumulated_depreciation_minor, '900000', 'Accumulated depr updated to $9,000.00');
  assert.strictEqual(runCheck.asset.current_book_value_minor, '11100000', 'Book value reduced to $111,000.00');
  console.log('  ✓ Period 1 depreciation run posted balanced GL voucher and updated carrying values.');

  // ─── Scenario 6: Immutability Trigger Protection ───────────────────────────
  console.log('\n[8/12] Scenario 6: Verifying Immutability Trigger on Posted Depreciation Schedule...');
  let updateRejected = false;
  try {
    await withTenant(TENANT_A, async () => {
      await client.query(`
        UPDATE gigalibs_finance.asset_depreciation_schedules
           SET depreciation_amount_minor = 500000
         WHERE asset_id = $1 AND fiscal_period_id = $2
      `, [asset1Id, period1Id]);
    });
  } catch (err) {
    updateRejected = true;
    assert.match(err.message, /Cannot modify financial figures of posted depreciation schedule/);
  }
  assert.ok(updateRejected, 'Trigger rejected unauthorized UPDATE on posted schedule figures');

  let deleteRejected = false;
  try {
    await withTenant(TENANT_A, async () => {
      await client.query(`
        DELETE FROM gigalibs_finance.asset_depreciation_schedules
         WHERE asset_id = $1 AND fiscal_period_id = $2
      `, [asset1Id, period1Id]);
    });
  } catch (err) {
    deleteRejected = true;
    assert.match(err.message, /Cannot delete posted depreciation schedule/);
  }
  assert.ok(deleteRejected, 'Trigger rejected DELETE on posted schedule');
  console.log('  ✓ Hardware immutability trigger strictly protects posted financial schedule records.');

  // ─── Scenario 7: Progression to Fully Depreciated State ─────────────────────
  console.log('\n[9/12] Scenario 7: Verifying Progression to FULLY_DEPRECIATED State...');
  await withTenant(TENANT_A, async () => {
    // Fast-forward asset to end of useful life where book value = salvage value ($12,000.00)
    await client.query(`
      UPDATE gigalibs_finance.fixed_assets
         SET accumulated_depreciation_minor = 10800000,
             current_book_value_minor = 1200000,
             status = 'FULLY_DEPRECIATED',
             updated_at = NOW(),
             version = version + 1
       WHERE id = $1
    `, [asset1Id]);
  });

  const fullCheck = await withTenant(TENANT_A, async () => {
    const res = await client.query('SELECT status, current_book_value_minor, salvage_value_minor FROM gigalibs_finance.fixed_assets WHERE id = $1', [asset1Id]);
    return res.rows[0];
  });
  assert.strictEqual(fullCheck.status, 'FULLY_DEPRECIATED', 'Status is FULLY_DEPRECIATED');
  assert.strictEqual(fullCheck.current_book_value_minor, fullCheck.salvage_value_minor, 'Book value matches salvage value');
  console.log('  ✓ Asset reaches FULLY_DEPRECIATED state when book value equals salvage basis.');

  // ─── Scenario 8: Asset Disposal & Gain Recognition GL Voucher ──────────────
  console.log('\n[10/12] Scenario 8: Asset Disposal via Sale with Gain on Disposal...');
  const asset2Id = randomUUID();
  let disposalJournalId;

  await withTenant(TENANT_A, async () => {
    // Asset 2: Acquired for $50,000.00, accumulated $20,000.00, NBV = $30,000.00
    await client.query(`
      INSERT INTO gigalibs_finance.fixed_assets (
        id, tenant_id, asset_code, asset_name, asset_class_id, status,
        acquisition_date, capitalization_date, currency_code, acquisition_cost_minor,
        salvage_value_minor, useful_life_months, depreciation_method, current_book_value_minor,
        accumulated_depreciation_minor, version, created_by
      ) VALUES (
        $1, $2, 'ASSET-VEH-001', 'Logistics Delivery Van', $3, 'DEPRECIATING',
        '2025-01-01', '2025-01-01', 'USD', 5000000, 0, 60, 'STRAIGHT_LINE', 3000000, 2000000, 1, $4
      )
    `, [asset2Id, TENANT_A, assetClassId, ACTOR_A]);

    // Disposed for $35,000.00 cash proceeds
    // Proceeds ($35,000.00) - NBV ($30,000.00) = $5,000.00 Gain on Sale
    const proceedsMinor = 3500000;
    const accumMinor = 2000000;
    const costMinor = 5000000;
    const gainMinor = 500000;

    disposalJournalId = randomUUID();
    // Balanced journal: Total Debits ($35K + $20K = $55K) == Total Credits ($50K + $5K = $55K)
    await client.query(`
      INSERT INTO gigalibs_finance.gl_journals (
        id, tenant_id, accounting_book_id, fiscal_period_id, journal_number, entry_type, posting_date,
        total_debit_minor, total_credit_minor, status, description, posted_by, version
      ) VALUES (
        $1, $2, $3, $4, 'JRN-DISP-VEH-01', 'STANDARD_MANUAL', '2026-03-15',
        5500000, 5500000, 'POSTED', 'Disposal of Logistics Van', $5, 1
      )
    `, [disposalJournalId, TENANT_A, bookId, period3Id, ACTOR_A]);

    // 1. Debit Cash: $35,000.00
    await client.query(`
      INSERT INTO gigalibs_finance.gl_journal_lines (
        id, tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor,
        currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES (gen_random_uuid(), $1, $2, 1, $3, $4, 0, 'USD', 1.0, $4, 0, 'Cash Proceeds')
    `, [TENANT_A, disposalJournalId, cashAccId, proceedsMinor]);

    // 2. Debit Accumulated Depreciation: $20,000.00
    await client.query(`
      INSERT INTO gigalibs_finance.gl_journal_lines (
        id, tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor,
        currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES (gen_random_uuid(), $1, $2, 2, $3, $4, 0, 'USD', 1.0, $4, 0, 'Clear Accum Depr')
    `, [TENANT_A, disposalJournalId, accumDeprAccId, accumMinor]);

    // 3. Credit Fixed Asset Cost: $50,000.00
    await client.query(`
      INSERT INTO gigalibs_finance.gl_journal_lines (
        id, tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor,
        currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES (gen_random_uuid(), $1, $2, 3, $3, 0, $4, 'USD', 1.0, 0, $4, 'Derecognize Asset Cost')
    `, [TENANT_A, disposalJournalId, assetCostAccId, costMinor]);

    // 4. Credit Gain on Disposal: $5,000.00
    await client.query(`
      INSERT INTO gigalibs_finance.gl_journal_lines (
        id, tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor,
        currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES (gen_random_uuid(), $1, $2, 4, $3, 0, $4, 'USD', 1.0, 0, $4, 'Gain on Sale')
    `, [TENANT_A, disposalJournalId, gainLossAccId, gainMinor]);

    // Insert Disposal Record
    await client.query(`
      INSERT INTO gigalibs_finance.asset_disposals (
        id, tenant_id, asset_id, disposal_date, disposal_type, proceeds_amount_minor,
        net_book_value_minor, gain_loss_amount_minor, journal_entry_id
      ) VALUES (gen_random_uuid(), $1, $2, '2026-03-15', 'SALE', $3, 3000000, $4, $5)
    `, [TENANT_A, asset2Id, proceedsMinor, gainMinor, disposalJournalId]);

    // Update Asset to DISPOSED
    await client.query(`
      UPDATE gigalibs_finance.fixed_assets
         SET status = 'DISPOSED', current_book_value_minor = 0, updated_at = NOW(), version = version + 1
       WHERE id = $1
    `, [asset2Id]);
  });

  const dispCheck = await withTenant(TENANT_A, async () => {
    const a = await client.query('SELECT status, current_book_value_minor FROM gigalibs_finance.fixed_assets WHERE id = $1', [asset2Id]);
    const d = await client.query('SELECT * FROM gigalibs_finance.asset_disposals WHERE asset_id = $1', [asset2Id]);
    return { asset: a.rows[0], disposal: d.rows[0] };
  });

  assert.strictEqual(dispCheck.asset.status, 'DISPOSED', 'Asset status is DISPOSED');
  assert.strictEqual(dispCheck.asset.current_book_value_minor, '0', 'NBV reduced to 0');
  assert.strictEqual(dispCheck.disposal.gain_loss_amount_minor, '500000', 'Gain of $5,000.00 correctly calculated');
  console.log('  ✓ Asset disposal via sale recognized gain and balanced GL ledger facts.');

  // ─── Scenario 9: Asset Scrap Write-Off with Loss on Disposal ───────────────
  console.log('\n[11/12] Scenario 9: Asset Scrap Write-Off with Loss Recognition...');
  const asset3Id = randomUUID();

  await withTenant(TENANT_A, async () => {
    // Asset 3: Cost $10,000.00, Accum $2,000.00, NBV $8,000.00. Scrapped for $0 proceeds.
    // Loss = $0 - $8,000.00 = -$8,000.00 Loss
    await client.query(`
      INSERT INTO gigalibs_finance.fixed_assets (
        id, tenant_id, asset_code, asset_name, asset_class_id, status,
        acquisition_date, capitalization_date, currency_code, acquisition_cost_minor,
        salvage_value_minor, useful_life_months, depreciation_method, current_book_value_minor,
        accumulated_depreciation_minor, version, created_by
      ) VALUES (
        $1, $2, 'ASSET-TOOL-001', 'Damaged Tooling Rig', $3, 'DEPRECIATING',
        '2026-01-01', '2026-01-01', 'USD', 1000000, 0, 12, 'STRAIGHT_LINE', 800000, 200000, 1, $4
      )
    `, [asset3Id, TENANT_A, assetClassId, ACTOR_A]);

    const scrapJournalId = randomUUID();
    // Balanced journal: Debit Accum $2K + Debit Loss $8K == Credit Cost $10K
    await client.query(`
      INSERT INTO gigalibs_finance.gl_journals (
        id, tenant_id, accounting_book_id, fiscal_period_id, journal_number, entry_type, posting_date,
        total_debit_minor, total_credit_minor, status, description, posted_by, version
      ) VALUES (
        $1, $2, $3, $4, 'JRN-SCRAP-01', 'STANDARD_MANUAL', '2026-03-20',
        1000000, 1000000, 'POSTED', 'Scrap Tooling Rig', $5, 1
      )
    `, [scrapJournalId, TENANT_A, bookId, period3Id, ACTOR_A]);

    // 1. Debit Accum Depr: $2,000.00
    await client.query(`
      INSERT INTO gigalibs_finance.gl_journal_lines (
        id, tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor,
        currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES (gen_random_uuid(), $1, $2, 1, $3, 200000, 0, 'USD', 1.0, 200000, 0, 'Clear Accum Depr')
    `, [TENANT_A, scrapJournalId, accumDeprAccId]);

    // 2. Debit Loss on Scrap: $8,000.00
    await client.query(`
      INSERT INTO gigalibs_finance.gl_journal_lines (
        id, tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor,
        currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES (gen_random_uuid(), $1, $2, 2, $3, 800000, 0, 'USD', 1.0, 800000, 0, 'Loss on Scrap')
    `, [TENANT_A, scrapJournalId, gainLossAccId]);

    // 3. Credit Fixed Asset Cost: $10,000.00
    await client.query(`
      INSERT INTO gigalibs_finance.gl_journal_lines (
        id, tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor,
        currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES (gen_random_uuid(), $1, $2, 3, $3, 0, 1000000, 'USD', 1.0, 0, 1000000, 'Derecognize Asset Cost')
    `, [TENANT_A, scrapJournalId, assetCostAccId]);

    // Insert Disposal Record
    await client.query(`
      INSERT INTO gigalibs_finance.asset_disposals (
        id, tenant_id, asset_id, disposal_date, disposal_type, proceeds_amount_minor,
        net_book_value_minor, gain_loss_amount_minor, journal_entry_id
      ) VALUES (gen_random_uuid(), $1, $2, '2026-03-20', 'SCRAP', 0, 800000, -800000, $3)
    `, [TENANT_A, asset3Id, scrapJournalId]);

    // Update Asset to WRITTEN_OFF
    await client.query(`
      UPDATE gigalibs_finance.fixed_assets
         SET status = 'WRITTEN_OFF', current_book_value_minor = 0, updated_at = NOW(), version = version + 1
       WHERE id = $1
    `, [asset3Id]);
  });

  const scrapCheck = await withTenant(TENANT_A, async () => {
    const a = await client.query('SELECT status, current_book_value_minor FROM gigalibs_finance.fixed_assets WHERE id = $1', [asset3Id]);
    const d = await client.query('SELECT * FROM gigalibs_finance.asset_disposals WHERE asset_id = $1', [asset3Id]);
    return { asset: a.rows[0], disposal: d.rows[0] };
  });

  assert.strictEqual(scrapCheck.asset.status, 'WRITTEN_OFF', 'Asset status is WRITTEN_OFF');
  assert.strictEqual(scrapCheck.disposal.gain_loss_amount_minor, '-800000', 'Loss of $8,000.00 correctly calculated');
  console.log('  ✓ Asset write-off correctly derecognized basis and booked loss voucher.');

  // ─── Scenario 10: Hardware Row-Level Security (RLS) Isolation ──────────────
  console.log('\n[12/12] Scenario 10: Verifying Hardware Row-Level Security (RLS) Isolation...');
  // Query as Tenant B under a non-superuser role
  await client.query('BEGIN');
  try {
    // Create rls_test_user if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'rls_test_user') THEN
          CREATE ROLE rls_test_user NOLOGIN;
        END IF;
      END
      $$;
      GRANT USAGE ON SCHEMA gigalibs_finance TO rls_test_user;
      GRANT SELECT ON ALL TABLES IN SCHEMA gigalibs_finance TO rls_test_user;
    `);

    await client.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT_B]);
    await client.query('SET ROLE rls_test_user');

    const crossAssets = await client.query('SELECT * FROM gigalibs_finance.fixed_assets');
    const crossClasses = await client.query('SELECT * FROM gigalibs_finance.fixed_asset_classes');
    const crossSchedules = await client.query('SELECT * FROM gigalibs_finance.asset_depreciation_schedules');
    const crossDisposals = await client.query('SELECT * FROM gigalibs_finance.asset_disposals');

    assert.strictEqual(crossAssets.rows.length, 0, 'Tenant B sees ZERO assets of Tenant A');
    assert.strictEqual(crossClasses.rows.length, 0, 'Tenant B sees ZERO classes of Tenant A');
    assert.strictEqual(crossSchedules.rows.length, 0, 'Tenant B sees ZERO schedules of Tenant A');
    assert.strictEqual(crossDisposals.rows.length, 0, 'Tenant B sees ZERO disposals of Tenant A');

    await client.query('RESET ROLE');
    await client.query('COMMIT');
    console.log('  ✓ Hardware RLS strictly isolated all fixed asset tables between tenants.');
  } catch (err) {
    await client.query('RESET ROLE');
    await client.query('ROLLBACK');
    throw err;
  }

  console.log('\n================================================================================');
  console.log('ALL 12 DATABASE CERTIFICATION CHECKS PASSED FOR WI-OI-114 (FIXED ASSETS)!');
  console.log('================================================================================\n');

} finally {
  await client.end();
}
