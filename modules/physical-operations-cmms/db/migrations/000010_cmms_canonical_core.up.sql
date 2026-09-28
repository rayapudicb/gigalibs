-- WI-OI-038 (roadmap P4): canonical CMMS core. Forward-only; 000001 and 000002 stay immutable.
--
-- The prototype foundation keyed tenants and users as uuid, but control-plane tenant, user and department ids
-- are cuids, so no real tenant could ever write to it; its meter-reading partitions also ended in 2026, and its
-- locations duplicated Geospatial places. No target holds CMMS data (the local target is at version 2 with
-- zero rows), so this migration replaces the prototype core instead of converting it — and refuses, leaving
-- version 2 intact, if any row or any prototype 000003–000009 table exists.
--
-- Canonical layout: text tenant, user and department references; site_ref is a Geospatial place id held as a
-- plain reference (no cross-module link); every command writes state, history, audit and outbox in one
-- transaction; forced RLS on app.tenant_id for every table. Append-only and read-only tables are enforced by
-- the module migration runner (MODULE_APPEND_ONLY_TABLES, MODULE_READ_ONLY_TABLES).

BEGIN;

-- The guard must never see a filtered view: with row security off, a role that RLS would filter errors out
-- instead of counting zero rows.
SET LOCAL row_security = off;

DO $$
DECLARE
  relation text;
  populated boolean;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'workforce_resources', 'resource_capabilities', 'resource_allocations', 'allocation_status_history',
    'workforce_usage_events', 'purchase_orders', 'po_line_items', 'import_jobs', 'import_job_rows',
    'export_jobs', 'column_alias_maps'
  ] LOOP
    IF to_regclass('gigalibs_cmms.' || relation) IS NOT NULL THEN
      RAISE EXCEPTION 'gigalibs_cmms contains prototype table % (migrations 000003-000009), which is outside the supported CMMS upgrade path', relation
        USING ERRCODE = '55000';
    END IF;
  END LOOP;

  FOREACH relation IN ARRAY ARRAY[
    'module_tenants', 'locations', 'form_schemas', 'asset_categories', 'assets', 'asset_files',
    'asset_downtimes', 'meters', 'meter_readings', 'wo_categories', 'work_orders', 'wo_labors',
    'wo_additional_costs', 'wo_history', 'pm_schedules', 'parts', 'part_transactions', 'vendors',
    'customers', 'maintenance_requests', 'audit_events', 'outbox_events'
  ] LOOP
    IF to_regclass('gigalibs_cmms.' || relation) IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM gigalibs_cmms.%I)', relation) INTO populated;
      IF populated THEN
        RAISE EXCEPTION 'gigalibs_cmms.% holds data; the canonical core migration only replaces an empty prototype schema', relation
          USING ERRCODE = '55000';
      END IF;
    END IF;
  END LOOP;
END
$$;

DROP TABLE IF EXISTS
  gigalibs_cmms.outbox_events, gigalibs_cmms.audit_events, gigalibs_cmms.maintenance_requests,
  gigalibs_cmms.customers, gigalibs_cmms.vendors, gigalibs_cmms.part_transactions, gigalibs_cmms.parts,
  gigalibs_cmms.pm_schedules, gigalibs_cmms.wo_history, gigalibs_cmms.wo_additional_costs,
  gigalibs_cmms.wo_labors, gigalibs_cmms.work_orders, gigalibs_cmms.wo_categories,
  gigalibs_cmms.meter_readings, gigalibs_cmms.meters, gigalibs_cmms.asset_downtimes,
  gigalibs_cmms.asset_files, gigalibs_cmms.assets, gigalibs_cmms.asset_categories,
  gigalibs_cmms.form_schemas, gigalibs_cmms.locations, gigalibs_cmms.module_tenants;

-- Shared value rules.
CREATE DOMAIN gigalibs_cmms.tenant_ref AS text
  CHECK (VALUE ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$');
CREATE DOMAIN gigalibs_cmms.principal_ref AS text
  CHECK (VALUE ~ '^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$');
CREATE DOMAIN gigalibs_cmms.currency_code AS character(3)
  CHECK (VALUE ~ '^[A-Z]{3}$');

-- ─── ASSETS ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE gigalibs_cmms.assets (
  tenant_id        gigalibs_cmms.tenant_ref NOT NULL,
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_tag        text NOT NULL CHECK (asset_tag ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description      text CHECK (char_length(description) <= 4000),
  category         text CHECK (char_length(category) BETWEEN 1 AND 80),
  status           text NOT NULL DEFAULT 'OPERATIONAL'
    CHECK (status IN ('OPERATIONAL', 'UNDER_MAINTENANCE', 'OFFLINE', 'DECOMMISSIONED')),
  criticality      text NOT NULL DEFAULT 'MEDIUM' CHECK (criticality IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  manufacturer     text CHECK (char_length(manufacturer) <= 200),
  model            text CHECK (char_length(model) <= 200),
  serial_number    text CHECK (char_length(serial_number) <= 200),
  parent_asset_id  uuid,
  site_ref         uuid,
  department_id    text CHECK (char_length(department_id) BETWEEN 1 AND 64),
  acquisition_cost numeric(14, 4) CHECK (acquisition_cost >= 0),
  currency_code    gigalibs_cmms.currency_code,
  purchase_date    date,
  warranty_expiry  date,
  specs            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(specs) = 'object'),
  archived_at      timestamptz,
  version          integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by       gigalibs_cmms.principal_ref NOT NULL,
  updated_by       gigalibs_cmms.principal_ref NOT NULL,
  correlation_id   text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT assets_tag_unique UNIQUE (tenant_id, asset_tag),
  CONSTRAINT assets_parent_fk FOREIGN KEY (tenant_id, parent_asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT assets_not_own_parent CHECK (parent_asset_id IS NULL OR parent_asset_id <> id),
  CONSTRAINT assets_cost_currency CHECK (acquisition_cost IS NULL OR currency_code IS NOT NULL),
  CONSTRAINT assets_archived_decommissioned CHECK (archived_at IS NULL OR status = 'DECOMMISSIONED')
);
CREATE INDEX assets_by_site ON gigalibs_cmms.assets (tenant_id, site_ref) WHERE archived_at IS NULL;
CREATE INDEX assets_by_parent ON gigalibs_cmms.assets (tenant_id, parent_asset_id) WHERE archived_at IS NULL;
CREATE INDEX assets_by_name ON gigalibs_cmms.assets (tenant_id, name, id) WHERE archived_at IS NULL;

-- ─── PREVENTIVE MAINTENANCE SCHEDULES ────────────────────────────────────────────────────────────────────
CREATE TABLE gigalibs_cmms.pm_schedules (
  tenant_id          gigalibs_cmms.tenant_ref NOT NULL,
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  name               text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description        text CHECK (char_length(description) <= 4000),
  asset_id           uuid NOT NULL,
  site_ref           uuid,
  department_id      text CHECK (char_length(department_id) BETWEEN 1 AND 64),
  interval_count     integer NOT NULL CHECK (interval_count BETWEEN 1 AND 3650),
  interval_unit      text NOT NULL CHECK (interval_unit IN ('DAY', 'WEEK', 'MONTH', 'YEAR')),
  time_zone          text NOT NULL DEFAULT 'UTC' CHECK (char_length(time_zone) BETWEEN 1 AND 64),
  next_due_at        timestamptz NOT NULL,
  last_generated_at  timestamptz,
  wo_title           text NOT NULL CHECK (char_length(wo_title) BETWEEN 1 AND 240),
  wo_description     text CHECK (char_length(wo_description) <= 10000),
  wo_priority        text NOT NULL DEFAULT 'MEDIUM' CHECK (wo_priority IN ('LOW', 'MEDIUM', 'HIGH', 'EMERGENCY')),
  estimated_hours    numeric(8, 2) CHECK (estimated_hours > 0 AND estimated_hours <= 10000),
  requires_signature boolean NOT NULL DEFAULT false,
  task_labels        jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(task_labels) = 'array' AND jsonb_array_length(task_labels) <= 50),
  is_active          boolean NOT NULL DEFAULT true,
  version            integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by         gigalibs_cmms.principal_ref NOT NULL,
  updated_by         gigalibs_cmms.principal_ref NOT NULL,
  correlation_id     text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT pm_schedules_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX pm_schedules_due ON gigalibs_cmms.pm_schedules (tenant_id, is_active, next_due_at);
CREATE INDEX pm_schedules_by_asset ON gigalibs_cmms.pm_schedules (tenant_id, asset_id);

-- ─── WORK ORDERS ─────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE gigalibs_cmms.work_order_counters (
  tenant_id  gigalibs_cmms.tenant_ref PRIMARY KEY,
  last_value bigint NOT NULL CHECK (last_value > 0)
);

CREATE TABLE gigalibs_cmms.work_orders (
  tenant_id          gigalibs_cmms.tenant_ref NOT NULL,
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  wo_number          text NOT NULL CHECK (wo_number ~ '^WO-[0-9]{6,}$'),
  request_key        uuid,
  type               text NOT NULL CHECK (type IN ('REACTIVE', 'PREVENTIVE', 'INSPECTION', 'EMERGENCY')),
  priority           text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'EMERGENCY')),
  status             text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED')),
  title              text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  description        text CHECK (char_length(description) <= 10000),
  asset_id           uuid,
  site_ref           uuid,
  department_id      text CHECK (char_length(department_id) BETWEEN 1 AND 64),
  assigned_to        gigalibs_cmms.principal_ref,
  due_at             timestamptz,
  started_at         timestamptz,
  completed_at       timestamptz,
  cancelled_at       timestamptz,
  requires_signature boolean NOT NULL DEFAULT false,
  signature_data     text CHECK (char_length(signature_data) <= 256000),
  signed_by          gigalibs_cmms.principal_ref,
  completion_notes   text CHECK (char_length(completion_notes) <= 4000),
  estimated_hours    numeric(8, 2) CHECK (estimated_hours > 0 AND estimated_hours <= 10000),
  trigger_source     text NOT NULL DEFAULT 'MANUAL' CHECK (trigger_source IN ('MANUAL', 'PM_SCHEDULE')),
  pm_schedule_id     uuid,
  pm_occurrence_at   timestamptz,
  version            integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by         gigalibs_cmms.principal_ref NOT NULL,
  updated_by         gigalibs_cmms.principal_ref NOT NULL,
  correlation_id     text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT work_orders_number_unique UNIQUE (tenant_id, wo_number),
  CONSTRAINT work_orders_request_key_unique UNIQUE (tenant_id, request_key),
  CONSTRAINT work_orders_pm_occurrence_unique UNIQUE (tenant_id, pm_schedule_id, pm_occurrence_at),
  CONSTRAINT work_orders_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT work_orders_pm_fk FOREIGN KEY (tenant_id, pm_schedule_id)
    REFERENCES gigalibs_cmms.pm_schedules (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT work_orders_completed_state CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL)),
  CONSTRAINT work_orders_cancelled_state CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL)),
  CONSTRAINT work_orders_signature_on_completion
    CHECK (status <> 'COMPLETED' OR NOT requires_signature OR (signature_data IS NOT NULL AND signed_by IS NOT NULL)),
  CONSTRAINT work_orders_pm_source
    CHECK ((trigger_source = 'PM_SCHEDULE') = (pm_schedule_id IS NOT NULL AND pm_occurrence_at IS NOT NULL))
);
CREATE INDEX work_orders_queue ON gigalibs_cmms.work_orders (tenant_id, status, priority, due_at);
CREATE INDEX work_orders_by_asset ON gigalibs_cmms.work_orders (tenant_id, asset_id);
CREATE INDEX work_orders_by_site ON gigalibs_cmms.work_orders (tenant_id, site_ref);

CREATE TABLE gigalibs_cmms.work_order_tasks (
  tenant_id     gigalibs_cmms.tenant_ref NOT NULL,
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL,
  position      integer NOT NULL CHECK (position BETWEEN 1 AND 200),
  label         text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 240),
  required      boolean NOT NULL DEFAULT true,
  status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DONE', 'FAILED', 'NOT_APPLICABLE')),
  result_value  numeric,
  notes         text CHECK (char_length(notes) <= 2000),
  completed_by  gigalibs_cmms.principal_ref,
  completed_at  timestamptz,
  version       integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT work_order_tasks_position_unique UNIQUE (tenant_id, work_order_id, position),
  CONSTRAINT work_order_tasks_wo_fk FOREIGN KEY (tenant_id, work_order_id)
    REFERENCES gigalibs_cmms.work_orders (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT work_order_tasks_completion CHECK ((status = 'PENDING') = (completed_at IS NULL))
);

CREATE TABLE gigalibs_cmms.work_order_labour (
  tenant_id     gigalibs_cmms.tenant_ref NOT NULL,
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL,
  worker_ref    gigalibs_cmms.principal_ref NOT NULL,
  hours         numeric(6, 2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  hourly_rate   numeric(10, 4) CHECK (hourly_rate >= 0),
  currency_code gigalibs_cmms.currency_code,
  time_category text NOT NULL DEFAULT 'REGULAR' CHECK (time_category IN ('REGULAR', 'OVERTIME', 'TRAVEL')),
  performed_on  date NOT NULL,
  notes         text CHECK (char_length(notes) <= 2000),
  created_by    gigalibs_cmms.principal_ref NOT NULL,
  correlation_id text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT work_order_labour_wo_fk FOREIGN KEY (tenant_id, work_order_id)
    REFERENCES gigalibs_cmms.work_orders (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT work_order_labour_rate_currency CHECK (hourly_rate IS NULL OR currency_code IS NOT NULL)
);
CREATE INDEX work_order_labour_by_wo ON gigalibs_cmms.work_order_labour (tenant_id, work_order_id);

CREATE TABLE gigalibs_cmms.work_order_events (
  tenant_id      gigalibs_cmms.tenant_ref NOT NULL,
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  work_order_id  uuid NOT NULL,
  event_type     text NOT NULL CHECK (event_type IN (
    'CREATED', 'UPDATED', 'STATUS_CHANGED', 'TASK_RECORDED', 'LABOUR_LOGGED', 'PART_ISSUED', 'NOTE_ADDED')),
  from_status    text,
  to_status      text,
  actor_subject  gigalibs_cmms.principal_ref NOT NULL,
  details        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  correlation_id text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  occurred_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT work_order_events_wo_fk FOREIGN KEY (tenant_id, work_order_id)
    REFERENCES gigalibs_cmms.work_orders (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX work_order_events_timeline ON gigalibs_cmms.work_order_events (tenant_id, work_order_id, occurred_at DESC);

-- ─── METERS ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE gigalibs_cmms.meters (
  tenant_id      gigalibs_cmms.tenant_ref NOT NULL,
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_id       uuid NOT NULL,
  name           text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  unit           text NOT NULL CHECK (char_length(unit) BETWEEN 1 AND 32),
  reading_type   text NOT NULL DEFAULT 'GAUGE' CHECK (reading_type IN ('GAUGE', 'COUNTER')),
  min_threshold  numeric,
  max_threshold  numeric,
  last_value     numeric,
  last_read_at   timestamptz,
  version        integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by     gigalibs_cmms.principal_ref NOT NULL,
  updated_by     gigalibs_cmms.principal_ref NOT NULL,
  correlation_id text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT meters_name_unique UNIQUE (tenant_id, asset_id, name),
  CONSTRAINT meters_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT meters_threshold_order CHECK (min_threshold IS NULL OR max_threshold IS NULL OR min_threshold <= max_threshold),
  CONSTRAINT meters_latest_pair CHECK ((last_value IS NULL) = (last_read_at IS NULL))
);

CREATE TABLE gigalibs_cmms.meter_readings (
  tenant_id   gigalibs_cmms.tenant_ref NOT NULL,
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  meter_id    uuid NOT NULL,
  value       numeric NOT NULL,
  read_at     timestamptz NOT NULL,
  source      text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL')),
  notes       text CHECK (char_length(notes) <= 2000),
  request_key uuid NOT NULL,
  recorded_by gigalibs_cmms.principal_ref NOT NULL,
  correlation_id text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT meter_readings_request_unique UNIQUE (tenant_id, meter_id, request_key),
  CONSTRAINT meter_readings_meter_fk FOREIGN KEY (tenant_id, meter_id)
    REFERENCES gigalibs_cmms.meters (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX meter_readings_series ON gigalibs_cmms.meter_readings (tenant_id, meter_id, read_at DESC);

-- ─── PARTS AND STOCK LEDGER ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE gigalibs_cmms.parts (
  tenant_id        gigalibs_cmms.tenant_ref NOT NULL,
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  part_number      text NOT NULL CHECK (part_number ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description      text CHECK (char_length(description) <= 4000),
  category         text CHECK (char_length(category) BETWEEN 1 AND 80),
  unit_of_measure  text NOT NULL DEFAULT 'EACH' CHECK (char_length(unit_of_measure) BETWEEN 1 AND 32),
  unit_cost        numeric(12, 4) CHECK (unit_cost >= 0),
  currency_code    gigalibs_cmms.currency_code NOT NULL,
  quantity_on_hand numeric(14, 3) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  min_quantity     numeric(14, 3) NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  reorder_point    numeric(14, 3) CHECK (reorder_point >= 0),
  non_stock        boolean NOT NULL DEFAULT false,
  barcode          text CHECK (char_length(barcode) BETWEEN 1 AND 128),
  site_ref         uuid,
  bin_location     text CHECK (char_length(bin_location) BETWEEN 1 AND 120),
  department_id    text CHECK (char_length(department_id) BETWEEN 1 AND 64),
  archived_at      timestamptz,
  version          integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by       gigalibs_cmms.principal_ref NOT NULL,
  updated_by       gigalibs_cmms.principal_ref NOT NULL,
  correlation_id   text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT parts_number_unique UNIQUE (tenant_id, part_number),
  CONSTRAINT parts_non_stock_balance CHECK (NOT non_stock OR quantity_on_hand = 0)
);
CREATE INDEX parts_by_name ON gigalibs_cmms.parts (tenant_id, name, id) WHERE archived_at IS NULL;

CREATE TABLE gigalibs_cmms.stock_movements (
  tenant_id       gigalibs_cmms.tenant_ref NOT NULL,
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  part_id         uuid NOT NULL,
  movement_type   text NOT NULL CHECK (movement_type IN ('RECEIPT', 'ISSUE', 'RETURN', 'ADJUSTMENT')),
  quantity_delta  numeric(14, 3) NOT NULL CHECK (quantity_delta <> 0),
  balance_after   numeric(14, 3) CHECK (balance_after >= 0),
  work_order_id   uuid,
  unit_cost       numeric(12, 4) CHECK (unit_cost >= 0),
  currency_code   gigalibs_cmms.currency_code NOT NULL,
  reason          text CHECK (char_length(reason) <= 500),
  idempotency_key uuid NOT NULL,
  created_by      gigalibs_cmms.principal_ref NOT NULL,
  correlation_id  text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT stock_movements_idempotency_unique UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT stock_movements_part_fk FOREIGN KEY (tenant_id, part_id)
    REFERENCES gigalibs_cmms.parts (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT stock_movements_wo_fk FOREIGN KEY (tenant_id, work_order_id)
    REFERENCES gigalibs_cmms.work_orders (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT stock_movements_direction CHECK (
    (movement_type IN ('RECEIPT', 'RETURN') AND quantity_delta > 0)
    OR (movement_type = 'ISSUE' AND quantity_delta < 0)
    OR movement_type = 'ADJUSTMENT'),
  CONSTRAINT stock_movements_adjustment_reason CHECK (movement_type <> 'ADJUSTMENT' OR reason IS NOT NULL)
);
CREATE INDEX stock_movements_by_part ON gigalibs_cmms.stock_movements (tenant_id, part_id, created_at DESC);
CREATE INDEX stock_movements_by_wo ON gigalibs_cmms.stock_movements (tenant_id, work_order_id) WHERE work_order_id IS NOT NULL;

-- ─── SECURITY AND DELIVERY FOUNDATION (same shape as Workforce and Geospatial) ───────────────────────────
CREATE TABLE gigalibs_cmms.auth_revocation_events (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  revocation_type VARCHAR(32) NOT NULL CHECK (revocation_type IN ('SESSION', 'SUBJECT_AUTH_VERSION')),
  session_id VARCHAR(128),
  subject_id VARCHAR(128),
  invalid_through_auth_version INTEGER,
  reason VARCHAR(256) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (revocation_type = 'SESSION' AND session_id IS NOT NULL
      AND subject_id IS NULL AND invalid_through_auth_version IS NULL)
    OR
    (revocation_type = 'SUBJECT_AUTH_VERSION' AND session_id IS NULL
      AND subject_id IS NOT NULL AND invalid_through_auth_version IS NOT NULL
      AND invalid_through_auth_version >= 0)
  )
);
CREATE INDEX auth_revocation_events_session_lookup
  ON gigalibs_cmms.auth_revocation_events (tenant_id, session_id) WHERE revocation_type = 'SESSION';
CREATE INDEX auth_revocation_events_subject_lookup
  ON gigalibs_cmms.auth_revocation_events (tenant_id, subject_id, invalid_through_auth_version)
  WHERE revocation_type = 'SUBJECT_AUTH_VERSION';

CREATE TABLE gigalibs_cmms.audit_events (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  actor_subject VARCHAR(128) NOT NULL,
  action VARCHAR(128) NOT NULL,
  entity_type VARCHAR(128) NOT NULL,
  entity_id VARCHAR(128),
  correlation_id VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_tenant_time ON gigalibs_cmms.audit_events (tenant_id, occurred_at DESC);

CREATE TABLE gigalibs_cmms.outbox_events (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  topic VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  aggregate_type VARCHAR(128) NOT NULL,
  aggregate_id VARCHAR(128) NOT NULL,
  aggregate_version INTEGER NOT NULL CHECK (aggregate_version > 0),
  correlation_id VARCHAR(128) NOT NULL,
  causation_id VARCHAR(128),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  payload JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  last_error_code VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, aggregate_type, aggregate_id, aggregate_version, event_type)
);
CREATE INDEX outbox_events_delivery ON gigalibs_cmms.outbox_events (status, available_at, created_at);

-- ─── ROW-LEVEL SECURITY ──────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'assets', 'pm_schedules', 'work_order_counters', 'work_orders', 'work_order_tasks', 'work_order_labour',
    'work_order_events', 'meters', 'meter_readings', 'parts', 'stock_movements', 'auth_revocation_events',
    'audit_events', 'outbox_events'
  ] LOOP
    EXECUTE format('ALTER TABLE gigalibs_cmms.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_cmms.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_cmms.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      relation || '_tenant_isolation',
      relation
    );
  END LOOP;
END
$$;

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (10, '000010_cmms_canonical_core');

COMMIT;
