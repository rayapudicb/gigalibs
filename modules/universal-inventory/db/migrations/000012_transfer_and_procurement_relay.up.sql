-- WI-OI-125 S2/S5: relay inter-warehouse transfer GL facts to Finance and replenishment PO drafts to Procurement.
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
        AND e.event_type IN (
          'inventory.receipt.completed.v1',
          'inventory.posting-cutoff.v1',
          'inventory.transfer.dispatched.v1',
          'inventory.transfer.received.v1'
        )
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

CREATE OR REPLACE FUNCTION gigalibs_inventory.relay_lease_procurement_draft_events(p_limit integer, p_lease_seconds integer)
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
        AND e.event_type = 'inventory.replenishment.po-draft.v1'
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

CREATE OR REPLACE FUNCTION gigalibs_inventory.relay_settle_procurement_draft_event(
  p_id uuid, p_published boolean, p_error_code text, p_retry_seconds integer, p_max_attempts integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_inventory, pg_temp
AS $$
  UPDATE gigalibs_inventory.outbox_events
     SET status = CASE
                    WHEN p_published THEN 'PUBLISHED'
                    WHEN p_retry_seconds IS NULL OR attempt_count >= p_max_attempts THEN 'FAILED'
                    ELSE 'PENDING'
                  END,
         published_at = CASE WHEN p_published THEN now() ELSE published_at END,
         available_at = CASE WHEN p_published OR p_retry_seconds IS NULL THEN available_at
                             ELSE now() + make_interval(secs => LEAST(GREATEST(p_retry_seconds, 1), 900)) END,
         last_error_code = CASE WHEN p_published THEN NULL ELSE left(p_error_code, 128) END
   WHERE id = p_id AND status IN ('PENDING', 'LEASED')
     AND event_type = 'inventory.replenishment.po-draft.v1'
$$;

REVOKE ALL ON FUNCTION gigalibs_inventory.relay_lease_procurement_draft_events(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_inventory.relay_settle_procurement_draft_event(uuid, boolean, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gigalibs_inventory.relay_lease_procurement_draft_events(integer, integer) TO gigalibs_inventory_runtime;
GRANT EXECUTE ON FUNCTION gigalibs_inventory.relay_settle_procurement_draft_event(uuid, boolean, text, integer, integer) TO gigalibs_inventory_runtime;

INSERT INTO gigalibs_inventory.schema_migrations (version, name)
VALUES (12, '000012_transfer_and_procurement_relay');

COMMIT;
