-- Production hardening (WI-OI-068–071): bounded outbox and inbox growth. Forward-only.
-- Outbox rows are delivery buffers and audit_events are the permanent evidence. Only the CMMS handshake facts have a
-- consumer today; every other fact would otherwise wait in PENDING forever. The sweep deletes, past the retention
-- window: delivered (PUBLISHED) facts, PENDING facts of event types no consumer is routed for, and old inbox
-- receipts (kept longer than the outbox so a replay inside the window is still de-duplicated). It never deletes
-- audit evidence, dead letters (FAILED) or routed facts still pending. SECURITY DEFINER because retention spans
-- tenants; only the Workforce runtime role may execute it.
BEGIN;

CREATE FUNCTION gigalibs_workforce.outbox_sweep(p_retention_days integer, p_receipt_retention_days integer, p_limit integer)
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
     WHERE status = 'PUBLISHED' AND created_at < now() - retention
     LIMIT batch)
  DELETE FROM gigalibs_workforce.outbox_events o USING doomed WHERE o.id = doomed.id;
  GET DIAGNOSTICS published = ROW_COUNT;

  WITH doomed AS (
    SELECT id FROM gigalibs_workforce.outbox_events e
     WHERE e.status = 'PENDING' AND e.created_at < now() - retention
       AND NOT (e.payload->>'sourceType' = 'CMMS_WORK_ORDER'
                AND e.event_type IN ('WORKFORCE_WORK_REQUIREMENT_REQUESTED_V1', 'WORKFORCE_WORK_REQUIREMENT_CANCELLED_V1',
                                     'WORKFORCE_RESOURCE_BOOKING_CREATED_V1', 'WORKFORCE_RESOURCE_BOOKING_STATUS_CHANGED_V1',
                                     'WORKFORCE_STAFFING_REQUEST_REJECTED_V1'))
     LIMIT batch)
  DELETE FROM gigalibs_workforce.outbox_events o USING doomed WHERE o.id = doomed.id;
  GET DIAGNOSTICS unrouted = ROW_COUNT;

  WITH doomed AS (
    SELECT id FROM gigalibs_workforce.inbox_receipts
     WHERE status IN ('PROCESSED', 'FAILED') AND received_at < now() - receipt_retention
     LIMIT batch)
  DELETE FROM gigalibs_workforce.inbox_receipts r USING doomed WHERE r.id = doomed.id;
  GET DIAGNOSTICS receipts = ROW_COUNT;
  RETURN NEXT;
END
$$;
REVOKE ALL ON FUNCTION gigalibs_workforce.outbox_sweep(integer, integer, integer) FROM PUBLIC;

CREATE INDEX outbox_events_sweep ON gigalibs_workforce.outbox_events (status, created_at);

INSERT INTO gigalibs_workforce.schema_migrations (version, name)
VALUES (14, '000014_workforce_outbox_retention');

COMMIT;
