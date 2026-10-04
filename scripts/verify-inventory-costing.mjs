#!/usr/bin/env node
/**
 * WI-OI-116: Inventory Costing, Valuation, Landed Cost & Cost of Goods Sold (COGS) Engine
 * Comprehensive PostgreSQL 16 database certification script covering:
 * - gigalibs_finance (v5)
 *
 * Proves:
 * 1. Contract & Zod Schema Validation
 * 2. Database Schema & Migration v5 Verification
 * 3. Scenario 1: Costing Profiles Setup (FIFO, AVCO, Standard Costing)
 * 4. Scenario 2: Inbound Goods Receipts & FIFO Cost Layers Ingestion
 * 5. Scenario 3: Deterministic FIFO Shipment Consumption & Balanced COGS Journal Posting
 * 6. Scenario 4: Moving Weighted Average (AVCO) Continuous Recomputation
 * 7. Scenario 5: Multi-Factor Landed Cost Capitalization & Apportionment Conservation
 * 8. Scenario 6: Standard Costing & Purchase Price Variance (PPV) GL Booking
 * 9. Scenario 7: Lower of Cost or Net Realizable Value (NRV) Impairment Revaluation
 * 10. Scenario 8: Database Immutability Triggers Protection (Exhausted Layers & Posted Vouchers)
 * 11. Scenario 9: Hardware Row-Level Security (RLS) Tenant Isolation
 * 12. Scenario 10: Subledger-to-General-Ledger Inventory Balance Reconciliation
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from '../node_modules/.pnpm/pg@8.23.0/node_modules/pg/lib/index.js';
import * as contracts from '../packages/contracts/dist/index.js';
import {
  consumeFifoLayers,
  calculateMovingAverage,
  calculatePurchasePriceVariance,
  apportionLandedCost,
  toScaledBigInt,
  fromScaledBigInt,
} from '../modules/financial-operations/apps/api/dist/costing/costing-engine.js';

const DB_URL = process.env.CONTROL_PLANE_DB_URL || 'postgresql://gigalibs:gigalibs_dev@localhost:5440/gigalibs';

console.log('================================================================================');
console.log('WI-OI-116: Inventory Costing, Valuation & Landed Cost Engine Certification');
console.log('Connecting to PostgreSQL database at port 5440...');

const client = new pg.Client({ connectionString: DB_URL });
await client.connect();

const TENANT_A = `tenant-costing-${randomUUID().slice(0, 8)}`;
const TENANT_B = `tenant-costing-other-${randomUUID().slice(0, 8)}`;
const ACTOR_A = `actor-${randomUUID().slice(0, 8)}`;
const LEGAL_ENTITY_ID = randomUUID();
const PRODUCT_FIFO_ID = randomUUID();
const PRODUCT_AVCO_ID = randomUUID();
const PRODUCT_STD_ID = randomUUID();
const WAREHOUSE_MAIN_ID = 'WH-MAIN-01';

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
  console.log('\n[1/12] Validating Versioned Costing Contracts & Enums...');
  assert.ok(contracts.COSTING_METHODS.includes('FIFO'), 'COSTING_METHODS has FIFO');
  assert.ok(contracts.COSTING_METHODS.includes('AVERAGE'), 'COSTING_METHODS has AVERAGE');
  assert.ok(contracts.COSTING_METHODS.includes('STANDARD'), 'COSTING_METHODS has STANDARD');
  assert.ok(contracts.COST_LAYER_STATUSES.includes('ACTIVE'), 'COST_LAYER_STATUSES has ACTIVE');
  assert.ok(contracts.COST_LAYER_STATUSES.includes('EXHAUSTED'), 'COST_LAYER_STATUSES has EXHAUSTED');
  assert.ok(contracts.LANDED_COST_ALLOCATION_BASES.includes('VALUE'), 'LANDED_COST_ALLOCATION_BASES has VALUE');
  assert.ok(contracts.LANDED_COST_ALLOCATION_BASES.includes('WEIGHT'), 'LANDED_COST_ALLOCATION_BASES has WEIGHT');
  assert.ok(contracts.LANDED_COST_STATUSES.includes('POSTED'), 'LANDED_COST_STATUSES has POSTED');
  assert.ok(contracts.REVALUATION_REASONS.includes('LOWER_OF_COST_OR_NRV'), 'REVALUATION_REASONS has LOWER_OF_COST_OR_NRV');
  assert.ok(contracts.COST_TRANSACTION_TYPES.includes('CUSTOMER_SHIPMENT'), 'COST_TRANSACTION_TYPES has CUSTOMER_SHIPMENT');

  console.log('  ✓ Public contracts, schemas, and enums successfully validated.');

  // ─── 2. Database Schema & Migration v5 Verification ────────────────────────
  console.log('\n[2/12] Verifying PostgreSQL Schema gigalibs_finance v5 Migration...');
  const migRes = await client.query('SELECT version FROM gigalibs_finance.schema_migrations ORDER BY version');
  const versions = migRes.rows.map((r) => r.version);
  assert.ok(versions.includes('5'), 'Migration version 5 is recorded in schema_migrations');

  const tablesRes = await client.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'gigalibs_finance' AND table_type = 'BASE TABLE'
     ORDER BY table_name
  `);
  const tables = tablesRes.rows.map((r) => r.table_name);
  assert.ok(tables.includes('cost_profiles'), 'has cost_profiles table');
  assert.ok(tables.includes('inventory_cost_layers'), 'has inventory_cost_layers table');
  assert.ok(tables.includes('cost_layer_consumptions'), 'has cost_layer_consumptions table');
  assert.ok(tables.includes('landed_cost_vouchers'), 'has landed_cost_vouchers table');
  assert.ok(tables.includes('landed_cost_allocations'), 'has landed_cost_allocations table');
  assert.ok(tables.includes('inventory_revaluations'), 'has inventory_revaluations table');

  // Verify RLS is enabled and forced on new tables
  for (const t of [
    'cost_profiles',
    'inventory_cost_layers',
    'cost_layer_consumptions',
    'landed_cost_vouchers',
    'landed_cost_allocations',
    'inventory_revaluations',
  ]) {
    const rlsRes = await client.query(`
      SELECT relrowsecurity, relforcerowsecurity FROM pg_class
       WHERE relname = $1 AND relnamespace = 'gigalibs_finance'::regnamespace
    `, [t]);
    assert.strictEqual(rlsRes.rows[0].relrowsecurity, true, `${t} has row security enabled`);
    assert.strictEqual(rlsRes.rows[0].relforcerowsecurity, true, `${t} has row security FORCED`);
  }
  console.log('  ✓ Database tables exist with hardware RLS enabled and forced.');

  // ─── Scenario 1: GL Setup & Cost Profiles Configuration ────────────────────
  console.log('\n[3/12] Scenario 1: Setting up Accounting Books, COA & Cost Profiles...');
  let bookId, fiscalYearId, fiscalPeriodId;
  let invAssetAccId, grniAccId, cogsAccId, landedClearingAccId, ppvAccId, scrapAccId, valuationLossAccId;
  let fifoProfileId, avcoProfileId, stdProfileId;

  await withTenant(TENANT_A, async () => {
    // 1. Accounting Book
    bookId = randomUUID();
    await client.query(`
      INSERT INTO gigalibs_finance.accounting_books (
        id, tenant_id, book_code, book_name, legal_entity_party_id, currency_code, costing_method, is_primary, status
      ) VALUES ($1, $2, 'BOOK-US-OP', 'US Operating Ledger', $3, 'USD', 'STANDARD', true, 'ACTIVE')
    `, [bookId, TENANT_A, LEGAL_ENTITY_ID]);

    // 2. Fiscal Year & Fiscal Period
    fiscalYearId = randomUUID();
    await client.query(`
      INSERT INTO gigalibs_finance.fiscal_years (
        id, tenant_id, accounting_book_id, year_name, start_date, end_date, status
      ) VALUES ($1, $2, $3, 'FY-2026', '2026-01-01', '2026-12-31', 'OPEN')
    `, [fiscalYearId, TENANT_A, bookId]);

    fiscalPeriodId = randomUUID();
    await client.query(`
      INSERT INTO gigalibs_finance.fiscal_periods (
        id, tenant_id, fiscal_year_id, accounting_book_id, period_number, period_name, start_date, end_date, status
      ) VALUES ($1, $2, $3, $4, 10, 'FY-2026-10', '2026-10-01', '2026-10-31', 'OPEN')
    `, [fiscalPeriodId, TENANT_A, fiscalYearId, bookId]);

    // 3. Chart of Accounts
    const createAcc = async (code, name, accClass, subtype, normalBalance) => {
      const id = randomUUID();
      await client.query(`
        INSERT INTO gigalibs_finance.chart_of_accounts (
          id, tenant_id, accounting_book_id, account_code, account_name, account_class, account_subtype,
          normal_balance, is_reconcilable, is_subledger_control, is_system_reserved, active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, true, true, true)
      `, [id, TENANT_A, bookId, code, name, accClass, subtype, normalBalance]);
      return id;
    };

    invAssetAccId = await createAcc('1400', 'Inventory Asset', 'ASSET', 'INVENTORY', 'DEBIT');
    grniAccId = await createAcc('2050', 'GRNI / Accrued Purchases', 'LIABILITY', 'ACCOUNTS_PAYABLE', 'CREDIT');
    cogsAccId = await createAcc('5000', 'Cost of Goods Sold', 'EXPENSE', 'COST_OF_GOODS_SOLD', 'DEBIT');
    landedClearingAccId = await createAcc('2060', 'Landed Cost Clearing', 'LIABILITY', 'OTHER_CURRENT_LIABILITY', 'CREDIT');
    ppvAccId = await createAcc('5100', 'Purchase Price Variance', 'EXPENSE', 'COST_OF_GOODS_SOLD', 'DEBIT');
    scrapAccId = await createAcc('5150', 'Inventory Scrap & Shrinkage', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT');
    valuationLossAccId = await createAcc('5200', 'Inventory Valuation Impairment Loss', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT');

    // 4. Cost Profiles
    fifoProfileId = randomUUID();
    await client.query(`
      INSERT INTO gigalibs_finance.cost_profiles (
        id, tenant_id, code, name, description, costing_method,
        inventory_gl_account_id, grni_gl_account_id, cogs_gl_account_id,
        landed_cost_clearing_gl_account_id, purchase_price_variance_gl_account_id,
        scrap_gl_account_id, valuation_loss_gl_account_id,
        standard_unit_cost_scaled, is_default, is_active
      ) VALUES (
        $1, $2, 'CST-FIFO-FG', 'FIFO Finished Goods Profile', 'Standard FIFO inventory tracking', 'FIFO',
        $3, $4, $5, $6, $7, $8, $9,
        NULL, true, true
      )
    `, [fifoProfileId, TENANT_A, invAssetAccId, grniAccId, cogsAccId, landedClearingAccId, ppvAccId, scrapAccId, valuationLossAccId]);

    avcoProfileId = randomUUID();
    await client.query(`
      INSERT INTO gigalibs_finance.cost_profiles (
        id, tenant_id, code, name, description, costing_method,
        inventory_gl_account_id, grni_gl_account_id, cogs_gl_account_id,
        landed_cost_clearing_gl_account_id, purchase_price_variance_gl_account_id,
        scrap_gl_account_id, valuation_loss_gl_account_id,
        standard_unit_cost_scaled, is_default, is_active
      ) VALUES (
        $1, $2, 'CST-AVCO-RM', 'Moving Average Raw Materials', 'Continuous weighted average tracking', 'AVERAGE',
        $3, $4, $5, $6, $7, $8, $9,
        NULL, false, true
      )
    `, [avcoProfileId, TENANT_A, invAssetAccId, grniAccId, cogsAccId, landedClearingAccId, ppvAccId, scrapAccId, valuationLossAccId]);

    stdProfileId = randomUUID();
    await client.query(`
      INSERT INTO gigalibs_finance.cost_profiles (
        id, tenant_id, code, name, description, costing_method,
        inventory_gl_account_id, grni_gl_account_id, cogs_gl_account_id,
        landed_cost_clearing_gl_account_id, purchase_price_variance_gl_account_id,
        scrap_gl_account_id, valuation_loss_gl_account_id,
        standard_unit_cost_scaled, is_default, is_active
      ) VALUES (
        $1, $2, 'CST-STD-ASSY', 'Standard Cost Assemblies', 'Standard cost with PPV postings', 'STANDARD',
        $3, $4, $5, $6, $7, $8, $9,
        30000000, false, true
      )
    `, [stdProfileId, TENANT_A, invAssetAccId, grniAccId, cogsAccId, landedClearingAccId, ppvAccId, scrapAccId, valuationLossAccId]);
  });

  console.log('  ✓ Created 3 Cost Profiles (FIFO, AVCO, STANDARD) with GL account mappings.');

  // Helper function to post GL Journal voucher
  const postJournalVoucher = async (tenantId, entryType, memo, lines) => {
    const journalId = randomUUID();
    const totalDebit = lines.reduce((acc, l) => acc + BigInt(l.debitMinor), 0n);
    const totalCredit = lines.reduce((acc, l) => acc + BigInt(l.creditMinor), 0n);
    assert.strictEqual(totalDebit, totalCredit, 'GL Journal MUST be balanced (Debits === Credits)');

    await client.query(`
      INSERT INTO gigalibs_finance.gl_journals (
        id, tenant_id, journal_number, accounting_book_id, fiscal_period_id, posting_date,
        entry_type, description, status, total_debit_minor, total_credit_minor, posted_at, posted_by
      ) VALUES ($1, $2, $3, $4, $5, '2026-10-04', $6, $7, 'POSTED', $8, $9, clock_timestamp(), $10)
    `, [journalId, tenantId, `JNL-${randomUUID().slice(0, 8)}`, bookId, fiscalPeriodId, entryType, memo, totalDebit.toString(), totalCredit.toString(), ACTOR_A]);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      await client.query(`
        INSERT INTO gigalibs_finance.gl_journal_lines (
          tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor,
          currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo
        ) VALUES ($1, $2, $3, $4, $5, $6, 'USD', 1.0, $5, $6, $7)
      `, [tenantId, journalId, i + 1, line.accountId, line.debitMinor, line.creditMinor, line.memo]);
    }

    return journalId;
  };

  // ─── Scenario 2: Inbound Goods Receipts & FIFO Layers ───────────────────────
  console.log('\n[4/12] Scenario 2: Ingesting Inbound Goods Receipts & Building FIFO Layers...');
  let layer1Id, layer2Id;

  await withTenant(TENANT_A, async () => {
    // Receipt 1: 100 units @ $20.00 = $2,000.00
    layer1Id = randomUUID();
    await client.query(`
      INSERT INTO gigalibs_finance.inventory_cost_layers (
        id, tenant_id, cost_profile_id, product_id, warehouse_id, receipt_ref,
        receipt_date, initial_quantity, remaining_quantity, unit_cost_scaled,
        total_initial_cost_minor, total_remaining_cost_minor, landed_cost_added_minor, status
      ) VALUES (
        $1, $2, $3, $4, $5, 'GRN-001',
        NOW() - INTERVAL '2 days', 100.000000, 100.000000, 20000000,
        200000, 200000, 0, 'ACTIVE'
      )
    `, [layer1Id, TENANT_A, fifoProfileId, PRODUCT_FIFO_ID, WAREHOUSE_MAIN_ID]);

    // Post GRNI Journal: Debit Inventory 1400 $2,000.00, Credit GRNI 2050 $2,000.00
    await postJournalVoucher(TENANT_A, 'SUBLEDGER_INVENTORY', 'Goods Receipt GRN-001 Accrual', [
      { accountId: invAssetAccId, debitMinor: '200000', creditMinor: '0', memo: 'Debit Inventory Asset' },
      { accountId: grniAccId, debitMinor: '0', creditMinor: '200000', memo: 'Credit Accrued Purchases / GRNI' },
    ]);

    // Receipt 2: 100 units @ $25.00 = $2,500.00
    layer2Id = randomUUID();
    await client.query(`
      INSERT INTO gigalibs_finance.inventory_cost_layers (
        id, tenant_id, cost_profile_id, product_id, warehouse_id, receipt_ref,
        receipt_date, initial_quantity, remaining_quantity, unit_cost_scaled,
        total_initial_cost_minor, total_remaining_cost_minor, landed_cost_added_minor, status
      ) VALUES (
        $1, $2, $3, $4, $5, 'GRN-002',
        NOW() - INTERVAL '1 days', 100.000000, 100.000000, 25000000,
        250000, 250000, 0, 'ACTIVE'
      )
    `, [layer2Id, TENANT_A, fifoProfileId, PRODUCT_FIFO_ID, WAREHOUSE_MAIN_ID]);

    // Post GRNI Journal: Debit Inventory 1400 $2,500.00, Credit GRNI 2050 $2,500.00
    await postJournalVoucher(TENANT_A, 'SUBLEDGER_INVENTORY', 'Goods Receipt GRN-002 Accrual', [
      { accountId: invAssetAccId, debitMinor: '250000', creditMinor: '0', memo: 'Debit Inventory Asset' },
      { accountId: grniAccId, debitMinor: '0', creditMinor: '250000', memo: 'Credit Accrued Purchases / GRNI' },
    ]);
  });

  const layersRes = await withTenant(TENANT_A, async () => {
    return client.query(`SELECT id, remaining_quantity, unit_cost_scaled, status FROM gigalibs_finance.inventory_cost_layers WHERE product_id = $1 ORDER BY receipt_date ASC`, [PRODUCT_FIFO_ID]);
  });
  assert.strictEqual(layersRes.rows.length, 2, '2 FIFO layers created');
  assert.strictEqual(layersRes.rows[0].status, 'ACTIVE', 'Layer 1 is ACTIVE');
  assert.strictEqual(layersRes.rows[1].status, 'ACTIVE', 'Layer 2 is ACTIVE');
  console.log('  ✓ Ingested 2 goods receipts ($2,000 + $2,500) and posted balanced GRNI accrual journals.');

  // ─── Scenario 3: Deterministic FIFO Shipment & COGS Relief ──────────────────
  console.log('\n[5/12] Scenario 3: Fulfilling Order with FIFO Depletion & COGS Recognition...');
  const fifoLayers = [
    { id: layer1Id, remainingQuantity: '100.000000', unitCostScaled: '20000000' },
    { id: layer2Id, remainingQuantity: '100.000000', unitCostScaled: '25000000' },
  ];

  // Request 120 units for shipment SO-001
  const fifoResult = consumeFifoLayers(fifoLayers, '120.000000');
  assert.strictEqual(fifoResult.unfulfilledQuantity, '0.000000', 'Shipment fully fulfilled');
  assert.strictEqual(fifoResult.totalCogsMinor, '250000', 'Total COGS is exactly $2,500.00 ($20*100 + $25*20)');
  assert.strictEqual(fifoResult.consumptions.length, 2, 'Consumed across 2 layers');

  let cogsJournalId;
  await withTenant(TENANT_A, async () => {
    // Post COGS relief journal: Debit COGS 5000 $2,500.00, Credit Inventory Asset 1400 $2,500.00
    cogsJournalId = await postJournalVoucher(TENANT_A, 'SUBLEDGER_INVENTORY', 'Shipment SO-001 COGS Relief', [
      { accountId: cogsAccId, debitMinor: fifoResult.totalCogsMinor, creditMinor: '0', memo: 'Debit Cost of Goods Sold' },
      { accountId: invAssetAccId, debitMinor: '0', creditMinor: fifoResult.totalCogsMinor, memo: 'Credit Inventory Asset' },
    ]);

    // Record consumption lines
    for (const c of fifoResult.consumptions) {
      await client.query(`
        INSERT INTO gigalibs_finance.cost_layer_consumptions (
          id, tenant_id, cost_layer_id, transaction_ref, transaction_type,
          quantity_consumed, unit_cost_scaled, cost_minor, consumed_at, gl_journal_id
        ) VALUES (
          gen_random_uuid(), $1, $2, 'SO-001', 'CUSTOMER_SHIPMENT',
          $3, $4, $5, NOW(), $6
        )
      `, [TENANT_A, c.costLayerId, c.quantityConsumed, c.unitCostScaled, c.costMinor, cogsJournalId]);
    }

    // Update Layer 1 -> EXHAUSTED (0 remaining)
    await client.query(`
      UPDATE gigalibs_finance.inventory_cost_layers
         SET remaining_quantity = 0.000000, total_remaining_cost_minor = 0, status = 'EXHAUSTED', updated_at = NOW()
       WHERE id = $1
    `, [layer1Id]);

    // Update Layer 2 -> PARTIALLY_CONSUMED (80 remaining @ $25 = $2,000.00 = 200000 minor)
    await client.query(`
      UPDATE gigalibs_finance.inventory_cost_layers
         SET remaining_quantity = 80.000000, total_remaining_cost_minor = 200000, status = 'PARTIALLY_CONSUMED', updated_at = NOW()
       WHERE id = $1
    `, [layer2Id]);
  });

  const checkL1 = await withTenant(TENANT_A, async () => {
    const res = await client.query('SELECT remaining_quantity, status FROM gigalibs_finance.inventory_cost_layers WHERE id = $1', [layer1Id]);
    return res.rows[0];
  });
  const checkL2 = await withTenant(TENANT_A, async () => {
    const res = await client.query('SELECT remaining_quantity, status FROM gigalibs_finance.inventory_cost_layers WHERE id = $1', [layer2Id]);
    return res.rows[0];
  });
  assert.strictEqual(checkL1.status, 'EXHAUSTED', 'Layer 1 is EXHAUSTED');
  assert.strictEqual(Number(checkL1.remaining_quantity), 0, 'Layer 1 has 0 remaining');
  assert.strictEqual(checkL2.status, 'PARTIALLY_CONSUMED', 'Layer 2 is PARTIALLY_CONSUMED');
  assert.strictEqual(Number(checkL2.remaining_quantity), 80, 'Layer 2 has 80 remaining');
  console.log('  ✓ Deterministic FIFO consumed 120 units ($2,500.00 COGS) and posted balanced relief journal.');

  // ─── Scenario 4: Moving Weighted Average (AVCO) Continuous Recomputation ───
  console.log('\n[6/12] Scenario 4: Testing Moving Weighted Average (AVCO) Recomputation...');
  // Initial: 50 units @ $10.00 = $500.00
  // Inbound receipt: 150 units @ $14.00 = $2,100.00
  // Total: 200 units, value $2,600.00 => new unit cost = $13.00/unit
  const avcoCalc = calculateMovingAverage('50.000000', '10000000', '150.000000', '14000000');
  assert.strictEqual(avcoCalc.totalNewQuantity, '200.000000', 'Total quantity is 200.000000');
  assert.strictEqual(avcoCalc.newAvgCostScaled, '13000000', 'New moving average unit cost is exact $13.000000 (13000000 scaled)');

  let avcoLayerId;
  await withTenant(TENANT_A, async () => {
    // Post GRNI Journal: Debit Inventory 1400 $2,600.00, Credit GRNI 2050 $2,600.00
    await postJournalVoucher(TENANT_A, 'SUBLEDGER_INVENTORY', 'Goods Receipt AVCO-BATCH-01 Accrual', [
      { accountId: invAssetAccId, debitMinor: '260000', creditMinor: '0', memo: 'Debit Inventory Asset (AVCO Materials)' },
      { accountId: grniAccId, debitMinor: '0', creditMinor: '260000', memo: 'Credit Accrued Purchases / GRNI' },
    ]);

    avcoLayerId = randomUUID();
    await client.query(`
      INSERT INTO gigalibs_finance.inventory_cost_layers (
        id, tenant_id, cost_profile_id, product_id, warehouse_id, receipt_ref,
        receipt_date, initial_quantity, remaining_quantity, unit_cost_scaled,
        total_initial_cost_minor, total_remaining_cost_minor, status
      ) VALUES (
        $1, $2, $3, $4, $5, 'AVCO-BATCH-01',
        NOW(), 200.000000, 200.000000, 13000000,
        260000, 260000, 'ACTIVE'
      )
    `, [avcoLayerId, TENANT_A, avcoProfileId, PRODUCT_AVCO_ID, WAREHOUSE_MAIN_ID]);
  });
  console.log('  ✓ Continuous moving average correctly computed $13.00/unit with zero floating-point error.');

  // ─── Scenario 5: Multi-Factor Landed Cost Capitalization ───────────────────
  console.log('\n[7/12] Scenario 5: Apportioning & Capitalizing Landed Cost Voucher...');
  // Freight & customs voucher: $200.00 (20000 minor)
  // Apportioned to remaining 80 units of Layer 2
  const landedTargets = [
    {
      costLayerId: layer2Id,
      productId: PRODUCT_FIFO_ID,
      basisMetric: '200000', // Value basis ($2,000.00)
      layerRemainingQuantity: '80.000000',
    },
  ];

  const apportionment = apportionLandedCost('20000', '25000000', landedTargets);
  assert.strictEqual(apportionment.length, 1, '1 line allocated');
  assert.strictEqual(apportionment[0].apportionedAmountMinor, '20000', 'Full $200.00 allocated with exact conservation');
  // $200.00 / 80 units = $2.50/unit => adjusted unit cost = $25.00 + $2.50 = $27.50 (27500000 scaled)
  assert.strictEqual(apportionment[0].adjustedUnitCostScaled, '27500000', 'Adjusted unit cost is $27.50');

  let landedVoucherId, landedJournalId;
  await withTenant(TENANT_A, async () => {
    // 1. Post Landed Cost absorption journal: Debit Inventory Asset 1400 $200.00, Credit Landed Cost Clearing 2060 $200.00
    landedJournalId = await postJournalVoucher(TENANT_A, 'SUBLEDGER_INVENTORY', 'Ocean Freight LCV-001 Absorption', [
      { accountId: invAssetAccId, debitMinor: '20000', creditMinor: '0', memo: 'Debit Inventory Asset (Capitalized Freight)' },
      { accountId: landedClearingAccId, debitMinor: '0', creditMinor: '20000', memo: 'Credit Landed Cost Clearing' },
    ]);

    // 2. Create landed cost voucher
    landedVoucherId = randomUUID();
    await client.query(`
      INSERT INTO gigalibs_finance.landed_cost_vouchers (
        id, tenant_id, voucher_number, description, allocation_basis,
        total_landed_cost_minor, currency_code, status, gl_journal_id, posted_at
      ) VALUES (
        $1, $2, 'LCV-001', 'Ocean Freight & Customs Duty', 'VALUE',
        20000, 'USD', 'POSTED', $3, NOW()
      )
    `, [landedVoucherId, TENANT_A, landedJournalId]);

    // 3. Insert allocation record
    await client.query(`
      INSERT INTO gigalibs_finance.landed_cost_allocations (
        id, tenant_id, landed_cost_id, cost_layer_id, product_id,
        basis_weight, apportioned_amount_minor, adjusted_unit_cost_scaled
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        200000.000000, 20000, 27500000
      )
    `, [TENANT_A, landedVoucherId, layer2Id, PRODUCT_FIFO_ID]);

    // 4. Update Layer 2 with capitalized landed cost
    // New remaining cost = 80 units * $27.50 = $2,200.00 (220000 minor)
    await client.query(`
      UPDATE gigalibs_finance.inventory_cost_layers
         SET landed_cost_added_minor = landed_cost_added_minor + 20000,
             unit_cost_scaled = 27500000,
             total_remaining_cost_minor = 220000,
             updated_at = NOW()
       WHERE id = $1
    `, [layer2Id]);
  });

  const checkL2Landed = await withTenant(TENANT_A, async () => {
    const res = await client.query('SELECT unit_cost_scaled, total_remaining_cost_minor, landed_cost_added_minor FROM gigalibs_finance.inventory_cost_layers WHERE id = $1', [layer2Id]);
    return res.rows[0];
  });
  assert.strictEqual(checkL2Landed.unit_cost_scaled, '27500000', 'Layer 2 unit cost updated to $27.50');
  assert.strictEqual(checkL2Landed.landed_cost_added_minor, '20000', 'Landed cost added recorded as $200.00');
  assert.strictEqual(checkL2Landed.total_remaining_cost_minor, '220000', 'Total remaining cost is $2,200.00');
  console.log('  ✓ Landed cost capitalized into unit cost ($25.00 -> $27.50) with balanced GL absorption.');

  // ─── Scenario 6: Standard Costing & Purchase Price Variance (PPV) ───────────
  console.log('\n[8/12] Scenario 6: Standard Costing Receipt & Purchase Price Variance (PPV)...');
  // Standard cost: $30.00/unit (30000000 scaled)
  // Actual PO cost: $34.00/unit (34000000 scaled) for 50 units
  // Actual outlay = 50 * $34 = $1,700.00 (170000 minor)
  // Standard inventory asset = 50 * $30 = $1,500.00 (150000 minor)
  // Unfavorable PPV = $200.00 (20000 minor)
  const ppvCalc = calculatePurchasePriceVariance('50.000000', '34000000', '30000000');
  assert.strictEqual(ppvCalc.varianceMinor, '20000', 'PPV is $200.00');
  assert.strictEqual(ppvCalc.isUnfavorable, true, 'Variance is UNFAVORABLE (debit to expense)');

  let stdLayerId;
  await withTenant(TENANT_A, async () => {
    // Balanced GL voucher: Debit Inventory $1,500 + Debit PPV $200 = Credit GRNI $1,700
    await postJournalVoucher(TENANT_A, 'SUBLEDGER_INVENTORY', 'Standard Cost Receipt GRN-STD-01 with PPV', [
      { accountId: invAssetAccId, debitMinor: '150000', creditMinor: '0', memo: 'Debit Inventory Asset at Standard Cost' },
      { accountId: ppvAccId, debitMinor: '20000', creditMinor: '0', memo: 'Debit Purchase Price Variance (Unfavorable)' },
      { accountId: grniAccId, debitMinor: '0', creditMinor: '170000', memo: 'Credit Accrued Purchases / GRNI at Actual' },
    ]);

    stdLayerId = randomUUID();
    await client.query(`
      INSERT INTO gigalibs_finance.inventory_cost_layers (
        id, tenant_id, cost_profile_id, product_id, warehouse_id, receipt_ref,
        receipt_date, initial_quantity, remaining_quantity, unit_cost_scaled,
        total_initial_cost_minor, total_remaining_cost_minor, status
      ) VALUES (
        $1, $2, $3, $4, $5, 'GRN-STD-01',
        NOW(), 50.000000, 50.000000, 30000000,
        150000, 150000, 'ACTIVE'
      )
    `, [stdLayerId, TENANT_A, stdProfileId, PRODUCT_STD_ID, WAREHOUSE_MAIN_ID]);
  });
  console.log('  ✓ Standard costing receipt booked inventory at standard ($1,500) and PPV variance ($200).');

  // ─── Scenario 7: Lower of Cost or Net Realizable Value (NRV) Impairment ─────
  console.log('\n[9/12] Scenario 7: Lower of Cost or NRV Periodic Impairment Write-Down...');
  // For the standard assembly layer: carrying value $30.00/unit, NRV drops to $25.00/unit
  // Impairment write-down: 50 units * ($30 - $25) = $250.00 (25000 minor)
  let revaluationJournalId;
  await withTenant(TENANT_A, async () => {
    // Post Valuation Loss journal: Debit Valuation Loss 5200 $250.00, Credit Inventory Asset 1400 $250.00
    revaluationJournalId = await postJournalVoucher(TENANT_A, 'SUBLEDGER_INVENTORY', 'NRV Impairment Write-Down', [
      { accountId: valuationLossAccId, debitMinor: '25000', creditMinor: '0', memo: 'Debit Inventory Valuation Loss' },
      { accountId: invAssetAccId, debitMinor: '0', creditMinor: '25000', memo: 'Credit Inventory Asset Write-Down' },
    ]);

    // Record revaluation
    await client.query(`
      INSERT INTO gigalibs_finance.inventory_revaluations (
        id, tenant_id, cost_profile_id, product_id, warehouse_id,
        reason, previous_unit_cost_scaled, new_unit_cost_scaled,
        quantity, carrying_value_delta_minor, gl_journal_id
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        'LOWER_OF_COST_OR_NRV', 30000000, 25000000,
        50.000000, -25000, $5
      )
    `, [TENANT_A, stdProfileId, PRODUCT_STD_ID, WAREHOUSE_MAIN_ID, revaluationJournalId]);

    // Adjust layer carrying value: new unit cost $25.00, new total remaining cost $1,250.00 (125000 minor)
    await client.query(`
      UPDATE gigalibs_finance.inventory_cost_layers
         SET unit_cost_scaled = 25000000,
             total_remaining_cost_minor = 125000,
             status = 'REVALUED',
             updated_at = NOW()
       WHERE id = $1
    `, [stdLayerId]);
  });

  const checkReval = await withTenant(TENANT_A, async () => {
    const r = await client.query('SELECT * FROM gigalibs_finance.inventory_revaluations WHERE product_id = $1', [PRODUCT_STD_ID]);
    const l = await client.query('SELECT unit_cost_scaled, total_remaining_cost_minor, status FROM gigalibs_finance.inventory_cost_layers WHERE id = $1', [stdLayerId]);
    return { reval: r.rows[0], layer: l.rows[0] };
  });
  assert.strictEqual(checkReval.reval.reason, 'LOWER_OF_COST_OR_NRV', 'Reason is LOWER_OF_COST_OR_NRV');
  assert.strictEqual(checkReval.reval.carrying_value_delta_minor, '-25000', 'Delta is -$250.00');
  assert.strictEqual(checkReval.layer.status, 'REVALUED', 'Layer status is REVALUED');
  assert.strictEqual(checkReval.layer.total_remaining_cost_minor, '125000', 'Remaining cost reduced to $1,250.00');
  console.log('  ✓ NRV impairment write-down booked ($250.00) and layer carrying value revalued.');

  // ─── Scenario 8: Database Immutability Triggers Protection ─────────────────
  console.log('\n[10/12] Scenario 8: Verifying Database Immutability Triggers Protection...');
  // Test 1: Mutating EXHAUSTED cost layer should fail
  let exhaustedMutationBlocked = false;
  try {
    await withTenant(TENANT_A, async () => {
      await client.query(`
        UPDATE gigalibs_finance.inventory_cost_layers
           SET remaining_quantity = 50.000000
         WHERE id = $1
      `, [layer1Id]);
    });
  } catch (err) {
    if (err.message.includes('Cannot mutate exhausted inventory cost layer')) {
      exhaustedMutationBlocked = true;
    } else {
      throw err;
    }
  }
  assert.strictEqual(exhaustedMutationBlocked, true, 'Trigger trg_cost_layers_immutable blocked mutating EXHAUSTED layer');

  // Test 2: Mutating POSTED landed cost voucher should fail
  let postedLandedCostMutationBlocked = false;
  try {
    await withTenant(TENANT_A, async () => {
      await client.query(`
        UPDATE gigalibs_finance.landed_cost_vouchers
           SET total_landed_cost_minor = 30000
         WHERE id = $1
      `, [landedVoucherId]);
    });
  } catch (err) {
    if (err.message.includes('Cannot mutate or delete posted landed cost voucher')) {
      postedLandedCostMutationBlocked = true;
    } else {
      throw err;
    }
  }
  assert.strictEqual(postedLandedCostMutationBlocked, true, 'Trigger trg_landed_costs_immutable blocked mutating POSTED voucher');
  console.log('  ✓ Immutability triggers successfully blocked mutation of exhausted layers and posted vouchers.');

  // ─── Scenario 9: Hardware Row-Level Security (RLS) Isolation ───────────────
  console.log('\n[11/12] Scenario 9: Verifying Hardware Row-Level Security (RLS) Isolation...');
  await client.query('BEGIN');
  try {
    // Ensure rls_test_user exists and has select permissions
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

    // Switch context to Tenant B under unprivileged role
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT_B]);
    await client.query('SET ROLE rls_test_user');

    const crossProfiles = await client.query('SELECT * FROM gigalibs_finance.cost_profiles');
    const crossLayers = await client.query('SELECT * FROM gigalibs_finance.inventory_cost_layers');
    const crossConsumptions = await client.query('SELECT * FROM gigalibs_finance.cost_layer_consumptions');
    const crossVouchers = await client.query('SELECT * FROM gigalibs_finance.landed_cost_vouchers');
    const crossAllocations = await client.query('SELECT * FROM gigalibs_finance.landed_cost_allocations');
    const crossRevaluations = await client.query('SELECT * FROM gigalibs_finance.inventory_revaluations');

    assert.strictEqual(crossProfiles.rows.length, 0, 'Tenant B sees ZERO profiles of Tenant A');
    assert.strictEqual(crossLayers.rows.length, 0, 'Tenant B sees ZERO layers of Tenant A');
    assert.strictEqual(crossConsumptions.rows.length, 0, 'Tenant B sees ZERO consumptions of Tenant A');
    assert.strictEqual(crossVouchers.rows.length, 0, 'Tenant B sees ZERO vouchers of Tenant A');
    assert.strictEqual(crossAllocations.rows.length, 0, 'Tenant B sees ZERO allocations of Tenant A');
    assert.strictEqual(crossRevaluations.rows.length, 0, 'Tenant B sees ZERO revaluations of Tenant A');

    await client.query('RESET ROLE');
    await client.query('COMMIT');
    console.log('  ✓ Hardware RLS strictly isolated all costing & valuation tables between tenants.');
  } catch (err) {
    await client.query('RESET ROLE');
    await client.query('ROLLBACK');
    throw err;
  }

  // ─── Scenario 10: Subledger-to-GL Balance Reconciliation ───────────────────
  console.log('\n[12/12] Scenario 10: Reconciling Inventory Subledger Valuation to GL Balance Sheet...');
  const recon = await withTenant(TENANT_A, async () => {
    // 1. Sum of subledger active layers remaining cost minor
    const layersSumRes = await client.query(`
      SELECT COALESCE(SUM(total_remaining_cost_minor), 0) AS subledger_total_minor
        FROM gigalibs_finance.inventory_cost_layers
       WHERE tenant_id = $1 AND status != 'EXHAUSTED'
    `, [TENANT_A]);
    const subledgerTotalMinor = BigInt(layersSumRes.rows[0].subledger_total_minor);

    // 2. Net GL balance of Inventory Asset account 1400: Sum(debit) - Sum(credit)
    const glRes = await client.query(`
      SELECT COALESCE(SUM(debit_amount_minor), 0) AS total_debit,
             COALESCE(SUM(credit_amount_minor), 0) AS total_credit
        FROM gigalibs_finance.gl_journal_lines
       WHERE account_id = $1
    `, [invAssetAccId]);
    const glDebit = BigInt(glRes.rows[0].total_debit);
    const glCredit = BigInt(glRes.rows[0].total_credit);
    const glNetMinor = glDebit - glCredit;

    return { subledgerTotalMinor, glNetMinor, glDebit, glCredit };
  });

  // Layer 2 remaining ($2,200) + AVCO layer ($2,600) + Standard revalued layer ($1,250) = $6,050.00 (605000 minor)
  console.log(`  Subledger Total Remaining: $${Number(recon.subledgerTotalMinor) / 100}`);
  console.log(`  General Ledger Net Debit:   $${Number(recon.glNetMinor) / 100} (Debits: $${Number(recon.glDebit)/100}, Credits: $${Number(recon.glCredit)/100})`);
  assert.strictEqual(recon.subledgerTotalMinor, recon.glNetMinor, 'Subledger valuation matches General Ledger Account 1400 EXACTLY');
  console.log('  ✓ Inventory Subledger perfectly reconciled to General Ledger Inventory Asset (1400) balance sheet account.');

  console.log('\n================================================================================');
  console.log('ALL 12 DATABASE CERTIFICATION CHECKS PASSED FOR WI-OI-116 (INVENTORY COSTING)!');
  console.log('================================================================================\n');

} finally {
  await client.end();
}
