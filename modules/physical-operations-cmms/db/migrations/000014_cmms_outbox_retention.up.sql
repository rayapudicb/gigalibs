-- Production hardening (WI-OI-068–071): bounded outbox and inbox growth. Forward-only.
-- Outbox rows are delivery buffers and audit_events are the permanent evidence. Only the staffing facts have a
-- consumer (Workforce); every other CMMS fact would otherwise wait in PENDING forever. The sweep deletes, past the
-- retention window: delivered facts, PENDING facts of unrouted event types, and old inbox receipts (kept longer
-- than the outbox). It never deletes audit evidence, dead letters or routed facts still pending. SECURITY DEFINER
-- because retention spans tenants; only the CMMS runtime role may execute it.
BEGIN;

CREATE FUNCTION gigalibs_cmms.outbox_sweep(p_retention_days integer, p_receipt_retention_days integer, p_limit integer)
RETURNS TABLE (published bigint, unrouted bigint, receipts bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = gigalibs_cmms, pg_temp
AS $$
DECLARE
  retention interval := make_interval(days => GREATEST(p_retention_days, 7));
  receipt_retention interval := make_interval(days => GREATEST(p_receipt_retention_days, p_retention_days, 7) + 1);
  batch integer := GREATEST(LEAST(p_limit, 50000), 1);
BEGIN
  WITH doomed AS (
    SELECT id FROM gigalibs_cmms.outbox_events
     WHERE status = 'PUBLISHED' AND created_at < now() - retention
     LIMIT batch)
  DELETE FROM gigalibs_cmms.outbox_events o USING doomed WHERE o.id = doomed.id;
  GET DIAGNOSTICS published = ROW_COUNT;

  WITH doomed AS (
    SELECT id FROM gigalibs_cmms.outbox_events e
     WHERE e.status = 'PENDING' AND e.created_at < now() - retention
       AND e.event_type NOT IN ('CMMS_STAFFING_REQUESTED_V1', 'CMMS_STAFFING_CANCELLED_V1')
     LIMIT batch)
  DELETE FROM gigalibs_cmms.outbox_events o USING doomed WHERE o.id = doomed.id;
  GET DIAGNOSTICS unrouted = ROW_COUNT;

  WITH doomed AS (
    SELECT id FROM gigalibs_cmms.inbox_receipts
     WHERE status IN ('PROCESSED', 'FAILED') AND received_at < now() - receipt_retention
     LIMIT batch)
  DELETE FROM gigalibs_cmms.inbox_receipts r USING doomed WHERE r.id = doomed.id;
  GET DIAGNOSTICS receipts = ROW_COUNT;
  RETURN NEXT;
END
$$;
REVOKE ALL ON FUNCTION gigalibs_cmms.outbox_sweep(integer, integer, integer) FROM PUBLIC;

CREATE INDEX outbox_events_sweep ON gigalibs_cmms.outbox_events (status, created_at);

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (14, '000014_cmms_outbox_retention');

COMMIT;
