-- Migration: 000007_finance_period_close_accruals_forecasting.up.sql
-- Module: financial-operations (WI-OI-118)
-- Purpose: Subledger lockouts (AP, AR, Inventory, Fixed Assets, Treasury, GL),
--          period close checklists with maker-checker approvals,
--          accrual, prepayment & deferred revenue amortization schedules (cent-conserving),
--          year-end retained earnings rollover engine,
--          and multi-period financial forecasting models with hardware RLS.

BEGIN;

-- 1. Record migration version
INSERT INTO gigalibs_finance.schema_migrations (version) VALUES (7)
ON CONFLICT (version) DO NOTHING;

-- 2. Period Subledger Locks
CREATE TABLE IF NOT EXISTS gigalibs_finance.period_subledger_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    accounting_book_id UUID NOT NULL REFERENCES gigalibs_finance.accounting_books(id) ON DELETE CASCADE,
    fiscal_period_id UUID NOT NULL REFERENCES gigalibs_finance.fiscal_periods(id) ON DELETE CASCADE,
    subledger_type VARCHAR(30) NOT NULL CHECK (subledger_type IN ('AP', 'AR', 'INVENTORY', 'FIXED_ASSETS', 'TREASURY', 'GL')),
    lock_status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (lock_status IN ('OPEN', 'SOFT_LOCKED', 'HARD_LOCKED')),
    locked_at TIMESTAMPTZ,
    locked_by VARCHAR(64),
    unlocked_at TIMESTAMPTZ,
    unlocked_by VARCHAR(64),
    notes TEXT,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_subledger_locks UNIQUE (tenant_id, accounting_book_id, fiscal_period_id, subledger_type)
);

CREATE INDEX IF NOT EXISTS idx_subledger_locks_lookup ON gigalibs_finance.period_subledger_locks(tenant_id, accounting_book_id, fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_subledger_locks_status ON gigalibs_finance.period_subledger_locks(tenant_id, subledger_type, lock_status);

-- 3. Period Close Checklists
CREATE TABLE IF NOT EXISTS gigalibs_finance.period_close_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    accounting_book_id UUID NOT NULL REFERENCES gigalibs_finance.accounting_books(id) ON DELETE CASCADE,
    fiscal_period_id UUID NOT NULL REFERENCES gigalibs_finance.fiscal_periods(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL CHECK (task_type IN (
        'BANK_RECONCILIATION', 'INVENTORY_VALUATION', 'DEPRECIATION_RUN',
        'ACCRUAL_AMORTIZATION', 'INTERCOMPANY_ELIMINATION', 'TAX_CALCULATION',
        'TRIAL_BALANCE_VERIFICATION', 'MAKER_CHECKER_APPROVAL'
    )),
    task_name VARCHAR(150) NOT NULL,
    task_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (task_status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED')),
    sequence_order INT NOT NULL DEFAULT 1,
    depends_on_task_type VARCHAR(50),
    completed_at TIMESTAMPTZ,
    completed_by VARCHAR(64),
    notes TEXT,
    evidence_ref VARCHAR(255),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_close_checklists UNIQUE (tenant_id, accounting_book_id, fiscal_period_id, task_type)
);

CREATE INDEX IF NOT EXISTS idx_close_checklists_lookup ON gigalibs_finance.period_close_checklists(tenant_id, accounting_book_id, fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_close_checklists_status ON gigalibs_finance.period_close_checklists(tenant_id, task_status);

-- 4. Accrual & Deferral Amortization Schedules
CREATE TABLE IF NOT EXISTS gigalibs_finance.accrual_amortization_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    accounting_book_id UUID NOT NULL REFERENCES gigalibs_finance.accounting_books(id) ON DELETE CASCADE,
    schedule_number VARCHAR(50) NOT NULL,
    schedule_name VARCHAR(150) NOT NULL,
    amortization_type VARCHAR(40) NOT NULL CHECK (amortization_type IN ('EXPENSE_ACCRUAL', 'PREPAYMENT_AMORTIZATION', 'DEFERRED_REVENUE_AMORTIZATION')),
    source_document_type VARCHAR(50),
    source_document_ref VARCHAR(100),
    total_amount_minor BIGINT NOT NULL CHECK (total_amount_minor > 0),
    recognized_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (recognized_amount_minor >= 0),
    remaining_amount_minor BIGINT NOT NULL CHECK (remaining_amount_minor >= 0),
    currency_code VARCHAR(3) NOT NULL,
    expense_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    balance_sheet_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    start_period_id UUID NOT NULL REFERENCES gigalibs_finance.fiscal_periods(id),
    end_period_id UUID REFERENCES gigalibs_finance.fiscal_periods(id),
    periods_count INT NOT NULL CHECK (periods_count >= 1 AND periods_count <= 120),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
    auto_reversal BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_amort_schedules_num UNIQUE (tenant_id, accounting_book_id, schedule_number)
);

CREATE INDEX IF NOT EXISTS idx_amort_schedules_book ON gigalibs_finance.accrual_amortization_schedules(tenant_id, accounting_book_id);
CREATE INDEX IF NOT EXISTS idx_amort_schedules_type ON gigalibs_finance.accrual_amortization_schedules(tenant_id, amortization_type, status);

-- 5. Accrual Amortization Lines
CREATE TABLE IF NOT EXISTS gigalibs_finance.accrual_amortization_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    schedule_id UUID NOT NULL REFERENCES gigalibs_finance.accrual_amortization_schedules(id) ON DELETE CASCADE,
    period_number INT NOT NULL CHECK (period_number >= 1),
    fiscal_period_id UUID NOT NULL REFERENCES gigalibs_finance.fiscal_periods(id),
    scheduled_date DATE NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'POSTED', 'REVERSED')),
    gl_journal_id UUID REFERENCES gigalibs_finance.gl_journals(id),
    auto_reversal_journal_id UUID REFERENCES gigalibs_finance.gl_journals(id),
    posted_at TIMESTAMPTZ,
    posted_by VARCHAR(64),
    reversed_at TIMESTAMPTZ,
    reversed_by VARCHAR(64),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_amort_lines_period UNIQUE (tenant_id, schedule_id, period_number)
);

CREATE INDEX IF NOT EXISTS idx_amort_lines_sched ON gigalibs_finance.accrual_amortization_lines(tenant_id, schedule_id);
CREATE INDEX IF NOT EXISTS idx_amort_lines_period ON gigalibs_finance.accrual_amortization_lines(tenant_id, fiscal_period_id, status);

-- 6. Year-End Close Runs (Retained Earnings Rollover)
CREATE TABLE IF NOT EXISTS gigalibs_finance.year_end_close_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    accounting_book_id UUID NOT NULL REFERENCES gigalibs_finance.accounting_books(id) ON DELETE CASCADE,
    fiscal_year_id UUID NOT NULL REFERENCES gigalibs_finance.fiscal_years(id),
    retained_earnings_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    total_revenue_minor BIGINT NOT NULL,
    total_expense_minor BIGINT NOT NULL,
    net_income_minor BIGINT NOT NULL,
    currency_code VARCHAR(3) NOT NULL,
    closing_journal_id UUID REFERENCES gigalibs_finance.gl_journals(id),
    status VARCHAR(20) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT', 'PREVIEWED', 'POSTED', 'REVERSED')),
    preview_summary JSONB,
    closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_by VARCHAR(64) NOT NULL,
    notes TEXT,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_year_end_runs UNIQUE (tenant_id, accounting_book_id, fiscal_year_id)
);

CREATE INDEX IF NOT EXISTS idx_year_end_runs_lookup ON gigalibs_finance.year_end_close_runs(tenant_id, accounting_book_id, fiscal_year_id);

-- 7. Financial Forecast Models
CREATE TABLE IF NOT EXISTS gigalibs_finance.financial_forecast_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    accounting_book_id UUID NOT NULL REFERENCES gigalibs_finance.accounting_books(id) ON DELETE CASCADE,
    model_name VARCHAR(150) NOT NULL,
    forecast_method VARCHAR(30) NOT NULL CHECK (forecast_method IN ('HISTORICAL_RUN_RATE', 'WEIGHTED_MOVING_AVG', 'BUDGET_ADJUSTED')),
    base_periods_count INT NOT NULL DEFAULT 3 CHECK (base_periods_count BETWEEN 1 AND 36),
    growth_rate_bps INT NOT NULL DEFAULT 0,
    inflation_rate_bps INT NOT NULL DEFAULT 0,
    forecast_horizon_periods INT NOT NULL DEFAULT 12 CHECK (forecast_horizon_periods BETWEEN 1 AND 36),
    include_commitments BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_forecast_models UNIQUE (tenant_id, accounting_book_id, model_name)
);

CREATE INDEX IF NOT EXISTS idx_forecast_models_book ON gigalibs_finance.financial_forecast_models(tenant_id, accounting_book_id);

-- 8. Financial Forecast Lines
CREATE TABLE IF NOT EXISTS gigalibs_finance.financial_forecast_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    model_id UUID NOT NULL REFERENCES gigalibs_finance.financial_forecast_models(id) ON DELETE CASCADE,
    projection_period_index INT NOT NULL CHECK (projection_period_index >= 1),
    fiscal_period_id UUID REFERENCES gigalibs_finance.fiscal_periods(id),
    account_id UUID REFERENCES gigalibs_finance.chart_of_accounts(id),
    account_type VARCHAR(30),
    baseline_amount_minor BIGINT NOT NULL,
    forecast_amount_minor BIGINT NOT NULL,
    encumbrance_adjusted_amount_minor BIGINT NOT NULL,
    confidence_low_minor BIGINT NOT NULL,
    confidence_high_minor BIGINT NOT NULL,
    currency_code VARCHAR(3) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_forecast_lines_account UNIQUE (tenant_id, model_id, projection_period_index, account_id)
);

CREATE INDEX IF NOT EXISTS idx_forecast_lines_model ON gigalibs_finance.financial_forecast_lines(tenant_id, model_id, projection_period_index);

-- 9. Enable and Force Row-Level Security
ALTER TABLE gigalibs_finance.period_subledger_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.period_subledger_locks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.period_subledger_locks
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_finance.period_close_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.period_close_checklists FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.period_close_checklists
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_finance.accrual_amortization_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.accrual_amortization_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.accrual_amortization_schedules
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_finance.accrual_amortization_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.accrual_amortization_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.accrual_amortization_lines
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_finance.year_end_close_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.year_end_close_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.year_end_close_runs
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_finance.financial_forecast_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.financial_forecast_models FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.financial_forecast_models
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_finance.financial_forecast_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.financial_forecast_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.financial_forecast_lines
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

-- 10. Immutability Triggers
CREATE OR REPLACE FUNCTION gigalibs_finance.fn_prevent_posted_year_end_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'POSTED' AND TG_OP = 'UPDATE' THEN
        IF NEW.net_income_minor <> OLD.net_income_minor OR NEW.closing_journal_id <> OLD.closing_journal_id THEN
            RAISE EXCEPTION 'Cannot modify financial figures on posted year-end close run %', OLD.id;
        END IF;
    END IF;
    IF OLD.status = 'POSTED' AND TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Cannot delete posted year-end close run %', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_year_end_close_immutable ON gigalibs_finance.year_end_close_runs;
CREATE TRIGGER trg_year_end_close_immutable
    BEFORE UPDATE OR DELETE ON gigalibs_finance.year_end_close_runs
    FOR EACH ROW EXECUTE FUNCTION gigalibs_finance.fn_prevent_posted_year_end_mutation();

CREATE OR REPLACE FUNCTION gigalibs_finance.fn_prevent_posted_amortization_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'POSTED' AND TG_OP = 'UPDATE' THEN
        IF NEW.amount_minor <> OLD.amount_minor OR NEW.gl_journal_id <> OLD.gl_journal_id THEN
            RAISE EXCEPTION 'Cannot modify posted amortization schedule line %', OLD.id;
        END IF;
    END IF;
    IF OLD.status = 'POSTED' AND TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Cannot delete posted amortization line %', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_amortization_lines_immutable ON gigalibs_finance.accrual_amortization_lines;
CREATE TRIGGER trg_amortization_lines_immutable
    BEFORE UPDATE OR DELETE ON gigalibs_finance.accrual_amortization_lines
    FOR EACH ROW EXECUTE FUNCTION gigalibs_finance.fn_prevent_posted_amortization_mutation();

COMMIT;
