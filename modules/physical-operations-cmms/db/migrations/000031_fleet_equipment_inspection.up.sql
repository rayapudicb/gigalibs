-- WI-OI-139 M-DVIR: fleet and heavy-equipment pre-trip inspection (CMMS extension). Additive: six new tenant-isolated
-- tables and one more work-order origin. Inspections, their results and photos are append-only for the runtime role;
-- a grounding (red tag) is cleared only by a supervisor who did not certify its repair. Recovery: the down migration
-- drops the tables while empty and restores the origin list; otherwise roll forward.
BEGIN;

CREATE TABLE gigalibs_cmms.fleet_check_templates (
  tenant_id         gigalibs_cmms.tenant_ref NOT NULL,
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  code              text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
  name              text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  revision          integer NOT NULL CHECK (revision > 0),
  status            text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'RETIRED')),
  classification_id uuid,
  zones             jsonb NOT NULL CHECK (jsonb_typeof(zones) = 'array' AND jsonb_array_length(zones) BETWEEN 1 AND 12),
  authored_by       gigalibs_cmms.principal_ref NOT NULL,
  published_by      gigalibs_cmms.principal_ref,
  published_at      timestamptz,
  version           integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by        gigalibs_cmms.principal_ref NOT NULL,
  correlation_id    text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT fleet_check_templates_revision_unique UNIQUE (tenant_id, code, revision),
  CONSTRAINT fleet_check_templates_classification_fk FOREIGN KEY (tenant_id, classification_id)
    REFERENCES gigalibs_cmms.cmms_asset_classifications (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fleet_check_templates_publication
    CHECK ((status = 'DRAFT') = (published_by IS NULL) AND (published_by IS NULL) = (published_at IS NULL))
);
CREATE UNIQUE INDEX fleet_check_templates_one_draft ON gigalibs_cmms.fleet_check_templates (tenant_id, code) WHERE status = 'DRAFT';
CREATE UNIQUE INDEX fleet_check_templates_one_published ON gigalibs_cmms.fleet_check_templates (tenant_id, code) WHERE status = 'PUBLISHED';

CREATE TABLE gigalibs_cmms.fleet_enrollments (
  tenant_id           gigalibs_cmms.tenant_ref NOT NULL,
  asset_id            uuid NOT NULL,
  template_code       text NOT NULL CHECK (template_code ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
  interval_hours      integer NOT NULL DEFAULT 24 CHECK (interval_hours BETWEEN 1 AND 168),
  required_credential text CHECK (char_length(required_credential) BETWEEN 1 AND 64),
  enrolled_by         gigalibs_cmms.principal_ref NOT NULL,
  version             integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by          gigalibs_cmms.principal_ref NOT NULL,
  correlation_id      text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, asset_id),
  CONSTRAINT fleet_enrollments_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE gigalibs_cmms.fleet_inspections (
  tenant_id           gigalibs_cmms.tenant_ref NOT NULL,
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  client_operation_id uuid NOT NULL,
  payload_sha256      text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  asset_id            uuid NOT NULL,
  template_id         uuid NOT NULL,
  kind                text NOT NULL CHECK (kind IN ('PRE_TRIP', 'POST_TRIP')),
  inspected_by        gigalibs_cmms.principal_ref NOT NULL,
  started_at          timestamptz NOT NULL,
  submitted_at        timestamptz NOT NULL,
  received_at         timestamptz NOT NULL DEFAULT now(),
  meter_reading       numeric CHECK (meter_reading >= 0),
  result              text NOT NULL CHECK (result IN ('PASS', 'DEFECTS', 'GROUNDED')),
  minor_count         integer NOT NULL CHECK (minor_count >= 0),
  critical_count      integer NOT NULL CHECK (critical_count >= 0),
  request_id          uuid,
  site_ref            uuid,
  department_id       text CHECK (char_length(department_id) BETWEEN 1 AND 64),
  certified           boolean NOT NULL CHECK (certified),
  correlation_id      text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT fleet_inspections_operation_unique UNIQUE (tenant_id, client_operation_id),
  CONSTRAINT fleet_inspections_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fleet_inspections_template_fk FOREIGN KEY (tenant_id, template_id)
    REFERENCES gigalibs_cmms.fleet_check_templates (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fleet_inspections_request_fk FOREIGN KEY (tenant_id, request_id)
    REFERENCES gigalibs_cmms.maintenance_requests (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fleet_inspections_times CHECK (started_at <= submitted_at),
  -- The result follows the defects: critical grounds, minor only is DEFECTS (and raises a request), none is PASS.
  CONSTRAINT fleet_inspections_result CHECK (
    (result = 'GROUNDED') = (critical_count > 0) AND
    (result = 'DEFECTS') = (critical_count = 0 AND minor_count > 0)),
  CONSTRAINT fleet_inspections_request CHECK ((minor_count > 0) = (request_id IS NOT NULL))
);
CREATE INDEX fleet_inspections_asset_time ON gigalibs_cmms.fleet_inspections (tenant_id, asset_id, submitted_at DESC);

CREATE TABLE gigalibs_cmms.fleet_inspection_results (
  tenant_id     gigalibs_cmms.tenant_ref NOT NULL,
  inspection_id uuid NOT NULL,
  item_key      text NOT NULL CHECK (item_key ~ '^[a-z][a-z0-9-]{0,31}$'),
  zone_key      text NOT NULL CHECK (zone_key ~ '^[a-z][a-z0-9-]{0,31}$'),
  position      integer NOT NULL CHECK (position >= 0),
  outcome       text NOT NULL CHECK (outcome IN ('PASS', 'MINOR', 'CRITICAL', 'NA')),
  note          text CHECK (char_length(note) BETWEEN 1 AND 1000),
  PRIMARY KEY (tenant_id, inspection_id, item_key),
  CONSTRAINT fleet_inspection_results_inspection_fk FOREIGN KEY (tenant_id, inspection_id)
    REFERENCES gigalibs_cmms.fleet_inspections (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fleet_inspection_results_note CHECK ((outcome IN ('MINOR', 'CRITICAL')) = (note IS NOT NULL))
);

CREATE TABLE gigalibs_cmms.fleet_inspection_photos (
  tenant_id     gigalibs_cmms.tenant_ref NOT NULL,
  inspection_id uuid NOT NULL,
  item_key      text NOT NULL,
  content_type  text NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  bytes         bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 16 AND 307200),
  sha256        text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (tenant_id, inspection_id, item_key),
  CONSTRAINT fleet_inspection_photos_result_fk FOREIGN KEY (tenant_id, inspection_id, item_key)
    REFERENCES gigalibs_cmms.fleet_inspection_results (tenant_id, inspection_id, item_key) ON DELETE RESTRICT
);

CREATE TABLE gigalibs_cmms.fleet_groundings (
  tenant_id           gigalibs_cmms.tenant_ref NOT NULL,
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_id            uuid NOT NULL,
  source              text NOT NULL CHECK (source IN ('INSPECTION', 'MANUAL')),
  inspection_id       uuid,
  client_operation_id uuid,
  reason              text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 4000),
  status              text NOT NULL DEFAULT 'GROUNDED' CHECK (status IN ('GROUNDED', 'REPAIRED', 'CLEARED')),
  grounded_by         gigalibs_cmms.principal_ref NOT NULL,
  grounded_at         timestamptz NOT NULL DEFAULT now(),
  work_order_id       uuid,
  asset_taken_offline boolean NOT NULL DEFAULT false,
  corrective_action   text CHECK (char_length(corrective_action) BETWEEN 1 AND 2000),
  certified_by        gigalibs_cmms.principal_ref,
  certified_at        timestamptz,
  cleared_by          gigalibs_cmms.principal_ref,
  cleared_at          timestamptz,
  clearance_note      text CHECK (char_length(clearance_note) BETWEEN 1 AND 2000),
  override            boolean NOT NULL DEFAULT false,
  site_ref            uuid,
  department_id       text CHECK (char_length(department_id) BETWEEN 1 AND 64),
  version             integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by          gigalibs_cmms.principal_ref NOT NULL,
  correlation_id      text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT fleet_groundings_operation_unique UNIQUE (tenant_id, client_operation_id),
  CONSTRAINT fleet_groundings_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fleet_groundings_inspection_fk FOREIGN KEY (tenant_id, inspection_id)
    REFERENCES gigalibs_cmms.fleet_inspections (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fleet_groundings_work_order_fk FOREIGN KEY (tenant_id, work_order_id)
    REFERENCES gigalibs_cmms.work_orders (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fleet_groundings_source CHECK (
    (source = 'INSPECTION') = (inspection_id IS NOT NULL) AND (source = 'MANUAL') = (client_operation_id IS NOT NULL)),
  -- A repair certificate is a corrective action, its certifier and time, together.
  CONSTRAINT fleet_groundings_certificate CHECK (
    (certified_by IS NULL) = (certified_at IS NULL) AND (certified_by IS NULL) = (corrective_action IS NULL)),
  CONSTRAINT fleet_groundings_lifecycle CHECK (
    (status = 'GROUNDED' AND certified_by IS NULL AND cleared_by IS NULL) OR
    (status = 'REPAIRED' AND certified_by IS NOT NULL AND cleared_by IS NULL) OR
    (status = 'CLEARED' AND cleared_by IS NOT NULL AND cleared_at IS NOT NULL AND (certified_by IS NOT NULL OR override))),
  -- Four eyes: whoever clears a repair did not certify it; an override (no certificate) carries its reason.
  CONSTRAINT fleet_groundings_four_eyes CHECK (cleared_by IS NULL OR certified_by IS NULL OR cleared_by <> certified_by),
  CONSTRAINT fleet_groundings_override CHECK (NOT override OR (certified_by IS NULL AND clearance_note IS NOT NULL))
);
CREATE UNIQUE INDEX fleet_groundings_one_open ON gigalibs_cmms.fleet_groundings (tenant_id, asset_id) WHERE status <> 'CLEARED';
CREATE UNIQUE INDEX fleet_groundings_one_per_inspection ON gigalibs_cmms.fleet_groundings (tenant_id, inspection_id)
  WHERE inspection_id IS NOT NULL;

DO $rls$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['fleet_check_templates', 'fleet_enrollments', 'fleet_inspections',
    'fleet_inspection_results', 'fleet_inspection_photos', 'fleet_groundings'] LOOP
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
  CHECK (trigger_source IN ('MANUAL', 'PM_SCHEDULE', 'METER_TRIGGER', 'ROUND_EXCEPTION', 'CALIBRATION', 'FLEET_DEFECT'));

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (31, '000031_fleet_equipment_inspection');

COMMIT;
