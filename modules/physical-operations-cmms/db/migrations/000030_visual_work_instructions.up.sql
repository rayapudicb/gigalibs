-- WI-OI-138 M-SOP: visual maintenance work instructions (CMMS extension). Additive: six new tenant-isolated tables.
-- Step results keep their content (trigger); only a countersign by another user may follow. Photos and step images are
-- bounded rasters checked by the service. Recovery: the down migration drops the tables while empty; else roll forward.
BEGIN;

CREATE TABLE gigalibs_cmms.sop_procedures (
  tenant_id       gigalibs_cmms.tenant_ref NOT NULL,
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  code            text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
  title           text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  revision        integer NOT NULL CHECK (revision > 0),
  status          text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'SUPERSEDED', 'WITHDRAWN')),
  job_plan_id     uuid,
  safety_critical boolean NOT NULL DEFAULT false,
  steps           jsonb NOT NULL CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) BETWEEN 1 AND 100),
  authored_by     gigalibs_cmms.principal_ref NOT NULL,
  last_edited_by  gigalibs_cmms.principal_ref NOT NULL,
  submitted_by    gigalibs_cmms.principal_ref,
  approved_by     gigalibs_cmms.principal_ref,
  approved_at     timestamptz,
  review_note     text CHECK (char_length(review_note) <= 2000),
  version         integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by      gigalibs_cmms.principal_ref NOT NULL,
  correlation_id  text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT sop_procedures_revision_unique UNIQUE (tenant_id, code, revision),
  CONSTRAINT sop_procedures_job_plan_fk FOREIGN KEY (tenant_id, job_plan_id)
    REFERENCES gigalibs_cmms.cmms_job_plans (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT sop_procedures_review CHECK ((status = 'DRAFT') OR submitted_by IS NOT NULL),
  CONSTRAINT sop_procedures_approval
    CHECK ((status IN ('PUBLISHED', 'SUPERSEDED', 'WITHDRAWN')) = (approved_by IS NOT NULL) AND (approved_by IS NULL) = (approved_at IS NULL)),
  -- Four eyes: the approver wrote none of the revision.
  CONSTRAINT sop_procedures_four_eyes CHECK (approved_by IS NULL OR (approved_by <> authored_by AND approved_by <> last_edited_by))
);
CREATE UNIQUE INDEX sop_procedures_one_open ON gigalibs_cmms.sop_procedures (tenant_id, code) WHERE status IN ('DRAFT', 'IN_REVIEW');
CREATE UNIQUE INDEX sop_procedures_one_published ON gigalibs_cmms.sop_procedures (tenant_id, code) WHERE status = 'PUBLISHED';

CREATE TABLE gigalibs_cmms.sop_step_images (
  tenant_id    gigalibs_cmms.tenant_ref NOT NULL,
  procedure_id uuid NOT NULL,
  step_key     text NOT NULL CHECK (step_key ~ '^[a-z][a-z0-9-]{0,31}$'),
  content_type text NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  bytes        bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 16 AND 307200),
  sha256       text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (tenant_id, procedure_id, step_key),
  CONSTRAINT sop_step_images_procedure_fk FOREIGN KEY (tenant_id, procedure_id)
    REFERENCES gigalibs_cmms.sop_procedures (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE gigalibs_cmms.sop_executions (
  tenant_id           gigalibs_cmms.tenant_ref NOT NULL,
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  procedure_id        uuid NOT NULL,
  client_operation_id uuid NOT NULL,
  work_order_id       uuid,
  asset_id            uuid,
  site_ref            uuid,
  department_id       text CHECK (char_length(department_id) BETWEEN 1 AND 64),
  executed_by         gigalibs_cmms.principal_ref NOT NULL,
  status              text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
  started_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  version             integer NOT NULL DEFAULT 1 CHECK (version > 0),
  correlation_id      text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT sop_executions_operation_unique UNIQUE (tenant_id, client_operation_id),
  CONSTRAINT sop_executions_procedure_fk FOREIGN KEY (tenant_id, procedure_id)
    REFERENCES gigalibs_cmms.sop_procedures (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT sop_executions_work_order_fk FOREIGN KEY (tenant_id, work_order_id)
    REFERENCES gigalibs_cmms.work_orders (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT sop_executions_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT sop_executions_completion CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);

CREATE TABLE gigalibs_cmms.sop_step_results (
  tenant_id           gigalibs_cmms.tenant_ref NOT NULL,
  execution_id        uuid NOT NULL,
  sequence            integer NOT NULL CHECK (sequence > 0),
  client_operation_id uuid NOT NULL,
  step_key            text NOT NULL CHECK (step_key ~ '^[a-z][a-z0-9-]{0,31}$'),
  outcome             text NOT NULL CHECK (outcome IN ('CONFIRMED', 'ANSWER_YES', 'ANSWER_NO', 'READING', 'PHOTO', 'DONE')),
  reading             numeric,
  within_limits       boolean,
  recorded_by         gigalibs_cmms.principal_ref NOT NULL,
  recorded_at         timestamptz NOT NULL,
  received_at         timestamptz NOT NULL DEFAULT now(),
  cosign_required     boolean NOT NULL,
  cosigned_by         gigalibs_cmms.principal_ref,
  cosigned_at         timestamptz,
  PRIMARY KEY (tenant_id, execution_id, sequence),
  CONSTRAINT sop_step_results_operation_unique UNIQUE (tenant_id, client_operation_id),
  CONSTRAINT sop_step_results_execution_fk FOREIGN KEY (tenant_id, execution_id)
    REFERENCES gigalibs_cmms.sop_executions (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT sop_step_results_reading CHECK ((outcome = 'READING') = (reading IS NOT NULL)),
  CONSTRAINT sop_step_results_cosign CHECK (
    (cosigned_by IS NULL) = (cosigned_at IS NULL) AND (cosigned_by IS NULL OR cosign_required)),
  -- Two people for a dual sign-off step.
  CONSTRAINT sop_step_results_two_person CHECK (cosigned_by IS NULL OR cosigned_by <> recorded_by)
);

-- A result's content never changes; a countersign may be added once.
CREATE FUNCTION gigalibs_cmms.sop_step_results_guard() RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'step results are never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.cosigned_by IS NOT NULL OR
     (to_jsonb(NEW) - ARRAY['cosigned_by', 'cosigned_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['cosigned_by', 'cosigned_at']) THEN
    RAISE EXCEPTION 'step result % of execution % cannot change', OLD.sequence, OLD.execution_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$guard$;
CREATE TRIGGER sop_step_results_guard BEFORE UPDATE OR DELETE ON gigalibs_cmms.sop_step_results
  FOR EACH ROW EXECUTE FUNCTION gigalibs_cmms.sop_step_results_guard();

CREATE TABLE gigalibs_cmms.sop_result_photos (
  tenant_id    gigalibs_cmms.tenant_ref NOT NULL,
  execution_id uuid NOT NULL,
  sequence     integer NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  bytes        bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 16 AND 512000),
  sha256       text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (tenant_id, execution_id, sequence),
  CONSTRAINT sop_result_photos_result_fk FOREIGN KEY (tenant_id, execution_id, sequence)
    REFERENCES gigalibs_cmms.sop_step_results (tenant_id, execution_id, sequence) ON DELETE RESTRICT
);

CREATE TABLE gigalibs_cmms.sop_feedback (
  tenant_id       gigalibs_cmms.tenant_ref NOT NULL,
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  procedure_id    uuid NOT NULL,
  step_key        text NOT NULL CHECK (step_key ~ '^[a-z][a-z0-9-]{0,31}$'),
  text            text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  status          text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
  raised_by       gigalibs_cmms.principal_ref NOT NULL,
  raised_at       timestamptz NOT NULL DEFAULT now(),
  resolved_by     gigalibs_cmms.principal_ref,
  resolved_at     timestamptz,
  resolution_note text CHECK (char_length(resolution_note) <= 2000),
  correlation_id  text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT sop_feedback_procedure_fk FOREIGN KEY (tenant_id, procedure_id)
    REFERENCES gigalibs_cmms.sop_procedures (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT sop_feedback_resolution CHECK ((status = 'RESOLVED') = (resolved_by IS NOT NULL AND resolution_note IS NOT NULL))
);

DO $rls$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['sop_procedures', 'sop_step_images', 'sop_executions', 'sop_step_results',
    'sop_result_photos', 'sop_feedback'] LOOP
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
VALUES (30, '000030_visual_work_instructions');

COMMIT;
