-- WI-OI-127: append-only Finance landed cost projections keyed by finance cost layer.
BEGIN;

CREATE TABLE gigalibs_inventory.inventory_landed_cost_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  finance_landed_cost_id uuid NOT NULL,
  finance_cost_layer_id uuid NOT NULL,
  product_id uuid NOT NULL,
  apportioned_amount_minor numeric(18, 0) NOT NULL CHECK (apportioned_amount_minor >= 0),
  prior_unit_cost_scaled numeric(30, 0) NOT NULL CHECK (prior_unit_cost_scaled >= 0),
  adjusted_unit_cost_scaled numeric(30, 0) NOT NULL CHECK (adjusted_unit_cost_scaled >= 0),
  voucher_number varchar(50) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, finance_landed_cost_id, finance_cost_layer_id)
);

CREATE INDEX inventory_landed_cost_adjustments_product
  ON gigalibs_inventory.inventory_landed_cost_adjustments (tenant_id, product_id, created_at DESC);

CREATE FUNCTION gigalibs_inventory.prevent_landed_cost_adjustment_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Inventory landed cost adjustments are append-only' USING ERRCODE = '55000';
END $$;

CREATE TRIGGER inventory_landed_cost_adjustments_immutable
  BEFORE UPDATE OR DELETE ON gigalibs_inventory.inventory_landed_cost_adjustments
  FOR EACH ROW EXECUTE FUNCTION gigalibs_inventory.prevent_landed_cost_adjustment_mutation();

ALTER TABLE gigalibs_inventory.inventory_landed_cost_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_inventory.inventory_landed_cost_adjustments FORCE ROW LEVEL SECURITY;
CREATE POLICY inventory_landed_cost_adjustments_tenant_isolation ON gigalibs_inventory.inventory_landed_cost_adjustments
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

GRANT SELECT, INSERT ON gigalibs_inventory.inventory_landed_cost_adjustments TO gigalibs_inventory_runtime;

INSERT INTO gigalibs_inventory.schema_migrations (version, name)
VALUES (13, '000013_landed_cost_adjustment_projection')
ON CONFLICT (version) DO NOTHING;

COMMIT;
