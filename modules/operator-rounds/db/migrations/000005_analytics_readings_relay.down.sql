BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM gigalibs_operator_rounds.outbox_events
             WHERE topic='operator-rounds.facts.v1'
               AND event_type IN ('READING_ACCEPTED_V1','EXCEPTION_RAISED_V1')
               AND status IN ('PENDING','LEASED')) THEN
    RAISE EXCEPTION 'Unsettled Analytics reading facts exist; use roll-forward reconciliation';
  END IF;
END $$;
DROP FUNCTION gigalibs_operator_rounds.relay_settle_analytics_event(varchar,boolean,text,integer,integer);
DROP FUNCTION gigalibs_operator_rounds.relay_lease_analytics_events(integer,integer);
DELETE FROM gigalibs_operator_rounds.schema_migrations WHERE version=5;
COMMIT;
