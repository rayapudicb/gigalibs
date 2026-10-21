-- SPEED foundation (WI-OI-120bw, SPEED S3; plan v1.4 §4.2). Forward-only; structure only, no business rows.
--
-- Projects, the module-local organization replica (sites come from it), the dispatcher's idempotency records and the
-- audit, outbox and revocation tables every module on the SDK uses. Every table carries forced RLS on app.tenant_id.
-- The module migration runner enforces append-only and read-only tables (MODULE_APPEND_ONLY_TABLES,
-- MODULE_READ_ONLY_TABLES) and the least-privilege runtime role.

BEGIN;

CREATE SCHEMA IF NOT EXISTS gigalibs_speed;

CREATE TABLE IF NOT EXISTS gigalibs_speed.schema_migrations (
  version    bigint PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK (version > 0),
  CHECK (char_length(name) BETWEEN 1 AND 200)
);

-- A project belongs to one site (an organization unit that holds records). Archived, never deleted (GxP).
CREATE TABLE gigalibs_speed.projects (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  request_key uuid NOT NULL,
  code varchar(40) NOT NULL CHECK (char_length(btrim(code)) > 0 AND code = btrim(code)),
  name varchar(200) NOT NULL CHECK (char_length(btrim(name)) > 0),
  site_unit_id varchar(64) NOT NULL,
  owner_subject varchar(128) NOT NULL CHECK (char_length(btrim(owner_subject)) > 0),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 4000),
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_by varchar(128),
  archived_at timestamptz,
  UNIQUE (tenant_id, request_key),
  CHECK ((status = 'ARCHIVED') = (archived_at IS NOT NULL AND archived_by IS NOT NULL))
);
CREATE UNIQUE INDEX projects_tenant_code ON gigalibs_speed.projects (tenant_id, lower(code));
CREATE INDEX projects_tenant_site ON gigalibs_speed.projects (tenant_id, site_unit_id, status);
CREATE INDEX projects_tenant_updated ON gigalibs_speed.projects (tenant_id, updated_at DESC, id);

CREATE FUNCTION gigalibs_speed.refuse_project_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'SPEED projects are archived, never deleted' USING ERRCODE = '55000';
END $$;
CREATE TRIGGER projects_never_deleted BEFORE DELETE ON gigalibs_speed.projects
FOR EACH ROW EXECUTE FUNCTION gigalibs_speed.refuse_project_delete();

-- Idempotency-Key results of the module SDK's record dispatcher (WI-OI-120f).
CREATE TABLE gigalibs_speed.record_idempotency (
  tenant_id varchar(64) NOT NULL,
  idempotency_key uuid NOT NULL,
  operation varchar(200) NOT NULL,
  request_hash char(64) NOT NULL,
  state varchar(16) NOT NULL CHECK (state IN ('IN_PROGRESS', 'COMPLETED')),
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, idempotency_key),
  CHECK ((state = 'COMPLETED') = (completed_at IS NOT NULL))
);
CREATE INDEX record_idempotency_created ON gigalibs_speed.record_idempotency (created_at);

CREATE TABLE gigalibs_speed.auth_revocation_events (
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
      AND subject_id IS NOT NULL AND invalid_through_auth_version IS NOT NULL)
  )
);
CREATE INDEX auth_revocation_events_session_lookup
  ON gigalibs_speed.auth_revocation_events (tenant_id, session_id) WHERE revocation_type = 'SESSION';
CREATE INDEX auth_revocation_events_subject_lookup
  ON gigalibs_speed.auth_revocation_events (tenant_id, subject_id, invalid_through_auth_version)
  WHERE revocation_type = 'SUBJECT_AUTH_VERSION';

-- Every change: who, when, which fields changed from what to what, and the reason (FR-AUD-01). S2 adds the
-- platform's field-level audit; this table stays the module's evidence.
CREATE TABLE gigalibs_speed.audit_events (
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
CREATE INDEX audit_events_tenant_time ON gigalibs_speed.audit_events (tenant_id, occurred_at DESC);
CREATE INDEX audit_events_tenant_entity ON gigalibs_speed.audit_events (tenant_id, entity_type, entity_id, occurred_at DESC);

CREATE TABLE gigalibs_speed.outbox_events (
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
CREATE INDEX outbox_events_delivery ON gigalibs_speed.outbox_events (status, available_at, created_at);

-- WI-OI-109 module-local organization replica. It is populated only by signed kernel module.call jobs.
CREATE TABLE gigalibs_speed.org_replica_versions (
  tenant_id varchar(64) NOT NULL, version_id varchar(64) NOT NULL, tree_id varchar(64) NOT NULL,
  tree_kind varchar(16) NOT NULL CHECK (tree_kind IN ('PRIMARY','ALTERNATE')),
  version_number integer NOT NULL CHECK (version_number > 0),
  checksum char(71) NOT NULL CHECK (checksum ~ '^sha256:[0-9a-f]{64}$'),
  status varchar(16) NOT NULL DEFAULT 'RECEIVING' CHECK (status IN ('RECEIVING','READY')),
  unit_count integer CHECK (unit_count >= 0), received_at timestamptz NOT NULL DEFAULT now(), ready_at timestamptz,
  PRIMARY KEY (tenant_id, version_id),
  CHECK ((status = 'READY') = (ready_at IS NOT NULL AND unit_count IS NOT NULL))
);
CREATE TABLE gigalibs_speed.org_replica_units (
  tenant_id varchar(64) NOT NULL, version_id varchar(64) NOT NULL, unit_id varchar(64) NOT NULL,
  parent_unit_id varchar(64), code varchar(64) NOT NULL, name varchar(200) NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order >= 0), status varchar(16) NOT NULL CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
  holds_records boolean NOT NULL, type_code varchar(40) NOT NULL,
  PRIMARY KEY (tenant_id, version_id, unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_speed.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE,
  CHECK (parent_unit_id IS NULL OR parent_unit_id <> unit_id)
);
CREATE TABLE gigalibs_speed.org_replica_closure (
  tenant_id varchar(64) NOT NULL, version_id varchar(64) NOT NULL,
  ancestor_unit_id varchar(64) NOT NULL, descendant_unit_id varchar(64) NOT NULL,
  depth smallint NOT NULL CHECK (depth BETWEEN 0 AND 16),
  PRIMARY KEY (tenant_id, version_id, ancestor_unit_id, descendant_unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_speed.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE
);
CREATE INDEX org_replica_descendant ON gigalibs_speed.org_replica_closure (tenant_id, version_id, descendant_unit_id);

DO $$
DECLARE
  relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'projects', 'record_idempotency', 'auth_revocation_events', 'audit_events', 'outbox_events',
    'org_replica_versions', 'org_replica_units', 'org_replica_closure'
  ] LOOP
    EXECUTE format('ALTER TABLE gigalibs_speed.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_speed.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_speed.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      relation || '_tenant_isolation',
      relation
    );
  END LOOP;
END
$$;

INSERT INTO gigalibs_speed.schema_migrations (version, name)
VALUES (1, '000001_speed_foundation');

COMMIT;
