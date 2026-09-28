BEGIN;

CREATE SCHEMA IF NOT EXISTS gigalibs_cmms;

-- ─── RUNTIME ROLE ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gigalibs_cmms_api_runtime') THEN
    CREATE ROLE gigalibs_cmms_api_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END;
$$;

-- ─── MIGRATION TRACKING ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.schema_migrations (
  version    bigint PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT cmms_migrations_version_check CHECK (version > 0),
  CONSTRAINT cmms_migrations_name_check CHECK (char_length(name) BETWEEN 1 AND 200)
);

-- ─── MODULE TENANT REGISTRY ───────────────────────────────────────────────────
-- Each row represents a tenant that has activated the CMMS module.
-- tenant_id matches the JWT tenant claim (UUID).
CREATE TABLE IF NOT EXISTS gigalibs_cmms.module_tenants (
  id                     uuid PRIMARY KEY,
  oidc_issuer            text NOT NULL,
  external_tenant_subject text NOT NULL,
  status                 text NOT NULL DEFAULT 'ACTIVE',
  created_at             timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at             timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT cmms_module_tenants_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  CONSTRAINT cmms_module_tenants_oidc_identity_unique UNIQUE (oidc_issuer, external_tenant_subject)
);

-- ─── LOCATIONS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.locations (
  tenant_id     uuid NOT NULL,
  id            uuid NOT NULL,
  name          text NOT NULL,
  parent_id     uuid,                            -- self-referencing hierarchy
  location_type text NOT NULL DEFAULT 'SITE',   -- SITE | BUILDING | FLOOR | ZONE | ROOM
  address       jsonb,
  floor_plan_url text,                           -- @gigalibs/storage-core signed URL
  geo_lat       numeric(10,7),
  geo_lng       numeric(10,7),
  version       integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at    timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT locations_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT locations_parent_fk FOREIGN KEY (tenant_id, parent_id)
    REFERENCES gigalibs_cmms.locations (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT locations_type_check CHECK (location_type IN ('SITE','BUILDING','FLOOR','ZONE','ROOM')),
  CONSTRAINT locations_version_check CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS idx_cmms_locations_parent ON gigalibs_cmms.locations (tenant_id, parent_id);

-- ─── FORM SCHEMAS ─────────────────────────────────────────────────────────────
-- Stores dynamic form definitions from @gigalibs/form-engine-core.
-- category determines context: ASSET_TYPE | WORK_ORDER | CHECKLIST | PM
CREATE TABLE IF NOT EXISTS gigalibs_cmms.form_schemas (
  tenant_id  uuid NOT NULL,
  id         uuid NOT NULL,
  title      text NOT NULL,
  category   text NOT NULL DEFAULT 'ASSET_TYPE',
  version    integer NOT NULL DEFAULT 1,
  schema_json jsonb NOT NULL,                   -- Full FormSchema JSON
  is_active  boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT form_schemas_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT form_schemas_category_check CHECK (category IN ('ASSET_TYPE','WORK_ORDER','CHECKLIST','PM')),
  CONSTRAINT form_schemas_version_check CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS idx_cmms_form_schemas_cat ON gigalibs_cmms.form_schemas (tenant_id, category);

-- ─── ASSET CATEGORIES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.asset_categories (
  tenant_id  uuid NOT NULL,
  id         uuid NOT NULL,
  name       text NOT NULL,
  color      text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT asset_categories_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT asset_categories_name_unique UNIQUE (tenant_id, name)
);

-- ─── ASSETS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.assets (
  tenant_id          uuid NOT NULL,
  id                 uuid NOT NULL,
  name               text NOT NULL,
  description        text,
  category_id        uuid,                       -- → asset_categories
  form_schema_id     uuid,                       -- → form_schemas (dynamic spec template)
  specs              jsonb NOT NULL DEFAULT '{}',-- dynamic field values from form_schema
  status             text NOT NULL DEFAULT 'OPERATIONAL',
  asset_tag          text,                       -- barcode / QR / NFC
  serial_number      text,
  model              text,
  manufacturer       text,
  power              text,                       -- e.g. "220V 15A"
  area               text,
  acquisition_cost   numeric(14,4),
  currency_code      character(3) NOT NULL DEFAULT 'USD',
  location_id        uuid,                       -- → locations
  parent_asset_id    uuid,                       -- → assets (hierarchy)
  assigned_to        uuid,                       -- platform user UUID
  assigned_teams     uuid[] NOT NULL DEFAULT '{}',
  assigned_vendors   uuid[] NOT NULL DEFAULT '{}',
  assigned_customers uuid[] NOT NULL DEFAULT '{}',
  warranty_expiry    date,
  purchase_date      date,
  criticality        text NOT NULL DEFAULT 'MEDIUM',
  iot_device_id      text,                       -- external SCADA/IoT platform ID
  scada_endpoint     text,                       -- MQTT topic or REST endpoint URL
  is_deleted         boolean NOT NULL DEFAULT false,
  version            integer NOT NULL DEFAULT 1,
  created_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at         timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT assets_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT assets_category_fk FOREIGN KEY (tenant_id, category_id)
    REFERENCES gigalibs_cmms.asset_categories (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT assets_form_schema_fk FOREIGN KEY (tenant_id, form_schema_id)
    REFERENCES gigalibs_cmms.form_schemas (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT assets_location_fk FOREIGN KEY (tenant_id, location_id)
    REFERENCES gigalibs_cmms.locations (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT assets_parent_fk FOREIGN KEY (tenant_id, parent_asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT assets_status_check CHECK (status IN ('OPERATIONAL','UNDER_MAINTENANCE','OFFLINE','DECOMMISSIONED')),
  CONSTRAINT assets_criticality_check CHECK (criticality IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  CONSTRAINT assets_currency_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT assets_version_check CHECK (version > 0),
  CONSTRAINT assets_tag_unique UNIQUE (tenant_id, asset_tag)
);
CREATE INDEX IF NOT EXISTS idx_cmms_assets_status     ON gigalibs_cmms.assets (tenant_id, status) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_cmms_assets_category   ON gigalibs_cmms.assets (tenant_id, category_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_cmms_assets_location   ON gigalibs_cmms.assets (tenant_id, location_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_cmms_assets_parent     ON gigalibs_cmms.assets (tenant_id, parent_asset_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_cmms_assets_iot        ON gigalibs_cmms.assets (tenant_id, iot_device_id) WHERE iot_device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cmms_assets_specs_gin  ON gigalibs_cmms.assets USING GIN (specs);

-- ─── ASSET FILES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.asset_files (
  tenant_id   uuid NOT NULL,
  id          uuid NOT NULL,
  asset_id    uuid NOT NULL,
  file_url    text NOT NULL,
  file_name   text NOT NULL,
  file_type   text NOT NULL DEFAULT 'document',  -- image | document | manual | certificate
  uploaded_by uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT asset_files_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cmms_asset_files_asset ON gigalibs_cmms.asset_files (tenant_id, asset_id);

-- ─── ASSET DOWNTIMES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.asset_downtimes (
  tenant_id       uuid NOT NULL,
  id              uuid NOT NULL,
  asset_id        uuid NOT NULL,
  duration_hours  numeric(8,2) NOT NULL,
  downtime_status text NOT NULL DEFAULT 'UNPLANNED',
  started_at      timestamptz NOT NULL,
  ended_at        timestamptz,
  notes           text,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at      timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT asset_downtimes_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT asset_downtimes_status_check CHECK (downtime_status IN ('PLANNED','UNPLANNED')),
  CONSTRAINT asset_downtimes_duration_check CHECK (duration_hours >= 0)
);
CREATE INDEX IF NOT EXISTS idx_cmms_downtimes_asset ON gigalibs_cmms.asset_downtimes (tenant_id, asset_id);

-- ─── METERS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.meters (
  tenant_id     uuid NOT NULL,
  id            uuid NOT NULL,
  asset_id      uuid NOT NULL,
  name          text NOT NULL,
  unit          text NOT NULL,                  -- 'mm/s', 'hours', 'degC', 'bar', 'RPM', 'kW'
  reading_type  text NOT NULL DEFAULT 'GAUGE',  -- GAUGE | COUNTER | CUMULATIVE
  current_value numeric,
  min_threshold numeric,                        -- alert if BELOW (optional)
  max_threshold numeric,                        -- alert if ABOVE
  iot_topic     text,                           -- MQTT topic or SCADA tag name
  last_read_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at    timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT meters_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT meters_reading_type_check CHECK (reading_type IN ('GAUGE','COUNTER','CUMULATIVE'))
);
CREATE INDEX IF NOT EXISTS idx_cmms_meters_asset ON gigalibs_cmms.meters (tenant_id, asset_id);

-- ─── METER READINGS (time-series, range-partitioned) ─────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.meter_readings (
  tenant_id   uuid NOT NULL,
  id          uuid NOT NULL,
  meter_id    uuid NOT NULL,
  asset_id    uuid NOT NULL,
  value       numeric NOT NULL,
  source      text NOT NULL DEFAULT 'MANUAL',   -- MANUAL | IOT | SCADA | IMPORT
  notes       text,
  entered_by  uuid,
  ingested_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id, ingested_at)
) PARTITION BY RANGE (ingested_at);

-- Initial partition — add monthly partitions at tenant provisioning / via cron
CREATE TABLE IF NOT EXISTS gigalibs_cmms.meter_readings_2026_09
  PARTITION OF gigalibs_cmms.meter_readings
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE IF NOT EXISTS gigalibs_cmms.meter_readings_2026_10
  PARTITION OF gigalibs_cmms.meter_readings
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE IF NOT EXISTS gigalibs_cmms.meter_readings_2026_11
  PARTITION OF gigalibs_cmms.meter_readings
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE IF NOT EXISTS gigalibs_cmms.meter_readings_2026_12
  PARTITION OF gigalibs_cmms.meter_readings
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE INDEX IF NOT EXISTS idx_cmms_mr_meter_time ON gigalibs_cmms.meter_readings (tenant_id, meter_id, ingested_at DESC);

-- ─── WO CATEGORIES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.wo_categories (
  tenant_id  uuid NOT NULL,
  id         uuid NOT NULL,
  name       text NOT NULL,
  color      text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT wo_categories_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT wo_categories_name_unique UNIQUE (tenant_id, name)
);

-- ─── WORK ORDERS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.work_orders (
  tenant_id                uuid NOT NULL,
  id                       uuid NOT NULL,
  wo_number                text NOT NULL,         -- WO-20260907-0042
  type                     text NOT NULL,         -- REACTIVE | PREVENTIVE | INSPECTION | EMERGENCY
  priority                 text NOT NULL DEFAULT 'NONE',
  status                   text NOT NULL DEFAULT 'OPEN',
  title                    text NOT NULL,
  description              text,
  asset_id                 uuid,
  location_id              uuid,
  category_id              uuid,
  assigned_to              uuid,                  -- primary technician
  additional_workers       uuid[] NOT NULL DEFAULT '{}',
  assigned_teams           uuid[] NOT NULL DEFAULT '{}',
  due_date                 timestamptz,
  started_at               timestamptz,
  completed_at             timestamptz,
  required_signature       boolean NOT NULL DEFAULT false,
  signature_data           text,                  -- base64 SVG from signature pad
  feedback                 text,
  trigger_source           text NOT NULL DEFAULT 'MANUAL',
  trigger_pm_id            uuid,
  trigger_meter_reading_id uuid,
  trigger_request_id       uuid,
  trigger_rule_id          text,                  -- universal-rule-pro rule id
  form_schema_id           uuid,                  -- dynamic checklist template
  form_data                jsonb,                 -- captured checklist answers
  estimated_duration       numeric(8,2),          -- hours
  audit_receipt            text,                  -- SHA-256 FIPS seal
  is_deleted               boolean NOT NULL DEFAULT false,
  version                  integer NOT NULL DEFAULT 1,
  created_by               uuid NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at               timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT work_orders_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT work_orders_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT work_orders_location_fk FOREIGN KEY (tenant_id, location_id)
    REFERENCES gigalibs_cmms.locations (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT work_orders_category_fk FOREIGN KEY (tenant_id, category_id)
    REFERENCES gigalibs_cmms.wo_categories (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT work_orders_form_schema_fk FOREIGN KEY (tenant_id, form_schema_id)
    REFERENCES gigalibs_cmms.form_schemas (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT work_orders_type_check CHECK (type IN ('REACTIVE','PREVENTIVE','INSPECTION','EMERGENCY')),
  CONSTRAINT work_orders_priority_check CHECK (priority IN ('NONE','LOW','MEDIUM','HIGH','EMERGENCY')),
  CONSTRAINT work_orders_status_check CHECK (status IN ('OPEN','IN_PROGRESS','ON_HOLD','COMPLETED','CANCELLED')),
  CONSTRAINT work_orders_trigger_check CHECK (trigger_source IN ('MANUAL','RULE_ENGINE','PM_SCHEDULE','REQUEST')),
  CONSTRAINT work_orders_wo_number_unique UNIQUE (tenant_id, wo_number),
  CONSTRAINT work_orders_version_check CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS idx_cmms_wo_status    ON gigalibs_cmms.work_orders (tenant_id, status, priority) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_cmms_wo_asset     ON gigalibs_cmms.work_orders (tenant_id, asset_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_cmms_wo_assigned  ON gigalibs_cmms.work_orders (tenant_id, assigned_to) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_cmms_wo_due       ON gigalibs_cmms.work_orders (tenant_id, due_date) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_cmms_wo_trigger   ON gigalibs_cmms.work_orders (tenant_id, trigger_source, trigger_rule_id);

-- ─── WO LABOR ENTRIES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.wo_labors (
  tenant_id     uuid NOT NULL,
  id            uuid NOT NULL,
  wo_id         uuid NOT NULL,
  worker_id     uuid NOT NULL,
  duration      numeric(8,2) NOT NULL,
  hourly_rate   numeric(10,4),
  time_category text,                            -- Regular | Overtime | Travel
  started_at    timestamptz,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT wo_labors_wo_fk FOREIGN KEY (tenant_id, wo_id)
    REFERENCES gigalibs_cmms.work_orders (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT wo_labors_duration_check CHECK (duration > 0)
);
CREATE INDEX IF NOT EXISTS idx_cmms_wo_labors_wo ON gigalibs_cmms.wo_labors (tenant_id, wo_id);

-- ─── WO ADDITIONAL COSTS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.wo_additional_costs (
  tenant_id     uuid NOT NULL,
  id            uuid NOT NULL,
  wo_id         uuid NOT NULL,
  description   text NOT NULL,
  amount        numeric(12,4) NOT NULL,
  currency_code character(3) NOT NULL DEFAULT 'USD',
  cost_category text,
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT wo_costs_wo_fk FOREIGN KEY (tenant_id, wo_id)
    REFERENCES gigalibs_cmms.work_orders (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT wo_costs_amount_check CHECK (amount > 0),
  CONSTRAINT wo_costs_currency_check CHECK (currency_code ~ '^[A-Z]{3}$')
);

-- ─── WO HISTORY (audit trail) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.wo_history (
  tenant_id  uuid NOT NULL,
  id         uuid NOT NULL,
  wo_id      uuid NOT NULL,
  changed_by uuid NOT NULL,
  field_name text NOT NULL,
  old_value  text,
  new_value  text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT wo_history_wo_fk FOREIGN KEY (tenant_id, wo_id)
    REFERENCES gigalibs_cmms.work_orders (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cmms_wo_history_wo ON gigalibs_cmms.wo_history (tenant_id, wo_id, created_at DESC);

-- ─── PM SCHEDULES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.pm_schedules (
  tenant_id          uuid NOT NULL,
  id                 uuid NOT NULL,
  name               text NOT NULL,
  description        text,
  asset_id           uuid NOT NULL,
  location_id        uuid,
  category_id        uuid,
  trigger_type       text NOT NULL DEFAULT 'CALENDAR',
  cron_expression    text,                        -- for CALENDAR triggers
  cron_timezone      text NOT NULL DEFAULT 'UTC',
  meter_id           uuid,                        -- for METER_THRESHOLD triggers
  meter_threshold    numeric,
  wo_title_template  text,
  wo_description     text,
  wo_priority        text NOT NULL DEFAULT 'NONE',
  assigned_to        uuid,
  assigned_teams     uuid[] NOT NULL DEFAULT '{}',
  form_schema_id     uuid,                        -- checklist template
  estimated_duration numeric(8,2),
  workflow_dag_id    text,                        -- workflow-studio DAG id
  is_active          boolean NOT NULL DEFAULT true,
  last_triggered_at  timestamptz,
  next_due_at        timestamptz,
  version            integer NOT NULL DEFAULT 1,
  created_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at         timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT pm_schedules_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT pm_schedules_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT pm_schedules_trigger_check CHECK (trigger_type IN ('CALENDAR','METER_THRESHOLD','BOTH')),
  CONSTRAINT pm_schedules_priority_check CHECK (wo_priority IN ('NONE','LOW','MEDIUM','HIGH','EMERGENCY')),
  CONSTRAINT pm_schedules_version_check CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS idx_cmms_pm_asset    ON gigalibs_cmms.pm_schedules (tenant_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_cmms_pm_active   ON gigalibs_cmms.pm_schedules (tenant_id, is_active, next_due_at);

-- ─── PARTS (MRO INVENTORY) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.parts (
  tenant_id        uuid NOT NULL,
  id               uuid NOT NULL,
  part_number      text NOT NULL,
  name             text NOT NULL,
  description      text,
  category         text,
  unit_of_measure  text NOT NULL DEFAULT 'EACH',
  unit_cost        numeric(12,4),
  currency_code    character(3) NOT NULL DEFAULT 'USD',
  quantity_on_hand numeric NOT NULL DEFAULT 0,
  min_quantity     numeric NOT NULL DEFAULT 0,
  max_quantity     numeric,
  reorder_point    numeric,                       -- auto-PO trigger threshold
  non_stock        boolean NOT NULL DEFAULT false,
  barcode          text,
  area             text,
  location_id      uuid,
  is_deleted       boolean NOT NULL DEFAULT false,
  version          integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at       timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT parts_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT parts_location_fk FOREIGN KEY (tenant_id, location_id)
    REFERENCES gigalibs_cmms.locations (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT parts_pn_unique UNIQUE (tenant_id, part_number),
  CONSTRAINT parts_qty_check CHECK (quantity_on_hand >= 0),
  CONSTRAINT parts_currency_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT parts_version_check CHECK (version > 0)
);

-- ─── PART TRANSACTIONS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.part_transactions (
  tenant_id   uuid NOT NULL,
  id          uuid NOT NULL,
  part_id     uuid NOT NULL,
  type        text NOT NULL,                     -- ADD | CONSUME | TRANSFER | ADJUSTMENT
  quantity    numeric NOT NULL,
  wo_id       uuid,                              -- work_orders.id if consumed on WO
  po_id       uuid,                              -- purchase_orders.id if restocked
  location_id uuid,
  unit_cost   numeric(12,4),
  notes       text,
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT part_tx_part_fk FOREIGN KEY (tenant_id, part_id)
    REFERENCES gigalibs_cmms.parts (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT part_tx_type_check CHECK (type IN ('ADD','CONSUME','TRANSFER','ADJUSTMENT'))
);
CREATE INDEX IF NOT EXISTS idx_cmms_part_tx_part ON gigalibs_cmms.part_transactions (tenant_id, part_id, created_at DESC);

-- ─── VENDORS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.vendors (
  tenant_id   uuid NOT NULL,
  id          uuid NOT NULL,
  name        text NOT NULL,
  email       text,
  phone       text,
  address     jsonb,
  website     text,
  description text,
  rate        numeric(10,4),
  currency_code character(3) DEFAULT 'USD',
  is_deleted  boolean NOT NULL DEFAULT false,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at  timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT vendors_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT vendors_name_unique UNIQUE (tenant_id, name),
  CONSTRAINT vendors_version_check CHECK (version > 0)
);

-- ─── CUSTOMERS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.customers (
  tenant_id   uuid NOT NULL,
  id          uuid NOT NULL,
  name        text NOT NULL,
  email       text,
  phone       text,
  address     jsonb,
  description text,
  is_deleted  boolean NOT NULL DEFAULT false,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at  timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT customers_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT customers_name_unique UNIQUE (tenant_id, name),
  CONSTRAINT customers_version_check CHECK (version > 0)
);

-- ─── MAINTENANCE REQUESTS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.maintenance_requests (
  tenant_id         uuid NOT NULL,
  id                uuid NOT NULL,
  title             text NOT NULL,
  description       text,
  priority          text NOT NULL DEFAULT 'NONE',
  status            text NOT NULL DEFAULT 'PENDING',
  asset_id          uuid,
  location_id       uuid,
  requester_name    text,
  requester_email   text,
  requester_phone   text,
  converted_wo_id   uuid,                         -- work_orders.id once approved+converted
  portal_uuid       text,                         -- public portal slug (per tenant)
  version           integer NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at        timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT requests_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT requests_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT requests_priority_check CHECK (priority IN ('NONE','LOW','MEDIUM','HIGH','EMERGENCY')),
  CONSTRAINT requests_status_check CHECK (status IN ('PENDING','APPROVED','CANCELLED','CONVERTED')),
  CONSTRAINT requests_version_check CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS idx_cmms_requests_status ON gigalibs_cmms.maintenance_requests (tenant_id, status);

-- ─── AUDIT EVENTS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.audit_events (
  tenant_id   uuid NOT NULL,
  id          uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  action      text NOT NULL,
  actor_id    text NOT NULL,
  actor_role  text NOT NULL,
  details     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT audit_events_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_cmms_audit_entity ON gigalibs_cmms.audit_events (tenant_id, entity_type, entity_id, created_at DESC);

-- ─── OUTBOX EVENTS ────────────────────────────────────────────────────────────
-- Transactional outbox for reliable event publishing to @gigalibs/event-bus
CREATE TABLE IF NOT EXISTS gigalibs_cmms.outbox_events (
  tenant_id       uuid NOT NULL,
  id              uuid NOT NULL,
  event_type      text NOT NULL,
  payload         jsonb NOT NULL,
  delivery_status text NOT NULL DEFAULT 'PENDING',
  created_at      timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT outbox_events_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT outbox_delivery_status_check CHECK (delivery_status IN ('PENDING','DELIVERED','FAILED'))
);
CREATE INDEX IF NOT EXISTS idx_cmms_outbox_pending ON gigalibs_cmms.outbox_events (created_at) WHERE delivery_status = 'PENDING';

-- ─── RECORD MIGRATION ─────────────────────────────────────────────────────────
INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (1, '000001_cmms_foundation')
ON CONFLICT (version) DO NOTHING;

COMMIT;
