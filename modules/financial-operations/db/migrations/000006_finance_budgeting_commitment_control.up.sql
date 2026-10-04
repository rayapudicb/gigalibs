-- Migration: 000006_finance_budgeting_commitment_control.up.sql
-- Module: financial-operations (WI-OI-117)
-- Purpose: Budget structures (Opex, Capex, Project), versioned budget revisions,
--          line allocations by Account/Cost-Center/Project/Period, commitment accounting
--          (encumbrances and liquidations), hardware RLS, and immutability triggers.

BEGIN;

-- 1. Record migration version
INSERT INTO gigalibs_finance.schema_migrations (version) VALUES (6)
ON CONFLICT (version) DO NOTHING;

-- 2. Budget Structures
CREATE TABLE IF NOT EXISTS gigalibs_finance.budget_structures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    budget_type VARCHAR(30) NOT NULL CHECK (budget_type IN ('OPERATING_OPEX', 'CAPITAL_CAPEX', 'PROJECT', 'REVENUE')),
    accounting_book_id UUID NOT NULL REFERENCES gigalibs_finance.accounting_books(id),
    control_action VARCHAR(30) NOT NULL DEFAULT 'HARD_STOP' CHECK (control_action IN ('HARD_STOP', 'ADVISORY_WARN', 'AUDIT_LOG', 'DISABLED')),
    allow_overspend_threshold_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (allow_overspend_threshold_pct >= 0 AND allow_overspend_threshold_pct <= 100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(64),
    updated_by VARCHAR(64),
    CONSTRAINT uq_budget_structures_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_budget_structures_tenant_code ON gigalibs_finance.budget_structures(tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_budget_structures_book ON gigalibs_finance.budget_structures(tenant_id, accounting_book_id);

-- 3. Budget Revisions (Maker-Checker & Version Control)
CREATE TABLE IF NOT EXISTS gigalibs_finance.budget_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    budget_structure_id UUID NOT NULL REFERENCES gigalibs_finance.budget_structures(id) ON DELETE CASCADE,
    revision_number INT NOT NULL CHECK (revision_number >= 1),
    fiscal_year_id UUID NOT NULL REFERENCES gigalibs_finance.fiscal_years(id),
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'ACTIVE', 'REVISED', 'SUPERSEDED', 'FROZEN', 'CLOSED')),
    total_allocated_minor BIGINT NOT NULL DEFAULT 0 CHECK (total_allocated_minor >= 0),
    checksum VARCHAR(64),
    notes TEXT,
    submitted_at TIMESTAMPTZ,
    submitted_by VARCHAR(64),
    approved_at TIMESTAMPTZ,
    approved_by VARCHAR(64),
    activated_at TIMESTAMPTZ,
    activated_by VARCHAR(64),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_budget_revisions_number UNIQUE (tenant_id, budget_structure_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_budget_revisions_struct_status ON gigalibs_finance.budget_revisions(tenant_id, budget_structure_id, status);
CREATE INDEX IF NOT EXISTS idx_budget_revisions_year ON gigalibs_finance.budget_revisions(tenant_id, fiscal_year_id);

-- 4. Budget Lines (Dimensional Allocations)
CREATE TABLE IF NOT EXISTS gigalibs_finance.budget_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    budget_revision_id UUID NOT NULL REFERENCES gigalibs_finance.budget_revisions(id) ON DELETE CASCADE,
    fiscal_period_id UUID NOT NULL REFERENCES gigalibs_finance.fiscal_periods(id),
    account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    cost_center_id VARCHAR(64) NOT NULL,
    project_code VARCHAR(64),
    allocated_amount_minor BIGINT NOT NULL CHECK (allocated_amount_minor >= 0),
    revised_amount_minor BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_lines_revision ON gigalibs_finance.budget_lines(tenant_id, budget_revision_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_lookup ON gigalibs_finance.budget_lines(tenant_id, account_id, cost_center_id, fiscal_period_id);

-- 5. Budget Commitments (Encumbrances)
CREATE TABLE IF NOT EXISTS gigalibs_finance.budget_commitments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    budget_line_id UUID NOT NULL REFERENCES gigalibs_finance.budget_lines(id) ON DELETE CASCADE,
    source_document_type VARCHAR(40) NOT NULL CHECK (source_document_type IN ('PURCHASE_REQUISITION', 'PURCHASE_ORDER', 'AP_BILL', 'MANUAL_RESERVATION')),
    source_document_id VARCHAR(100) NOT NULL,
    document_number VARCHAR(100) NOT NULL,
    commitment_type VARCHAR(30) NOT NULL CHECK (commitment_type IN ('PRE_COMMITMENT', 'ENCUMBRANCE', 'ACTUAL_CONSUMPTION', 'RELEASE')),
    amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LIQUIDATED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_commitments_line ON gigalibs_finance.budget_commitments(tenant_id, budget_line_id);
CREATE INDEX IF NOT EXISTS idx_budget_commitments_doc ON gigalibs_finance.budget_commitments(tenant_id, source_document_type, source_document_id);
CREATE INDEX IF NOT EXISTS idx_budget_commitments_status ON gigalibs_finance.budget_commitments(tenant_id, status);

-- 6. Enable and Force Row-Level Security
ALTER TABLE gigalibs_finance.budget_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.budget_structures FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.budget_structures
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_finance.budget_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.budget_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.budget_revisions
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_finance.budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.budget_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.budget_lines
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_finance.budget_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.budget_commitments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.budget_commitments
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

-- 7. Immutability Triggers
CREATE OR REPLACE FUNCTION gigalibs_finance.fn_prevent_sealed_revision_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IN ('ACTIVE', 'SUPERSEDED', 'FROZEN', 'CLOSED') AND TG_OP = 'UPDATE' THEN
        IF NEW.total_allocated_minor <> OLD.total_allocated_minor OR NEW.revision_number <> OLD.revision_number THEN
            RAISE EXCEPTION 'Cannot modify financial allocations on sealed budget revision %', OLD.id;
        END IF;
    END IF;
    IF OLD.status = 'ACTIVE' AND TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Cannot delete active budget revision %', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_budget_revisions_immutable ON gigalibs_finance.budget_revisions;
CREATE TRIGGER trg_budget_revisions_immutable
    BEFORE UPDATE OR DELETE ON gigalibs_finance.budget_revisions
    FOR EACH ROW EXECUTE FUNCTION gigalibs_finance.fn_prevent_sealed_revision_mutation();

CREATE OR REPLACE FUNCTION gigalibs_finance.fn_prevent_active_revision_lines_mutation()
RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(30);
BEGIN
    SELECT status INTO v_status FROM gigalibs_finance.budget_revisions WHERE id = OLD.budget_revision_id;
    IF v_status IN ('ACTIVE', 'SUPERSEDED', 'FROZEN', 'CLOSED') THEN
        RAISE EXCEPTION 'Cannot mutate budget lines of sealed budget revision %', OLD.budget_revision_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_budget_lines_immutable ON gigalibs_finance.budget_lines;
CREATE TRIGGER trg_budget_lines_immutable
    BEFORE UPDATE OR DELETE ON gigalibs_finance.budget_lines
    FOR EACH ROW EXECUTE FUNCTION gigalibs_finance.fn_prevent_active_revision_lines_mutation();

CREATE OR REPLACE FUNCTION gigalibs_finance.fn_prevent_liquidated_commitment_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'LIQUIDATED' THEN
        RAISE EXCEPTION 'Cannot modify or delete liquidated budget commitment %', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_budget_commitments_immutable ON gigalibs_finance.budget_commitments;
CREATE TRIGGER trg_budget_commitments_immutable
    BEFORE UPDATE OR DELETE ON gigalibs_finance.budget_commitments
    FOR EACH ROW EXECUTE FUNCTION gigalibs_finance.fn_prevent_liquidated_commitment_mutation();

COMMIT;
