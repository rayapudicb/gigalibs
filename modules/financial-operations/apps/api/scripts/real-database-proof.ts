import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import * as contracts from '@gigalibs/contracts';

const DB_URL = process.env.CONTROL_PLANE_DB_URL || process.env.DATABASE_URL || 'postgresql://gigalibs:gigalibs_dev@localhost:5440/gigalibs';

console.log('== Financial Operations Real Database Certification ==');
const client = new pg.Client({ connectionString: DB_URL });
await client.connect();

const TENANT_A = `tenant-fin-${randomUUID().slice(0, 8)}`;
const TENANT_B = `tenant-fin-other-${randomUUID().slice(0, 8)}`;
const ACTOR_A = `actor-${randomUUID().slice(0, 8)}`;
const LEGAL_ENTITY_ID = randomUUID();

try {
  // 1. Schema check
  const migRes = await client.query('SELECT version FROM gigalibs_finance.schema_migrations');
  assert.equal(migRes.rows[0]?.version, '1', 'Schema migration 1 applied');

  // Helper
  const withTenant = async (tenantId: string, fn: () => Promise<void>) => {
    await client.query('BEGIN');
    try {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await fn();
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  };

  // 2. Book
  const bookId = randomUUID();
  await withTenant(TENANT_A, async () => {
    await client.query(
      `INSERT INTO gigalibs_finance.accounting_books (
        id, tenant_id, book_code, book_name, legal_entity_party_id, currency_code, costing_method, is_primary, status
      ) VALUES ($1, $2, 'CORP-US-GAAP', 'Primary US GAAP Book', $3, 'USD', 'STANDARD', true, 'ACTIVE')`,
      [bookId, TENANT_A, LEGAL_ENTITY_ID],
    );
  });

  // 3. COA
  const cashId = randomUUID();
  const arId = randomUUID();
  const revId = randomUUID();
  await withTenant(TENANT_A, async () => {
    await client.query(
      `INSERT INTO gigalibs_finance.chart_of_accounts (id, tenant_id, accounting_book_id, account_code, account_name, account_class, account_subtype, normal_balance, is_reconcilable, is_subledger_control, is_system_reserved, active)
       VALUES ($1, $2, $3, '1000', 'Operating Cash', 'ASSET', 'BANK', 'DEBIT', true, false, true, true)`,
      [cashId, TENANT_A, bookId],
    );
    await client.query(
      `INSERT INTO gigalibs_finance.chart_of_accounts (id, tenant_id, accounting_book_id, account_code, account_name, account_class, account_subtype, normal_balance, is_reconcilable, is_subledger_control, is_system_reserved, active)
       VALUES ($1, $2, $3, '1200', 'Accounts Receivable Control', 'ASSET', 'ACCOUNTS_RECEIVABLE', 'DEBIT', true, true, true, true)`,
      [arId, TENANT_A, bookId],
    );
    await client.query(
      `INSERT INTO gigalibs_finance.chart_of_accounts (id, tenant_id, accounting_book_id, account_code, account_name, account_class, account_subtype, normal_balance, is_reconcilable, is_subledger_control, is_system_reserved, active)
       VALUES ($1, $2, $3, '4000', 'Commercial Sales Revenue', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT', false, false, false, true)`,
      [revId, TENANT_A, bookId],
    );
  });

  // 4. Periods
  const yearId = randomUUID();
  const periodOpenId = randomUUID();
  const periodLockedId = randomUUID();
  await withTenant(TENANT_A, async () => {
    await client.query(
      `INSERT INTO gigalibs_finance.fiscal_years (id, tenant_id, accounting_book_id, year_name, start_date, end_date, status)
       VALUES ($1, $2, $3, 'FY-2026', '2026-01-01', '2026-12-31', 'OPEN')`,
      [yearId, TENANT_A, bookId],
    );
    await client.query(
      `INSERT INTO gigalibs_finance.fiscal_periods (id, tenant_id, fiscal_year_id, accounting_book_id, period_number, period_name, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, 1, 'FY-2026-01', '2026-01-01', '2026-01-31', 'LOCKED')`,
      [periodLockedId, TENANT_A, yearId, bookId],
    );
    await client.query(
      `INSERT INTO gigalibs_finance.fiscal_periods (id, tenant_id, fiscal_year_id, accounting_book_id, period_number, period_name, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, 10, 'FY-2026-10', '2026-10-01', '2026-10-31', 'OPEN')`,
      [periodOpenId, TENANT_A, yearId, bookId],
    );
  });

  // 5. Balanced Journal
  const jnlId = randomUUID();
  await withTenant(TENANT_A, async () => {
    await client.query(
      `INSERT INTO gigalibs_finance.gl_journals (id, tenant_id, journal_number, accounting_book_id, fiscal_period_id, posting_date, entry_type, description, status, total_debit_minor, total_credit_minor, posted_at, posted_by)
       VALUES ($1, $2, 'JNL-PROOF-001', $3, $4, '2026-10-04', 'STANDARD_MANUAL', 'Proof Journal', 'POSTED', 150000, 150000, clock_timestamp(), $5)`,
      [jnlId, TENANT_A, bookId, periodOpenId, ACTOR_A],
    );
    await client.query(
      `INSERT INTO gigalibs_finance.gl_journal_lines (tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor, currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo)
       VALUES ($1, $2, 1, $3, 150000, 0, 'USD', 1.0, 150000, 0, 'Debit AR')`,
      [TENANT_A, jnlId, arId],
    );
    await client.query(
      `INSERT INTO gigalibs_finance.gl_journal_lines (tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor, currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo)
       VALUES ($1, $2, 2, $3, 0, 150000, 'USD', 1.0, 0, 150000, 'Credit Revenue')`,
      [TENANT_A, jnlId, revId],
    );
  });

  // 6. Double-entry invariant check
  let unbalanceRejected = false;
  try {
    await withTenant(TENANT_A, async () => {
      const badId = randomUUID();
      await client.query(
        `INSERT INTO gigalibs_finance.gl_journals (id, tenant_id, journal_number, accounting_book_id, fiscal_period_id, posting_date, entry_type, description, status, total_debit_minor, total_credit_minor)
         VALUES ($1, $2, 'JNL-BAD', $3, $4, '2026-10-04', 'STANDARD_MANUAL', 'Bad', 'POSTED', 100, 100)`,
        [badId, TENANT_A, bookId, periodOpenId],
      );
      await client.query(
        `INSERT INTO gigalibs_finance.gl_journal_lines (tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor, currency_code, base_debit_amount_minor, base_credit_amount_minor)
         VALUES ($1, $2, 1, $3, 100, 0, 'USD', 100, 0)`,
        [TENANT_A, badId, arId],
      );
      await client.query(
        `INSERT INTO gigalibs_finance.gl_journal_lines (tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor, currency_code, base_debit_amount_minor, base_credit_amount_minor)
         VALUES ($1, $2, 2, $3, 0, 50, 'USD', 0, 50)`,
        [TENANT_A, badId, revId],
      );
    });
  } catch {
    unbalanceRejected = true;
  }
  assert.ok(unbalanceRejected, 'Unbalance journal must be rejected');

  // 7. Immutability
  let updateRejected = false;
  try {
    await withTenant(TENANT_A, async () => {
      await client.query('UPDATE gigalibs_finance.gl_journal_lines SET debit_amount_minor = 9999 WHERE journal_id = $1', [jnlId]);
    });
  } catch {
    updateRejected = true;
  }
  assert.ok(updateRejected, 'Update on posted line must be rejected');

  // 8. Reversal
  const revJnlId = randomUUID();
  await withTenant(TENANT_A, async () => {
    await client.query(
      `INSERT INTO gigalibs_finance.gl_journals (id, tenant_id, journal_number, accounting_book_id, fiscal_period_id, posting_date, entry_type, source_document_type, source_document_id, description, status, total_debit_minor, total_credit_minor, reversed_journal_id, posted_at, posted_by)
       VALUES ($1, $2, 'REV-PROOF-001', $3, $4, '2026-10-04', 'REVERSAL', 'GL_JOURNAL', $5, 'Reversal', 'POSTED', 150000, 150000, $6, clock_timestamp(), $7)`,
      [revJnlId, TENANT_A, bookId, periodOpenId, jnlId, jnlId, ACTOR_A],
    );
    await client.query(
      `INSERT INTO gigalibs_finance.gl_journal_lines (tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor, currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo)
       VALUES ($1, $2, 1, $3, 0, 150000, 'USD', 1.0, 0, 150000, 'Reversal Credit')`,
      [TENANT_A, revJnlId, arId],
    );
    await client.query(
      `INSERT INTO gigalibs_finance.gl_journal_lines (tenant_id, journal_id, line_number, account_id, debit_amount_minor, credit_amount_minor, currency_code, exchange_rate, base_debit_amount_minor, base_credit_amount_minor, memo)
       VALUES ($1, $2, 2, $3, 150000, 0, 'USD', 1.0, 150000, 0, 'Reversal Debit')`,
      [TENANT_A, revJnlId, revId],
    );
    await client.query("UPDATE gigalibs_finance.gl_journals SET status = 'REVERSED' WHERE id = $1", [jnlId]);
  });

  console.log('✓ All Real-Database Financial Operations checks passed successfully.');
} finally {
  await client.end();
}
