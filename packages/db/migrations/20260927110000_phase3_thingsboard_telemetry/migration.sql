-- Phase 3 / US-P3-01: ThingsBoard Telemetry Device Bindings & CBM Expansion
-- 1. Update gigalibs_cmms.meter_readings source check constraint
ALTER TABLE gigalibs_cmms.meter_readings
  DROP CONSTRAINT IF EXISTS meter_readings_source_check;

ALTER TABLE gigalibs_cmms.meter_readings
  ADD CONSTRAINT meter_readings_source_check
  CHECK (source = ANY (ARRAY['MANUAL'::text, 'THINGSBOARD'::text, 'IOT_TELEMETRY'::text]));

-- 2. Update gigalibs_cmms.work_orders trigger_source check constraint
ALTER TABLE gigalibs_cmms.work_orders
  DROP CONSTRAINT IF EXISTS work_orders_trigger_source_check;

ALTER TABLE gigalibs_cmms.work_orders
  ADD CONSTRAINT work_orders_trigger_source_check
  CHECK (trigger_source = ANY (ARRAY['MANUAL'::text, 'PM_SCHEDULE'::text, 'CBM_TELEMETRY'::text]));

-- 3. Create gigalibs_cmms.telemetry_device_bindings table
CREATE TABLE IF NOT EXISTS gigalibs_cmms.telemetry_device_bindings (
  tenant_id          gigalibs_cmms.tenant_ref NOT NULL,
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  device_id          text NOT NULL, -- ThingsBoard hardware device ID / token
  device_name        text NOT NULL,
  device_type        text NOT NULL DEFAULT 'SENSOR',
  asset_id           uuid NOT NULL,
  site_ref           uuid, -- Phase 1 Spatial Node ID
  meter_id           uuid,
  telemetry_keys     text[] NOT NULL DEFAULT ARRAY['temperature', 'vibration', 'pressure'],
  is_active          boolean NOT NULL DEFAULT true,
  last_telemetry_at  timestamptz,
  last_payload       jsonb,
  created_by         gigalibs_cmms.principal_ref NOT NULL DEFAULT 'system:thingsboard_bridge',
  updated_by         gigalibs_cmms.principal_ref NOT NULL DEFAULT 'system:thingsboard_bridge',
  correlation_id     text NOT NULL DEFAULT gen_random_uuid()::text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telemetry_device_bindings_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT telemetry_device_bindings_device_unique UNIQUE (tenant_id, device_id),
  CONSTRAINT telemetry_device_bindings_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT
);

-- Enable Row-Level Security on telemetry_device_bindings
ALTER TABLE gigalibs_cmms.telemetry_device_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.telemetry_device_bindings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telemetry_device_bindings_tenant_isolation ON gigalibs_cmms.telemetry_device_bindings;
CREATE POLICY telemetry_device_bindings_tenant_isolation ON gigalibs_cmms.telemetry_device_bindings
  USING (tenant_id::text = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.tenant_id', true), ''));

CREATE INDEX IF NOT EXISTS telemetry_device_bindings_asset_idx ON gigalibs_cmms.telemetry_device_bindings (tenant_id, asset_id);
CREATE INDEX IF NOT EXISTS telemetry_device_bindings_site_idx ON gigalibs_cmms.telemetry_device_bindings (tenant_id, site_ref);
