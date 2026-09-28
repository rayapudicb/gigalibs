-- WI-OI-068 (ADR-0007 option A): outbox relay leasing for the CMMS handshake. Forward-only.
-- The relay runs as the least-privilege runtime role, which forced RLS confines to one tenant per transaction.
-- These definer functions are the only cross-tenant access it has: they lease and settle outbox rows of the
-- handshake event types for CMMS-sourced work only, and read or change nothing else.
BEGIN;

CREATE FUNCTION gigalibs_workforce.relay_lease_cmms_events(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_workforce.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_workforce, pg_temp
AS $$
  UPDATE gigalibs_workforce.outbox_events o
     SET available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
     SELECT e.id FROM gigalibs_workforce.outbox_events e
      WHERE e.status = 'PENDING' AND e.available_at <= now()
        AND e.event_type IN ('WORKFORCE_WORK_REQUIREMENT_REQUESTED_V1', 'WORKFORCE_WORK_REQUIREMENT_CANCELLED_V1',
                             'WORKFORCE_RESOURCE_BOOKING_CREATED_V1', 'WORKFORCE_RESOURCE_BOOKING_STATUS_CHANGED_V1',
                             'WORKFORCE_STAFFING_REQUEST_REJECTED_V1')
        AND e.payload->>'sourceType' = 'CMMS_WORK_ORDER'
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

CREATE FUNCTION gigalibs_workforce.relay_settle_cmms_event(
  p_id text, p_published boolean, p_error_code text, p_retry_seconds integer, p_max_attempts integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_workforce, pg_temp
AS $$
  UPDATE gigalibs_workforce.outbox_events
     SET status = CASE
                    WHEN p_published THEN 'PUBLISHED'
                    WHEN p_retry_seconds IS NULL OR attempt_count >= p_max_attempts THEN 'FAILED'
                    ELSE 'PENDING'
                  END,
         published_at = CASE WHEN p_published THEN now() ELSE published_at END,
         available_at = CASE WHEN p_published OR p_retry_seconds IS NULL THEN available_at
                             ELSE now() + make_interval(secs => LEAST(GREATEST(p_retry_seconds, 1), 900)) END,
         last_error_code = CASE WHEN p_published THEN NULL ELSE left(p_error_code, 128) END
   WHERE id = p_id AND status = 'PENDING' AND payload->>'sourceType' = 'CMMS_WORK_ORDER'
$$;

INSERT INTO gigalibs_workforce.schema_migrations (version, name)
VALUES (8, '000008_workforce_outbox_relay');

COMMIT;
