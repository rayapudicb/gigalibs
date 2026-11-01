-- Recovery only before any defect or skip exists. After use, prefer a forward correction: dropping them would erase
-- operator reports and supervisor decisions.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM gigalibs_operator_rounds.checkpoint_skips) THEN
    RAISE EXCEPTION 'Cannot remove recorded checkpoint skips';
  END IF;
  IF EXISTS (SELECT 1 FROM gigalibs_operator_rounds.exceptions WHERE origin='DEFECT') THEN
    RAISE EXCEPTION 'Cannot remove recorded defects';
  END IF;
END $$;
DROP TABLE gigalibs_operator_rounds.checkpoint_skips;
DROP INDEX gigalibs_operator_rounds.exceptions_defect_run;
DROP INDEX gigalibs_operator_rounds.exceptions_evidence_once;
DROP INDEX gigalibs_operator_rounds.exceptions_defect_operation;
ALTER TABLE gigalibs_operator_rounds.exceptions
  DROP CONSTRAINT exceptions_origin_shape,
  DROP CONSTRAINT exceptions_evidence_fk,
  DROP CONSTRAINT exceptions_checkpoint_fk,
  DROP CONSTRAINT exceptions_run_fk,
  ALTER COLUMN reading_id SET NOT NULL,
  DROP COLUMN observed_at,
  DROP COLUMN reported_by,
  DROP COLUMN client_operation_id,
  DROP COLUMN evidence_id,
  DROP COLUMN description,
  DROP COLUMN checkpoint_id,
  DROP COLUMN run_id,
  DROP COLUMN origin;
DELETE FROM gigalibs_operator_rounds.schema_migrations WHERE version=10;
COMMIT;
