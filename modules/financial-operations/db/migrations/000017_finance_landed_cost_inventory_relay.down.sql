-- Revert WI-OI-127 landed cost relay event type (restore migration 15 lease filter).
BEGIN;

CREATE OR REPLACE FUNCTION gigalibs_finance.relay_lease_finance_inventory_events(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_finance.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_finance, pg_temp
AS $$
  UPDATE gigalibs_finance.outbox_events o
     SET status = 'LEASED',
         available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
     SELECT e.id FROM gigalibs_finance.outbox_events e
      WHERE (e.status = 'PENDING' OR (e.status = 'LEASED' AND e.available_at <= now()))
        AND e.available_at <= now()
        AND e.event_type IN (
          'finance.inventory-receipt.posting-outcome.v1',
          'finance.fiscal-period.state-changed.v1',
          'finance.fiscal-period.snapshot-completed.v1'
        )
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

REVOKE ALL ON FUNCTION gigalibs_finance.relay_lease_finance_inventory_events(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gigalibs_finance.relay_lease_finance_inventory_events(integer, integer)
  TO gigalibs_finance_runtime;

DELETE FROM gigalibs_finance.schema_migrations WHERE version = 17;

COMMIT;
