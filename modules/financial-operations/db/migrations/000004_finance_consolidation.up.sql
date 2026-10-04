-- Migration: 000004_finance_consolidation.up.sql
-- Module: financial-operations (WI-OI-115)
-- Purpose: Multi-company financial consolidation groups, member entities,
--          foreign exchange translation rates (IAS 21), intercompany account pairs,
--          consolidation runs, line-item entries, elimination vouchers,
--          hardware RLS, and immutability triggers.

BEGIN;

-- 1. Record migration version
INSERT INTO gigalibs_finance.schema_migrations (version) VALUES (4)
ON CONFLICT (version) DO NOTHING;

-- 2. Consolidation Groups
CREATE TABLE IF NOT EXISTS gigalibs_finance.consolidation_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    reporting_currency VARCHAR(3) NOT NULL,
    parent_entity_id UUID NOT NULL REFERENCES gigalibs_finance.accounting_books(id),
    cta_gl_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    nci_gl_account_id UUID REFERENCES gigalibs_finance.chart_of_accounts(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(64),
    updated_by VARCHAR(64),
    CONSTRAINT uq_consolidation_groups_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_consolidation_groups_tenant_code ON gigalibs_finance.consolidation_groups(tenant_id, code);

-- 3. Consolidation Entities (Member Books & Ownership)
CREATE TABLE IF NOT EXISTS gigalibs_finance.consolidation_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    consolidation_group_id UUID NOT NULL REFERENCES gigalibs_finance.consolidation_groups(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES gigalibs_finance.accounting_books(id),
    ownership_percentage INT NOT NULL DEFAULT 100 CHECK (ownership_percentage BETWEEN 1 AND 100),
    consolidation_method VARCHAR(30) NOT NULL DEFAULT 'FULL' CHECK (consolidation_method IN ('FULL', 'PROPORTIONAL', 'EQUITY')),
    is_parent BOOLEAN NOT NULL DEFAULT false,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_consolidation_entities_group_book UNIQUE (tenant_id, consolidation_group_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_consolidation_entities_group ON gigalibs_finance.consolidation_entities(tenant_id, consolidation_group_id);

-- 4. Consolidation FX Rates (Period-Specific IAS 21 Translation)
CREATE TABLE IF NOT EXISTS gigalibs_finance.consolidation_fx_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    consolidation_group_id UUID NOT NULL REFERENCES gigalibs_finance.consolidation_groups(id) ON DELETE CASCADE,
    fiscal_year_id UUID NOT NULL REFERENCES gigalibs_finance.fiscal_years(id),
    fiscal_period_id UUID NOT NULL REFERENCES gigalibs_finance.fiscal_periods(id),
    from_currency VARCHAR(3) NOT NULL,
    to_currency VARCHAR(3) NOT NULL,
    closing_rate_scaled BIGINT NOT NULL CHECK (closing_rate_scaled > 0),
    average_rate_scaled BIGINT NOT NULL CHECK (average_rate_scaled > 0),
    historical_rate_scaled BIGINT NOT NULL CHECK (historical_rate_scaled > 0),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_consolidation_fx_rates UNIQUE (tenant_id, consolidation_group_id, fiscal_period_id, from_currency, to_currency)
);

CREATE INDEX IF NOT EXISTS idx_consolidation_fx_rates_period ON gigalibs_finance.consolidation_fx_rates(tenant_id, consolidation_group_id, fiscal_period_id);

-- 5. Intercompany Account Pairs (Bilateral Trade & Loans)
CREATE TABLE IF NOT EXISTS gigalibs_finance.intercompany_pairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    consolidation_group_id UUID NOT NULL REFERENCES gigalibs_finance.consolidation_groups(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    entity_a_book_id UUID NOT NULL REFERENCES gigalibs_finance.accounting_books(id),
    entity_a_gl_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    entity_b_book_id UUID NOT NULL REFERENCES gigalibs_finance.accounting_books(id),
    entity_b_gl_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    pair_type VARCHAR(30) NOT NULL DEFAULT 'BALANCE_SHEET' CHECK (pair_type IN ('BALANCE_SHEET', 'INCOME_STATEMENT', 'DIVIDEND')),
    elimination_target VARCHAR(30) NOT NULL DEFAULT 'BILATERAL' CHECK (elimination_target IN ('BILATERAL', 'UNILATERAL')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_intercompany_pairs_code UNIQUE (tenant_id, consolidation_group_id, code)
);

CREATE INDEX IF NOT EXISTS idx_intercompany_pairs_group ON gigalibs_finance.intercompany_pairs(tenant_id, consolidation_group_id);

-- 6. Consolidation Runs
CREATE TABLE IF NOT EXISTS gigalibs_finance.consolidation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    consolidation_group_id UUID NOT NULL REFERENCES gigalibs_finance.consolidation_groups(id),
    run_number VARCHAR(50) NOT NULL,
    fiscal_year_id UUID NOT NULL REFERENCES gigalibs_finance.fiscal_years(id),
    fiscal_period_id UUID NOT NULL REFERENCES gigalibs_finance.fiscal_periods(id),
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'TRANSLATED', 'ELIMINATED', 'SEALED', 'REVERSED')),
    total_subsidiary_debit_minor BIGINT NOT NULL DEFAULT 0,
    total_subsidiary_credit_minor BIGINT NOT NULL DEFAULT 0,
    total_elimination_debit_minor BIGINT NOT NULL DEFAULT 0,
    total_elimination_credit_minor BIGINT NOT NULL DEFAULT 0,
    total_cta_minor BIGINT NOT NULL DEFAULT 0,
    total_consolidated_debit_minor BIGINT NOT NULL DEFAULT 0,
    total_consolidated_credit_minor BIGINT NOT NULL DEFAULT 0,
    executed_by VARCHAR(64) NOT NULL,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sealed_at TIMESTAMPTZ,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_consolidation_runs_number UNIQUE (tenant_id, run_number)
);

CREATE INDEX IF NOT EXISTS idx_consolidation_runs_group ON gigalibs_finance.consolidation_runs(tenant_id, consolidation_group_id, fiscal_period_id);

-- 7. Consolidation Entries (Translated Snapshot Lines)
CREATE TABLE IF NOT EXISTS gigalibs_finance.consolidation_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    consolidation_run_id UUID NOT NULL REFERENCES gigalibs_finance.consolidation_runs(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES gigalibs_finance.accounting_books(id),
    gl_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    local_currency VARCHAR(3) NOT NULL,
    local_debit_minor BIGINT NOT NULL DEFAULT 0,
    local_credit_minor BIGINT NOT NULL DEFAULT 0,
    fx_rate_type VARCHAR(20) NOT NULL CHECK (fx_rate_type IN ('CLOSING', 'AVERAGE', 'HISTORICAL', 'ONE_TO_ONE')),
    fx_rate_applied_scaled BIGINT NOT NULL,
    reporting_currency VARCHAR(3) NOT NULL,
    reporting_debit_minor BIGINT NOT NULL DEFAULT 0,
    reporting_credit_minor BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consolidation_entries_run ON gigalibs_finance.consolidation_entries(tenant_id, consolidation_run_id);

-- 8. Consolidation Eliminations (Generated Elimination Journal Lines)
CREATE TABLE IF NOT EXISTS gigalibs_finance.consolidation_eliminations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    consolidation_run_id UUID NOT NULL REFERENCES gigalibs_finance.consolidation_runs(id) ON DELETE CASCADE,
    intercompany_pair_id UUID REFERENCES gigalibs_finance.intercompany_pairs(id),
    gl_journal_id UUID REFERENCES gigalibs_finance.gl_journals(id),
    debit_gl_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    credit_gl_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    elimination_amount_minor BIGINT NOT NULL CHECK (elimination_amount_minor > 0),
    currency_code VARCHAR(3) NOT NULL,
    discrepancy_amount_minor BIGINT NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consolidation_eliminations_run ON gigalibs_finance.consolidation_eliminations(tenant_id, consolidation_run_id);

-- 9. Immutability Trigger on Sealed Consolidation Runs
CREATE OR REPLACE FUNCTION gigalibs_finance.fn_verify_consolidation_run_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status = 'SEALED' AND NEW.status != 'REVERSED' THEN
        RAISE EXCEPTION 'Cannot modify sealed consolidation run id %', OLD.id;
    END IF;

    IF TG_OP = 'DELETE' AND OLD.status = 'SEALED' THEN
        RAISE EXCEPTION 'Cannot delete sealed consolidation run id %', OLD.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_consolidation_runs_immutable ON gigalibs_finance.consolidation_runs;
CREATE TRIGGER trg_consolidation_runs_immutable
BEFORE UPDATE OR DELETE ON gigalibs_finance.consolidation_runs
FOR EACH ROW EXECUTE FUNCTION gigalibs_finance.fn_verify_consolidation_run_immutability();

-- 10. Hardware Row-Level Security
ALTER TABLE gigalibs_finance.consolidation_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.consolidation_groups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.consolidation_groups;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.consolidation_groups
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_finance.consolidation_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.consolidation_entities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.consolidation_entities;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.consolidation_entities
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_finance.consolidation_fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.consolidation_fx_rates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.consolidation_fx_rates;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.consolidation_fx_rates
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_finance.intercompany_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.intercompany_pairs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.intercompany_pairs;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.intercompany_pairs
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_finance.consolidation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.consolidation_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.consolidation_runs;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.consolidation_runs
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_finance.consolidation_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.consolidation_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.consolidation_entries;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.consolidation_entries
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_finance.consolidation_eliminations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.consolidation_eliminations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.consolidation_eliminations;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.consolidation_eliminations
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

COMMIT;
