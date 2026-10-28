-- WI-OI-123: lease only dispatched fulfillments to AR. Other Orders facts retain their own delivery route.
BEGIN;

CREATE FUNCTION gigalibs_orders.relay_lease_ar_fulfillments(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_orders.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_orders, pg_temp
AS $$
  UPDATE gigalibs_orders.outbox_events o
     SET status = 'LEASED',
         available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
     SELECT e.id FROM gigalibs_orders.outbox_events e
      WHERE e.event_type = 'orders.fulfillment.dispatched.v1'
        AND (e.status = 'PENDING' OR (e.status = 'LEASED' AND e.available_at <= now()))
        AND e.available_at <= now()
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

INSERT INTO gigalibs_orders.schema_migrations (version) VALUES (5);
COMMIT;
