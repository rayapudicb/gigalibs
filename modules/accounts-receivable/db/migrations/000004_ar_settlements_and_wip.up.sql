BEGIN;

-- 1. BILLABLE SHIFTS (WIP Burndown & Two-Phase Locking)
CREATE TABLE IF NOT EXISTS gigalibs_ar.billable_shifts (
  tenant_id UUID NOT NULL,
  id UUID NOT NULL,
  source_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  resource_name TEXT NOT NULL,
  resource_role TEXT NOT NULL,
  quantity NUMERIC(20, 6) NOT NULL,
  raw_cost_minor BIGINT NOT NULL,
  markup_percent_bp INTEGER NOT NULL DEFAULT 3500,
  billed_rate_minor BIGINT NOT NULL,
  billed_total_minor BIGINT NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'PENDING',
  billing_status TEXT NOT NULL DEFAULT 'UNBILLED',
  invoiced_in_header_number TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT billable_shifts_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT billable_shifts_quantity_check CHECK (quantity > 0),
  CONSTRAINT billable_shifts_amounts_check CHECK (raw_cost_minor >= 0 AND billed_rate_minor >= 0 AND billed_total_minor >= 0),
  CONSTRAINT billable_shifts_markup_check CHECK (markup_percent_bp >= 0),
  CONSTRAINT billable_shifts_approval_check CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT billable_shifts_billing_check CHECK (billing_status IN ('UNBILLED', 'INVOICED'))
);

CREATE INDEX IF NOT EXISTS billable_shifts_project_idx
  ON gigalibs_ar.billable_shifts (tenant_id, project_id, approval_status, billing_status);
CREATE INDEX IF NOT EXISTS billable_shifts_source_idx
  ON gigalibs_ar.billable_shifts (tenant_id, source_id);

-- 2. PAYMENT RECORDS (Settlement & Reconciliation)
CREATE TABLE IF NOT EXISTS gigalibs_ar.payment_records (
  tenant_id UUID NOT NULL,
  id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  amount_minor BIGINT NOT NULL,
  currency CHARACTER(3) NOT NULL,
  payment_method TEXT NOT NULL,
  payment_reference TEXT,
  notes TEXT,
  paid_at TIMESTAMPTZ NOT NULL,
  recorded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT payment_records_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT payment_records_invoice_fk FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES gigalibs_ar.invoices (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT payment_records_amount_check CHECK (amount_minor > 0),
  CONSTRAINT payment_records_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT payment_records_method_check CHECK (payment_method IN ('WIRE', 'ACH', 'CHECK', 'CARD', 'CREDIT_NOTE', 'MANUAL'))
);

CREATE INDEX IF NOT EXISTS payment_records_invoice_idx
  ON gigalibs_ar.payment_records (tenant_id, invoice_id, paid_at DESC);

-- 3. VOID RECORDS & CANCELLATIONS (Preserving Immutable Historical Invoice)
CREATE TABLE IF NOT EXISTS gigalibs_ar.void_records (
  tenant_id UUID NOT NULL,
  id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  reason TEXT NOT NULL,
  voided_by TEXT NOT NULL,
  voided_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT void_records_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT void_records_invoice_fk FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES gigalibs_ar.invoices (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT void_records_invoice_unique UNIQUE (tenant_id, invoice_id),
  CONSTRAINT void_records_reason_check CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500)
);

-- 4. RATE CATALOG ITEMS
CREATE TABLE IF NOT EXISTS gigalibs_ar.rate_catalog_items (
  tenant_id UUID NOT NULL,
  id UUID NOT NULL,
  billing_entity_id UUID,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  unit_price_minor BIGINT NOT NULL,
  currency CHARACTER(3) NOT NULL DEFAULT 'USD',
  unit_metric TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT rate_catalog_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT rate_catalog_sku_unique UNIQUE (tenant_id, sku),
  CONSTRAINT rate_catalog_sku_check CHECK (sku ~ '^[A-Z0-9_-]{1,50}$'),
  CONSTRAINT rate_catalog_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  CONSTRAINT rate_catalog_price_check CHECK (unit_price_minor >= 0),
  CONSTRAINT rate_catalog_category_check CHECK (category IN ('CREW_LABOR', 'EQUIPMENT_HARDWARE', 'CLOUD_INFRA', 'SOFTWARE_LICENSE'))
);

CREATE INDEX IF NOT EXISTS rate_catalog_category_idx
  ON gigalibs_ar.rate_catalog_items (tenant_id, category, is_active);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE gigalibs_ar.billable_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.billable_shifts FORCE ROW LEVEL SECURITY;
CREATE POLICY billable_shifts_tenant_policy ON gigalibs_ar.billable_shifts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gigalibs_ar.payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.payment_records FORCE ROW LEVEL SECURITY;
CREATE POLICY payment_records_tenant_policy ON gigalibs_ar.payment_records
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gigalibs_ar.void_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.void_records FORCE ROW LEVEL SECURITY;
CREATE POLICY void_records_tenant_policy ON gigalibs_ar.void_records
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gigalibs_ar.rate_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.rate_catalog_items FORCE ROW LEVEL SECURITY;
CREATE POLICY rate_catalog_items_tenant_policy ON gigalibs_ar.rate_catalog_items
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- 6. GRANT RUNTIME PERMISSIONS
GRANT SELECT, INSERT, UPDATE ON TABLE
  gigalibs_ar.billable_shifts,
  gigalibs_ar.rate_catalog_items
TO gigalibs_ar_api_runtime;

GRANT SELECT, INSERT ON TABLE
  gigalibs_ar.payment_records,
  gigalibs_ar.void_records
TO gigalibs_ar_api_runtime;

-- 7. SCHEMA VERSION
INSERT INTO gigalibs_ar.schema_migrations (version, name)
VALUES (4, '000004_ar_settlements_and_wip')
ON CONFLICT (version) DO NOTHING;

COMMIT;
