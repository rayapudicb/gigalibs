-- WI-OI-133: bounded inspection reading facts to the Analytics inbox.
BEGIN;

CREATE FUNCTION gigalibs_operator_rounds.relay_lease_analytics_events(p_limit integer,p_lease_seconds integer)
RETURNS SETOF gigalibs_operator_rounds.outbox_events
LANGUAGE sql SECURITY DEFINER SET search_path=gigalibs_operator_rounds,pg_temp
AS $$
  UPDATE gigalibs_operator_rounds.outbox_events o
  SET status='LEASED',attempt_count=o.attempt_count+1,
      available_at=now()+make_interval(secs=>GREATEST(LEAST(p_lease_seconds,300),5))
  WHERE o.id IN (
    SELECT e.id FROM gigalibs_operator_rounds.outbox_events e
    WHERE e.topic='operator-rounds.facts.v1'
      AND e.event_type IN ('READING_ACCEPTED_V1','EXCEPTION_RAISED_V1')
      AND e.status IN ('PENDING','LEASED') AND e.available_at<=now()
    ORDER BY e.created_at,e.id LIMIT GREATEST(LEAST(p_limit,100),1)
    FOR UPDATE SKIP LOCKED
  ) RETURNING o.*
$$;

CREATE FUNCTION gigalibs_operator_rounds.relay_settle_analytics_event(
  p_id varchar,p_published boolean,p_error_code text,p_retry_seconds integer,p_max_attempts integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=gigalibs_operator_rounds,pg_temp
AS $$
  UPDATE gigalibs_operator_rounds.outbox_events
  SET status=CASE WHEN p_published THEN 'PUBLISHED'
             WHEN p_retry_seconds IS NULL OR attempt_count>=p_max_attempts THEN 'FAILED'
             ELSE 'PENDING' END,
      published_at=CASE WHEN p_published THEN now() ELSE published_at END,
      available_at=CASE WHEN NOT p_published AND p_retry_seconds IS NOT NULL
             THEN now()+make_interval(secs=>LEAST(GREATEST(p_retry_seconds,1),900)) ELSE available_at END,
      last_error_code=CASE WHEN p_published THEN NULL ELSE left(p_error_code,128) END
  WHERE id=p_id AND status='LEASED' AND topic='operator-rounds.facts.v1'
    AND event_type IN ('READING_ACCEPTED_V1','EXCEPTION_RAISED_V1')
$$;

REVOKE ALL ON FUNCTION gigalibs_operator_rounds.relay_lease_analytics_events(integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_operator_rounds.relay_settle_analytics_event(varchar,boolean,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gigalibs_operator_rounds.relay_lease_analytics_events(integer,integer)
  TO gigalibs_operator_rounds_runtime;
GRANT EXECUTE ON FUNCTION gigalibs_operator_rounds.relay_settle_analytics_event(varchar,boolean,text,integer,integer)
  TO gigalibs_operator_rounds_runtime;

INSERT INTO gigalibs_operator_rounds.schema_migrations(version,name)
VALUES(5,'000005_analytics_readings_relay');
COMMIT;
