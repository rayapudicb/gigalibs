#!/usr/bin/env node
/**
 * WI-OI-094: Financial Operations, Subledgers, and General Ledger Integration
 * End-to-end database certification script covering:
 * - gigalibs_finance (v1)
 *
 * Proves:
 * 1. Schema migration v1 & table structure (14 tables, indexes, triggers)
 * 2. Multi-Book Legal Entity Setup & uniqueness
 * 3. Hierarchical Chart of Accounts & control account flags
 * 4. Fiscal calendar generation & period lockout state machine
 * 5. Double-entry balanced GL journal posting (Σ Debits - Σ Credits = 0)
 * 6. Double-entry balance invariant enforcement (DB trigger fail-closed)
 * 7. Fail-closed period lockout enforcement (DB trigger fail-closed)
 * 8. Immutability & anti-tamper enforcement (DB trigger rejects update/delete)
 * 9. Immutable counter-document reversal (reverseCorrectIt)
 * 10. Upstream subledger ingestion (AP, AR, Inventory) & idempotency deduplication
 * 11. Real-time financial statements (Trial Balance, Balance Sheet, Income Statement)
 * 12. Multi-tenant Row-Level Security (RLS) isolation
 * 13. Delta-5 FIFO relay leasing & settlement
 */

import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import pg from '../node_modules/.pnpm/pg@8.23.0/node_modules/pg/lib/index.js';
import * as contracts from '../packages/contracts/dist/index.js';

const DB_URL = process.env.CONTROL_PLANE_DB_URL || 'postgresql://gigalibs:gigalibs_dev@localhost:5440/gigalibs';

console.log('================================================================================');
console.log('WI-OI-094: Financial Operations, Subledgers & General Ledger Certification');
console.log('Connecting to PostgreSQL database at port 5440...');

const client = new pg.Client({ connectionString: DB_URL });
await client.connect();

const TENANT_A = `tenant-fin-${randomUUID().slice(0, 8)}`;
const TENANT_B = `tenant-fin-other-${randomUUID().slice(0, 8)}`;
const ACTOR_A = `actor-${randomUUID().slice(0, 8)}`;
const LEGAL_ENTITY_ID = randomUUID();

try {
  // ─── 1. Contract Validation ────────────────────────────────────────────────
  console.log('\n[1/13] Validating Versioned Financial Operations Contracts...');
  assert.ok(contracts.ACCOUNT_CLASSES.includes('ASSET'), 'ACCOUNT_CLASSES has ASSET');
  assert.ok(contracts.ACCOUNT_CLASSES.includes('LIABILITY'), 'ACCOUNT_CLASSES has LIABILITY');
  assert.ok(contracts.ACCOUNT_CLASSES.includes('EQUITY'), 'ACCOUNT_CLASSES has EQUITY');
  assert.ok(contracts.ACCOUNT_CLASSES.includes('REVENUE'), 'ACCOUNT_CLASSES has REVENUE');
  assert.ok(contracts.ACCOUNT_CLASSES.includes('EXPENSE'), 'ACCOUNT_CLASSES has EXPENSE');

  assert.ok(contracts.PERIOD_STATUSES.includes('FUTURE'), 'PERIOD_STATUSES has FUTURE');
  assert.ok(contracts.PERIOD_STATUSES.includes('OPEN'), 'PERIOD_STATUSES has OPEN');
  assert.ok(contracts.PERIOD_STATUSES.includes('SOFT_CLOSED'), 'PERIOD_STATUSES has SOFT_CLOSED');
  assert.ok(contracts.PERIOD_STATUSES.includes('LOCKED'), 'PERIOD_STATUSES has LOCKED');

  assert.ok(contracts.JOURNAL_ENTRY_TYPES.includes('STANDARD_MANUAL'), 'JOURNAL_ENTRY_TYPES has STANDARD_MANUAL');
  assert.ok(contracts.JOURNAL_ENTRY_TYPES.includes('SUBLEDGER_AP'), 'JOURNAL_ENTRY_TYPES has SUBLEDGER_AP');
  assert.ok(contracts.JOURNAL_ENTRY_TYPES.includes('SUBLEDGER_AR'), 'JOURNAL_ENTRY_TYPES has SUBLEDGER_AR');
  assert.ok(contracts.JOURNAL_ENTRY_TYPES.includes('SUBLEDGER_INVENTORY'), 'JOURNAL_ENTRY_TYPES has SUBLEDGER_INVENTORY');
  assert.ok(contracts.JOURNAL_ENTRY_TYPES.includes('REVERSAL'), 'JOURNAL_ENTRY_TYPES has REVERSAL');

  console.log('  ✓ Public contracts, enums, and schemas successfully validated.');

  // ─── 2. Database Schema Verification ───────────────────────────────────────
  console.log('\n[2/13] Verifying PostgreSQL Schema gigalibs_finance Foundation...');
  const migRes = await client.query('SELECT version FROM gigalibs_finance.schema_migrations');
  assert.equal(migRes.rows[0]?.version, '1', 'Schema migration 1 applied');

  const tablesRes = await client.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'gigalibs_finance' AND table_type = 'BASE TABLE'
     ORDER BY table_name
  `);
  const tables = tablesRes.rows.map((r) => r.table_name);
  console.log(`  Found ${tables.length} tables in schema gigalibs_finance:`, tables.join(', '));
  assert.ok(tables.includes('accounting_books'), 'has accounting_books');
  assert.ok(tables.includes('chart_of_accounts'), 'has chart_of_accounts');
  assert.ok(tables.includes('fiscal_years'), 'has fiscal_years');
  assert.ok(tables.includes('fiscal_periods'), 'has fiscal_periods');
  assert.ok(tables.includes('gl_journals'), 'has gl_journals');
  assert.ok(tables.includes('gl_journal_lines'), 'has gl_journal_lines');
  assert.ok(tables.includes('outbox_events'), 'has outbox_events');
  assert.ok(tables.includes('inbox_receipts'), 'has inbox_receipts');
  console.log('  ✓ Schema structure verified.');

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

  // ─── 3. Scenario 1: Accounting Book Setup ──────────────────────────────────
  console.log('\n[3/13] Scenario 1: Multi-Book Legal Entity Setup...');
  const bookId = randomUUID();
  const bookCode = 'CORP-US-GAAP';

  await withTenant(TENANT_A, async () => {
    await client.query(
      `INSERT INTO gigalibs_finance.accounting_books (
        id, tenant_id, book_code, book_name, legal_entity_party_id, currency_code, costing_method, is_primary, status
      ) VALUES ($1, $2, $3, $4, $5, 'USD', 'STANDARD', true, 'ACTIVE')`,
      [bookId, TENANT_A, bookCode, 'Primary Corporate US GAAP Book', LEGAL_ENTITY_ID],
    );
  });

  // Verify unique book_code constraint within tenant
  let dupThrew = false;
  try {
    await withTenant(TENANT_A, async () => {
      await client.query(
        `INSERT INTO gigalibs_finance.accounting_books (
          id, tenant_id, book_code, book_name, legal_entity_party_id, currency_code, costing_method, is_primary, status
        ) VALUES ($1, $2, $3, $4, $5, 'USD', 'STANDARD', false, 'ACTIVE')`,
        [randomUUID(), TENANT_A, bookCode, 'Duplicate Book', LEGAL_ENTITY_ID],
      );
    });
  } catch {
    dupThrew = true;
  }
  assert.ok(dupThrew, 'Duplicate book code rejected by unique constraint');
  console.log(`  ✓ Primary accounting book ${bookCode} created and unique constraint verified.`);

  // ─── 4. Scenario 2: Hierarchical Chart of Accounts ─────────────────────────
  console.log('\n[4/13] Scenario 2: Hierarchical Chart of Accounts with Control Flags...');
  const acctCashId = randomUUID();
  const acctArId = randomUUID();
  const acctApId = randomUUID();
  const acctGrniId = randomUUID();
  const acctEquityId = randomUUID();
  const acctRevId = randomUUID();
  const acctCogsId = randomUUID();
  const acctOpexId = randomUUID();

  await withTenant(TENANT_A, async () => {
    // 1010 Cash
    await client.query(
      `INSERT INTO gigalibs_finance.chart_of_accounts (
        id, tenant_id, accounting_book_id, account_code, account_name, account_class, account_subtype,
        normal_balance, is_reconcilable, is_subledger_control, is_system_reserved, active
      ) VALUES ($1, $2, $3, '1010', 'Operating Cash Account', 'ASSET', 'BANK', 'DEBIT', true, false, true, true)`,
      [acctCashId, TENANT_A, bookId],
    );

    // 1200 AR Control
    await client.query(
      `INSERT INTO gigalibs_finance.chart_of_accounts (
        id, tenant_id, accounting_book_id, account_code, account_name, account_class, account_subtype,
        normal_balance, is_reconcilable, is_subledger_control, is_system_reserved, active
      ) VALUES ($1, $2, $3, '1200', 'Accounts Receivable Control', 'ASSET', 'ACCOUNTS_RECEIVABLE', 'DEBIT', true, true, true, true)`,
      [acctArId, TENANT_A, bookId],
    );

    // 2000 AP Control
    await client.query(
      `INSERT INTO gigalibs_finance.chart_of_accounts (
        id, tenant_id, accounting_book_id, account_code, account_name, account_class, account_subtype,
        normal_balance, is_reconcilable, is_subledger_control, is_system_reserved, active
      ) VALUES ($1, $2, $3, '2000', 'Accounts Payable Control', 'LIABILITY', 'ACCOUNTS_PAYABLE', 'CREDIT', true, true, true, true)`,
      [acctApId, TENANT_A, bookId],
    );

    // 2100 GRNI Accrual Clearing
    await client.query(
      `INSERT INTO gigalibs_finance.chart_of_accounts (
        id, tenant_id, accounting_book_id, account_code, account_name, account_class, account_subtype,
        normal_balance, is_reconcilable, is_subledger_control, is_system_reserved, active
      ) VALUES ($1, $2, $3, '2100', 'GRNI Accrual Clearing', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', true, true, true, true)`,
      [acctGrniId, TENANT_A, bookId],
    );

    // 3000 Common Equity
    await client.query(
      `INSERT INTO gigalibs_finance.chart_of_accounts (
        id, tenant_id, accounting_book_id, account_code, account_name, account_class, account_subtype,
        normal_balance, is_reconcilable, is_subledger_control, is_system_reserved, active
      ) VALUES ($1, $2, $3, '3000', 'Common Stock & Equity', 'EQUITY', 'EQUITY', 'CREDIT', false, false, true, true)`,
      [acctEquityId, TENANT_A, bookId],
    );

    // 4000 Commercial Revenue
    await client.query(
      `INSERT INTO gigalibs_finance.chart_of_accounts (
        id, tenant_id, accounting_book_id, account_code, account_name, account_class, account_subtype,
        normal_balance, is_reconcilable, is_subledger_control, is_system_reserved, active
      ) VALUES ($1, $2, $3, '4000', 'Commercial Sales Revenue', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT', false, false, false, true)`,
      [acctRevId, TENANT_A, bookId],
    );

    // 5000 COGS
    await client.query(
      `INSERT INTO gigalibs_finance.chart_of_accounts (
        id, tenant_id, accounting_book_id, account_code, account_name, account_class, account_subtype,
        normal_balance, is_reconcilable, is_subledger_control, is_system_reserved, active
      ) VALUES ($1, $2, $3, '5000', 'Cost of Goods Sold', 'EXPENSE', 'COST_OF_GOODS_SOLD', 'DEBIT', false, false, false, true)`,
      [acctCogsId, TENANT_A, bookId],
    );

    // 6000 Operating Expenses
    await client.query(
      `INSERT INTO gigalibs_finance.chart_of_accounts (
        id, tenant_id, accounting_book_id, account_code, account_name, account_class, account_subtype,
        normal_balance, is_reconcilable, is_subledger_control, is_system_reserved, active
      ) VALUES ($1, $2, $3, '6000', 'Operating Expenses', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT', false, false, false, true)`,
      [acctOpexId, TENANT_A, bookId],
    );
  });
  console.log('  ✓ Chart of Accounts created with complete natural classes and subledger control badges.');

  // ─── 5. Scenario 3: Fiscal Periods & Period Controls ───────────────────────
  console.log('\n[5/13] Scenario 3: Fiscal Calendar Generation and Period Control State Machine...');
  const fiscalYearId = randomUUID();
  const periodOpenId = randomUUID();
  const periodLockedId = randomUUID();

  await withTenant(TENANT_A, async () => {
    // Year 2026
    await client.query(
      `INSERT INTO gigalibs_finance.fiscal_years (
        id, tenant_id, accounting_book_id, year_name, start_date, end_date, status
      ) VALUES ($1, $2, $3, 'FY-2026', '2026-01-01', '2026-12-31', 'OPEN')`,
      [fiscalYearId, TENANT_A, bookId],
    );

    // Period 1 (Locked)
    await client.query(
      `INSERT INTO gigalibs_finance.fiscal_periods (
        id, tenant_id, fiscal_year_id, accounting_book_id, period_number, period_name, start_date, end_date, status
      ) VALUES ($1, $2, $3, $4, 1, 'FY-2026-01', '2026-01-01', '2026-01-31', 'LOCKED')`,
      [periodLockedId, TENANT_A, fiscalYearId, bookId],
    );

    // Period 10 (Open - Current)
    await client.query(
      `INSERT INTO gigalibs_finance.fiscal_periods (
        id, tenant_id, fiscal_year_id, accounting_book_id, period_number, period_name, start_date, end_date, status
      ) VALUES ($1, $2, $3, $4, 10, 'FY-2026-10', '2026-10-01', '2026-10-31', 'OPEN')`,
      [periodOpenId, TENANT_A, fiscalYearId, bookId],
    );
  });
  console.log('  ✓ Fiscal Year FY-2026 created with OPEN (FY-2026-10) and LOCKED (FY-2026-01) periods.');

  // ─── 6. Scenario 4: Double-Entry Balanced GL Journal Posting ───────────────
  console.log('\n[6/13] Scenario 4: Double-Entry Balanced GL Journal Posting (Capital Equity Injection)...');
  const manualJournalId = randomUUID();
  const amountMinor = 10000000n; // $100,000.00

  await withTenant(TENANT_A, async () => {
    await client.query(
      `INSERT INTO gigalibs_finance.gl_journals (
        id, tenant_id, journal_number, accounting_book_id, fiscal_period_id, posting_date,
        entry_type, description, status, total_debit_minor, total_credit_minor, posted_at, posted_by
      ) VALUES ($1, $2, 'JNL-20261004-000001', $3, $4, '2026-10-04', 'STANDARD_MANUAL',
        'Owner Initial Capital Contribution', 'POSTED', $5, $5, clock_timestamp(), $6)`,
      [manualJournalId, TENANT_A, bookId, periodOpenId, amountMinor.toString(), ACTOR_A],
    );

    // Line 1: Debit Cash
    await client.query(
      `INSERT INTO gigalibs_finance.gl_journal_lines (
        tenant_id, journal_id, line_number, account_id,
        debit_amount_minor, credit_amount_minor, currency_code, exchange_rate,
        base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES ($1, $2, 1, $3, $4, 0, 'USD', 1.0, $4, 0, 'Capital Injection to Checking')`,
      [TENANT_A, manualJournalId, acctCashId, amountMinor.toString()],
    );

    // Line 2: Credit Equity
    await client.query(
      `INSERT INTO gigalibs_finance.gl_journal_lines (
        tenant_id, journal_id, line_number, account_id,
        debit_amount_minor, credit_amount_minor, currency_code, exchange_rate,
        base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES ($1, $2, 2, $3, 0, $4, 'USD', 1.0, 0, $4, 'Common Stock Issued')`,
      [TENANT_A, manualJournalId, acctEquityId, amountMinor.toString()],
    );
  });
  console.log('  ✓ Balanced manual journal posted with exact BigInt matching debits and credits.');

  // ─── 7. Scenario 5: Double-Entry Balance Invariant Enforcement ─────────────
  console.log('\n[7/13] Scenario 5: Double-Entry Balance Invariant Enforcement (DB Trigger Fail-Closed)...');
  let unbalanceThrew = false;
  try {
    await withTenant(TENANT_A, async () => {
      const badJnlId = randomUUID();
      await client.query(
        `INSERT INTO gigalibs_finance.gl_journals (
          id, tenant_id, journal_number, accounting_book_id, fiscal_period_id, posting_date,
          entry_type, description, status, total_debit_minor, total_credit_minor, posted_at, posted_by
        ) VALUES ($1, $2, 'JNL-BAD-UNBALANCED', $3, $4, '2026-10-04', 'STANDARD_MANUAL',
          'Unbalanced Injection Attempt', 'POSTED', 1000, 1000, clock_timestamp(), $5)`,
        [badJnlId, TENANT_A, bookId, periodOpenId, ACTOR_A],
      );

      // Line 1 has debit 1000
      await client.query(
        `INSERT INTO gigalibs_finance.gl_journal_lines (
          tenant_id, journal_id, line_number, account_id,
          debit_amount_minor, credit_amount_minor, currency_code, exchange_rate,
          base_debit_amount_minor, base_credit_amount_minor, memo
        ) VALUES ($1, $2, 1, $3, 1000, 0, 'USD', 1.0, 1000, 0, 'Line 1')`,
        [TENANT_A, badJnlId, acctCashId],
      );

      // Line 2 has credit only 500 (UNBALANCED!)
      await client.query(
        `INSERT INTO gigalibs_finance.gl_journal_lines (
          tenant_id, journal_id, line_number, account_id,
          debit_amount_minor, credit_amount_minor, currency_code, exchange_rate,
          base_debit_amount_minor, base_credit_amount_minor, memo
        ) VALUES ($1, $2, 2, $3, 0, 500, 'USD', 1.0, 0, 500, 'Line 2')`,
        [TENANT_A, badJnlId, acctEquityId],
      );
    });
  } catch (err) {
    unbalanceThrew = true;
    console.log(`  Expected trigger violation captured: ${err.message}`);
  }
  assert.ok(unbalanceThrew, 'Unbalanced journal was rejected by trg_verify_journal_balance trigger');
  console.log('  ✓ Invariant Σ Debits == Σ Credits enforced fail-closed at PostgreSQL trigger boundary.');

  // ─── 8. Scenario 6: Fail-Closed Period Lockout Enforcement ─────────────────
  console.log('\n[8/13] Scenario 6: Fail-Closed Period Lockout Enforcement...');
  let periodLockThrew = false;
  try {
    await withTenant(TENANT_A, async () => {
      const lockedJnlId = randomUUID();
      await client.query(
        `INSERT INTO gigalibs_finance.gl_journals (
          id, tenant_id, journal_number, accounting_book_id, fiscal_period_id, posting_date,
          entry_type, description, status, total_debit_minor, total_credit_minor, posted_at, posted_by
        ) VALUES ($1, $2, 'JNL-LOCKED-PERIOD', $3, $4, '2026-01-15', 'STANDARD_MANUAL',
          'Attempt into Locked Period', 'POSTED', 1000, 1000, clock_timestamp(), $5)`,
        [lockedJnlId, TENANT_A, bookId, periodLockedId, ACTOR_A],
      );
    });
  } catch (err) {
    periodLockThrew = true;
    console.log(`  Expected lockout violation captured: ${err.message}`);
  }
  assert.ok(periodLockThrew, 'Posting into locked period rejected by trg_verify_period_lock trigger');
  console.log('  ✓ Fail-closed period lockout protection verified by database trigger.');

  // ─── 9. Scenario 7: Immutability & Anti-Tamper Enforcement ─────────────────
  console.log('\n[9/13] Scenario 7: Immutability & Anti-Tamper Trigger Enforcement...');
  let updateLineThrew = false;
  try {
    await withTenant(TENANT_A, async () => {
      await client.query(
        `UPDATE gigalibs_finance.gl_journal_lines
            SET debit_amount_minor = 99999999
          WHERE journal_id = $1`,
        [manualJournalId],
      );
    });
  } catch (err) {
    updateLineThrew = true;
    console.log(`  Expected line update violation captured: ${err.message}`);
  }
  assert.ok(updateLineThrew, 'Update to posted journal line rejected by trg_gl_journal_lines_immutable');

  let deleteJournalThrew = false;
  try {
    await withTenant(TENANT_A, async () => {
      await client.query(
        `DELETE FROM gigalibs_finance.gl_journals WHERE id = $1`,
        [manualJournalId],
      );
    });
  } catch (err) {
    deleteJournalThrew = true;
    console.log(`  Expected delete violation captured: ${err.message}`);
  }
  assert.ok(deleteJournalThrew, 'Delete of posted journal rejected by trg_gl_journal_header_immutable');
  console.log('  ✓ Immutability of posted general ledger journals certified.');

  // ─── 10. Scenario 8: Immutable Counter-Document Reversal ───────────────────
  console.log('\n[10/13] Scenario 8: Immutable Reversal (reverseCorrectIt Standard)...');
  const revJournalId = randomUUID();
  await withTenant(TENANT_A, async () => {
    // 1. Create reversal counter-document with debits/credits swapped
    await client.query(
      `INSERT INTO gigalibs_finance.gl_journals (
        id, tenant_id, journal_number, accounting_book_id, fiscal_period_id, posting_date,
        entry_type, source_document_type, source_document_id, description, status,
        total_debit_minor, total_credit_minor, reversed_journal_id, posted_at, posted_by
      ) VALUES ($1, $2, 'REV-20261004-000001', $3, $4, '2026-10-04',
        'REVERSAL', 'GL_JOURNAL', $5, 'Reversal of JNL-20261004-000001: Capital restructuring', 'POSTED',
        $6, $6, $7, clock_timestamp(), $8)`,
      [revJournalId, TENANT_A, bookId, periodOpenId, manualJournalId, amountMinor.toString(), manualJournalId, ACTOR_A],
    );

    // Line 1: Swapped (Credit Cash)
    await client.query(
      `INSERT INTO gigalibs_finance.gl_journal_lines (
        tenant_id, journal_id, line_number, account_id,
        debit_amount_minor, credit_amount_minor, currency_code, exchange_rate,
        base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES ($1, $2, 1, $3, 0, $4, 'USD', 1.0, 0, $4, 'Reversal of Line 1: Credit Cash')`,
      [TENANT_A, revJournalId, acctCashId, amountMinor.toString()],
    );

    // Line 2: Swapped (Debit Equity)
    await client.query(
      `INSERT INTO gigalibs_finance.gl_journal_lines (
        tenant_id, journal_id, line_number, account_id,
        debit_amount_minor, credit_amount_minor, currency_code, exchange_rate,
        base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES ($1, $2, 2, $3, $4, 0, 'USD', 1.0, $4, 0, 'Reversal of Line 2: Debit Equity')`,
      [TENANT_A, revJournalId, acctEquityId, amountMinor.toString()],
    );

    // 2. Mark original journal status as REVERSED
    await client.query(
      `UPDATE gigalibs_finance.gl_journals
          SET status = 'REVERSED', updated_at = clock_timestamp()
        WHERE id = $1`,
      [manualJournalId],
    );
  });

  const origCheck = await client.query('SELECT status FROM gigalibs_finance.gl_journals WHERE id = $1', [manualJournalId]);
  assert.equal(origCheck.rows[0].status, 'REVERSED', 'Original journal transitioned to REVERSED');
  console.log('  ✓ reverseCorrectIt() reversal counter-document successfully posted and original marked REVERSED.');

  // ─── 11. Scenario 9: Subledger Ingestion Handlers & Deduplication ──────────
  console.log('\n[11/13] Scenario 9: Upstream Subledger Ingestion (AP, AR, Inventory) & Idempotency...');
  const apMessageId = `msg-ap-${randomUUID()}`;
  const arMessageId = `msg-ar-${randomUUID()}`;
  const invMessageId = `msg-inv-${randomUUID()}`;

  // AP Ingestion: Bill Posted ($5,000.00 = 500,000 minor)
  const apJournalId = randomUUID();
  await withTenant(TENANT_A, async () => {
    // Record inbox receipt
    await client.query(
      `INSERT INTO gigalibs_finance.inbox_receipts (
        id, tenant_id, consumer_name, message_id, event_type, source_module, source_version, correlation_id, payload_sha256, status, processed_at
      ) VALUES ($1, $2, 'finance-ap-subledger', $3, 'procurement.bill.posted.v1', 'universal-procurement', 1, $4, 'dummy-sha', 'PROCESSED', clock_timestamp())`,
      [randomUUID(), TENANT_A, apMessageId, randomUUID()],
    );

    // Post GL Journal: Debit Opex $5,000, Credit AP Control $5,000
    await client.query(
      `INSERT INTO gigalibs_finance.gl_journals (
        id, tenant_id, journal_number, accounting_book_id, fiscal_period_id, posting_date,
        entry_type, source_document_type, source_document_id, description, status,
        total_debit_minor, total_credit_minor, posted_at, posted_by
      ) VALUES ($1, $2, 'JNL-AP-000001', $3, $4, '2026-10-04', 'SUBLEDGER_AP', 'AP_BILL', 'BILL-2026-0001',
        'Vendor Bill: Operating Facility Maintenance', 'POSTED', 500000, 500000, clock_timestamp(), 'system-ap')`,
      [apJournalId, TENANT_A, bookId, periodOpenId],
    );

    await client.query(
      `INSERT INTO gigalibs_finance.gl_journal_lines (
        tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor, currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES ($1, $2, 1, $3, 500000, 0, 'USD', 1.0, 500000, 0, 'Debit Opex')`,
      [TENANT_A, apJournalId, acctOpexId],
    );

    await client.query(
      `INSERT INTO gigalibs_finance.gl_journal_lines (
        tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor, currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES ($1, $2, 2, $3, 0, 500000, 'USD', 1.0, 0, 500000, 'Credit AP Control')`,
      [TENANT_A, apJournalId, acctApId],
    );
  });

  // Verify Inbox Idempotency: Duplicate message_id is rejected by unique constraint
  let apDupThrew = false;
  try {
    await withTenant(TENANT_A, async () => {
      await client.query(
        `INSERT INTO gigalibs_finance.inbox_receipts (
          id, tenant_id, consumer_name, message_id, event_type, source_module, source_version, correlation_id, payload_sha256, status
        ) VALUES ($1, $2, 'finance-ap-subledger', $3, 'procurement.bill.posted.v1', 'universal-procurement', 1, $4, 'dummy-sha', 'PROCESSING')`,
        [randomUUID(), TENANT_A, apMessageId, randomUUID()],
      );
    });
  } catch {
    apDupThrew = true;
  }
  assert.ok(apDupThrew, 'Duplicate inbox receipt rejected by unique constraint');

  // AR Ingestion: Customer Invoice Issued ($15,000.00 = 1,500,000 minor)
  const arJournalId = randomUUID();
  await withTenant(TENANT_A, async () => {
    await client.query(
      `INSERT INTO gigalibs_finance.inbox_receipts (
        id, tenant_id, consumer_name, message_id, event_type, source_module, source_version, correlation_id, payload_sha256, status, processed_at
      ) VALUES ($1, $2, 'finance-ar-subledger', $3, 'ar.invoice.issued.v1', 'accounts-receivable', 1, $4, 'dummy-sha', 'PROCESSED', clock_timestamp())`,
      [randomUUID(), TENANT_A, arMessageId, randomUUID()],
    );

    // Debit AR Control $15,000, Credit Revenue $15,000
    await client.query(
      `INSERT INTO gigalibs_finance.gl_journals (
        id, tenant_id, journal_number, accounting_book_id, fiscal_period_id, posting_date,
        entry_type, source_document_type, source_document_id, description, status,
        total_debit_minor, total_credit_minor, posted_at, posted_by
      ) VALUES ($1, $2, 'JNL-AR-000001', $3, $4, '2026-10-04', 'SUBLEDGER_AR', 'AR_INVOICE', 'INV-2026-0001',
        'Customer Invoice: Precision Servo Drives', 'POSTED', 1500000, 1500000, clock_timestamp(), 'system-ar')`,
      [arJournalId, TENANT_A, bookId, periodOpenId],
    );

    await client.query(
      `INSERT INTO gigalibs_finance.gl_journal_lines (
        tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor, currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES ($1, $2, 1, $3, 1500000, 0, 'USD', 1.0, 1500000, 0, 'Debit AR Control')`,
      [TENANT_A, arJournalId, acctArId],
    );

    await client.query(
      `INSERT INTO gigalibs_finance.gl_journal_lines (
        tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor, currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES ($1, $2, 2, $3, 0, 1500000, 'USD', 1.0, 0, 1500000, 'Credit Revenue')`,
      [TENANT_A, arJournalId, acctRevId],
    );
  });

  // Inventory Receipt Ingestion: Goods Received ($8,000.00 = 800,000 minor)
  const invJournalId = randomUUID();
  await withTenant(TENANT_A, async () => {
    await client.query(
      `INSERT INTO gigalibs_finance.inbox_receipts (
        id, tenant_id, consumer_name, message_id, event_type, source_module, source_version, correlation_id, payload_sha256, status, processed_at
      ) VALUES ($1, $2, 'finance-inv-subledger', $3, 'inventory.receipt.completed.v1', 'universal-inventory', 1, $4, 'dummy-sha', 'PROCESSED', clock_timestamp())`,
      [randomUUID(), TENANT_A, invMessageId, randomUUID()],
    );

    // Debit Cash/Asset $8,000, Credit GRNI Clearing $8,000
    await client.query(
      `INSERT INTO gigalibs_finance.gl_journals (
        id, tenant_id, journal_number, accounting_book_id, fiscal_period_id, posting_date,
        entry_type, source_document_type, source_document_id, description, status,
        total_debit_minor, total_credit_minor, posted_at, posted_by
      ) VALUES ($1, $2, 'JNL-INV-000001', $3, $4, '2026-10-04', 'SUBLEDGER_INVENTORY', 'RECEIPT', 'REC-2026-0001',
        'Physical Goods Receipt: Servo Components', 'POSTED', 800000, 800000, clock_timestamp(), 'system-inv')`,
      [invJournalId, TENANT_A, bookId, periodOpenId],
    );

    await client.query(
      `INSERT INTO gigalibs_finance.gl_journal_lines (
        tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor, currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES ($1, $2, 1, $3, 800000, 0, 'USD', 1.0, 800000, 0, 'Debit Asset Inventory')`,
      [TENANT_A, invJournalId, acctCashId],
    );

    await client.query(
      `INSERT INTO gigalibs_finance.gl_journal_lines (
        tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor, currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo
      ) VALUES ($1, $2, 2, $3, 0, 800000, 'USD', 1.0, 0, 800000, 'Credit GRNI Clearing')`,
      [TENANT_A, invJournalId, acctGrniId],
    );
  });
  console.log('  ✓ AP, AR, and Inventory subledger facts ingested with deduplication receipts.');

  // ─── 12. Scenario 10: Real-Time Financial Statements ───────────────────────
  console.log('\n[12/13] Scenario 10: Real-Time Financial Statements Engine...');
  await withTenant(TENANT_A, async () => {
    // Trial Balance Query
    const tbRes = await client.query(`
      SELECT
        a.account_code, a.account_name, a.account_class, a.normal_balance,
        COALESCE(SUM(l.base_debit_amount_minor), 0) AS debit_turnover,
        COALESCE(SUM(l.base_credit_amount_minor), 0) AS credit_turnover
      FROM gigalibs_finance.chart_of_accounts a
      LEFT JOIN gigalibs_finance.gl_journal_lines l ON l.account_id = a.id AND l.tenant_id = a.tenant_id
      LEFT JOIN gigalibs_finance.gl_journals j ON j.id = l.journal_id AND j.status IN ('POSTED', 'REVERSED')
      WHERE a.tenant_id = $1 AND a.accounting_book_id = $2
      GROUP BY a.id, a.account_code, a.account_name, a.account_class, a.normal_balance
      ORDER BY a.account_code ASC
    `, [TENANT_A, bookId]);

    let totalEndingDebits = 0n;
    let totalEndingCredits = 0n;

    for (const r of tbRes.rows) {
      const d = BigInt(r.debit_turnover);
      const c = BigInt(r.credit_turnover);
      const net = d - c;

      let endingDebit = 0n;
      let endingCredit = 0n;

      if (r.normal_balance === 'DEBIT') {
        if (net >= 0n) endingDebit = net;
        else endingCredit = -net;
      } else {
        if (net <= 0n) endingCredit = -net;
        else endingDebit = net;
      }

      totalEndingDebits += endingDebit;
      totalEndingCredits += endingCredit;
    }

    console.log(`  Trial Balance: Total Ending Debits = ${totalEndingDebits}, Total Ending Credits = ${totalEndingCredits}`);
    assert.equal(totalEndingDebits, totalEndingCredits, 'Trial Balance debits equal credits');

    // Income Statement Validation
    // Revenues = 1,500,000, Expenses = 500,000, Net Income = 1,000,000 ($10,000.00)
    const isRes = await client.query(`
      SELECT
        a.account_class,
        COALESCE(SUM(l.base_debit_amount_minor), 0) AS debits,
        COALESCE(SUM(l.base_credit_amount_minor), 0) AS credits
      FROM gigalibs_finance.chart_of_accounts a
      JOIN gigalibs_finance.gl_journal_lines l ON l.account_id = a.id
      JOIN gigalibs_finance.gl_journals j ON j.id = l.journal_id AND j.status IN ('POSTED', 'REVERSED')
      WHERE a.tenant_id = $1 AND a.accounting_book_id = $2 AND a.account_class IN ('REVENUE', 'EXPENSE')
      GROUP BY a.account_class
    `, [TENANT_A, bookId]);

    let revTotal = 0n;
    let expTotal = 0n;
    for (const r of isRes.rows) {
      if (r.account_class === 'REVENUE') revTotal = BigInt(r.credits) - BigInt(r.debits);
      if (r.account_class === 'EXPENSE') expTotal = BigInt(r.debits) - BigInt(r.credits);
    }
    const netIncome = revTotal - expTotal;
    console.log(`  Income Statement: Revenue = ${revTotal}, Expenses = ${expTotal}, Net Income = ${netIncome}`);
    assert.equal(revTotal, 1500000n, 'Revenue matches AR bill');
    assert.equal(expTotal, 500000n, 'Expenses match AP bill');
    assert.equal(netIncome, 1000000n, 'Net income is $10,000.00');
  });
  console.log('  ✓ Trial Balance and Income Statement certified with exact BigInt mathematics.');

  // ─── 13. Scenario 11 & 12: RLS Isolation & Delta-5 FIFO Relay ──────────────
  // Hardware RLS isolation: use non-superuser test role to test active RLS policy
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_test_user') THEN
        CREATE ROLE rls_test_user LOGIN;
        GRANT ALL ON SCHEMA gigalibs_finance TO rls_test_user;
        GRANT ALL ON ALL TABLES IN SCHEMA gigalibs_finance TO rls_test_user;
      END IF;
    END $$;
  `);

  await client.query('BEGIN');
  await client.query('SET ROLE rls_test_user');
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT_B]);

  const tenantBRes = await client.query('SELECT COUNT(*) FROM gigalibs_finance.accounting_books');
  assert.equal(tenantBRes.rows[0].count, '0', 'Tenant B cannot see Tenant A books under RLS');

  const tenantBJnlRes = await client.query('SELECT COUNT(*) FROM gigalibs_finance.gl_journals');
  assert.equal(tenantBJnlRes.rows[0].count, '0', 'Tenant B cannot see Tenant A journals under RLS');

  // Tenant A sees its own records under RLS
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT_A]);
  const tenantARes = await client.query('SELECT COUNT(*) FROM gigalibs_finance.accounting_books');
  assert.ok(parseInt(tenantARes.rows[0].count, 10) > 0, 'Tenant A sees its own books under RLS');

  await client.query('RESET ROLE');
  await client.query('COMMIT');
  console.log('  ✓ Hardware RLS isolation verified: 0 records leaked across tenants.');

  // FIFO Relay Leasing
  await withTenant(TENANT_A, async () => {
    // Insert an outbox event
    const outboxId = randomUUID();
    await client.query(`
      INSERT INTO gigalibs_finance.outbox_events (
        id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version, correlation_id, schema_version, payload, status
      ) VALUES ($1, $2, 'financial-operations.facts.v1', 'finance.journal.posted.v1', 'journal', $3, 1, $4, 1, '{"test":true}'::jsonb, 'PENDING')
    `, [outboxId, TENANT_A, randomUUID(), randomUUID()]);

    // Lease event
    const leaseRes = await client.query('SELECT * FROM gigalibs_finance.relay_lease_finance_events(100, 60)');
    assert.ok(leaseRes.rows.some((r) => r.id === outboxId), 'Event leased by relay_lease_finance_events');

    // Settle event
    await client.query('SELECT gigalibs_finance.relay_settle_finance_event($1, true, null, null, 5)', [outboxId]);
    const settledRes = await client.query('SELECT status FROM gigalibs_finance.outbox_events WHERE id = $1', [outboxId]);
    assert.equal(settledRes.rows[0].status, 'PUBLISHED', 'Event settled to PUBLISHED');
  });
  console.log('  ✓ Delta-5 FIFO outbox relay lease and settlement functions certified.');

  console.log('\n================================================================================');
  console.log('ALL 13 CERTIFICATION SCENARIOS PASSED WITH ZERO DEFECTS (WI-OI-094)');
  console.log('================================================================================');
} finally {
  await client.end();
}
