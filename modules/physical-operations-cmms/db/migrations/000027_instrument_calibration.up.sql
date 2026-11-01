-- WI-OI-134 M-CAL: field instrument calibration as a CMMS extension. Instruments are CMMS assets.
-- Additive: five new tenant-isolated tables and one more work-order origin. Records keep an immutable profile snapshot;
-- only the one-time decision may change a record, and points and standard snapshots are append-only for the runtime
-- role (MODULE_APPEND_ONLY_TABLES). Recovery: empty tables can be dropped by the down migration; with data, keep the
-- tables and roll forward.
BEGIN;

CREATE TABLE gigalibs_cmms.calibration_standards (
  tenant_id          gigalibs_cmms.tenant_ref NOT NULL,
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  code               text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
  name               text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  serial_number      text CHECK (char_length(serial_number) <= 200),
  manufacturer       text CHECK (char_length(manufacturer) <= 200),
  model              text CHECK (char_length(model) <= 200),
  accuracy_statement text CHECK (char_length(accuracy_statement) <= 500),
  certificate_number text NOT NULL CHECK (char_length(certificate_number) BETWEEN 1 AND 120),
  issued_by          text NOT NULL CHECK (char_length(issued_by) BETWEEN 1 AND 200),
  calibrated_on      date NOT NULL,
  valid_until        date NOT NULL,
  status             text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'WITHDRAWN')),
  site_ref           uuid,
  department_id      text CHECK (char_length(department_id) BETWEEN 1 AND 64),
  version            integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by         gigalibs_cmms.principal_ref NOT NULL,
  updated_by         gigalibs_cmms.principal_ref NOT NULL,
  correlation_id     text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT calibration_standards_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT calibration_standards_validity CHECK (valid_until >= calibrated_on)
);

CREATE TABLE gigalibs_cmms.calibration_profiles (
  tenant_id       gigalibs_cmms.tenant_ref NOT NULL,
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_id        uuid NOT NULL,
  revision        integer NOT NULL CHECK (revision > 0),
  status          text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED')),
  input_lrv       numeric(18, 6) NOT NULL,
  input_urv       numeric(18, 6) NOT NULL,
  input_unit      text NOT NULL CHECK (char_length(input_unit) BETWEEN 1 AND 24),
  output_lrv      numeric(18, 6) NOT NULL,
  output_urv      numeric(18, 6) NOT NULL,
  output_unit     text NOT NULL CHECK (char_length(output_unit) BETWEEN 1 AND 24),
  transfer        text NOT NULL CHECK (transfer IN ('LINEAR', 'SQUARE_ROOT')),
  tolerance_mode  text NOT NULL CHECK (tolerance_mode IN ('PERCENT_SPAN', 'ABSOLUTE')),
  tolerance_value numeric(18, 6) NOT NULL CHECK (tolerance_value > 0),
  test_points     numeric(9, 6)[] NOT NULL
    CHECK (cardinality(test_points) BETWEEN 2 AND 21 AND 0 <= ALL (test_points) AND 100 >= ALL (test_points)),
  interval_days   integer NOT NULL CHECK (interval_days BETWEEN 1 AND 3650),
  procedure       text CHECK (char_length(procedure) <= 4000),
  authored_by     gigalibs_cmms.principal_ref NOT NULL,
  last_edited_by  gigalibs_cmms.principal_ref NOT NULL,
  published_by    gigalibs_cmms.principal_ref,
  published_at    timestamptz,
  version         integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by      gigalibs_cmms.principal_ref NOT NULL,
  correlation_id  text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT calibration_profiles_revision_unique UNIQUE (tenant_id, asset_id, revision),
  CONSTRAINT calibration_profiles_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT calibration_profiles_input_range CHECK (input_urv > input_lrv),
  CONSTRAINT calibration_profiles_output_span CHECK (output_urv <> output_lrv),
  CONSTRAINT calibration_profiles_publication
    CHECK ((status = 'DRAFT') = (published_by IS NULL) AND (published_by IS NULL) = (published_at IS NULL)),
  -- Maker-checker: the publisher wrote none of the draft.
  CONSTRAINT calibration_profiles_four_eyes
    CHECK (published_by IS NULL OR (published_by <> authored_by AND published_by <> last_edited_by))
);
CREATE UNIQUE INDEX calibration_profiles_one_published
  ON gigalibs_cmms.calibration_profiles (tenant_id, asset_id) WHERE status = 'PUBLISHED';
CREATE UNIQUE INDEX calibration_profiles_one_draft
  ON gigalibs_cmms.calibration_profiles (tenant_id, asset_id) WHERE status = 'DRAFT';

CREATE TABLE gigalibs_cmms.calibration_records (
  tenant_id                gigalibs_cmms.tenant_ref NOT NULL,
  id                       uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_id                 uuid NOT NULL,
  profile_id               uuid NOT NULL,
  profile_revision         integer NOT NULL CHECK (profile_revision > 0),
  definition               jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  work_order_id            uuid,
  site_ref                 uuid,
  department_id            text CHECK (char_length(department_id) BETWEEN 1 AND 64),
  technician               gigalibs_cmms.principal_ref NOT NULL,
  client_operation_id      uuid NOT NULL,
  request_sha256           text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  started_at               timestamptz NOT NULL,
  completed_at             timestamptz NOT NULL,
  received_at              timestamptz NOT NULL DEFAULT now(),
  status                   text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'APPROVED', 'REJECTED')),
  as_found_result          text NOT NULL CHECK (as_found_result IN ('PASS', 'FAIL')),
  as_left_result           text CHECK (as_left_result IN ('PASS', 'FAIL')),
  overall_result           text NOT NULL CHECK (overall_result IN ('PASS', 'ADJUSTED', 'FAIL')),
  impact_review_required   boolean NOT NULL,
  notes                    text CHECK (char_length(notes) <= 2000),
  technician_statement     text NOT NULL CHECK (char_length(technician_statement) BETWEEN 1 AND 500),
  record_sha256            text NOT NULL CHECK (record_sha256 ~ '^[0-9a-f]{64}$'),
  corrective_work_order_id uuid,
  asset_taken_offline      boolean NOT NULL DEFAULT false,
  decided_by               gigalibs_cmms.principal_ref,
  decided_at               timestamptz,
  decision_note            text CHECK (char_length(decision_note) <= 2000),
  decision_statement       text CHECK (char_length(decision_statement) <= 500),
  version                  integer NOT NULL DEFAULT 1 CHECK (version > 0),
  correlation_id           text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT calibration_records_operation_unique UNIQUE (tenant_id, client_operation_id),
  CONSTRAINT calibration_records_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT calibration_records_profile_fk FOREIGN KEY (tenant_id, profile_id)
    REFERENCES gigalibs_cmms.calibration_profiles (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT calibration_records_work_order_fk FOREIGN KEY (tenant_id, work_order_id)
    REFERENCES gigalibs_cmms.work_orders (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT calibration_records_corrective_fk FOREIGN KEY (tenant_id, corrective_work_order_id)
    REFERENCES gigalibs_cmms.work_orders (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT calibration_records_window CHECK (completed_at >= started_at),
  CONSTRAINT calibration_records_result CHECK (
    (overall_result = 'PASS' AND as_found_result = 'PASS' AND as_left_result IS DISTINCT FROM 'FAIL')
    OR (overall_result = 'ADJUSTED' AND as_found_result = 'FAIL' AND as_left_result = 'PASS')
    OR (overall_result = 'FAIL' AND (as_left_result = 'FAIL' OR (as_found_result = 'FAIL' AND as_left_result IS NULL)))),
  CONSTRAINT calibration_records_impact CHECK (impact_review_required = (as_found_result = 'FAIL')),
  -- A failed instrument is always contained: one corrective work order; it is taken offline only on FAIL.
  CONSTRAINT calibration_records_containment CHECK (
    (overall_result = 'FAIL') = (corrective_work_order_id IS NOT NULL) AND (NOT asset_taken_offline OR overall_result = 'FAIL')),
  CONSTRAINT calibration_records_decision CHECK (
    (status = 'SUBMITTED') = (decided_by IS NULL)
    AND (decided_by IS NULL) = (decided_at IS NULL)
    AND (decided_by IS NULL) = (decision_statement IS NULL)
    AND (status <> 'REJECTED' OR decision_note IS NOT NULL)),
  -- Four eyes: the technician never decides their own record.
  CONSTRAINT calibration_records_four_eyes CHECK (decided_by IS NULL OR decided_by <> technician)
);
CREATE INDEX calibration_records_by_asset
  ON gigalibs_cmms.calibration_records (tenant_id, asset_id, completed_at DESC, id);
CREATE INDEX calibration_records_awaiting
  ON gigalibs_cmms.calibration_records (tenant_id, received_at) WHERE status = 'SUBMITTED';

-- A record's content never changes; only its one decision may be written, once.
CREATE FUNCTION gigalibs_cmms.calibration_records_guard() RETURNS trigger LANGUAGE plpgsql AS $guard$
DECLARE
  decision_columns constant text[] := ARRAY['status', 'decided_by', 'decided_at', 'decision_note',
    'decision_statement', 'version', 'updated_at', 'correlation_id'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'calibration records are never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'calibration record % is already decided', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - decision_columns) IS DISTINCT FROM (to_jsonb(OLD) - decision_columns) THEN
    RAISE EXCEPTION 'calibration record % content is immutable', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$guard$;
CREATE TRIGGER calibration_records_guard BEFORE UPDATE OR DELETE ON gigalibs_cmms.calibration_records
  FOR EACH ROW EXECUTE FUNCTION gigalibs_cmms.calibration_records_guard();

CREATE TABLE gigalibs_cmms.calibration_record_standards (
  tenant_id          gigalibs_cmms.tenant_ref NOT NULL,
  record_id          uuid NOT NULL,
  standard_id        uuid NOT NULL,
  code               text NOT NULL,
  name               text NOT NULL,
  certificate_number text NOT NULL,
  valid_until        date NOT NULL,
  PRIMARY KEY (tenant_id, record_id, standard_id),
  CONSTRAINT calibration_record_standards_record_fk FOREIGN KEY (tenant_id, record_id)
    REFERENCES gigalibs_cmms.calibration_records (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT calibration_record_standards_standard_fk FOREIGN KEY (tenant_id, standard_id)
    REFERENCES gigalibs_cmms.calibration_standards (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE gigalibs_cmms.calibration_points (
  tenant_id          gigalibs_cmms.tenant_ref NOT NULL,
  record_id          uuid NOT NULL,
  phase              text NOT NULL CHECK (phase IN ('AS_FOUND', 'AS_LEFT')),
  position           smallint NOT NULL CHECK (position BETWEEN 0 AND 20),
  nominal_percent    numeric(9, 6) NOT NULL CHECK (nominal_percent BETWEEN 0 AND 100),
  applied_input      numeric(18, 6) NOT NULL,
  expected_output    numeric(18, 6) NOT NULL,
  measured_output    numeric(18, 6) NOT NULL,
  error_absolute     numeric NOT NULL,
  error_percent_span numeric NOT NULL,
  within_tolerance   boolean NOT NULL,
  PRIMARY KEY (tenant_id, record_id, phase, position),
  CONSTRAINT calibration_points_record_fk FOREIGN KEY (tenant_id, record_id)
    REFERENCES gigalibs_cmms.calibration_records (tenant_id, id) ON DELETE RESTRICT
);

DO $rls$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['calibration_standards', 'calibration_profiles', 'calibration_records',
    'calibration_record_standards', 'calibration_points'] LOOP
    EXECUTE format('ALTER TABLE gigalibs_cmms.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE gigalibs_cmms.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_cmms.%I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')) '
      'WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), ''''))',
      'cmms_' || table_name || '_tenant_isolation', table_name);
  END LOOP;
END
$rls$;

ALTER TABLE gigalibs_cmms.work_orders DROP CONSTRAINT work_orders_trigger_source_check;
ALTER TABLE gigalibs_cmms.work_orders ADD CONSTRAINT work_orders_trigger_source_check
  CHECK (trigger_source IN ('MANUAL', 'PM_SCHEDULE', 'METER_TRIGGER', 'ROUND_EXCEPTION', 'CALIBRATION'));

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (27, '000027_instrument_calibration');

COMMIT;
