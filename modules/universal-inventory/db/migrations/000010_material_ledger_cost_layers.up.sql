-- WI-OI-124 S3–S4: append-only cost layers mirrored from ledger; per-org valuation method config.
BEGIN;

CREATE TABLE gigalibs_inventory.inventory_org_valuation_settings (
  tenant_id varchar(64) NOT NULL,
  org_unit_id varchar(64) NOT NULL,
  valuation_method varchar(20) NOT NULL DEFAULT 'MOVING_AVERAGE'
    CHECK (valuation_method IN ('STANDARD', 'MOVING_AVERAGE', 'FIFO')),
  finance_cost_profile_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(128) NOT NULL DEFAULT 'system',
  PRIMARY KEY (tenant_id, org_unit_id)
);

CREATE TABLE gigalibs_inventory.inventory_cost_layers (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  ledger_entry_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  location_id uuid NOT NULL,
  product_id uuid NOT NULL,
  uom_id uuid NOT NULL,
  lot_id uuid,
  valuation_method varchar(20) NOT NULL CHECK (valuation_method IN ('STANDARD', 'MOVING_AVERAGE', 'FIFO')),
  quantity numeric(18, 6) NOT NULL CHECK (quantity > 0),
  unit_cost_minor numeric(18, 0) NOT NULL CHECK (unit_cost_minor >= 0),
  total_cost_minor numeric(18, 0) NOT NULL CHECK (total_cost_minor >= 0),
  org_unit_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, ledger_entry_id),
  FOREIGN KEY (tenant_id, ledger_entry_id) REFERENCES gigalibs_inventory.stock_ledger_entries (tenant_id, id),
  FOREIGN KEY (tenant_id, transaction_id) REFERENCES gigalibs_inventory.stock_ledger_transactions (tenant_id, id),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES gigalibs_inventory.warehouses (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES gigalibs_inventory.locations (tenant_id, id),
  FOREIGN KEY (tenant_id, lot_id) REFERENCES gigalibs_inventory.inventory_lots (tenant_id, id)
);
CREATE INDEX inventory_cost_layers_product ON gigalibs_inventory.inventory_cost_layers (tenant_id, product_id, created_at DESC);

-- A transfer can have only one immutable counter-document, including under
-- concurrent reversal requests with different HTTP retries.
CREATE UNIQUE INDEX stock_ledger_transfer_reversal_once
  ON gigalibs_inventory.stock_ledger_transactions (tenant_id, document_reference_id)
  WHERE document_type = 'STOCK_REVERSAL';

-- A reservation owns exact balance rows. Without this link, releasing or issuing one
-- demand can consume another demand's reserved stock from a different locator/lot.
CREATE TABLE gigalibs_inventory.inventory_reservation_allocations (
  tenant_id varchar(64) NOT NULL,
  reservation_id uuid NOT NULL,
  balance_id uuid NOT NULL,
  allocated_quantity numeric(18, 6) NOT NULL CHECK (allocated_quantity > 0),
  fulfilled_quantity numeric(18, 6) NOT NULL DEFAULT 0 CHECK (fulfilled_quantity >= 0),
  released_quantity numeric(18, 6) NOT NULL DEFAULT 0 CHECK (released_quantity >= 0),
  PRIMARY KEY (tenant_id, reservation_id, balance_id),
  FOREIGN KEY (tenant_id, reservation_id) REFERENCES gigalibs_inventory.inventory_reservations (tenant_id, id),
  FOREIGN KEY (tenant_id, balance_id) REFERENCES gigalibs_inventory.stock_balances (tenant_id, id),
  CHECK (fulfilled_quantity + released_quantity <= allocated_quantity)
);
CREATE INDEX inventory_reservation_allocations_balance
  ON gigalibs_inventory.inventory_reservation_allocations (tenant_id, balance_id);

-- Bind only legacy reservations whose outstanding quantity reconciles to one
-- reserved balance row. Multiple reserved locators/lots or any mismatch remain
-- unmapped and are refused by issue/release until an operator reconciles them.
LOCK TABLE gigalibs_inventory.inventory_reservations, gigalibs_inventory.stock_balances IN SHARE ROW EXCLUSIVE MODE;
WITH active_reservations AS (
  SELECT tenant_id, warehouse_id, product_id, uom_id,
         SUM(quantity - fulfilled_quantity) AS outstanding_quantity,
         COUNT(*) AS reservation_count
    FROM gigalibs_inventory.inventory_reservations
   WHERE status = 'ACTIVE' AND quantity > fulfilled_quantity
   GROUP BY tenant_id, warehouse_id, product_id, uom_id
), single_balance AS (
  SELECT tenant_id, warehouse_id, product_id, uom_id,
         MIN(id::text)::uuid AS balance_id,
         MIN(location_id::text)::uuid AS location_id,
         MIN(reserved_quantity) AS reserved_quantity,
         COUNT(*) AS balance_count
    FROM gigalibs_inventory.stock_balances
   WHERE reserved_quantity > 0
   GROUP BY tenant_id, warehouse_id, product_id, uom_id
)
INSERT INTO gigalibs_inventory.inventory_reservation_allocations
  (tenant_id, reservation_id, balance_id, allocated_quantity)
SELECT r.tenant_id, r.id, b.balance_id, r.quantity - r.fulfilled_quantity
  FROM gigalibs_inventory.inventory_reservations r
  JOIN active_reservations a ON a.tenant_id = r.tenant_id AND a.warehouse_id = r.warehouse_id
    AND a.product_id = r.product_id AND a.uom_id = r.uom_id
  JOIN single_balance b ON b.tenant_id = a.tenant_id AND b.warehouse_id = a.warehouse_id
    AND b.product_id = a.product_id AND b.uom_id = a.uom_id
 WHERE r.status = 'ACTIVE' AND r.quantity > r.fulfilled_quantity
   AND b.balance_count = 1 AND b.reserved_quantity = a.outstanding_quantity
   AND NOT EXISTS (
     SELECT 1 FROM gigalibs_inventory.inventory_reservations other
      WHERE other.tenant_id = r.tenant_id AND other.warehouse_id = r.warehouse_id
        AND other.product_id = r.product_id AND other.uom_id = r.uom_id
        AND other.status = 'ACTIVE' AND other.quantity > other.fulfilled_quantity
        AND other.location_id IS NOT NULL AND other.location_id <> b.location_id
   );

-- A fulfillment key may issue a reservation once, even when a scanner retries
-- after losing the HTTP response. The key and issued quantity cannot be edited.
CREATE TABLE gigalibs_inventory.inventory_reservation_issues (
  tenant_id varchar(64) NOT NULL,
  fulfillment_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  order_id uuid NOT NULL,
  issue_id uuid NOT NULL,
  issued_quantity numeric(18, 6) NOT NULL CHECK (issued_quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, fulfillment_id),
  UNIQUE (tenant_id, issue_id),
  FOREIGN KEY (tenant_id, reservation_id) REFERENCES gigalibs_inventory.inventory_reservations (tenant_id, id)
);

-- Finance owns posted receipt valuation. This append-only inbox projection is
-- keyed by the source receipt line and Finance's immutable cost-layer id.
CREATE TABLE gigalibs_inventory.inventory_receipt_cost_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  receipt_id uuid NOT NULL,
  receipt_line_id uuid NOT NULL,
  finance_cost_layer_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  location_id uuid NOT NULL,
  product_id uuid NOT NULL,
  org_unit_id varchar(64),
  valuation_method varchar(20) NOT NULL CHECK (valuation_method IN ('STANDARD', 'FIFO', 'AVERAGE')),
  quantity numeric(18, 6) NOT NULL CHECK (quantity > 0),
  unit_cost_scaled numeric(30, 0) NOT NULL CHECK (unit_cost_scaled >= 0),
  total_cost_minor numeric(18, 0) NOT NULL CHECK (total_cost_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, receipt_line_id),
  UNIQUE (tenant_id, finance_cost_layer_id),
  FOREIGN KEY (tenant_id, receipt_id) REFERENCES gigalibs_inventory.receipts (tenant_id, id),
  FOREIGN KEY (tenant_id, receipt_line_id) REFERENCES gigalibs_inventory.receipt_lines (tenant_id, id),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES gigalibs_inventory.warehouses (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES gigalibs_inventory.locations (tenant_id, id)
);
CREATE INDEX inventory_receipt_cost_records_product
  ON gigalibs_inventory.inventory_receipt_cost_records (tenant_id, product_id, created_at DESC);

CREATE FUNCTION gigalibs_inventory.prevent_cost_layer_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Inventory cost layers are append-only' USING ERRCODE = '55000';
END $$;

CREATE TRIGGER inventory_cost_layers_immutable
  BEFORE UPDATE OR DELETE ON gigalibs_inventory.inventory_cost_layers
  FOR EACH ROW EXECUTE FUNCTION gigalibs_inventory.prevent_cost_layer_mutation();

CREATE TRIGGER inventory_receipt_cost_records_immutable
  BEFORE UPDATE OR DELETE ON gigalibs_inventory.inventory_receipt_cost_records
  FOR EACH ROW EXECUTE FUNCTION gigalibs_inventory.prevent_cost_layer_mutation();

CREATE TRIGGER inventory_reservation_issues_immutable
  BEFORE UPDATE OR DELETE ON gigalibs_inventory.inventory_reservation_issues
  FOR EACH ROW EXECUTE FUNCTION gigalibs_inventory.prevent_cost_layer_mutation();

CREATE FUNCTION gigalibs_inventory.mirror_ledger_entry_to_cost_layer() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  method varchar(20);
  org_unit varchar(64);
BEGIN
  IF NEW.direction <> 'DEBIT' OR NEW.unit_cost_minor IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT w.org_unit_id INTO org_unit
    FROM gigalibs_inventory.warehouses w
   WHERE w.tenant_id = NEW.tenant_id AND w.id = NEW.warehouse_id;
  SELECT s.valuation_method INTO method
    FROM gigalibs_inventory.inventory_org_valuation_settings s
   WHERE s.tenant_id = NEW.tenant_id AND s.org_unit_id = org_unit;
  IF method IS NULL THEN
    RAISE EXCEPTION 'Organization valuation method is not configured for costed inventory movement'
      USING ERRCODE = '23514';
  END IF;
  INSERT INTO gigalibs_inventory.inventory_cost_layers (
    id, tenant_id, ledger_entry_id, transaction_id, warehouse_id, location_id, product_id, uom_id, lot_id,
    valuation_method, quantity, unit_cost_minor, total_cost_minor, org_unit_id, created_at
  ) VALUES (
    gen_random_uuid(),
    NEW.tenant_id,
    NEW.id,
    NEW.transaction_id,
    NEW.warehouse_id,
    NEW.location_id,
    NEW.product_id,
    NEW.uom_id,
    NEW.lot_id,
    method,
    NEW.quantity,
    NEW.unit_cost_minor,
    COALESCE(NEW.total_cost_minor, ROUND(NEW.unit_cost_minor * NEW.quantity)::numeric(18, 0)),
    org_unit,
    NEW.created_at
  )
  ON CONFLICT (tenant_id, ledger_entry_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER stock_ledger_entries_cost_layer_mirror
  AFTER INSERT ON gigalibs_inventory.stock_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION gigalibs_inventory.mirror_ledger_entry_to_cost_layer();

ALTER TABLE gigalibs_inventory.inventory_org_valuation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_inventory.inventory_org_valuation_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY inventory_org_valuation_settings_tenant_isolation ON gigalibs_inventory.inventory_org_valuation_settings
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_inventory.inventory_cost_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_inventory.inventory_cost_layers FORCE ROW LEVEL SECURITY;
CREATE POLICY inventory_cost_layers_tenant_isolation ON gigalibs_inventory.inventory_cost_layers
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_inventory.inventory_reservation_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_inventory.inventory_reservation_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY inventory_reservation_allocations_tenant_isolation ON gigalibs_inventory.inventory_reservation_allocations
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_inventory.inventory_reservation_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_inventory.inventory_reservation_issues FORCE ROW LEVEL SECURITY;
CREATE POLICY inventory_reservation_issues_tenant_isolation ON gigalibs_inventory.inventory_reservation_issues
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_inventory.inventory_receipt_cost_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_inventory.inventory_receipt_cost_records FORCE ROW LEVEL SECURITY;
CREATE POLICY inventory_receipt_cost_records_tenant_isolation ON gigalibs_inventory.inventory_receipt_cost_records
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

-- Existing runtime roles need privileges on tables introduced after bootstrap.
GRANT SELECT, INSERT, UPDATE ON gigalibs_inventory.inventory_org_valuation_settings TO gigalibs_inventory_runtime;
GRANT SELECT, INSERT ON gigalibs_inventory.inventory_cost_layers TO gigalibs_inventory_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON gigalibs_inventory.inventory_reservation_allocations TO gigalibs_inventory_runtime;
GRANT SELECT, INSERT ON gigalibs_inventory.inventory_reservation_issues TO gigalibs_inventory_runtime;
GRANT SELECT, INSERT ON gigalibs_inventory.inventory_receipt_cost_records TO gigalibs_inventory_runtime;

INSERT INTO gigalibs_inventory.schema_migrations (version, name)
VALUES (10, '000010_material_ledger_cost_layers')
ON CONFLICT (version) DO NOTHING;

COMMIT;
