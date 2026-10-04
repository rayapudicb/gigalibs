-- Migration: 000005_finance_inventory_costing.up.sql
-- Module: financial-operations (WI-OI-116)
-- Purpose: Inventory costing profiles (FIFO, Moving Average, Standard Cost),
--          inbound receipt cost layers, cost layer consumption tracking,
--          landed cost vouchers and line apportionment, inventory revaluations,
--          hardware RLS, and immutability triggers.

BEGIN;

-- 1. Record migration version
INSERT INTO gigalibs_finance.schema_migrations (version) VALUES (5)
ON CONFLICT (version) DO NOTHING;

-- 2. Cost Profiles
CREATE TABLE IF NOT EXISTS gigalibs_finance.cost_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    costing_method VARCHAR(30) NOT NULL CHECK (costing_method IN ('STANDARD', 'FIFO', 'AVERAGE')),
    inventory_gl_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    grni_gl_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    cogs_gl_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    landed_cost_clearing_gl_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    purchase_price_variance_gl_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    scrap_gl_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    valuation_loss_gl_account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id),
    standard_unit_cost_scaled BIGINT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(64),
    updated_by VARCHAR(64),
    CONSTRAINT uq_cost_profiles_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_cost_profiles_tenant_code ON gigalibs_finance.cost_profiles(tenant_id, code);

-- 3. Inventory Cost Layers (Inbound Receipts & Running Balance)
CREATE TABLE IF NOT EXISTS gigalibs_finance.inventory_cost_layers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    cost_profile_id UUID NOT NULL REFERENCES gigalibs_finance.cost_profiles(id),
    product_id UUID NOT NULL,
    warehouse_id VARCHAR(64) NOT NULL,
    receipt_ref VARCHAR(100) NOT NULL,
    receipt_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    initial_quantity NUMERIC(18,6) NOT NULL CHECK (initial_quantity > 0),
    remaining_quantity NUMERIC(18,6) NOT NULL CHECK (remaining_quantity >= 0),
    unit_cost_scaled BIGINT NOT NULL CHECK (unit_cost_scaled >= 0),
    total_initial_cost_minor BIGINT NOT NULL CHECK (total_initial_cost_minor >= 0),
    total_remaining_cost_minor BIGINT NOT NULL CHECK (total_remaining_cost_minor >= 0),
    landed_cost_added_minor BIGINT NOT NULL DEFAULT 0 CHECK (landed_cost_added_minor >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PARTIALLY_CONSUMED', 'EXHAUSTED', 'REVALUED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_layers_product_warehouse ON gigalibs_finance.inventory_cost_layers(tenant_id, product_id, warehouse_id, receipt_date);
CREATE INDEX IF NOT EXISTS idx_cost_layers_status ON gigalibs_finance.inventory_cost_layers(tenant_id, status);

-- 4. Cost Layer Consumptions (Outbound Shipments, Issues, Scrap)
CREATE TABLE IF NOT EXISTS gigalibs_finance.cost_layer_consumptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    cost_layer_id UUID NOT NULL REFERENCES gigalibs_finance.inventory_cost_layers(id),
    transaction_ref VARCHAR(100) NOT NULL,
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('PURCHASE_RECEIPT', 'CUSTOMER_SHIPMENT', 'WORK_ORDER_ISSUE', 'RETURN_INWARDS', 'RETURN_OUTWARDS', 'SCRAP_ADJUSTMENT', 'REVALUATION')),
    quantity_consumed NUMERIC(18,6) NOT NULL CHECK (quantity_consumed > 0),
    unit_cost_scaled BIGINT NOT NULL CHECK (unit_cost_scaled >= 0),
    cost_minor BIGINT NOT NULL CHECK (cost_minor >= 0),
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    gl_journal_id UUID REFERENCES gigalibs_finance.gl_journals(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consumptions_layer ON gigalibs_finance.cost_layer_consumptions(tenant_id, cost_layer_id);
CREATE INDEX IF NOT EXISTS idx_consumptions_tx ON gigalibs_finance.cost_layer_consumptions(tenant_id, transaction_ref);

-- 5. Landed Cost Vouchers
CREATE TABLE IF NOT EXISTS gigalibs_finance.landed_cost_vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    voucher_number VARCHAR(50) NOT NULL,
    description TEXT,
    allocation_basis VARCHAR(30) NOT NULL CHECK (allocation_basis IN ('VALUE', 'WEIGHT', 'VOLUME', 'QUANTITY')),
    total_landed_cost_minor BIGINT NOT NULL CHECK (total_landed_cost_minor > 0),
    currency_code VARCHAR(3) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ALLOCATED', 'POSTED', 'VOIDED')),
    gl_journal_id UUID REFERENCES gigalibs_finance.gl_journals(id),
    posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_landed_cost_voucher_number UNIQUE (tenant_id, voucher_number)
);

CREATE INDEX IF NOT EXISTS idx_landed_costs_voucher ON gigalibs_finance.landed_cost_vouchers(tenant_id, voucher_number);

-- 6. Landed Cost Allocations
CREATE TABLE IF NOT EXISTS gigalibs_finance.landed_cost_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    landed_cost_id UUID NOT NULL REFERENCES gigalibs_finance.landed_cost_vouchers(id) ON DELETE CASCADE,
    cost_layer_id UUID NOT NULL REFERENCES gigalibs_finance.inventory_cost_layers(id),
    product_id UUID NOT NULL,
    basis_weight NUMERIC(18,6) NOT NULL CHECK (basis_weight >= 0),
    apportioned_amount_minor BIGINT NOT NULL CHECK (apportioned_amount_minor >= 0),
    adjusted_unit_cost_scaled BIGINT NOT NULL CHECK (adjusted_unit_cost_scaled >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_landed_allocations_voucher ON gigalibs_finance.landed_cost_allocations(tenant_id, landed_cost_id);
CREATE INDEX IF NOT EXISTS idx_landed_allocations_layer ON gigalibs_finance.landed_cost_allocations(tenant_id, cost_layer_id);

-- 7. Inventory Revaluations (Impairment & NRV Adjustments)
CREATE TABLE IF NOT EXISTS gigalibs_finance.inventory_revaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    cost_profile_id UUID NOT NULL REFERENCES gigalibs_finance.cost_profiles(id),
    product_id UUID NOT NULL,
    warehouse_id VARCHAR(64) NOT NULL,
    revaluation_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason VARCHAR(40) NOT NULL CHECK (reason IN ('LOWER_OF_COST_OR_NRV', 'DAMAGED_OBSOLETE', 'MARKET_CORRECTION', 'PHYSICAL_COUNT_ADJUSTMENT')),
    previous_unit_cost_scaled BIGINT NOT NULL,
    new_unit_cost_scaled BIGINT NOT NULL,
    quantity NUMERIC(18,6) NOT NULL CHECK (quantity >= 0),
    carrying_value_delta_minor BIGINT NOT NULL,
    gl_journal_id UUID NOT NULL REFERENCES gigalibs_finance.gl_journals(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revaluations_product ON gigalibs_finance.inventory_revaluations(tenant_id, product_id, revaluation_date);

-- 8. Enable and Force Row-Level Security
ALTER TABLE gigalibs_finance.cost_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.cost_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.cost_profiles
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_finance.inventory_cost_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.inventory_cost_layers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.inventory_cost_layers
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_finance.cost_layer_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.cost_layer_consumptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.cost_layer_consumptions
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_finance.landed_cost_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.landed_cost_vouchers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.landed_cost_vouchers
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_finance.landed_cost_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.landed_cost_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.landed_cost_allocations
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_finance.inventory_revaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.inventory_revaluations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.inventory_revaluations
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

-- 9. Immutability Triggers
CREATE OR REPLACE FUNCTION gigalibs_finance.fn_prevent_exhausted_layer_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'EXHAUSTED' AND TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Cannot mutate exhausted inventory cost layer %', OLD.id;
    END IF;
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (SELECT 1 FROM gigalibs_finance.cost_layer_consumptions WHERE cost_layer_id = OLD.id) THEN
            RAISE EXCEPTION 'Cannot delete cost layer % with recorded consumptions', OLD.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cost_layers_immutable ON gigalibs_finance.inventory_cost_layers;
CREATE TRIGGER trg_cost_layers_immutable
    BEFORE UPDATE OR DELETE ON gigalibs_finance.inventory_cost_layers
    FOR EACH ROW EXECUTE FUNCTION gigalibs_finance.fn_prevent_exhausted_layer_mutation();

CREATE OR REPLACE FUNCTION gigalibs_finance.fn_prevent_posted_landed_cost_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'POSTED' THEN
        RAISE EXCEPTION 'Cannot mutate or delete posted landed cost voucher %', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_landed_costs_immutable ON gigalibs_finance.landed_cost_vouchers;
CREATE TRIGGER trg_landed_costs_immutable
    BEFORE UPDATE OR DELETE ON gigalibs_finance.landed_cost_vouchers
    FOR EACH ROW EXECUTE FUNCTION gigalibs_finance.fn_prevent_posted_landed_cost_mutation();

COMMIT;
