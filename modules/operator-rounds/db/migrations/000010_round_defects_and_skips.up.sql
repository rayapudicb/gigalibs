-- WI-OI-133: ad-hoc defects and supervisor-authorized checkpoint skips (product spec 01 §2).
-- A defect is an exception with origin DEFECT: no reading, the operator's description, an optional bound photo, and the
-- same review / CMMS corrective path as a threshold exception. A skip is a step of the run's route path that a
-- different, authorized person approves or rejects. Additive: existing exceptions keep origin READING.
BEGIN;

ALTER TABLE gigalibs_operator_rounds.exceptions
  ADD COLUMN origin varchar(16) NOT NULL DEFAULT 'READING' CHECK (origin IN ('READING','DEFECT')),
  ADD COLUMN run_id uuid,
  ADD COLUMN checkpoint_id uuid,
  ADD COLUMN description text CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 2000),
  ADD COLUMN evidence_id uuid,
  ADD COLUMN client_operation_id uuid,
  ADD COLUMN reported_by varchar(128),
  ADD COLUMN observed_at timestamptz,
  ALTER COLUMN reading_id DROP NOT NULL,
  ADD CONSTRAINT exceptions_run_fk FOREIGN KEY (tenant_id,run_id)
    REFERENCES gigalibs_operator_rounds.round_runs(tenant_id,id),
  ADD CONSTRAINT exceptions_checkpoint_fk FOREIGN KEY (tenant_id,checkpoint_id)
    REFERENCES gigalibs_operator_rounds.checkpoints(tenant_id,id),
  ADD CONSTRAINT exceptions_evidence_fk FOREIGN KEY (tenant_id,evidence_id)
    REFERENCES gigalibs_operator_rounds.media_evidence(tenant_id,id),
  ADD CONSTRAINT exceptions_origin_shape CHECK (
    (origin='READING' AND reading_id IS NOT NULL AND description IS NULL AND client_operation_id IS NULL)
    OR (origin='DEFECT' AND reading_id IS NULL AND run_id IS NOT NULL AND checkpoint_id IS NOT NULL
        AND description IS NOT NULL AND client_operation_id IS NOT NULL AND reported_by IS NOT NULL
        AND observed_at IS NOT NULL));
CREATE UNIQUE INDEX exceptions_defect_operation
  ON gigalibs_operator_rounds.exceptions(tenant_id,client_operation_id) WHERE client_operation_id IS NOT NULL;
-- One photo supports one record: a reading (readings_evidence_single_use) or a defect; the service refuses both.
CREATE UNIQUE INDEX exceptions_evidence_once
  ON gigalibs_operator_rounds.exceptions(tenant_id,evidence_id) WHERE evidence_id IS NOT NULL;
CREATE INDEX exceptions_defect_run ON gigalibs_operator_rounds.exceptions(tenant_id,run_id) WHERE run_id IS NOT NULL;

CREATE TABLE gigalibs_operator_rounds.checkpoint_skips (
  id uuid NOT NULL,
  tenant_id varchar(64) NOT NULL,
  run_id uuid NOT NULL,
  checkpoint_id uuid NOT NULL,
  client_operation_id uuid NOT NULL,
  captured_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  reason_code varchar(32) NOT NULL
    CHECK (reason_code IN ('INACCESSIBLE','UNSAFE','ASSET_OUT_OF_SERVICE','TAG_DAMAGED','OTHER')),
  note text CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 1000),
  requested_by varchar(128) NOT NULL,
  state varchar(16) NOT NULL DEFAULT 'REQUESTED' CHECK (state IN ('REQUESTED','APPROVED','REJECTED')),
  decided_by varchar(128),
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) BETWEEN 1 AND 2000),
  decided_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,client_operation_id),
  UNIQUE (tenant_id,run_id,checkpoint_id),
  FOREIGN KEY (tenant_id,run_id) REFERENCES gigalibs_operator_rounds.round_runs(tenant_id,id),
  FOREIGN KEY (tenant_id,checkpoint_id) REFERENCES gigalibs_operator_rounds.checkpoints(tenant_id,id),
  -- A decision names its decider, note and time; the requester never decides their own skip.
  CHECK ((state='REQUESTED' AND decided_by IS NULL AND decided_at IS NULL AND decision_note IS NULL)
      OR (state<>'REQUESTED' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_note IS NOT NULL
          AND decided_by<>requested_by)),
  CHECK (reason_code<>'OTHER' OR note IS NOT NULL)
);
CREATE INDEX checkpoint_skips_pending ON gigalibs_operator_rounds.checkpoint_skips(tenant_id,state,received_at);
ALTER TABLE gigalibs_operator_rounds.checkpoint_skips ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_operator_rounds.checkpoint_skips FORCE ROW LEVEL SECURITY;
CREATE POLICY checkpoint_skips_tenant_isolation ON gigalibs_operator_rounds.checkpoint_skips
  FOR ALL USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),''))
  WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),''));

INSERT INTO gigalibs_operator_rounds.schema_migrations(version,name)
VALUES(10,'000010_round_defects_and_skips');
COMMIT;
