-- WI-OI-133: durable, tenant-bound corrective action delivery to CMMS.
BEGIN;

ALTER TABLE gigalibs_operator_rounds.outbox_events DROP CONSTRAINT outbox_events_status_check;
ALTER TABLE gigalibs_operator_rounds.outbox_events ADD CONSTRAINT outbox_events_status_check
  CHECK (status IN ('PENDING','LEASED','PUBLISHED','FAILED'));

CREATE FUNCTION gigalibs_operator_rounds.relay_lease_cmms_events(p_limit integer,p_lease_seconds integer)
RETURNS SETOF gigalibs_operator_rounds.outbox_events
LANGUAGE sql SECURITY DEFINER SET search_path = gigalibs_operator_rounds, pg_temp
AS $$
  UPDATE gigalibs_operator_rounds.outbox_events o
  SET status='LEASED',attempt_count=o.attempt_count+1,
      available_at=now()+make_interval(secs=>GREATEST(LEAST(p_lease_seconds,300),5))
  WHERE o.id IN (
    SELECT e.id FROM gigalibs_operator_rounds.outbox_events e
    WHERE e.topic='operator-rounds.cmms.v1'
      AND e.event_type='ROUND_CORRECTIVE_ACTION_REQUESTED_V1'
      AND e.status IN ('PENDING','LEASED') AND e.available_at<=now()
    ORDER BY e.created_at,e.id LIMIT GREATEST(LEAST(p_limit,100),1)
    FOR UPDATE SKIP LOCKED
  ) RETURNING o.*
$$;

REVOKE ALL ON FUNCTION gigalibs_operator_rounds.relay_lease_cmms_events(integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gigalibs_operator_rounds.relay_lease_cmms_events(integer,integer)
  TO gigalibs_operator_rounds_runtime;

INSERT INTO gigalibs_operator_rounds.schema_migrations(version,name)
VALUES (4,'000004_cmms_corrective_relay');

COMMIT;
