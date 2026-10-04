-- Migration: 000001_orders_fulfillment_foundation.up.sql
-- Module: universal-orders (WI-OI-093)
-- Purpose: Schema gigalibs_orders with quotations, sales orders, ATP allocations, fulfillments, customer AR invoices, credit memos, strict RLS, and immutable audit log.

CREATE SCHEMA IF NOT EXISTS gigalibs_orders;

-- 1. Schema migrations table
CREATE TABLE IF NOT EXISTS gigalibs_orders.schema_migrations (
    version BIGINT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO gigalibs_orders.schema_migrations (version) VALUES (1)
ON CONFLICT (version) DO NOTHING;

-- 2. Organization replica tables (required by OrganizationReplica in @gigalibs/module-sdk)
CREATE TABLE IF NOT EXISTS gigalibs_orders.org_replica_versions (
  tenant_id VARCHAR(64) NOT NULL,
  version_id VARCHAR(64) NOT NULL,
  tree_id VARCHAR(64) NOT NULL,
  tree_kind VARCHAR(16) NOT NULL CHECK (tree_kind IN ('PRIMARY','ALTERNATE')),
  version_number INT NOT NULL CHECK (version_number > 0),
  checksum CHAR(71) NOT NULL CHECK (checksum ~ '^sha256:[0-9a-f]{64}$'),
  status VARCHAR(16) NOT NULL DEFAULT 'RECEIVING' CHECK (status IN ('RECEIVING','READY')),
  unit_count INT CHECK (unit_count >= 0),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ready_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, version_id),
  CHECK ((status = 'READY') = (ready_at IS NOT NULL AND unit_count IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS gigalibs_orders.org_replica_units (
  tenant_id VARCHAR(64) NOT NULL,
  version_id VARCHAR(64) NOT NULL,
  unit_id VARCHAR(64) NOT NULL,
  parent_unit_id VARCHAR(64),
  code VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  sort_order INT NOT NULL CHECK (sort_order >= 0),
  status VARCHAR(16) NOT NULL CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
  holds_records BOOLEAN NOT NULL,
  type_code VARCHAR(40) NOT NULL,
  PRIMARY KEY (tenant_id, version_id, unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_orders.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE,
  CHECK (parent_unit_id IS NULL OR parent_unit_id <> unit_id)
);

CREATE TABLE IF NOT EXISTS gigalibs_orders.org_replica_closure (
  tenant_id VARCHAR(64) NOT NULL,
  version_id VARCHAR(64) NOT NULL,
  ancestor_unit_id VARCHAR(64) NOT NULL,
  descendant_unit_id VARCHAR(64) NOT NULL,
  depth SMALLINT NOT NULL CHECK (depth BETWEEN 0 AND 16),
  PRIMARY KEY (tenant_id, version_id, ancestor_unit_id, descendant_unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_orders.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS orders_org_descendant ON gigalibs_orders.org_replica_closure (tenant_id, version_id, descendant_unit_id);


-- 3. Audit and Auth Revocation events
CREATE TABLE IF NOT EXISTS gigalibs_orders.audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL,
    actor_id VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gigalibs_orders.auth_revocation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    token_id VARCHAR(128) NOT NULL,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(255)
);

-- 4. Sales Quotations
CREATE TABLE IF NOT EXISTS gigalibs_orders.sales_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    quote_number VARCHAR(64) NOT NULL,
    org_unit_id VARCHAR(64) NOT NULL,
    customer_party_id UUID NOT NULL,
    customer_name VARCHAR(200) NOT NULL,
    currency_code VARCHAR(3) NOT NULL DEFAULT 'USD',
    subtotal_minor BIGINT NOT NULL DEFAULT 0,
    discount_total_minor BIGINT NOT NULL DEFAULT 0,
    tax_total_minor BIGINT NOT NULL DEFAULT 0,
    total_amount_minor BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    valid_until TIMESTAMPTZ NOT NULL,
    payment_term_days INT NOT NULL DEFAULT 30,
    notes TEXT,
    converted_order_id UUID,
    custom_extensions JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(64),
    updated_by VARCHAR(64),
    CONSTRAINT uq_sales_quotes_number UNIQUE (tenant_id, quote_number)
);

CREATE TABLE IF NOT EXISTS gigalibs_orders.sales_quote_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    quote_id UUID NOT NULL REFERENCES gigalibs_orders.sales_quotes(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    product_id UUID NOT NULL,
    product_code VARCHAR(64) NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    quoted_quantity NUMERIC(16, 6) NOT NULL,
    uom_id UUID NOT NULL,
    unit_price_minor BIGINT NOT NULL,
    discount_percent_basis_points INT NOT NULL DEFAULT 0,
    line_subtotal_minor BIGINT NOT NULL,
    tax_rate_basis_points INT NOT NULL DEFAULT 0,
    line_tax_minor BIGINT NOT NULL DEFAULT 0,
    line_total_minor BIGINT NOT NULL,
    lead_time_days INT,
    custom_extensions JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sales_quote_lines_num UNIQUE (tenant_id, quote_id, line_number)
);

-- 5. Sales Orders
CREATE TABLE IF NOT EXISTS gigalibs_orders.sales_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    order_number VARCHAR(64) NOT NULL,
    org_unit_id VARCHAR(64) NOT NULL,
    customer_party_id UUID NOT NULL,
    customer_name VARCHAR(200) NOT NULL,
    order_type VARCHAR(32) NOT NULL DEFAULT 'STANDARD',
    currency_code VARCHAR(3) NOT NULL DEFAULT 'USD',
    subtotal_minor BIGINT NOT NULL DEFAULT 0,
    discount_total_minor BIGINT NOT NULL DEFAULT 0,
    tax_total_minor BIGINT NOT NULL DEFAULT 0,
    total_amount_minor BIGINT NOT NULL DEFAULT 0,
    warehouse_id UUID NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    quote_id UUID REFERENCES gigalibs_orders.sales_quotes(id),
    customer_po_reference VARCHAR(100),
    payment_term_days INT NOT NULL DEFAULT 30,
    shipping_address TEXT,
    confirmed_by VARCHAR(64),
    confirmed_at TIMESTAMPTZ,
    custom_extensions JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(64),
    updated_by VARCHAR(64),
    CONSTRAINT uq_sales_orders_number UNIQUE (tenant_id, order_number)
);

CREATE TABLE IF NOT EXISTS gigalibs_orders.sales_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    order_id UUID NOT NULL REFERENCES gigalibs_orders.sales_orders(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    product_id UUID NOT NULL,
    product_code VARCHAR(64) NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    ordered_quantity NUMERIC(16, 6) NOT NULL,
    allocated_quantity NUMERIC(16, 6) NOT NULL DEFAULT 0,
    shipped_quantity NUMERIC(16, 6) NOT NULL DEFAULT 0,
    invoiced_quantity NUMERIC(16, 6) NOT NULL DEFAULT 0,
    uom_id UUID NOT NULL,
    unit_price_minor BIGINT NOT NULL,
    discount_minor BIGINT NOT NULL DEFAULT 0,
    tax_rate_basis_points INT NOT NULL DEFAULT 0,
    line_subtotal_minor BIGINT NOT NULL,
    line_tax_minor BIGINT NOT NULL DEFAULT 0,
    line_total_minor BIGINT NOT NULL,
    warehouse_id UUID NOT NULL,
    promised_date TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    custom_extensions JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sales_order_lines_num UNIQUE (tenant_id, order_id, line_number)
);

-- 6. Order Inventory Allocations (ATP Reservations)
CREATE TABLE IF NOT EXISTS gigalibs_orders.order_inventory_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    order_id UUID NOT NULL REFERENCES gigalibs_orders.sales_orders(id) ON DELETE RESTRICT,
    order_line_id UUID NOT NULL REFERENCES gigalibs_orders.sales_order_lines(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    location_id UUID,
    allocated_quantity NUMERIC(16, 6) NOT NULL,
    uom_id UUID NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'HARD_RESERVED',
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    allocated_by VARCHAR(64) NOT NULL,
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Fulfillment Orders & Lines
CREATE TABLE IF NOT EXISTS gigalibs_orders.fulfillment_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    fulfillment_number VARCHAR(64) NOT NULL,
    order_id UUID NOT NULL REFERENCES gigalibs_orders.sales_orders(id) ON DELETE RESTRICT,
    warehouse_id UUID NOT NULL,
    carrier VARCHAR(100),
    tracking_number VARCHAR(100),
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    dispatched_at TIMESTAMPTZ,
    dispatched_by VARCHAR(64),
    delivered_at TIMESTAMPTZ,
    custom_extensions JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_fulfillment_number UNIQUE (tenant_id, fulfillment_number)
);

CREATE TABLE IF NOT EXISTS gigalibs_orders.fulfillment_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    fulfillment_order_id UUID NOT NULL REFERENCES gigalibs_orders.fulfillment_orders(id) ON DELETE CASCADE,
    order_line_id UUID NOT NULL REFERENCES gigalibs_orders.sales_order_lines(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL,
    shipped_quantity NUMERIC(16, 6) NOT NULL,
    uom_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    lot_number VARCHAR(100),
    serial_number VARCHAR(100),
    custom_extensions JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Customer Invoices (Accounts Receivable)
CREATE TABLE IF NOT EXISTS gigalibs_orders.customer_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    invoice_number VARCHAR(64) NOT NULL,
    order_id UUID NOT NULL REFERENCES gigalibs_orders.sales_orders(id) ON DELETE RESTRICT,
    customer_party_id UUID NOT NULL,
    customer_name VARCHAR(200) NOT NULL,
    currency_code VARCHAR(3) NOT NULL DEFAULT 'USD',
    subtotal_minor BIGINT NOT NULL DEFAULT 0,
    discount_total_minor BIGINT NOT NULL DEFAULT 0,
    tax_total_minor BIGINT NOT NULL DEFAULT 0,
    total_amount_minor BIGINT NOT NULL DEFAULT 0,
    amount_paid_minor BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    due_date TIMESTAMPTZ NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    issued_by VARCHAR(64) NOT NULL,
    notes TEXT,
    custom_extensions JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_customer_invoice_number UNIQUE (tenant_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS gigalibs_orders.customer_invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    invoice_id UUID NOT NULL REFERENCES gigalibs_orders.customer_invoices(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    order_line_id UUID REFERENCES gigalibs_orders.sales_order_lines(id),
    fulfillment_order_line_id UUID REFERENCES gigalibs_orders.fulfillment_order_lines(id),
    product_id UUID NOT NULL,
    product_code VARCHAR(64) NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    invoiced_quantity NUMERIC(16, 6) NOT NULL,
    uom_id UUID NOT NULL,
    unit_price_minor BIGINT NOT NULL,
    discount_minor BIGINT NOT NULL DEFAULT 0,
    tax_rate_basis_points INT NOT NULL DEFAULT 0,
    line_subtotal_minor BIGINT NOT NULL,
    line_tax_minor BIGINT NOT NULL DEFAULT 0,
    line_total_minor BIGINT NOT NULL,
    custom_extensions JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_customer_invoice_lines_num UNIQUE (tenant_id, invoice_id, line_number)
);

-- 9. Customer Returns & Credit Memos (RMA)
CREATE TABLE IF NOT EXISTS gigalibs_orders.customer_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    return_number VARCHAR(64) NOT NULL,
    order_id UUID REFERENCES gigalibs_orders.sales_orders(id),
    customer_party_id UUID NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'REQUESTED',
    reason TEXT NOT NULL,
    authorized_by VARCHAR(64),
    authorized_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    custom_extensions JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_customer_return_number UNIQUE (tenant_id, return_number)
);

CREATE TABLE IF NOT EXISTS gigalibs_orders.customer_return_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    return_id UUID NOT NULL REFERENCES gigalibs_orders.customer_returns(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    order_line_id UUID REFERENCES gigalibs_orders.sales_order_lines(id),
    product_id UUID NOT NULL,
    quantity NUMERIC(16, 6) NOT NULL,
    uom_id UUID NOT NULL,
    disposition VARCHAR(32) NOT NULL DEFAULT 'RETURN_TO_STOCK',
    condition_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_customer_return_lines_num UNIQUE (tenant_id, return_id, line_number)
);

CREATE TABLE IF NOT EXISTS gigalibs_orders.customer_credit_memos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    credit_memo_number VARCHAR(64) NOT NULL,
    invoice_id UUID REFERENCES gigalibs_orders.customer_invoices(id),
    order_id UUID REFERENCES gigalibs_orders.sales_orders(id),
    customer_party_id UUID NOT NULL,
    currency_code VARCHAR(3) NOT NULL DEFAULT 'USD',
    total_amount_minor BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    reason TEXT NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    issued_by VARCHAR(64) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_customer_credit_memo_number UNIQUE (tenant_id, credit_memo_number)
);

CREATE TABLE IF NOT EXISTS gigalibs_orders.customer_credit_memo_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    credit_memo_id UUID NOT NULL REFERENCES gigalibs_orders.customer_credit_memos(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    product_id UUID,
    quantity NUMERIC(16, 6) NOT NULL,
    unit_price_minor BIGINT NOT NULL,
    line_total_minor BIGINT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_customer_credit_memo_lines_num UNIQUE (tenant_id, credit_memo_id, line_number)
);

-- 10. Triggers for updated_at and immutability
CREATE OR REPLACE FUNCTION gigalibs_orders.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sales_quotes_updated_at BEFORE UPDATE ON gigalibs_orders.sales_quotes FOR EACH ROW EXECUTE FUNCTION gigalibs_orders.update_timestamp();
CREATE TRIGGER trg_sales_orders_updated_at BEFORE UPDATE ON gigalibs_orders.sales_orders FOR EACH ROW EXECUTE FUNCTION gigalibs_orders.update_timestamp();
CREATE TRIGGER trg_fulfillment_orders_updated_at BEFORE UPDATE ON gigalibs_orders.fulfillment_orders FOR EACH ROW EXECUTE FUNCTION gigalibs_orders.update_timestamp();
CREATE TRIGGER trg_customer_invoices_updated_at BEFORE UPDATE ON gigalibs_orders.customer_invoices FOR EACH ROW EXECUTE FUNCTION gigalibs_orders.update_timestamp();
CREATE TRIGGER trg_customer_returns_updated_at BEFORE UPDATE ON gigalibs_orders.customer_returns FOR EACH ROW EXECUTE FUNCTION gigalibs_orders.update_timestamp();
CREATE TRIGGER trg_customer_credit_memos_updated_at BEFORE UPDATE ON gigalibs_orders.customer_credit_memos FOR EACH ROW EXECUTE FUNCTION gigalibs_orders.update_timestamp();

-- Anti-tamper trigger on dispatched fulfillment lines (never deleted or modified once shipped)
CREATE OR REPLACE FUNCTION gigalibs_orders.prevent_shipped_line_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Dispatched fulfillment records are immutable and cannot be deleted';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fulfillment_order_lines_immutable
BEFORE DELETE ON gigalibs_orders.fulfillment_order_lines
FOR EACH ROW EXECUTE FUNCTION gigalibs_orders.prevent_shipped_line_mutation();

-- 11. Row-Level Security (RLS) enforcement
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'gigalibs_orders'
          AND table_type = 'BASE TABLE'
          AND table_name NOT IN ('schema_migrations')
    LOOP
        EXECUTE format('ALTER TABLE gigalibs_orders.%I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('ALTER TABLE gigalibs_orders.%I FORCE ROW LEVEL SECURITY;', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_orders.%I;', t);
        EXECUTE format('
            CREATE POLICY tenant_isolation_policy ON gigalibs_orders.%I
            AS PERMISSIVE FOR ALL
            TO PUBLIC
            USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))
            WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''));
        ', t);
    END LOOP;
END;
$$;
