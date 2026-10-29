-- WI-OI-130: canonical asset_downtimes (re-created after 000010 drop) + IoT/workflow source tracking.
BEGIN;

CREATE TABLE IF NOT EXISTS gigalibs_cmms.asset_downtimes (
  tenant_id        gigalibs_cmms.tenant_ref NOT NULL,
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_id         uuid NOT NULL,
  downtime_type    text NOT NULL DEFAULT 'UNPLANNED'
    CHECK (downtime_type IN ('PLANNED', 'UNPLANNED', 'PROCESS')),
  started_at       timestamptz NOT NULL,
  ended_at         timestamptz,
  duration_hours   numeric(10, 4) NOT NULL DEFAULT 0 CHECK (duration_hours >= 0),
  failure_cause_code text CHECK (char_length(failure_cause_code) <= 80),
  notes            text CHECK (char_length(notes) <= 4000),
  source           text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'IOT_AUTO', 'WORKFLOW')),
  external_alert_id uuid,
  work_order_id    uuid,
  created_by       gigalibs_cmms.principal_ref NOT NULL,
  correlation_id   text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT asset_downtimes_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT asset_downtimes_wo_fk FOREIGN KEY (tenant_id, work_order_id)
    REFERENCES gigalibs_cmms.work_orders (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT asset_downtimes_window CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX IF NOT EXISTS idx_cmms_downtimes_asset ON gigalibs_cmms.asset_downtimes (tenant_id, asset_id, started_at DESC);

ALTER TABLE gigalibs_cmms.asset_downtimes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.asset_downtimes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cmms_asset_downtimes_tenant_isolation ON gigalibs_cmms.asset_downtimes;
CREATE POLICY cmms_asset_downtimes_tenant_isolation ON gigalibs_cmms.asset_downtimes
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (23, '000023_asset_downtime_maasa');

COMMIT;
