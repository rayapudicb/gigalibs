-- Roll back only after all pending corrective actions have been reconciled with CMMS.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM gigalibs_operator_rounds.outbox_events
             WHERE topic='operator-rounds.cmms.v1' AND status IN ('PENDING','LEASED')) THEN
    RAISE EXCEPTION 'Unsettled CMMS corrective actions exist; use roll-forward reconciliation';
  END IF;
END $$;
DROP FUNCTION gigalibs_operator_rounds.relay_lease_cmms_events(integer,integer);
ALTER TABLE gigalibs_operator_rounds.outbox_events DROP CONSTRAINT outbox_events_status_check;
ALTER TABLE gigalibs_operator_rounds.outbox_events ADD CONSTRAINT outbox_events_status_check
  CHECK (status IN ('PENDING','PUBLISHED','FAILED'));
DELETE FROM gigalibs_operator_rounds.schema_migrations WHERE version=4;
COMMIT;
