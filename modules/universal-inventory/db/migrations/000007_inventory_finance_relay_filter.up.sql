-- WI-OI-120bq (M1, M2): Finance subledger relay leases only inventory.receipt.completed.v1; revoke PUBLIC execute.
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

REVOKE ALL ON FUNCTION gigalibs_inventory.relay_lease_inventory_events(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_inventory.relay_settle_inventory_event(uuid, boolean, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gigalibs_inventory.relay_lease_inventory_events(integer, integer) TO gigalibs_inventory_runtime;
GRANT EXECUTE ON FUNCTION gigalibs_inventory.relay_settle_inventory_event(uuid, boolean, text, integer, integer) TO gigalibs_inventory_runtime;

INSERT INTO gigalibs_inventory.schema_migrations (version) VALUES (7)
ON CONFLICT (version) DO NOTHING;

COMMIT;
