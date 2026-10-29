-- WI-OI-126: durable action states for cross-module Inventory handshakes.
BEGIN;

ALTER TABLE gigalibs_universal_manufacturing.production_orders
  DROP CONSTRAINT production_orders_status_check;
ALTER TABLE gigalibs_universal_manufacturing.production_orders
  ADD CONSTRAINT production_orders_status_check
  CHECK (status IN ('DRAFT', 'RESERVING', 'RELEASED', 'ISSUING', 'ISSUED', 'RECEIVING', 'COMPLETED', 'CANCELLED'));
ALTER TABLE gigalibs_universal_manufacturing.production_orders
  ADD COLUMN last_error_code varchar(128);

ALTER TABLE gigalibs_universal_manufacturing.production_plans
  ADD COLUMN org_unit_id varchar(64);
ALTER TABLE gigalibs_universal_manufacturing.work_centers
  ADD COLUMN org_unit_id varchar(64);

CREATE TABLE gigalibs_universal_manufacturing.routings (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  bom_id uuid NOT NULL REFERENCES gigalibs_universal_manufacturing.boms(id),
  org_unit_id varchar(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'OBSOLETE')),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX routings_active_bom ON gigalibs_universal_manufacturing.routings (tenant_id, bom_id)
  WHERE status = 'ACTIVE';
CREATE TABLE gigalibs_universal_manufacturing.routing_steps (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  routing_id uuid NOT NULL REFERENCES gigalibs_universal_manufacturing.routings(id) ON DELETE CASCADE,
  step_number integer NOT NULL CHECK (step_number > 0),
  work_center_id uuid NOT NULL REFERENCES gigalibs_universal_manufacturing.work_centers(id),
  setup_minutes numeric(12, 2) NOT NULL DEFAULT 0 CHECK (setup_minutes >= 0),
  run_minutes_per_unit numeric(12, 4) NOT NULL DEFAULT 0 CHECK (run_minutes_per_unit >= 0),
  UNIQUE (tenant_id, routing_id, step_number)
);
DO $$ DECLARE relation text; BEGIN
  FOREACH relation IN ARRAY ARRAY['routings', 'routing_steps'] LOOP
    EXECUTE format('ALTER TABLE gigalibs_universal_manufacturing.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_universal_manufacturing.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_universal_manufacturing.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      relation || '_tenant_isolation', relation
    );
  END LOOP;
END $$;

CREATE TABLE gigalibs_universal_manufacturing.production_order_counters (
  tenant_id varchar(64) PRIMARY KEY,
  last_number bigint NOT NULL CHECK (last_number > 0)
);
INSERT INTO gigalibs_universal_manufacturing.production_order_counters (tenant_id, last_number)
SELECT tenant_id,
       COALESCE(MAX(substring(order_number FROM '^MO-([0-9]+)$')::bigint), 0)
  FROM gigalibs_universal_manufacturing.production_orders
 GROUP BY tenant_id
HAVING COALESCE(MAX(substring(order_number FROM '^MO-([0-9]+)$')::bigint), 0) > 0;
ALTER TABLE gigalibs_universal_manufacturing.production_order_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_universal_manufacturing.production_order_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY production_order_counters_tenant_isolation ON gigalibs_universal_manufacturing.production_order_counters
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

-- ADR-0018: the module must hold the exact organization version in the signed context.
CREATE TABLE gigalibs_universal_manufacturing.org_replica_versions (
  tenant_id varchar(64) NOT NULL,
  version_id varchar(64) NOT NULL,
  tree_id varchar(64) NOT NULL,
  tree_kind varchar(16) NOT NULL CHECK (tree_kind IN ('PRIMARY', 'ALTERNATE')),
  version_number integer NOT NULL CHECK (version_number > 0),
  checksum char(71) NOT NULL CHECK (checksum ~ '^sha256:[0-9a-f]{64}$'),
  status varchar(16) NOT NULL DEFAULT 'RECEIVING' CHECK (status IN ('RECEIVING', 'READY')),
  unit_count integer CHECK (unit_count >= 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  PRIMARY KEY (tenant_id, version_id),
  CHECK ((status = 'READY') = (ready_at IS NOT NULL AND unit_count IS NOT NULL))
);
CREATE TABLE gigalibs_universal_manufacturing.org_replica_units (
  tenant_id varchar(64) NOT NULL,
  version_id varchar(64) NOT NULL,
  unit_id varchar(64) NOT NULL,
  parent_unit_id varchar(64),
  code varchar(64) NOT NULL,
  name varchar(200) NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  status varchar(16) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  holds_records boolean NOT NULL,
  type_code varchar(40) NOT NULL,
  PRIMARY KEY (tenant_id, version_id, unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_universal_manufacturing.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE,
  CHECK (parent_unit_id IS NULL OR parent_unit_id <> unit_id)
);
CREATE TABLE gigalibs_universal_manufacturing.org_replica_closure (
  tenant_id varchar(64) NOT NULL,
  version_id varchar(64) NOT NULL,
  ancestor_unit_id varchar(64) NOT NULL,
  descendant_unit_id varchar(64) NOT NULL,
  depth smallint NOT NULL CHECK (depth BETWEEN 0 AND 16),
  PRIMARY KEY (tenant_id, version_id, ancestor_unit_id, descendant_unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_universal_manufacturing.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE
);
CREATE INDEX org_replica_closure_descendant ON gigalibs_universal_manufacturing.org_replica_closure (tenant_id, version_id, descendant_unit_id);

DO $$ DECLARE relation text; BEGIN
  FOREACH relation IN ARRAY ARRAY['org_replica_versions', 'org_replica_units', 'org_replica_closure'] LOOP
    EXECUTE format('ALTER TABLE gigalibs_universal_manufacturing.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_universal_manufacturing.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_universal_manufacturing.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      relation || '_tenant_isolation', relation
    );
  END LOOP;
END $$;

INSERT INTO gigalibs_universal_manufacturing.schema_migrations (version, name)
VALUES (5, '000005_production_recovery');

COMMIT;
