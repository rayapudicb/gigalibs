-- WI-OI-068 follow-up: per-work-order delivery order for the Workforce relay. Forward-only.
-- The relay must deliver a work order's staffing facts in the order they happened: a withdrawal delivered before
-- its request left an orphaned Workforce requirement. UPDATE … RETURNING does not preserve the subquery order, and
-- facts written in one transaction shared now(). The lease now takes a row only when no earlier fact of the same
-- work order is still pending, and outbox rows take the insertion instant.
BEGIN;

ALTER TABLE gigalibs_cmms.outbox_events ALTER COLUMN created_at SET DEFAULT clock_timestamp();

CREATE INDEX outbox_events_staffing_pending
  ON gigalibs_cmms.outbox_events ((payload->>'workOrderId'), created_at, id)
  WHERE status = 'PENDING' AND event_type IN ('CMMS_STAFFING_REQUESTED_V1', 'CMMS_STAFFING_CANCELLED_V1');

CREATE OR REPLACE FUNCTION gigalibs_cmms.relay_lease_workforce_events(p_limit integer, p_lease_seconds integer)
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
        AND e.event_type IN ('CMMS_STAFFING_REQUESTED_V1', 'CMMS_STAFFING_CANCELLED_V1')
        AND NOT EXISTS (
          SELECT 1 FROM gigalibs_cmms.outbox_events p
           WHERE p.status = 'PENDING'
             AND p.event_type IN ('CMMS_STAFFING_REQUESTED_V1', 'CMMS_STAFFING_CANCELLED_V1')
             AND p.payload->>'workOrderId' = e.payload->>'workOrderId'
             AND (p.created_at, p.id) < (e.created_at, e.id))
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (12, '000012_cmms_relay_ordering');

COMMIT;
