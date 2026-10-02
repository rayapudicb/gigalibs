-- WI-OI-109e3 (ADR-0007 option A, ADR-0018): complete position snapshots, including their organization owner,
-- reach Analytics through the durable Workforce outbox. The relay leases at most the oldest pending version per
-- position, signs it with Workforce's dedicated Analytics-inbox key and retries/dead-letters through the module SDK.
-- Forward-only. Position facts were previously unrouted, so no existing consumer is changed.
BEGIN;

CREATE INDEX outbox_events_analytics_position_pending
  ON gigalibs_workforce.outbox_events (tenant_id, aggregate_id, aggregate_version)
  WHERE status = 'PENDING'
    AND event_type IN ('WORKFORCE_POSITION_CREATED_V1', 'WORKFORCE_POSITION_UPDATED_V1');

CREATE FUNCTION gigalibs_workforce.relay_lease_analytics_positions(p_limit integer, p_lease_seconds integer)
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
        AND e.event_type IN ('WORKFORCE_POSITION_CREATED_V1', 'WORKFORCE_POSITION_UPDATED_V1')
        AND NOT EXISTS (
          SELECT 1 FROM gigalibs_workforce.outbox_events p
           WHERE p.status = 'PENDING'
             AND p.event_type IN ('WORKFORCE_POSITION_CREATED_V1', 'WORKFORCE_POSITION_UPDATED_V1')
             AND p.tenant_id = e.tenant_id AND p.aggregate_id = e.aggregate_id
             AND p.aggregate_version < e.aggregate_version)
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

CREATE FUNCTION gigalibs_workforce.relay_settle_analytics_position(
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
   WHERE id = p_id AND status = 'PENDING'
     AND event_type IN ('WORKFORCE_POSITION_CREATED_V1', 'WORKFORCE_POSITION_UPDATED_V1')
$$;

-- The retention sweep must keep routed position facts while delivery is pending.
CREATE OR REPLACE FUNCTION gigalibs_workforce.outbox_sweep(p_retention_days integer, p_receipt_retention_days integer, p_limit integer)
RETURNS TABLE (published bigint, unrouted bigint, receipts bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = gigalibs_workforce, pg_temp
AS $$
DECLARE
  retention interval := make_interval(days => GREATEST(p_retention_days, 7));
  receipt_retention interval := make_interval(days => GREATEST(p_receipt_retention_days, p_retention_days, 7) + 1);
  batch integer := GREATEST(LEAST(p_limit, 50000), 1);
BEGIN
  WITH doomed AS (
    SELECT id FROM gigalibs_workforce.outbox_events
     WHERE status = 'PUBLISHED' AND created_at < now() - retention LIMIT batch)
  DELETE FROM gigalibs_workforce.outbox_events o USING doomed WHERE o.id = doomed.id;
  GET DIAGNOSTICS published = ROW_COUNT;

  WITH doomed AS (
    SELECT id FROM gigalibs_workforce.outbox_events e
     WHERE e.status = 'PENDING' AND e.created_at < now() - retention
       AND NOT (
         (e.payload->>'sourceType' = 'CMMS_WORK_ORDER'
          AND e.event_type IN ('WORKFORCE_WORK_REQUIREMENT_REQUESTED_V1', 'WORKFORCE_WORK_REQUIREMENT_CANCELLED_V1',
                               'WORKFORCE_RESOURCE_BOOKING_CREATED_V1', 'WORKFORCE_RESOURCE_BOOKING_STATUS_CHANGED_V1',
                               'WORKFORCE_STAFFING_REQUEST_REJECTED_V1'))
         OR e.event_type IN ('WORKFORCE_POSITION_CREATED_V1', 'WORKFORCE_POSITION_UPDATED_V1'))
     LIMIT batch)
  DELETE FROM gigalibs_workforce.outbox_events o USING doomed WHERE o.id = doomed.id;
  GET DIAGNOSTICS unrouted = ROW_COUNT;

  WITH doomed AS (
    SELECT id FROM gigalibs_workforce.inbox_receipts
     WHERE status IN ('PROCESSED', 'FAILED') AND received_at < now() - receipt_retention LIMIT batch)
  DELETE FROM gigalibs_workforce.inbox_receipts r USING doomed WHERE r.id = doomed.id;
  GET DIAGNOSTICS receipts = ROW_COUNT;
  RETURN NEXT;
END
$$;

REVOKE ALL ON FUNCTION gigalibs_workforce.relay_lease_analytics_positions(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_workforce.relay_settle_analytics_position(text, boolean, text, integer, integer) FROM PUBLIC;

INSERT INTO gigalibs_workforce.schema_migrations (version, name)
VALUES (18, '000018_workforce_analytics_relay');

COMMIT;
