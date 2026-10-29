-- WI-OI-128 S4: durable outbox relay lease/settle for Orders credit-memo and Finance scrap events.
BEGIN;

ALTER TABLE gigalibs_universal_returns.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_status_check;
ALTER TABLE gigalibs_universal_returns.outbox_events ADD CONSTRAINT outbox_events_status_check
  CHECK (status IN ('PENDING', 'LEASED', 'PUBLISHED', 'FAILED'));

CREATE OR REPLACE FUNCTION gigalibs_universal_returns.relay_lease_returns_orders_events(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_universal_returns.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_universal_returns, pg_temp
AS $$
  UPDATE gigalibs_universal_returns.outbox_events o
     SET status = 'LEASED',
         available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
     SELECT e.id FROM gigalibs_universal_returns.outbox_events e
      WHERE (e.status = 'PENDING' OR (e.status = 'LEASED' AND e.available_at <= now()))
        AND e.available_at <= now()
        AND e.event_type = 'returns.rma.credit_memo_requested.v1'
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

CREATE OR REPLACE FUNCTION gigalibs_universal_returns.relay_lease_returns_finance_events(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_universal_returns.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_universal_returns, pg_temp
AS $$
  UPDATE gigalibs_universal_returns.outbox_events o
     SET status = 'LEASED',
         available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
     SELECT e.id FROM gigalibs_universal_returns.outbox_events e
      WHERE (e.status = 'PENDING' OR (e.status = 'LEASED' AND e.available_at <= now()))
        AND e.available_at <= now()
        AND e.event_type = 'returns.rma.scrap_gl_requested.v1'
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

CREATE OR REPLACE FUNCTION gigalibs_universal_returns.relay_settle_returns_event(
  p_id varchar, p_published boolean, p_error_code text, p_retry_seconds integer, p_max_attempts integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_universal_returns, pg_temp
AS $$
  UPDATE gigalibs_universal_returns.outbox_events
     SET status = CASE
                    WHEN p_published THEN 'PUBLISHED'
                    WHEN p_retry_seconds IS NULL OR attempt_count >= p_max_attempts THEN 'FAILED'
                    ELSE 'PENDING'
                  END,
         published_at = CASE WHEN p_published THEN now() ELSE published_at END,
         available_at = CASE WHEN p_published OR p_retry_seconds IS NULL THEN available_at
                             ELSE now() + make_interval(secs => LEAST(GREATEST(p_retry_seconds, 1), 900)) END,
         last_error_code = CASE WHEN p_published THEN NULL ELSE left(p_error_code, 128) END
   WHERE id = p_id
$$;

REVOKE ALL ON FUNCTION gigalibs_universal_returns.relay_lease_returns_orders_events(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_universal_returns.relay_lease_returns_finance_events(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_universal_returns.relay_settle_returns_event(varchar, boolean, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gigalibs_universal_returns.relay_lease_returns_orders_events(integer, integer) TO gigalibs_universal_returns_runtime;
GRANT EXECUTE ON FUNCTION gigalibs_universal_returns.relay_lease_returns_finance_events(integer, integer) TO gigalibs_universal_returns_runtime;
GRANT EXECUTE ON FUNCTION gigalibs_universal_returns.relay_settle_returns_event(varchar, boolean, text, integer, integer) TO gigalibs_universal_returns_runtime;

INSERT INTO gigalibs_universal_returns.schema_migrations (version, name)
VALUES (5, '000005_rma_outbox_relay')
ON CONFLICT (version) DO NOTHING;

COMMIT;
