-- Migration: 000002_finance_treasury_reconciliation.up.sql
-- Module: financial-operations (WI-OI-095)
-- Purpose: Bank accounts, statement ingestion, automated reconciliation matches,
--          reconciliation sessions with cryptographic seals, hardware RLS, and immutability triggers.

BEGIN;

-- 1. Record migration version
INSERT INTO gigalibs_finance.schema_migrations (version) VALUES (2)
ON CONFLICT (version) DO NOTHING;

-- 2. Bank Accounts
CREATE TABLE IF NOT EXISTS gigalibs_finance.bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    account_name VARCHAR(200) NOT NULL,
    account_number VARCHAR(100) NOT NULL,
    routing_code VARCHAR(100),
    iban VARCHAR(100),
    swift_bic VARCHAR(20),
    currency_code VARCHAR(3) NOT NULL,
    gl_cash_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    current_cleared_balance_minor BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'FROZEN')),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT uq_bank_accounts_tenant_num UNIQUE (tenant_id, account_number)
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_tenant_name ON gigalibs_finance.bank_accounts(tenant_id, account_name);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_tenant_gl_cash ON gigalibs_finance.bank_accounts(tenant_id, gl_cash_account_id);

-- 3. Bank Statements
CREATE TABLE IF NOT EXISTS gigalibs_finance.bank_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    bank_account_id UUID NOT NULL REFERENCES gigalibs_finance.bank_accounts(id) ON DELETE RESTRICT,
    statement_number VARCHAR(100) NOT NULL,
    statement_date DATE NOT NULL,
    opening_balance_minor BIGINT NOT NULL,
    closing_balance_minor BIGINT NOT NULL,
    format VARCHAR(20) NOT NULL CHECK (format IN ('CAMT053', 'MT940', 'OFX', 'CSV')),
    source_checksum VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'IMPORTED' CHECK (status IN ('IMPORTED', 'RECONCILING', 'RECONCILED')),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_bank_statements_checksum UNIQUE (tenant_id, bank_account_id, source_checksum)
);

CREATE INDEX IF NOT EXISTS idx_bank_statements_tenant_acc_date ON gigalibs_finance.bank_statements(tenant_id, bank_account_id, statement_date);

-- 4. Bank Statement Lines
CREATE TABLE IF NOT EXISTS gigalibs_finance.bank_statement_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    statement_id UUID NOT NULL REFERENCES gigalibs_finance.bank_statements(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    transaction_date DATE NOT NULL,
    value_date DATE NOT NULL,
    amount_minor BIGINT NOT NULL,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('CREDIT', 'DEBIT')),
    reference VARCHAR(200),
    check_number VARCHAR(50),
    counterparty_name VARCHAR(200),
    counterparty_account VARCHAR(100),
    description TEXT,
    match_status VARCHAR(20) NOT NULL DEFAULT 'UNMATCHED' CHECK (match_status IN ('UNMATCHED', 'AUTO_MATCHED', 'MANUALLY_MATCHED', 'ADJUSTED')),
    matched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_bank_statement_lines_seq UNIQUE (statement_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_tenant_match ON gigalibs_finance.bank_statement_lines(tenant_id, statement_id, match_status);
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_tenant_date ON gigalibs_finance.bank_statement_lines(tenant_id, transaction_date);

-- 5. Bank Reconciliation Sessions
CREATE TABLE IF NOT EXISTS gigalibs_finance.bank_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    bank_account_id UUID NOT NULL REFERENCES gigalibs_finance.bank_accounts(id) ON DELETE RESTRICT,
    statement_id UUID NOT NULL REFERENCES gigalibs_finance.bank_statements(id) ON DELETE RESTRICT,
    reconciliation_date DATE NOT NULL,
    statement_ending_balance_minor BIGINT NOT NULL,
    cleared_book_balance_minor BIGINT NOT NULL,
    unreconciled_difference_minor BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'BALANCED', 'SEALED')),
    seal_hash VARCHAR(64),
    sealed_at TIMESTAMPTZ,
    sealed_by VARCHAR(100),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_bank_reconciliations_session UNIQUE (tenant_id, bank_account_id, statement_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_tenant_date ON gigalibs_finance.bank_reconciliations(tenant_id, bank_account_id, reconciliation_date);

-- 6. Bank Reconciliation Matches
CREATE TABLE IF NOT EXISTS gigalibs_finance.bank_reconciliation_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    reconciliation_id UUID NOT NULL REFERENCES gigalibs_finance.bank_reconciliations(id) ON DELETE CASCADE,
    statement_line_id UUID NOT NULL REFERENCES gigalibs_finance.bank_statement_lines(id) ON DELETE RESTRICT,
    gl_journal_line_id UUID NOT NULL REFERENCES gigalibs_finance.gl_journal_lines(id) ON DELETE RESTRICT,
    matched_amount_minor BIGINT NOT NULL,
    match_rule VARCHAR(50) NOT NULL CHECK (match_rule IN ('EXACT_REF_AMOUNT', 'DATE_WINDOW_AMOUNT', 'MANUAL_OVERRIDE', 'FEE_ADJUSTMENT')),
    matched_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_bank_reconciliation_matches UNIQUE (reconciliation_id, statement_line_id, gl_journal_line_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_recon_matches_stmt_line ON gigalibs_finance.bank_reconciliation_matches(tenant_id, statement_line_id);
CREATE INDEX IF NOT EXISTS idx_bank_recon_matches_gl_line ON gigalibs_finance.bank_reconciliation_matches(tenant_id, gl_journal_line_id);

-- 7. Immutability trigger for sealed reconciliations
CREATE OR REPLACE FUNCTION gigalibs_finance.fn_verify_reconciliation_immutability()
RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status
    FROM gigalibs_finance.bank_reconciliations
    WHERE id = OLD.reconciliation_id;

    IF v_status = 'SEALED' THEN
        RAISE EXCEPTION 'CANNOT_MODIFY_SEALED_RECONCILIATION: Matches belonging to a sealed bank reconciliation session are immutable.';
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reconciliation_matches_immutable ON gigalibs_finance.bank_reconciliation_matches;
CREATE TRIGGER trg_reconciliation_matches_immutable
BEFORE UPDATE OR DELETE ON gigalibs_finance.bank_reconciliation_matches
FOR EACH ROW EXECUTE FUNCTION gigalibs_finance.fn_verify_reconciliation_immutability();

-- 8. Hardware Row-Level Security
ALTER TABLE gigalibs_finance.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.bank_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.bank_accounts;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.bank_accounts
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_finance.bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.bank_statements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.bank_statements;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.bank_statements
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_finance.bank_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.bank_statement_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.bank_statement_lines;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.bank_statement_lines
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_finance.bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.bank_reconciliations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.bank_reconciliations;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.bank_reconciliations
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_finance.bank_reconciliation_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.bank_reconciliation_matches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.bank_reconciliation_matches;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.bank_reconciliation_matches
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

COMMIT;
