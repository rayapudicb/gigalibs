-- WI-OI-133: module-owned inspection route, execution and offline receipt state.
-- Forward only. Apply after 000001; old readers see no changed column or removed table.
BEGIN;

CREATE TABLE gigalibs_operator_rounds.route_templates (
  id uuid NOT NULL,
  tenant_id varchar(64) NOT NULL,
  request_key uuid NOT NULL,
  request_sha256 char(64) NOT NULL,
  route_code varchar(64) NOT NULL,
  title varchar(200) NOT NULL CHECK (length(btrim(title)) > 0),
  description text,
  revision integer NOT NULL CHECK (revision > 0),
  state varchar(16) NOT NULL CHECK (state IN ('DRAFT','PUBLISHED','RETIRED')),
  owning_unit_id varchar(64),
  site_ref varchar(128),
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(schedule) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  approved_by varchar(128),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, request_key),
  UNIQUE (tenant_id, route_code, revision),
  CHECK ((state = 'DRAFT' AND approved_by IS NULL AND published_at IS NULL)
      OR (state IN ('PUBLISHED','RETIRED') AND approved_by IS NOT NULL AND published_at IS NOT NULL))
);
CREATE UNIQUE INDEX route_one_published_code
  ON gigalibs_operator_rounds.route_templates (tenant_id, route_code) WHERE state = 'PUBLISHED';
CREATE INDEX route_scope_list ON gigalibs_operator_rounds.route_templates
  (tenant_id, owning_unit_id, site_ref, state, updated_at DESC);

CREATE TABLE gigalibs_operator_rounds.checkpoints (
  id uuid NOT NULL,
  tenant_id varchar(64) NOT NULL,
  route_id uuid NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  label varchar(200) NOT NULL CHECK (length(btrim(label)) > 0),
  asset_ref varchar(128) NOT NULL,
  meter_ref varchar(128),
  tag_code varchar(128) NOT NULL,
  proof_mode varchar(16) NOT NULL CHECK (proof_mode IN ('NFC','BARCODE','EITHER')),
  reading_kind varchar(16) NOT NULL CHECK (reading_kind IN ('NUMERIC','CHOICE','BOOLEAN')),
  unit_code varchar(32),
  nominal numeric(18,6),
  amber_low numeric(18,6),
  amber_high numeric(18,6),
  red_low numeric(18,6),
  red_high numeric(18,6),
  choices jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(choices) = 'array'),
  branch_rule jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(branch_rule) = 'array'),
  instructions text,
  photo_on_exception boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, route_id, position),
  FOREIGN KEY (tenant_id, route_id) REFERENCES gigalibs_operator_rounds.route_templates(tenant_id,id),
  CHECK (reading_kind <> 'NUMERIC' OR unit_code IS NOT NULL)
);
CREATE INDEX checkpoint_route_order ON gigalibs_operator_rounds.checkpoints (tenant_id, route_id, position);

CREATE TABLE gigalibs_operator_rounds.assignments (
  id uuid NOT NULL,
  tenant_id varchar(64) NOT NULL,
  request_key uuid NOT NULL,
  request_sha256 char(64) NOT NULL,
  route_id uuid NOT NULL,
  route_revision integer NOT NULL CHECK (route_revision > 0),
  workforce_resource_ref varchar(128) NOT NULL,
  operator_subject varchar(128) NOT NULL,
  owning_unit_id varchar(64),
  site_ref varchar(128),
  scheduled_start timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  state varchar(16) NOT NULL DEFAULT 'ASSIGNED' CHECK (state IN ('ASSIGNED','STARTED','COMPLETED','MISSED','CANCELLED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, request_key),
  FOREIGN KEY (tenant_id, route_id) REFERENCES gigalibs_operator_rounds.route_templates(tenant_id,id),
  CHECK (due_at >= scheduled_start)
);
CREATE INDEX assignment_due ON gigalibs_operator_rounds.assignments
  (tenant_id, operator_subject, state, due_at);

CREATE TABLE gigalibs_operator_rounds.round_runs (
  id uuid NOT NULL,
  tenant_id varchar(64) NOT NULL,
  request_key uuid NOT NULL,
  request_sha256 char(64) NOT NULL,
  assignment_id uuid NOT NULL,
  route_id uuid NOT NULL,
  route_revision integer NOT NULL,
  actor_subject varchar(128) NOT NULL,
  state varchar(16) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (state IN ('IN_PROGRESS','COMPLETE','REJECTED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, request_key),
  UNIQUE (tenant_id, assignment_id),
  FOREIGN KEY (tenant_id, assignment_id) REFERENCES gigalibs_operator_rounds.assignments(tenant_id,id),
  FOREIGN KEY (tenant_id, route_id) REFERENCES gigalibs_operator_rounds.route_templates(tenant_id,id)
);

CREATE TABLE gigalibs_operator_rounds.media_evidence (
  id uuid NOT NULL,
  tenant_id varchar(64) NOT NULL,
  actor_subject varchar(128) NOT NULL,
  storage_key text NOT NULL,
  sha256 char(64) NOT NULL,
  mime_type varchar(128) NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 25000000),
  state varchar(16) NOT NULL CHECK (state IN ('STAGED','COMMITTED','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,storage_key),
  CHECK (state <> 'COMMITTED' OR committed_at IS NOT NULL)
);

CREATE TABLE gigalibs_operator_rounds.readings (
  id uuid NOT NULL,
  tenant_id varchar(64) NOT NULL,
  run_id uuid NOT NULL,
  checkpoint_id uuid NOT NULL,
  client_operation_id uuid NOT NULL,
  captured_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  source varchar(16) NOT NULL CHECK (source = 'MANUAL'),
  proof_method varchar(16) NOT NULL CHECK (proof_method IN ('NFC','BARCODE')),
  scanned_tag varchar(128) NOT NULL,
  numeric_value numeric(18,6),
  choice_value varchar(64),
  status varchar(16) NOT NULL CHECK (status IN ('NORMAL','AMBER','RED')),
  evidence_id uuid,
  actor_subject varchar(128) NOT NULL,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,client_operation_id),
  UNIQUE (tenant_id,run_id,checkpoint_id),
  FOREIGN KEY (tenant_id,run_id) REFERENCES gigalibs_operator_rounds.round_runs(tenant_id,id),
  FOREIGN KEY (tenant_id,checkpoint_id) REFERENCES gigalibs_operator_rounds.checkpoints(tenant_id,id),
  FOREIGN KEY (tenant_id,evidence_id) REFERENCES gigalibs_operator_rounds.media_evidence(tenant_id,id),
  CHECK ((numeric_value IS NOT NULL) <> (choice_value IS NOT NULL))
);
CREATE INDEX reading_route_time ON gigalibs_operator_rounds.readings (tenant_id,run_id,received_at);

CREATE TABLE gigalibs_operator_rounds.exceptions (
  id uuid NOT NULL,
  tenant_id varchar(64) NOT NULL,
  reading_id uuid NOT NULL,
  severity varchar(16) NOT NULL CHECK (severity IN ('AMBER','RED')),
  state varchar(24) NOT NULL CHECK (state IN ('OPEN','ACTION_PENDING','ACTION_ACCEPTED','ACTION_REJECTED','RESOLVED')),
  cmms_request_key uuid,
  cmms_work_order_ref varchar(128),
  refusal_code varchar(128),
  reviewed_by varchar(128),
  review_note text,
  reviewed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,reading_id),
  FOREIGN KEY (tenant_id,reading_id) REFERENCES gigalibs_operator_rounds.readings(tenant_id,id)
);
CREATE INDEX exception_board ON gigalibs_operator_rounds.exceptions (tenant_id,state,created_at DESC);

CREATE TABLE gigalibs_operator_rounds.sync_receipts (
  tenant_id varchar(64) NOT NULL,
  client_operation_id uuid NOT NULL,
  actor_subject varchar(128) NOT NULL,
  request_sha256 char(64) NOT NULL,
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  state varchar(16) NOT NULL CHECK (state IN ('ACCEPTED','CONFLICT','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,client_operation_id)
);

DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'route_templates','checkpoints','assignments','round_runs','media_evidence',
    'readings','exceptions','sync_receipts'
  ] LOOP
    EXECUTE format('ALTER TABLE gigalibs_operator_rounds.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE gigalibs_operator_rounds.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_operator_rounds.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'',true),'''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'',true),''''))',
      relation || '_tenant_isolation', relation
    );
  END LOOP;
END $$;

INSERT INTO gigalibs_operator_rounds.schema_migrations(version,name)
VALUES (2,'000002_rounds_domain');
COMMIT;
