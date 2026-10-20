BEGIN;

CREATE OR REPLACE FUNCTION gigalibs_inventory.relay_lease_inventory_events(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_inventory.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_inventory, pg_temp
AS $$
  UPDATE gigalibs_inventory.outbox_events o
     SET status = 'LEASED',
         available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
     SELECT e.id FROM gigalibs_inventory.outbox_events e
      WHERE (e.status = 'PENDING' OR (e.status = 'LEASED' AND e.available_at <= now()))
        AND e.available_at <= now()
        AND e.event_type = 'inventory.receipt.completed.v1'
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

DELETE FROM gigalibs_inventory.schema_migrations WHERE version = 8;

COMMIT;
