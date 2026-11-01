-- WI-OI-133: bind an upload to one assignment/checkpoint and prevent photo reuse.
-- Existing unbound evidence remains readable for historical records but cannot be attached to a new reading.
-- Preflight duplicate evidence references before applying this migration; resolve any duplicates forward.
BEGIN;

ALTER TABLE gigalibs_operator_rounds.media_evidence
  ADD COLUMN assignment_id uuid,
  ADD COLUMN checkpoint_id uuid,
  ADD CONSTRAINT media_evidence_binding_pair
    CHECK ((assignment_id IS NULL) = (checkpoint_id IS NULL)),
  ADD CONSTRAINT media_evidence_assignment_fk
    FOREIGN KEY (tenant_id,assignment_id)
    REFERENCES gigalibs_operator_rounds.assignments(tenant_id,id),
  ADD CONSTRAINT media_evidence_checkpoint_fk
    FOREIGN KEY (tenant_id,checkpoint_id)
    REFERENCES gigalibs_operator_rounds.checkpoints(tenant_id,id);

CREATE UNIQUE INDEX readings_evidence_single_use
  ON gigalibs_operator_rounds.readings(tenant_id,evidence_id)
  WHERE evidence_id IS NOT NULL;

INSERT INTO gigalibs_operator_rounds.schema_migrations(version,name)
VALUES(7,'000007_round_evidence_binding');
COMMIT;
