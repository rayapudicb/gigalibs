-- Recovery only before a bound upload exists; after use, apply a forward correction.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM gigalibs_operator_rounds.media_evidence WHERE assignment_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Cannot remove Rounds evidence binding after evidence has been staged';
  END IF;
END $$;
DROP INDEX gigalibs_operator_rounds.readings_evidence_single_use;
ALTER TABLE gigalibs_operator_rounds.media_evidence
  DROP CONSTRAINT media_evidence_assignment_fk,
  DROP CONSTRAINT media_evidence_checkpoint_fk,
  DROP CONSTRAINT media_evidence_binding_pair,
  DROP COLUMN assignment_id,
  DROP COLUMN checkpoint_id;
DELETE FROM gigalibs_operator_rounds.schema_migrations WHERE version=7;
COMMIT;
