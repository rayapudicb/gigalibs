-- WI-OI-130: IoT Gateway foundation (gigalibs_iot).
BEGIN;

CREATE SCHEMA IF NOT EXISTS gigalibs_iot;

CREATE DOMAIN gigalibs_iot.tenant_ref AS text
  CHECK (VALUE ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$');

CREATE DOMAIN gigalibs_iot.principal_ref AS text
  CHECK (VALUE ~ '^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$');

CREATE TABLE gigalibs_iot.schema_migrations (
  version integer PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE gigalibs_iot.module_tenants (
  tenant_id gigalibs_iot.tenant_ref PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE gigalibs_iot.iot_devices (
  tenant_id           gigalibs_iot.tenant_ref NOT NULL,
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  name                text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  protocol            text NOT NULL CHECK (protocol IN ('MQTT', 'MODBUS_TCP', 'OPC_UA', 'HTTP')),
  protocol_config     jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(protocol_config) = 'object'),
  status              text NOT NULL DEFAULT 'OFFLINE' CHECK (status IN ('ONLINE', 'OFFLINE', 'ALERT')),
  api_key_hint        text NOT NULL CHECK (char_length(api_key_hint) BETWEEN 4 AND 16),
  hmac_secret_hash    text NOT NULL CHECK (char_length(hmac_secret_hash) BETWEEN 32 AND 128),
  last_seen_at        timestamptz,
  battery_pct         numeric(5, 2) CHECK (battery_pct IS NULL OR (battery_pct >= 0 AND battery_pct <= 100)),
  bound_asset_id      uuid,
  bound_asset_tag     text,
  archived_at         timestamptz,
  version             integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by          gigalibs_iot.principal_ref NOT NULL,
  updated_by          gigalibs_iot.principal_ref NOT NULL,
  correlation_id      text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX iot_devices_status ON gigalibs_iot.iot_devices (tenant_id, status);
CREATE INDEX iot_devices_last_seen ON gigalibs_iot.iot_devices (tenant_id, last_seen_at DESC NULLS LAST);

CREATE TABLE gigalibs_iot.iot_sensors (
  tenant_id      gigalibs_iot.tenant_ref NOT NULL,
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  device_id      uuid NOT NULL,
  channel_key    text NOT NULL CHECK (channel_key ~ '^[A-Z0-9_]{2,64}$'),
  metric_type    text NOT NULL CHECK (char_length(metric_type) BETWEEN 1 AND 80),
  unit           text NOT NULL CHECK (char_length(unit) BETWEEN 1 AND 32),
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT iot_sensors_device_fk FOREIGN KEY (tenant_id, device_id)
    REFERENCES gigalibs_iot.iot_devices (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT iot_sensors_channel_unique UNIQUE (tenant_id, device_id, channel_key)
);

CREATE TABLE gigalibs_iot.iot_device_bindings (
  tenant_id        gigalibs_iot.tenant_ref NOT NULL,
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  device_id        uuid NOT NULL,
  sensor_id        uuid NOT NULL,
  cmms_meter_id    uuid NOT NULL,
  cmms_asset_id    uuid NOT NULL,
  confirmed_by     gigalibs_iot.principal_ref NOT NULL,
  confirmed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT iot_bindings_device_fk FOREIGN KEY (tenant_id, device_id)
    REFERENCES gigalibs_iot.iot_devices (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT iot_bindings_sensor_fk FOREIGN KEY (tenant_id, sensor_id)
    REFERENCES gigalibs_iot.iot_sensors (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT iot_bindings_sensor_unique UNIQUE (tenant_id, sensor_id)
);

CREATE TABLE gigalibs_iot.iot_telemetry_raw (
  tenant_id       gigalibs_iot.tenant_ref NOT NULL,
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  device_id       uuid NOT NULL,
  sensor_id       uuid,
  channel_key     text NOT NULL,
  value           numeric NOT NULL,
  unit            text,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 128),
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT iot_telemetry_device_fk FOREIGN KEY (tenant_id, device_id)
    REFERENCES gigalibs_iot.iot_devices (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT iot_telemetry_idemp UNIQUE (tenant_id, device_id, idempotency_key)
);
CREATE INDEX iot_telemetry_series ON gigalibs_iot.iot_telemetry_raw (tenant_id, device_id, read_at DESC);

CREATE TABLE gigalibs_iot.iot_condition_rules (
  tenant_id          gigalibs_iot.tenant_ref NOT NULL,
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  name               text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  metric_type        text NOT NULL,
  condition_type     text NOT NULL CHECK (condition_type IN ('THRESHOLD', 'RATE_OF_CHANGE', 'CONSECUTIVE_READINGS')),
  threshold_value    numeric NOT NULL,
  threshold_unit     text NOT NULL,
  severity           text NOT NULL CHECK (severity IN ('WARNING', 'CRITICAL')),
  scope_mode         text NOT NULL DEFAULT 'ALL' CHECK (scope_mode IN ('ALL', 'ASSET', 'CLASSIFICATION')),
  scope_asset_id     uuid,
  scope_classification text,
  consecutive_count  integer CHECK (consecutive_count IS NULL OR consecutive_count BETWEEN 1 AND 100),
  window_ms          integer CHECK (window_ms IS NULL OR window_ms BETWEEN 1000 AND 86400000),
  enabled            boolean NOT NULL DEFAULT true,
  version            integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by         gigalibs_iot.principal_ref NOT NULL,
  updated_by         gigalibs_iot.principal_ref NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE gigalibs_iot.iot_alerts (
  tenant_id        gigalibs_iot.tenant_ref NOT NULL,
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  device_id        uuid NOT NULL,
  rule_id          uuid,
  severity         text NOT NULL CHECK (severity IN ('WARNING', 'CRITICAL', 'INFO')),
  metric_type      text NOT NULL,
  observed_value   numeric NOT NULL,
  threshold_value  numeric,
  status           text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED')),
  cmms_asset_id    uuid,
  cmms_asset_tag   text,
  work_order_id    uuid,
  triggered_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT iot_alerts_device_fk FOREIGN KEY (tenant_id, device_id)
    REFERENCES gigalibs_iot.iot_devices (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX iot_alerts_feed ON gigalibs_iot.iot_alerts (tenant_id, triggered_at DESC);

CREATE TABLE gigalibs_iot.protocol_adapters (
  tenant_id     gigalibs_iot.tenant_ref NOT NULL,
  adapter_key   text NOT NULL CHECK (adapter_key IN ('MQTT', 'MODBUS_TCP', 'OPC_UA', 'HTTP_COAP', 'LORAWAN')),
  status        text NOT NULL DEFAULT 'STANDBY' CHECK (status IN ('ONLINE', 'OFFLINE', 'STOPPED', 'STANDBY')),
  device_count  integer NOT NULL DEFAULT 0 CHECK (device_count >= 0),
  config        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, adapter_key)
);

CREATE TABLE gigalibs_iot.discovery_scans (
  tenant_id    gigalibs_iot.tenant_ref NOT NULL,
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  subnet_cidr  text NOT NULL,
  status       text NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
  results      jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(results) = 'array'),
  scanned_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE gigalibs_iot.audit_events (
  tenant_id     gigalibs_iot.tenant_ref NOT NULL,
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_subject gigalibs_iot.principal_ref NOT NULL,
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     uuid NOT NULL,
  correlation_id text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE gigalibs_iot.outbox_events (
  tenant_id          gigalibs_iot.tenant_ref NOT NULL,
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  topic              text NOT NULL,
  event_type         text NOT NULL,
  aggregate_type     text NOT NULL,
  aggregate_id       uuid NOT NULL,
  aggregate_version  integer NOT NULL,
  correlation_id     text NOT NULL,
  schema_version     integer NOT NULL DEFAULT 1,
  payload            jsonb NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

INSERT INTO gigalibs_iot.schema_migrations (version, name)
VALUES (1, '000001_iot_foundation');

COMMIT;
