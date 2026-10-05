-- WI-EAM-004: Telemetry Ingestion & Meter-Driven PM Triggers (Maximo / openMAINT Parity)

-- 1. Extend meter_readings with telemetry sources and device metadata
-- WI-OI-120a (owner-approved correction, 2026-10-05; never applied to any database before): one transaction,
-- permissive tenant policies with WITH CHECK (RESTRICTIVE-only policies denied every row), principal_ref, and
-- the ledger row the module migration runner requires.

BEGIN;

ALTER TABLE gigalibs_cmms.meter_readings
  DROP CONSTRAINT IF EXISTS meter_readings_source_check;

ALTER TABLE gigalibs_cmms.meter_readings
  ADD CONSTRAINT meter_readings_source_check
  CHECK (source IN ('MANUAL', 'IOT_TELEMETRY', 'CONNECTOR_HUB', 'SCADA'));

ALTER TABLE gigalibs_cmms.meter_readings
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS payload_ref text;

-- 2. Meter Trigger Policies & Condition-Based PM Definitions
CREATE TABLE gigalibs_cmms.cmms_meter_triggers (
  tenant_id            gigalibs_cmms.tenant_ref NOT NULL,
  id                   uuid NOT NULL DEFAULT gen_random_uuid(),
  meter_id             uuid NOT NULL,
  trigger_type         varchar(32) NOT NULL,
  threshold_type       varchar(32),
  threshold_value      numeric,
  interval_value       numeric,
  last_triggered_value numeric,
  last_triggered_at    timestamptz,
  job_plan_id          uuid,
  work_order_title     varchar(200) NOT NULL,
  work_order_priority  varchar(20) NOT NULL DEFAULT 'HIGH',
  is_active            boolean NOT NULL DEFAULT true,
  version              integer NOT NULL DEFAULT 1,
  created_by           gigalibs_cmms.principal_ref NOT NULL,
  updated_by           gigalibs_cmms.principal_ref NOT NULL,
  correlation_id       text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT cmms_meter_triggers_type_check CHECK (trigger_type IN ('THRESHOLD_BREACH', 'USAGE_INTERVAL')),
  CONSTRAINT cmms_meter_triggers_threshold_type_check CHECK (threshold_type IS NULL OR threshold_type IN ('UPPER', 'LOWER', 'OUT_OF_BOUNDS')),
  CONSTRAINT cmms_meter_triggers_priority_check CHECK (work_order_priority IN ('LOW', 'MEDIUM', 'HIGH', 'EMERGENCY')),
  CONSTRAINT cmms_meter_triggers_meter_fk FOREIGN KEY (tenant_id, meter_id)
    REFERENCES gigalibs_cmms.meters (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cmms_meter_triggers_job_plan_fk FOREIGN KEY (tenant_id, job_plan_id)
    REFERENCES gigalibs_cmms.cmms_job_plans (tenant_id, id) ON DELETE SET NULL
);

ALTER TABLE gigalibs_cmms.cmms_meter_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.cmms_meter_triggers FORCE ROW LEVEL SECURITY;

CREATE POLICY cmms_meter_triggers_tenant_isolation ON gigalibs_cmms.cmms_meter_triggers
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref);

CREATE INDEX cmms_meter_triggers_meter_idx ON gigalibs_cmms.cmms_meter_triggers (tenant_id, meter_id);
CREATE INDEX cmms_meter_triggers_active_idx ON gigalibs_cmms.cmms_meter_triggers (tenant_id, is_active);

-- 3. Update work_orders table to support METER_TRIGGER provenance
ALTER TABLE gigalibs_cmms.work_orders
  DROP CONSTRAINT IF EXISTS work_orders_trigger_source_check;

ALTER TABLE gigalibs_cmms.work_orders
  ADD CONSTRAINT work_orders_trigger_source_check
  CHECK (trigger_source IN ('MANUAL', 'PM_SCHEDULE', 'METER_TRIGGER'));

ALTER TABLE gigalibs_cmms.work_orders
  ADD COLUMN IF NOT EXISTS meter_trigger_id uuid,
  ADD CONSTRAINT work_orders_meter_trigger_fk FOREIGN KEY (tenant_id, meter_trigger_id)
    REFERENCES gigalibs_cmms.cmms_meter_triggers (tenant_id, id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS work_orders_meter_trigger_idx ON gigalibs_cmms.work_orders (tenant_id, meter_trigger_id);

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (18, '000018_eam_telemetry_and_meter_triggers');

COMMIT;
