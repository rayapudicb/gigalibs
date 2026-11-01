-- WI-OI-135 M-TAG: physical asset tags, field commissioning requests and floor-walk audits (CMMS extension).
-- Additive: four new tenant-isolated tables. Sightings are append-only for the runtime role (MODULE_APPEND_ONLY_TABLES).
-- Recovery: the down migration drops the tables while they are empty; with data, keep them and roll forward.
BEGIN;

CREATE TABLE gigalibs_cmms.asset_physical_tags (
  tenant_id      gigalibs_cmms.tenant_ref NOT NULL,
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_id       uuid NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('NFC', 'RFID', 'DATAMATRIX', 'QR', 'CODE128')),
  value          text NOT NULL CHECK (char_length(value) BETWEEN 1 AND 256 AND value ~ '^[ -~]+$'),
  status         text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RETIRED')),
  bound_by       gigalibs_cmms.principal_ref NOT NULL,
  bound_at       timestamptz NOT NULL DEFAULT now(),
  retired_by     gigalibs_cmms.principal_ref,
  retired_at     timestamptz,
  retire_reason  text CHECK (char_length(retire_reason) BETWEEN 1 AND 500),
  correlation_id text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT asset_physical_tags_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT asset_physical_tags_uid CHECK (kind NOT IN ('NFC', 'RFID') OR value ~ '^[0-9A-F]{4,64}$'),
  CONSTRAINT asset_physical_tags_retirement CHECK (
    (status = 'RETIRED') = (retired_at IS NOT NULL) AND (retired_at IS NULL) = (retired_by IS NULL)
    AND (retired_at IS NULL) = (retire_reason IS NULL))
);
-- One active binding per physical tag; an asset may carry several tags.
CREATE UNIQUE INDEX asset_physical_tags_one_active
  ON gigalibs_cmms.asset_physical_tags (tenant_id, kind, value) WHERE status = 'ACTIVE';
CREATE INDEX asset_physical_tags_by_asset ON gigalibs_cmms.asset_physical_tags (tenant_id, asset_id);

CREATE TABLE gigalibs_cmms.asset_commissioning_requests (
  tenant_id           gigalibs_cmms.tenant_ref NOT NULL,
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  client_operation_id uuid NOT NULL,
  request_sha256      text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  proposed_asset_tag  text NOT NULL CHECK (proposed_asset_tag ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
  name                text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  manufacturer        text CHECK (char_length(manufacturer) BETWEEN 1 AND 200),
  model               text CHECK (char_length(model) BETWEEN 1 AND 200),
  serial_number       text CHECK (char_length(serial_number) BETWEEN 1 AND 200),
  category            text CHECK (char_length(category) BETWEEN 1 AND 80),
  classification_id   uuid,
  parent_asset_id     uuid,
  space_id            uuid,
  site_ref            uuid,
  department_id       text CHECK (char_length(department_id) BETWEEN 1 AND 64),
  latitude            numeric(9, 6) CHECK (latitude BETWEEN -90 AND 90),
  longitude           numeric(9, 6) CHECK (longitude BETWEEN -180 AND 180),
  location_accuracy_m numeric(10, 2) CHECK (location_accuracy_m >= 0),
  specs               jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(specs) = 'object'),
  nameplate_text      text CHECK (char_length(nameplate_text) BETWEEN 1 AND 2000),
  tag_kind            text CHECK (tag_kind IN ('NFC', 'RFID', 'DATAMATRIX', 'QR', 'CODE128')),
  tag_value           text CHECK (char_length(tag_value) BETWEEN 1 AND 256),
  notes               text CHECK (char_length(notes) <= 2000),
  duplicates          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(duplicates) = 'array'),
  status              text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'APPROVED', 'REJECTED')),
  decision            text CHECK (decision IN ('CREATED', 'LINKED', 'REJECTED')),
  submitted_by        gigalibs_cmms.principal_ref NOT NULL,
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  reviewed_by         gigalibs_cmms.principal_ref,
  reviewed_at         timestamptz,
  review_note         text CHECK (char_length(review_note) <= 2000),
  asset_id            uuid,
  version             integer NOT NULL DEFAULT 1 CHECK (version > 0),
  correlation_id      text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT asset_commissioning_operation_unique UNIQUE (tenant_id, client_operation_id),
  CONSTRAINT asset_commissioning_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT asset_commissioning_parent_fk FOREIGN KEY (tenant_id, parent_asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT asset_commissioning_tag_pair CHECK ((tag_kind IS NULL) = (tag_value IS NULL)),
  CONSTRAINT asset_commissioning_location_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CONSTRAINT asset_commissioning_decision CHECK (
    (status = 'SUBMITTED') = (reviewed_by IS NULL)
    AND (reviewed_by IS NULL) = (reviewed_at IS NULL)
    AND (reviewed_by IS NULL) = (decision IS NULL)
    AND (status <> 'APPROVED' OR (decision IN ('CREATED', 'LINKED') AND asset_id IS NOT NULL))
    AND (status <> 'REJECTED' OR (decision = 'REJECTED' AND asset_id IS NULL AND review_note IS NOT NULL))),
  -- Four eyes: the submitter never decides their own request.
  CONSTRAINT asset_commissioning_four_eyes CHECK (reviewed_by IS NULL OR reviewed_by <> submitted_by)
);
CREATE INDEX asset_commissioning_awaiting
  ON gigalibs_cmms.asset_commissioning_requests (tenant_id, submitted_at) WHERE status = 'SUBMITTED';

CREATE TABLE gigalibs_cmms.asset_audit_walks (
  tenant_id           gigalibs_cmms.tenant_ref NOT NULL,
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  client_operation_id uuid NOT NULL,
  label               text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  space_id            uuid,
  site_ref            uuid,
  department_id       text CHECK (char_length(department_id) BETWEEN 1 AND 64),
  status              text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'FINISHED')),
  started_by          gigalibs_cmms.principal_ref NOT NULL,
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz,
  correlation_id      text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT asset_audit_walks_operation_unique UNIQUE (tenant_id, client_operation_id),
  CONSTRAINT asset_audit_walks_target CHECK (space_id IS NOT NULL OR site_ref IS NOT NULL),
  CONSTRAINT asset_audit_walks_finish CHECK ((status = 'FINISHED') = (finished_at IS NOT NULL))
);

CREATE TABLE gigalibs_cmms.asset_audit_sightings (
  tenant_id           gigalibs_cmms.tenant_ref NOT NULL,
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  walk_id             uuid NOT NULL,
  client_operation_id uuid NOT NULL,
  kind                text NOT NULL CHECK (kind IN ('NFC', 'RFID', 'DATAMATRIX', 'QR', 'CODE128')),
  value               text NOT NULL CHECK (char_length(value) BETWEEN 1 AND 256),
  asset_id            uuid,
  space_id            uuid,
  seen_at             timestamptz NOT NULL,
  seen_by             gigalibs_cmms.principal_ref NOT NULL,
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT asset_audit_sightings_operation_unique UNIQUE (tenant_id, client_operation_id),
  CONSTRAINT asset_audit_sightings_walk_fk FOREIGN KEY (tenant_id, walk_id)
    REFERENCES gigalibs_cmms.asset_audit_walks (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT asset_audit_sightings_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX asset_audit_sightings_by_walk ON gigalibs_cmms.asset_audit_sightings (tenant_id, walk_id, seen_at);

DO $rls$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['asset_physical_tags', 'asset_commissioning_requests', 'asset_audit_walks',
    'asset_audit_sightings'] LOOP
    EXECUTE format('ALTER TABLE gigalibs_cmms.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE gigalibs_cmms.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_cmms.%I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')) '
      'WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), ''''))',
      'cmms_' || table_name || '_tenant_isolation', table_name);
  END LOOP;
END
$rls$;

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (28, '000028_asset_tagging_commissioning');

COMMIT;
