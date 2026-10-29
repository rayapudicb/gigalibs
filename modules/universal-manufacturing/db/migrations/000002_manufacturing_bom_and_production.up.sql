-- WI-OI-126 S1/S2: BOMs, work centers, production orders, MRP plans (forward-only).
BEGIN;

CREATE TABLE gigalibs_universal_manufacturing.work_centers (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  code varchar(32) NOT NULL,
  name varchar(128) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE gigalibs_universal_manufacturing.boms (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  bom_code varchar(64) NOT NULL,
  finished_product_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'OBSOLETE')),
  scrap_percent numeric(8, 4) NOT NULL DEFAULT 0 CHECK (scrap_percent >= 0 AND scrap_percent < 100),
  org_unit_id varchar(64),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, bom_code, version)
);

CREATE TABLE gigalibs_universal_manufacturing.bom_lines (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  bom_id uuid NOT NULL REFERENCES gigalibs_universal_manufacturing.boms (id) ON DELETE CASCADE,
  line_number integer NOT NULL CHECK (line_number > 0),
  component_product_id uuid NOT NULL,
  uom_id uuid NOT NULL,
  quantity_per numeric(18, 6) NOT NULL CHECK (quantity_per > 0),
  sub_bom_id uuid REFERENCES gigalibs_universal_manufacturing.boms (id),
  UNIQUE (tenant_id, bom_id, line_number)
);

CREATE TABLE gigalibs_universal_manufacturing.production_orders (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  order_number varchar(32) NOT NULL,
  bom_id uuid NOT NULL REFERENCES gigalibs_universal_manufacturing.boms (id),
  finished_product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  org_unit_id varchar(64),
  quantity numeric(18, 6) NOT NULL CHECK (quantity > 0),
  status varchar(16) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'RELEASED', 'ISSUED', 'COMPLETED', 'CANCELLED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  correlation_id varchar(128) NOT NULL,
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_number)
);

CREATE TABLE gigalibs_universal_manufacturing.production_order_lines (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  production_order_id uuid NOT NULL REFERENCES gigalibs_universal_manufacturing.production_orders (id) ON DELETE CASCADE,
  line_number integer NOT NULL CHECK (line_number > 0),
  component_product_id uuid NOT NULL,
  uom_id uuid NOT NULL,
  required_quantity numeric(18, 6) NOT NULL CHECK (required_quantity > 0),
  reservation_id uuid,
  issued_quantity numeric(18, 6) NOT NULL DEFAULT 0 CHECK (issued_quantity >= 0),
  UNIQUE (tenant_id, production_order_id, line_number)
);

CREATE TABLE gigalibs_universal_manufacturing.production_plans (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  run_id uuid NOT NULL,
  product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  net_requirement numeric(18, 6) NOT NULL,
  suggested_order_qty numeric(18, 6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, run_id, product_id, warehouse_id)
);

DO $$
DECLARE
  relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'work_centers', 'boms', 'bom_lines', 'production_orders', 'production_order_lines', 'production_plans'
  ] LOOP
    EXECUTE format('ALTER TABLE gigalibs_universal_manufacturing.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_universal_manufacturing.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_universal_manufacturing.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      relation || '_tenant_isolation',
      relation
    );
  END LOOP;
END
$$;

INSERT INTO gigalibs_universal_manufacturing.schema_migrations (version, name)
VALUES (2, '000002_manufacturing_bom_and_production');

COMMIT;
