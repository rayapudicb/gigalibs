-- WI-OI-141 M-INC: frontline hazard, near-miss and incident reports (ADR-0036). Forward-only and additive.
--
-- Reports are triaged by someone other than the reporter; a STOP_WORK report raises one alert, acknowledged by each
-- person once (append-only) and lifted with a reason by someone other than the reporter. Photos are append-only.
-- Every table carries forced RLS on app.tenant_id.

BEGIN;

CREATE TABLE gigalibs_safety_operations.hazard_counters (
  tenant_id VARCHAR(64) PRIMARY KEY,
  last_value BIGINT NOT NULL CHECK (last_value > 0)
);

CREATE TABLE gigalibs_safety_operations.hazard_reports (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  reference VARCHAR(16) NOT NULL CHECK (reference ~ '^HZ-[0-9]{6,}$'),
  client_operation_id UUID NOT NULL,
  payload_sha256 CHAR(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  severity VARCHAR(24) NOT NULL CHECK (severity IN ('GOOD_CATCH', 'UNSAFE_CONDITION', 'STOP_WORK')),
  category VARCHAR(32) NOT NULL CHECK (category IN ('SLIP_TRIP_FALL', 'LEAK_SPILL', 'ELECTRICAL', 'MACHINE_GUARDING',
    'PINCH_POINT', 'CHEMICAL', 'FIRE', 'ERGONOMIC', 'VEHICLE', 'WORKING_AT_HEIGHT', 'OTHER')),
  description VARCHAR(2000) NOT NULL CHECK (char_length(btrim(description)) > 0),
  area VARCHAR(200) NOT NULL CHECK (char_length(btrim(area)) > 0),
  site_ref UUID,
  asset_ref UUID,
  reported_by VARCHAR(128) NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  triage_due_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'REPORTED' CHECK (status IN ('REPORTED', 'TRIAGED', 'CLOSED')),
  likelihood SMALLINT CHECK (likelihood BETWEEN 1 AND 5),
  consequence SMALLINT CHECK (consequence BETWEEN 1 AND 5),
  route VARCHAR(16) CHECK (route IN ('MAINTENANCE', 'TRAINING', 'INVESTIGATION', 'RESOLVED')),
  triaged_by VARCHAR(128),
  triaged_at TIMESTAMPTZ,
  triage_note VARCHAR(2000),
  resolution VARCHAR(2000),
  closed_by VARCHAR(128),
  closed_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  correlation_id VARCHAR(128) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, reference),
  UNIQUE (tenant_id, reported_by, client_operation_id),
  CHECK (observed_at <= received_at + interval '5 minutes'),
  CHECK (triage_due_at >= received_at),
  -- A triage is a rating, a route, its author and its time, together; a report past REPORTED has one.
  CHECK ((status = 'REPORTED') = (triaged_by IS NULL)),
  CHECK ((triaged_by IS NULL) = (likelihood IS NULL) AND (triaged_by IS NULL) = (consequence IS NULL)
    AND (triaged_by IS NULL) = (route IS NULL) AND (triaged_by IS NULL) = (triaged_at IS NULL)),
  CHECK ((status = 'CLOSED') = (closed_by IS NOT NULL) AND (closed_by IS NULL) = (closed_at IS NULL)
    AND (closed_by IS NULL) = (resolution IS NULL)),
  -- An independent evaluation: the reporter does not triage their own report.
  CHECK (triaged_by IS NULL OR triaged_by <> reported_by)
);
CREATE INDEX hazard_reports_tenant_received ON gigalibs_safety_operations.hazard_reports (tenant_id, received_at DESC);
CREATE INDEX hazard_reports_reporter ON gigalibs_safety_operations.hazard_reports (tenant_id, reported_by, received_at DESC);

CREATE TABLE gigalibs_safety_operations.hazard_photos (
  report_id UUID PRIMARY KEY REFERENCES gigalibs_safety_operations.hazard_reports (id) ON DELETE RESTRICT,
  tenant_id VARCHAR(64) NOT NULL,
  content_type VARCHAR(16) NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  bytes BYTEA NOT NULL CHECK (octet_length(bytes) BETWEEN 16 AND 307200),
  sha256 CHAR(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$')
);

CREATE TABLE gigalibs_safety_operations.stop_work_alerts (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  report_id UUID NOT NULL UNIQUE REFERENCES gigalibs_safety_operations.hazard_reports (id) ON DELETE RESTRICT,
  area VARCHAR(200) NOT NULL,
  status VARCHAR(8) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'LIFTED')),
  raised_by VARCHAR(128) NOT NULL,
  raised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lifted_by VARCHAR(128),
  lifted_at TIMESTAMPTZ,
  lift_reason VARCHAR(1000),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  correlation_id VARCHAR(128) NOT NULL,
  CHECK ((status = 'LIFTED') = (lifted_by IS NOT NULL) AND (lifted_by IS NULL) = (lifted_at IS NULL)
    AND (lifted_by IS NULL) = (lift_reason IS NULL)),
  -- Whoever stopped the work does not restart it alone.
  CHECK (lifted_by IS NULL OR lifted_by <> raised_by)
);
CREATE INDEX stop_work_alerts_open ON gigalibs_safety_operations.stop_work_alerts (tenant_id, raised_at DESC) WHERE status = 'OPEN';

CREATE TABLE gigalibs_safety_operations.stop_work_acknowledgements (
  alert_id UUID NOT NULL REFERENCES gigalibs_safety_operations.stop_work_alerts (id) ON DELETE RESTRICT,
  tenant_id VARCHAR(64) NOT NULL,
  subject VARCHAR(128) NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_id, subject)
);

CREATE TABLE gigalibs_safety_operations.hazard_investigations (
  report_id UUID PRIMARY KEY REFERENCES gigalibs_safety_operations.hazard_reports (id) ON DELETE RESTRICT,
  tenant_id VARCHAR(64) NOT NULL,
  whys JSONB NOT NULL CHECK (jsonb_typeof(whys) = 'array' AND jsonb_array_length(whys) BETWEEN 1 AND 5),
  root_cause VARCHAR(1000) NOT NULL CHECK (char_length(btrim(root_cause)) > 0),
  contributing_factors JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(contributing_factors) = 'array' AND jsonb_array_length(contributing_factors) <= 10),
  investigator VARCHAR(128) NOT NULL,
  completed_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  correlation_id VARCHAR(128) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE
  relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['hazard_counters', 'hazard_reports', 'hazard_photos', 'stop_work_alerts',
    'stop_work_acknowledgements', 'hazard_investigations'] LOOP
    EXECUTE format('ALTER TABLE gigalibs_safety_operations.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_safety_operations.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_safety_operations.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      relation || '_tenant_isolation',
      relation
    );
  END LOOP;
END
$$;

INSERT INTO gigalibs_safety_operations.schema_migrations (version, name)
VALUES (2, '000002_hazard_reports');

COMMIT;
