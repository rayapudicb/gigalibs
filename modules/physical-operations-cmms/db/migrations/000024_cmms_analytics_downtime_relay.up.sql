-- WI-OI-130: lease/settle definer functions for CMMS downtime facts relayed to Analytics (ADR-0007 option A).
BEGIN;

CREATE FUNCTION gigalibs_cmms.relay_lease_analytics_downtime_events(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_cmms.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_cmms, pg_temp
AS $$
  UPDATE gigalibs_cmms.outbox_events o
     SET available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
     SELECT e.id FROM gigalibs_cmms.outbox_events e
      WHERE e.status = 'PENDING' AND e.available_at <= now()
        AND e.topic = 'cmms.downtime.v1'
        AND e.event_type IN ('DOWNTIME_STARTED_V1', 'DOWNTIME_ENDED_V1')
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

CREATE FUNCTION gigalibs_cmms.relay_settle_analytics_downtime_event(
  p_id text, p_published boolean, p_error_code text, p_retry_seconds integer, p_max_attempts integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_cmms, pg_temp
AS $$
  UPDATE gigalibs_cmms.outbox_events
     SET status = CASE
                    WHEN p_published THEN 'PUBLISHED'
                    WHEN p_retry_seconds IS NULL OR attempt_count >= p_max_attempts THEN 'FAILED'
                    ELSE 'PENDING'
                  END,
         published_at = CASE WHEN p_published THEN now() ELSE published_at END,
         available_at = CASE WHEN p_published OR p_retry_seconds IS NULL THEN available_at
                             ELSE now() + make_interval(secs => LEAST(GREATEST(p_retry_seconds, 1), 900)) END,
         last_error_code = CASE WHEN p_published THEN NULL ELSE left(p_error_code, 128) END
   WHERE id = p_id AND status = 'PENDING'
     AND topic = 'cmms.downtime.v1'
     AND event_type IN ('DOWNTIME_STARTED_V1', 'DOWNTIME_ENDED_V1')
$$;

REVOKE ALL ON FUNCTION gigalibs_cmms.relay_lease_analytics_downtime_events(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_cmms.relay_settle_analytics_downtime_event(text, boolean, text, integer, integer) FROM PUBLIC;

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (24, '000024_cmms_analytics_downtime_relay');

COMMIT;
