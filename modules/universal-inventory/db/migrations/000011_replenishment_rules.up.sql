-- WI-OI-125 S3: min–max/pack replenishment rules per product and warehouse (Advanced SCM, Module 3).
BEGIN;

CREATE TABLE gigalibs_inventory.replenish_rules (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  warehouse_id uuid NOT NULL,
  product_id uuid NOT NULL,
  min_quantity numeric(18, 6) NOT NULL CHECK (min_quantity >= 0),
  max_quantity numeric(18, 6) NOT NULL CHECK (max_quantity >= 0),
  pack_size numeric(18, 6) NOT NULL CHECK (pack_size > 0),
  preferred_vendor_party_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(128) NOT NULL DEFAULT 'system',
  CONSTRAINT replenish_rules_max_ge_min CHECK (max_quantity >= min_quantity),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, warehouse_id, product_id),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES gigalibs_inventory.warehouses (tenant_id, id)
);
CREATE INDEX replenish_rules_warehouse ON gigalibs_inventory.replenish_rules (tenant_id, warehouse_id, is_active);

ALTER TABLE gigalibs_inventory.replenish_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_inventory.replenish_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY replenish_rules_tenant_isolation ON gigalibs_inventory.replenish_rules
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

-- Existing runtime role needs privileges on the table introduced after bootstrap.
GRANT SELECT, INSERT, UPDATE, DELETE ON gigalibs_inventory.replenish_rules TO gigalibs_inventory_runtime;

INSERT INTO gigalibs_inventory.schema_migrations (version, name)
VALUES (11, '000011_replenishment_rules')
ON CONFLICT (version) DO NOTHING;

COMMIT;
