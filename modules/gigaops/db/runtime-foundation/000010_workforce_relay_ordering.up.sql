-- WI-OI-068 follow-up: per-work-order delivery order for the CMMS relay. Forward-only.
-- A work order's facts reach CMMS in the order they happened: the lease takes a row only when no earlier handshake
-- fact of the same work order is still pending, and outbox rows take the insertion instant (facts written in one
-- transaction previously shared now()).
BEGIN;

ALTER TABLE gigalibs_workforce.outbox_events ALTER COLUMN created_at SET DEFAULT clock_timestamp();

CREATE INDEX outbox_events_handshake_pending
  ON gigalibs_workforce.outbox_events ((payload->>'sourceRef'), created_at, id)
  WHERE status = 'PENDING' AND payload->>'sourceType' = 'CMMS_WORK_ORDER';

CREATE OR REPLACE FUNCTION gigalibs_workforce.relay_lease_cmms_events(p_limit integer, p_lease_seconds integer)
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
        AND NOT EXISTS (
          SELECT 1 FROM gigalibs_workforce.outbox_events p
           WHERE p.status = 'PENDING'
             AND p.payload->>'sourceType' = 'CMMS_WORK_ORDER'
             AND p.event_type IN ('WORKFORCE_WORK_REQUIREMENT_REQUESTED_V1', 'WORKFORCE_WORK_REQUIREMENT_CANCELLED_V1',
                                  'WORKFORCE_RESOURCE_BOOKING_CREATED_V1', 'WORKFORCE_RESOURCE_BOOKING_STATUS_CHANGED_V1',
                                  'WORKFORCE_STAFFING_REQUEST_REJECTED_V1')
             AND p.payload->>'sourceRef' = e.payload->>'sourceRef'
             AND (p.created_at, p.id) < (e.created_at, e.id))
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

INSERT INTO gigalibs_workforce.schema_migrations (version, name)
VALUES (10, '000010_workforce_relay_ordering');

COMMIT;
