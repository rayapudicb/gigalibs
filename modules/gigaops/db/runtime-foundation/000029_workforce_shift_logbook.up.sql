-- WI-OI-137 M-LOG: operator shift logbooks, immutable entries, the safety bypass register and two-person handovers.
-- Workforce owns handovers (ADR-0035, M-WF3); entries and bypasses are shift-bound and kept beside them. Additive and
-- forward-only; entries and handover packages are append-only in content (triggers), and entries are append-only for
-- the runtime role (MODULE_APPEND_ONLY_TABLES). Recovery: drop the empty tables with the down migration.
BEGIN;

CREATE TABLE gigalibs_workforce.logbooks (
  tenant_id      varchar(64) NOT NULL,
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  code           varchar(64) NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
  name           varchar(200) NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  department_id  varchar(64) CHECK (char_length(department_id) BETWEEN 1 AND 64),
  site_ref       uuid,
  time_zone      varchar(64) NOT NULL CHECK (char_length(time_zone) BETWEEN 1 AND 64),
  shift_windows  jsonb NOT NULL CHECK (jsonb_typeof(shift_windows) = 'array' AND jsonb_array_length(shift_windows) BETWEEN 1 AND 6),
  active         boolean NOT NULL DEFAULT true,
  version        integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by     varchar(128) NOT NULL,
  updated_by     varchar(128) NOT NULL,
  correlation_id varchar(128) NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT logbooks_code_unique UNIQUE (tenant_id, code)
);

CREATE TABLE gigalibs_workforce.logbook_entries (
  tenant_id           varchar(64) NOT NULL,
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  logbook_id          uuid NOT NULL,
  client_operation_id uuid NOT NULL,
  request_sha256      char(64) NOT NULL,
  shift_date          date NOT NULL,
  shift_name          varchar(40) NOT NULL,
  category            varchar(24) NOT NULL CHECK (category IN ('NOTE', 'EQUIPMENT_STATE', 'TRIP', 'CHEMICAL_DOSE',
                        'STANDING_ALARM', 'FEEDSTOCK_CHANGE', 'SAFETY')),
  text                text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  priority            varchar(8) NOT NULL CHECK (priority IN ('LOW', 'NORMAL', 'HIGH')),
  asset_ref           uuid,
  occurred_at         timestamptz NOT NULL,
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  author              varchar(128) NOT NULL,
  corrects_entry_id   uuid,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT logbook_entries_operation_unique UNIQUE (tenant_id, client_operation_id),
  CONSTRAINT logbook_entries_logbook_fk FOREIGN KEY (tenant_id, logbook_id)
    REFERENCES gigalibs_workforce.logbooks (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT logbook_entries_correction_fk FOREIGN KEY (tenant_id, corrects_entry_id)
    REFERENCES gigalibs_workforce.logbook_entries (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT logbook_entries_not_self CHECK (corrects_entry_id IS NULL OR corrects_entry_id <> id)
);
CREATE INDEX logbook_entries_by_shift ON gigalibs_workforce.logbook_entries (tenant_id, logbook_id, shift_date DESC, occurred_at DESC);

CREATE TABLE gigalibs_workforce.logbook_bypasses (
  tenant_id           varchar(64) NOT NULL,
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  logbook_id          uuid NOT NULL,
  client_operation_id uuid NOT NULL,
  request_sha256      char(64) NOT NULL,
  description         varchar(500) NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
  asset_ref           uuid,
  reason              text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  mitigation          text NOT NULL CHECK (char_length(mitigation) BETWEEN 1 AND 1000),
  status              varchar(12) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'AUTHORIZED', 'CLEARED', 'REJECTED')),
  requested_by        varchar(128) NOT NULL,
  requested_at        timestamptz NOT NULL DEFAULT now(),
  planned_removal_at  timestamptz NOT NULL,
  authorized_by       varchar(128),
  authorized_at       timestamptz,
  cleared_by          varchar(128),
  cleared_at          timestamptz,
  decision_note       text CHECK (char_length(decision_note) <= 1000),
  version             integer NOT NULL DEFAULT 1 CHECK (version > 0),
  correlation_id      varchar(128) NOT NULL,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT logbook_bypasses_operation_unique UNIQUE (tenant_id, client_operation_id),
  CONSTRAINT logbook_bypasses_logbook_fk FOREIGN KEY (tenant_id, logbook_id)
    REFERENCES gigalibs_workforce.logbooks (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT logbook_bypasses_lifecycle CHECK (
    (status = 'REQUESTED' AND authorized_by IS NULL AND cleared_by IS NULL)
    OR (status = 'AUTHORIZED' AND authorized_by IS NOT NULL AND authorized_at IS NOT NULL AND cleared_by IS NULL)
    OR (status = 'CLEARED' AND authorized_by IS NOT NULL AND cleared_by IS NOT NULL AND cleared_at IS NOT NULL)
    OR (status = 'REJECTED' AND authorized_by IS NOT NULL AND authorized_at IS NOT NULL AND cleared_by IS NULL
        AND decision_note IS NOT NULL)),
  -- Four eyes: the person who asked for the bypass never authorizes or rejects it.
  CONSTRAINT logbook_bypasses_four_eyes CHECK (authorized_by IS NULL OR authorized_by <> requested_by)
);
CREATE INDEX logbook_bypasses_open ON gigalibs_workforce.logbook_bypasses (tenant_id, logbook_id)
  WHERE status IN ('REQUESTED', 'AUTHORIZED');

CREATE TABLE gigalibs_workforce.logbook_handovers (
  tenant_id                varchar(64) NOT NULL,
  id                       uuid NOT NULL DEFAULT gen_random_uuid(),
  logbook_id               uuid NOT NULL,
  client_operation_id      uuid NOT NULL,
  request_sha256           char(64) NOT NULL,
  shift_date               date NOT NULL,
  shift_name               varchar(40) NOT NULL,
  status                   varchar(16) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'ACCEPTED', 'COUNTERSIGNED')),
  outgoing_by              varchar(128) NOT NULL,
  submitted_at             timestamptz NOT NULL DEFAULT now(),
  outgoing_statement       text NOT NULL,
  notes                    text NOT NULL CHECK (char_length(notes) BETWEEN 1 AND 4000),
  package                  jsonb NOT NULL CHECK (jsonb_typeof(package) = 'object'),
  incoming_by              varchar(128),
  accepted_at              timestamptz,
  incoming_statement       text,
  acknowledged_bypass_ids  uuid[] NOT NULL DEFAULT '{}',
  supervisor_by            varchar(128),
  countersigned_at         timestamptz,
  supervisor_statement     text,
  version                  integer NOT NULL DEFAULT 1 CHECK (version > 0),
  correlation_id           varchar(128) NOT NULL,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT logbook_handovers_operation_unique UNIQUE (tenant_id, client_operation_id),
  CONSTRAINT logbook_handovers_one_per_shift UNIQUE (tenant_id, logbook_id, shift_date, shift_name),
  CONSTRAINT logbook_handovers_logbook_fk FOREIGN KEY (tenant_id, logbook_id)
    REFERENCES gigalibs_workforce.logbooks (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT logbook_handovers_lifecycle CHECK (
    (status = 'SUBMITTED' AND incoming_by IS NULL AND supervisor_by IS NULL)
    OR (status = 'ACCEPTED' AND incoming_by IS NOT NULL AND accepted_at IS NOT NULL AND incoming_statement IS NOT NULL AND supervisor_by IS NULL)
    OR (status = 'COUNTERSIGNED' AND incoming_by IS NOT NULL AND supervisor_by IS NOT NULL AND countersigned_at IS NOT NULL
        AND supervisor_statement IS NOT NULL)),
  -- Two people take part in every handover, and a countersign comes from a third.
  CONSTRAINT logbook_handovers_two_person CHECK (incoming_by IS NULL OR incoming_by <> outgoing_by),
  CONSTRAINT logbook_handovers_third_person CHECK (supervisor_by IS NULL OR (supervisor_by <> outgoing_by AND supervisor_by <> incoming_by))
);

-- An accepted handover keeps its package, notes and sign-offs; only the countersign may follow.
CREATE FUNCTION gigalibs_workforce.logbook_handovers_guard() RETURNS trigger LANGUAGE plpgsql AS $guard$
DECLARE
  mutable_columns text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'handovers are never deleted' USING ERRCODE = 'check_violation';
  END IF;
  mutable_columns := CASE OLD.status
    WHEN 'SUBMITTED' THEN ARRAY['status', 'package', 'incoming_by', 'accepted_at', 'incoming_statement',
      'acknowledged_bypass_ids', 'version', 'correlation_id']
    WHEN 'ACCEPTED' THEN ARRAY['status', 'supervisor_by', 'countersigned_at', 'supervisor_statement', 'version', 'correlation_id']
    ELSE ARRAY[]::text[] END;
  IF (to_jsonb(NEW) - mutable_columns) IS DISTINCT FROM (to_jsonb(OLD) - mutable_columns) THEN
    RAISE EXCEPTION 'handover % cannot change that way', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$guard$;
CREATE TRIGGER logbook_handovers_guard BEFORE UPDATE OR DELETE ON gigalibs_workforce.logbook_handovers
  FOR EACH ROW EXECUTE FUNCTION gigalibs_workforce.logbook_handovers_guard();

DO $rls$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['logbooks', 'logbook_entries', 'logbook_bypasses', 'logbook_handovers'] LOOP
    EXECUTE format('ALTER TABLE gigalibs_workforce.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE gigalibs_workforce.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_workforce.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) '
      'WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      table_name || '_tenant_isolation', table_name);
  END LOOP;
END
$rls$;

INSERT INTO gigalibs_workforce.schema_migrations (version, name)
VALUES (29, '000029_workforce_shift_logbook')
ON CONFLICT (version) DO NOTHING;

COMMIT;
