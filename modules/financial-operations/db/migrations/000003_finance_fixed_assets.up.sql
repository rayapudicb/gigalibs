-- Migration: 000003_finance_fixed_assets.up.sql
-- Module: financial-operations (WI-OI-114)
-- Purpose: Fixed asset classes, asset register, multi-method depreciation schedules,
--          periodic batch depreciation runs, asset disposals, hardware RLS, and immutability triggers.

BEGIN;

-- 1. Record migration version
INSERT INTO gigalibs_finance.schema_migrations (version) VALUES (3)
ON CONFLICT (version) DO NOTHING;

-- 2. Fixed Asset Classes
CREATE TABLE IF NOT EXISTS gigalibs_finance.fixed_asset_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    depreciation_method VARCHAR(30) NOT NULL DEFAULT 'STRAIGHT_LINE'
        CHECK (depreciation_method IN ('STRAIGHT_LINE', 'DECLINING_BALANCE', 'SUM_OF_YEARS_DIGITS', 'NO_DEPRECIATION')),
    default_useful_life_months INT NOT NULL CHECK (default_useful_life_months >= 0),
    default_salvage_percentage INT NOT NULL DEFAULT 0 CHECK (default_salvage_percentage BETWEEN 0 AND 100),
    asset_gl_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    depreciation_expense_gl_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    accumulated_depreciation_gl_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    disposal_gain_loss_gl_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_fixed_asset_classes_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_asset_classes_tenant_code ON gigalibs_finance.fixed_asset_classes(tenant_id, code);

-- 3. Fixed Assets Register
CREATE TABLE IF NOT EXISTS gigalibs_finance.fixed_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    asset_code VARCHAR(50) NOT NULL,
    asset_name VARCHAR(200) NOT NULL,
    description TEXT,
    asset_class_id UUID NOT NULL REFERENCES gigalibs_finance.fixed_asset_classes(id),
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'CAPITALIZED', 'DEPRECIATING', 'FULLY_DEPRECIATED', 'DISPOSED', 'WRITTEN_OFF')),
    acquisition_date DATE NOT NULL,
    capitalization_date DATE,
    currency_code VARCHAR(3) NOT NULL DEFAULT 'USD',
    acquisition_cost_minor BIGINT NOT NULL CHECK (acquisition_cost_minor >= 0),
    salvage_value_minor BIGINT NOT NULL DEFAULT 0 CHECK (salvage_value_minor >= 0),
    useful_life_months INT NOT NULL CHECK (useful_life_months >= 0),
    depreciation_method VARCHAR(30) NOT NULL
        CHECK (depreciation_method IN ('STRAIGHT_LINE', 'DECLINING_BALANCE', 'SUM_OF_YEARS_DIGITS', 'NO_DEPRECIATION')),
    convention VARCHAR(30) NOT NULL DEFAULT 'FULL_MONTH'
        CHECK (convention IN ('FULL_MONTH', 'HALF_YEAR', 'MID_MONTH')),
    current_book_value_minor BIGINT NOT NULL CHECK (current_book_value_minor >= 0),
    accumulated_depreciation_minor BIGINT NOT NULL DEFAULT 0 CHECK (accumulated_depreciation_minor >= 0),
    physical_asset_ref UUID,
    asset_tag VARCHAR(100),
    serial_number VARCHAR(100),
    org_unit_id VARCHAR(64),
    place_id VARCHAR(64),
    custodian_party_id UUID,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT uq_fixed_assets_code UNIQUE (tenant_id, asset_code)
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_tenant_status ON gigalibs_finance.fixed_assets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_tenant_class ON gigalibs_finance.fixed_assets(tenant_id, asset_class_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_tenant_physical ON gigalibs_finance.fixed_assets(tenant_id, physical_asset_ref) WHERE physical_asset_ref IS NOT NULL;

-- 4. Asset Depreciation Schedules
CREATE TABLE IF NOT EXISTS gigalibs_finance.asset_depreciation_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    asset_id UUID NOT NULL REFERENCES gigalibs_finance.fixed_assets(id) ON DELETE CASCADE,
    fiscal_period_id UUID NOT NULL REFERENCES gigalibs_finance.fiscal_periods(id),
    period_number INT NOT NULL CHECK (period_number > 0),
    schedule_date DATE NOT NULL,
    depreciation_amount_minor BIGINT NOT NULL CHECK (depreciation_amount_minor >= 0),
    accumulated_depreciation_minor BIGINT NOT NULL CHECK (accumulated_depreciation_minor >= 0),
    book_value_minor BIGINT NOT NULL CHECK (book_value_minor >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'PROJECTED'
        CHECK (status IN ('PROJECTED', 'POSTED', 'REVERSED')),
    journal_entry_id UUID REFERENCES gigalibs_finance.gl_journals(id),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_asset_depr_schedules_period UNIQUE (tenant_id, asset_id, period_number)
);

CREATE INDEX IF NOT EXISTS idx_asset_depr_sched_asset_status ON gigalibs_finance.asset_depreciation_schedules(tenant_id, asset_id, status);
CREATE INDEX IF NOT EXISTS idx_asset_depr_sched_period ON gigalibs_finance.asset_depreciation_schedules(tenant_id, fiscal_period_id, status);

-- 5. Asset Depreciation Runs
CREATE TABLE IF NOT EXISTS gigalibs_finance.asset_depreciation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    run_code VARCHAR(50) NOT NULL,
    fiscal_period_id UUID NOT NULL REFERENCES gigalibs_finance.fiscal_periods(id),
    run_date DATE NOT NULL,
    total_depreciation_amount_minor BIGINT NOT NULL CHECK (total_depreciation_amount_minor >= 0),
    asset_count INT NOT NULL CHECK (asset_count >= 0),
    journal_entry_id UUID REFERENCES gigalibs_finance.gl_journals(id),
    status VARCHAR(20) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT', 'POSTED')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_asset_depr_runs_code UNIQUE (tenant_id, run_code)
);

CREATE INDEX IF NOT EXISTS idx_asset_depr_runs_tenant_period ON gigalibs_finance.asset_depreciation_runs(tenant_id, fiscal_period_id);

-- 6. Asset Disposals
CREATE TABLE IF NOT EXISTS gigalibs_finance.asset_disposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    asset_id UUID NOT NULL REFERENCES gigalibs_finance.fixed_assets(id),
    disposal_date DATE NOT NULL,
    disposal_type VARCHAR(30) NOT NULL CHECK (disposal_type IN ('SALE', 'SCRAP', 'WRITE_OFF', 'THEFT')),
    proceeds_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (proceeds_amount_minor >= 0),
    net_book_value_minor BIGINT NOT NULL CHECK (net_book_value_minor >= 0),
    gain_loss_amount_minor BIGINT NOT NULL,
    clearing_bank_account_id UUID REFERENCES gigalibs_finance.bank_accounts(id),
    journal_entry_id UUID NOT NULL REFERENCES gigalibs_finance.gl_journals(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_disposals_tenant_asset ON gigalibs_finance.asset_disposals(tenant_id, asset_id);

-- 7. Immutability Trigger for Posted Depreciation Schedules
CREATE OR REPLACE FUNCTION gigalibs_finance.fn_verify_depreciation_schedule_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status = 'POSTED' THEN
        IF NEW.status <> 'REVERSED' AND (
            NEW.depreciation_amount_minor <> OLD.depreciation_amount_minor OR
            NEW.accumulated_depreciation_minor <> OLD.accumulated_depreciation_minor OR
            NEW.book_value_minor <> OLD.book_value_minor OR
            NEW.period_number <> OLD.period_number
        ) THEN
            RAISE EXCEPTION 'Cannot modify financial figures of posted depreciation schedule id %', OLD.id;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' AND OLD.status = 'POSTED' THEN
        RAISE EXCEPTION 'Cannot delete posted depreciation schedule id %', OLD.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_depreciation_schedules_immutable ON gigalibs_finance.asset_depreciation_schedules;
CREATE TRIGGER trg_depreciation_schedules_immutable
BEFORE UPDATE OR DELETE ON gigalibs_finance.asset_depreciation_schedules
FOR EACH ROW EXECUTE FUNCTION gigalibs_finance.fn_verify_depreciation_schedule_immutability();

-- 8. Hardware Row-Level Security
ALTER TABLE gigalibs_finance.fixed_asset_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.fixed_asset_classes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.fixed_asset_classes;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.fixed_asset_classes
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_finance.fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.fixed_assets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.fixed_assets;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.fixed_assets
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_finance.asset_depreciation_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.asset_depreciation_schedules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.asset_depreciation_schedules;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.asset_depreciation_schedules
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_finance.asset_depreciation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.asset_depreciation_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.asset_depreciation_runs;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.asset_depreciation_runs
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_finance.asset_disposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.asset_disposals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.asset_disposals;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.asset_disposals
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

COMMIT;
