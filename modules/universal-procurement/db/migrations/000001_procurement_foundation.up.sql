-- ==============================================================================
-- Schema: gigalibs_procurement
-- Migration: 000001_procurement_foundation.up.sql
-- Description: Enterprise Architecture Phase 6: Universal Procurement,
--              Vendor Operations, Requisitions, Purchase Orders, 3-Way Matching,
--              Price Variance Holds, Vendor Bills, and Debit Memos.
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS gigalibs_procurement;

CREATE TABLE IF NOT EXISTS gigalibs_procurement.schema_migrations (
  version bigint PRIMARY KEY CHECK (version > 0),
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 200),
  applied_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

-- ─── Helper Functions ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION gigalibs_procurement.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION gigalibs_procurement.prevent_match_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Match records in gigalibs_procurement are immutable and cannot be deleted.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'VARIANCE_HOLD' AND NEW.status = 'FORCE_MATCHED'
       AND OLD.matched_quantity = NEW.matched_quantity
       AND OLD.po_unit_price_minor = NEW.po_unit_price_minor
       AND OLD.billed_unit_price_minor = NEW.billed_unit_price_minor THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Match quantities and prices in gigalibs_procurement are immutable and cannot be mutated.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 1. Organization Unit Replicas (Phase 1 Sync) ──────────────────────────────

CREATE TABLE IF NOT EXISTS gigalibs_procurement.org_replica_versions (
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

CREATE TABLE IF NOT EXISTS gigalibs_procurement.org_replica_units (
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
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_procurement.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE,
  CHECK (parent_unit_id IS NULL OR parent_unit_id <> unit_id)
);

CREATE TABLE IF NOT EXISTS gigalibs_procurement.org_replica_closure (
  tenant_id VARCHAR(64) NOT NULL,
  version_id VARCHAR(64) NOT NULL,
  ancestor_unit_id VARCHAR(64) NOT NULL,
  descendant_unit_id VARCHAR(64) NOT NULL,
  depth SMALLINT NOT NULL CHECK (depth BETWEEN 0 AND 16),
  PRIMARY KEY (tenant_id, version_id, ancestor_unit_id, descendant_unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_procurement.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS procurement_org_descendant ON gigalibs_procurement.org_replica_closure (tenant_id, version_id, descendant_unit_id);


-- ─── 2. Audit & Revocation Tables ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gigalibs_procurement.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gigalibs_procurement.auth_revocation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  subject VARCHAR(128) NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. Approval Policies (Delegation of Authority) ───────────────────────────

CREATE TABLE IF NOT EXISTS gigalibs_procurement.procurement_approval_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  policy_name VARCHAR(100) NOT NULL,
  org_unit_id VARCHAR(64),
  max_amount_minor NUMERIC(18, 0) NOT NULL,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'USD',
  required_role VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_approval_policies_updated_at
BEFORE UPDATE ON gigalibs_procurement.procurement_approval_policies
FOR EACH ROW EXECUTE FUNCTION gigalibs_procurement.set_updated_at();

-- ─── 4. Requisitions & Requisition Lines ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS gigalibs_procurement.procurement_requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  requisition_number VARCHAR(64) NOT NULL,
  org_unit_id VARCHAR(64) NOT NULL,
  requested_by VARCHAR(64) NOT NULL,
  description VARCHAR(1000),
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  total_estimated_minor NUMERIC(18, 0) NOT NULL DEFAULT 0,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'USD',
  approval_policy_id UUID REFERENCES gigalibs_procurement.procurement_approval_policies(id),
  approved_by VARCHAR(64),
  approved_at TIMESTAMPTZ,
  rejection_reason VARCHAR(500),
  custom_extensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(64),
  updated_by VARCHAR(64),
  CONSTRAINT uq_requisition_number UNIQUE (tenant_id, requisition_number)
);

CREATE TRIGGER trg_requisitions_updated_at
BEFORE UPDATE ON gigalibs_procurement.procurement_requisitions
FOR EACH ROW EXECUTE FUNCTION gigalibs_procurement.set_updated_at();

CREATE TABLE IF NOT EXISTS gigalibs_procurement.procurement_requisition_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  requisition_id UUID NOT NULL REFERENCES gigalibs_procurement.procurement_requisitions(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  product_id UUID NOT NULL,
  product_code VARCHAR(64) NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  quantity NUMERIC(18, 6) NOT NULL,
  uom_id UUID NOT NULL,
  estimated_unit_price_minor NUMERIC(18, 0) NOT NULL,
  estimated_total_minor NUMERIC(18, 0) NOT NULL,
  required_date TIMESTAMPTZ,
  cost_center_id VARCHAR(64),
  project_id VARCHAR(64),
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  custom_extensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_requisition_line UNIQUE (tenant_id, requisition_id, line_number)
);

CREATE TRIGGER trg_requisition_lines_updated_at
BEFORE UPDATE ON gigalibs_procurement.procurement_requisition_lines
FOR EACH ROW EXECUTE FUNCTION gigalibs_procurement.set_updated_at();

-- ─── 5. Purchase Orders & Purchase Order Lines ────────────────────────────────

CREATE TABLE IF NOT EXISTS gigalibs_procurement.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  order_number VARCHAR(64) NOT NULL,
  org_unit_id VARCHAR(64) NOT NULL,
  vendor_party_id UUID NOT NULL,
  vendor_name VARCHAR(200) NOT NULL,
  order_type VARCHAR(30) NOT NULL DEFAULT 'STANDARD',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  currency_code VARCHAR(3) NOT NULL DEFAULT 'USD',
  subtotal_minor NUMERIC(18, 0) NOT NULL DEFAULT 0,
  tax_total_minor NUMERIC(18, 0) NOT NULL DEFAULT 0,
  total_amount_minor NUMERIC(18, 0) NOT NULL DEFAULT 0,
  payment_term_days INT NOT NULL DEFAULT 30,
  incoterm VARCHAR(10),
  requisition_id UUID REFERENCES gigalibs_procurement.procurement_requisitions(id),
  destination_warehouse_id UUID NOT NULL,
  revision_number INT NOT NULL DEFAULT 0,
  issued_at TIMESTAMPTZ,
  issued_by VARCHAR(64),
  acknowledged_at TIMESTAMPTZ,
  custom_extensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(64),
  updated_by VARCHAR(64),
  CONSTRAINT uq_order_number UNIQUE (tenant_id, order_number)
);

CREATE TRIGGER trg_purchase_orders_updated_at
BEFORE UPDATE ON gigalibs_procurement.purchase_orders
FOR EACH ROW EXECUTE FUNCTION gigalibs_procurement.set_updated_at();

CREATE TABLE IF NOT EXISTS gigalibs_procurement.purchase_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  purchase_order_id UUID NOT NULL REFERENCES gigalibs_procurement.purchase_orders(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  requisition_line_id UUID REFERENCES gigalibs_procurement.procurement_requisition_lines(id),
  product_id UUID NOT NULL,
  product_code VARCHAR(64) NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  ordered_quantity NUMERIC(18, 6) NOT NULL,
  uom_id UUID NOT NULL,
  unit_price_minor NUMERIC(18, 0) NOT NULL,
  tax_rate_basis_points INT NOT NULL DEFAULT 0,
  line_tax_minor NUMERIC(18, 0) NOT NULL DEFAULT 0,
  line_subtotal_minor NUMERIC(18, 0) NOT NULL,
  line_total_minor NUMERIC(18, 0) NOT NULL,
  received_quantity NUMERIC(18, 6) NOT NULL DEFAULT 0,
  invoiced_quantity NUMERIC(18, 6) NOT NULL DEFAULT 0,
  destination_warehouse_id UUID NOT NULL,
  destination_location_id UUID,
  promised_date TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  custom_extensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_order_line UNIQUE (tenant_id, purchase_order_id, line_number)
);

CREATE TRIGGER trg_purchase_order_lines_updated_at
BEFORE UPDATE ON gigalibs_procurement.purchase_order_lines
FOR EACH ROW EXECUTE FUNCTION gigalibs_procurement.set_updated_at();

-- ─── 6. 3-Way Match Records ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gigalibs_procurement.match_po_receipt_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  purchase_order_id UUID NOT NULL REFERENCES gigalibs_procurement.purchase_orders(id),
  purchase_order_line_id UUID NOT NULL REFERENCES gigalibs_procurement.purchase_order_lines(id),
  receipt_id UUID NOT NULL,
  receipt_line_id UUID NOT NULL,
  matched_quantity NUMERIC(18, 6) NOT NULL,
  uom_id UUID NOT NULL,
  matched_by VARCHAR(64) NOT NULL,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(30) NOT NULL DEFAULT 'FULLY_MATCHED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_match_po_receipt UNIQUE (tenant_id, purchase_order_line_id, receipt_line_id)
);

CREATE TRIGGER trg_match_po_receipt_immutable
BEFORE UPDATE OR DELETE ON gigalibs_procurement.match_po_receipt_records
FOR EACH ROW EXECUTE FUNCTION gigalibs_procurement.prevent_match_mutation();

-- ─── 7. Vendor Bills & Lines ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gigalibs_procurement.vendor_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  vendor_party_id UUID NOT NULL,
  vendor_invoice_number VARCHAR(100) NOT NULL,
  invoice_date TIMESTAMPTZ NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'USD',
  subtotal_minor NUMERIC(18, 0) NOT NULL,
  tax_total_minor NUMERIC(18, 0) NOT NULL DEFAULT 0,
  total_amount_minor NUMERIC(18, 0) NOT NULL,
  purchase_order_id UUID REFERENCES gigalibs_procurement.purchase_orders(id),
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  approved_by VARCHAR(64),
  approved_at TIMESTAMPTZ,
  custom_extensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(64),
  updated_by VARCHAR(64),
  CONSTRAINT uq_vendor_bill_number UNIQUE (tenant_id, vendor_party_id, vendor_invoice_number)
);

CREATE TRIGGER trg_vendor_bills_updated_at
BEFORE UPDATE ON gigalibs_procurement.vendor_bills
FOR EACH ROW EXECUTE FUNCTION gigalibs_procurement.set_updated_at();

CREATE TABLE IF NOT EXISTS gigalibs_procurement.vendor_bill_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  vendor_bill_id UUID NOT NULL REFERENCES gigalibs_procurement.vendor_bills(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  purchase_order_id UUID REFERENCES gigalibs_procurement.purchase_orders(id),
  purchase_order_line_id UUID REFERENCES gigalibs_procurement.purchase_order_lines(id),
  product_id UUID,
  description VARCHAR(500) NOT NULL,
  billed_quantity NUMERIC(18, 6) NOT NULL,
  uom_id UUID NOT NULL,
  unit_price_minor NUMERIC(18, 0) NOT NULL,
  line_subtotal_minor NUMERIC(18, 0) NOT NULL,
  line_tax_minor NUMERIC(18, 0) NOT NULL DEFAULT 0,
  line_total_minor NUMERIC(18, 0) NOT NULL,
  matched_receipt_line_id UUID,
  custom_extensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vendor_bill_line UNIQUE (tenant_id, vendor_bill_id, line_number)
);

CREATE TRIGGER trg_vendor_bill_lines_updated_at
BEFORE UPDATE ON gigalibs_procurement.vendor_bill_lines
FOR EACH ROW EXECUTE FUNCTION gigalibs_procurement.set_updated_at();

-- ─── 8. Match PO Invoice Records ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gigalibs_procurement.match_po_invoice_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  purchase_order_id UUID NOT NULL REFERENCES gigalibs_procurement.purchase_orders(id),
  purchase_order_line_id UUID NOT NULL REFERENCES gigalibs_procurement.purchase_order_lines(id),
  vendor_bill_id UUID NOT NULL REFERENCES gigalibs_procurement.vendor_bills(id),
  vendor_bill_line_id UUID NOT NULL REFERENCES gigalibs_procurement.vendor_bill_lines(id),
  receipt_line_id UUID,
  matched_quantity NUMERIC(18, 6) NOT NULL,
  po_unit_price_minor NUMERIC(18, 0) NOT NULL,
  billed_unit_price_minor NUMERIC(18, 0) NOT NULL,
  price_variance_minor NUMERIC(18, 0) NOT NULL,
  price_variance_percent NUMERIC(8, 4) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'FULLY_MATCHED',
  tolerance_exceeded BOOLEAN NOT NULL DEFAULT false,
  override_authorized_by VARCHAR(64),
  override_reason VARCHAR(500),
  matched_by VARCHAR(64) NOT NULL,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_match_po_invoice UNIQUE (tenant_id, purchase_order_line_id, vendor_bill_line_id)
);

CREATE TRIGGER trg_match_po_invoice_immutable
BEFORE UPDATE OR DELETE ON gigalibs_procurement.match_po_invoice_records
FOR EACH ROW EXECUTE FUNCTION gigalibs_procurement.prevent_match_mutation();

-- ─── 9. Debit Memos & Lines ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gigalibs_procurement.debit_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  debit_memo_number VARCHAR(64) NOT NULL,
  vendor_party_id UUID NOT NULL,
  vendor_bill_id UUID REFERENCES gigalibs_procurement.vendor_bills(id),
  purchase_order_id UUID REFERENCES gigalibs_procurement.purchase_orders(id),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'USD',
  total_amount_minor NUMERIC(18, 0) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  reason VARCHAR(500) NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issued_by VARCHAR(64) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_debit_memo_number UNIQUE (tenant_id, debit_memo_number)
);

CREATE TRIGGER trg_debit_memos_updated_at
BEFORE UPDATE ON gigalibs_procurement.debit_memos
FOR EACH ROW EXECUTE FUNCTION gigalibs_procurement.set_updated_at();

CREATE TABLE IF NOT EXISTS gigalibs_procurement.debit_memo_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  debit_memo_id UUID NOT NULL REFERENCES gigalibs_procurement.debit_memos(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  product_id UUID,
  description VARCHAR(500) NOT NULL,
  quantity NUMERIC(18, 6) NOT NULL,
  unit_price_minor NUMERIC(18, 0) NOT NULL,
  line_total_minor NUMERIC(18, 0) NOT NULL,
  reason VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_debit_memo_line UNIQUE (tenant_id, debit_memo_id, line_number)
);

-- ─── 10. Enable and Force Row-Level Security ──────────────────────────────────

DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'org_replica_versions','org_replica_units','org_replica_closure',
    'audit_events','auth_revocation_events','procurement_approval_policies',
    'procurement_requisitions','procurement_requisition_lines',
    'purchase_orders','purchase_order_lines',
    'match_po_receipt_records','match_po_invoice_records',
    'vendor_bills','vendor_bill_lines',
    'debit_memos','debit_memo_lines'
  ] LOOP
    EXECUTE format('ALTER TABLE gigalibs_procurement.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_procurement.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_procurement.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      relation || '_tenant_isolation', relation
    );
  END LOOP;
END $$;

INSERT INTO gigalibs_procurement.schema_migrations (version, name)
VALUES (1, '000001_procurement_foundation')
ON CONFLICT (version) DO NOTHING;

