-- WI-OI-104e: pulled records reach Analytics through ADR-0007's outbox relay. A connection opts in; each newly
-- journalled record then writes an outbox fact in the same transaction, and the relay (the module SDK's OutboxRelay)
-- delivers it to Analytics' inbox with a dedicated relay key. The definer functions below are the relay's only
-- cross-tenant access. Forward-only; additive.

BEGIN;

ALTER TABLE gigalibs_connectors.tenant_connections
    ADD COLUMN IF NOT EXISTS deliver_to_analytics BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE gigalibs_connectors.outbox_events (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    topic VARCHAR(128) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    aggregate_type VARCHAR(128) NOT NULL,
    aggregate_id VARCHAR(128) NOT NULL,
    aggregate_version INTEGER NOT NULL CHECK (aggregate_version > 0),
    correlation_id VARCHAR(128) NOT NULL,
    causation_id VARCHAR(128),
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    payload JSONB NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    last_error_code VARCHAR(128),
    -- The insertion instant, so facts written in one transaction keep their order.
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, aggregate_type, aggregate_id, aggregate_version, event_type)
);

ALTER TABLE gigalibs_connectors.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_connectors.outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_events_tenant_isolation ON gigalibs_connectors.outbox_events
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE INDEX outbox_events_pending ON gigalibs_connectors.outbox_events (aggregate_id, created_at, id) WHERE status = 'PENDING';
CREATE INDEX outbox_events_sweep ON gigalibs_connectors.outbox_events (status, created_at);

-- Leases due facts, at most the oldest pending one per record, so versions of one record arrive in order.
CREATE FUNCTION gigalibs_connectors.relay_lease_analytics_records(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_connectors.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_connectors, pg_temp
AS $$
  UPDATE gigalibs_connectors.outbox_events o
     SET available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
     SELECT e.id FROM gigalibs_connectors.outbox_events e
      WHERE e.status = 'PENDING' AND e.available_at <= now()
        AND e.event_type = 'CONNECTOR_RECORD_PULLED_V1'
        AND NOT EXISTS (
          SELECT 1 FROM gigalibs_connectors.outbox_events p
           WHERE p.status = 'PENDING'
             AND p.event_type = 'CONNECTOR_RECORD_PULLED_V1'
             AND p.tenant_id = e.tenant_id
             AND p.aggregate_id = e.aggregate_id
             AND (p.created_at, p.id) < (e.created_at, e.id))
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

CREATE FUNCTION gigalibs_connectors.relay_settle_analytics_record(
  p_id text, p_published boolean, p_error_code text, p_retry_seconds integer, p_max_attempts integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_connectors, pg_temp
AS $$
  UPDATE gigalibs_connectors.outbox_events
     SET status = CASE
                    WHEN p_published THEN 'PUBLISHED'
                    WHEN p_retry_seconds IS NULL OR attempt_count >= p_max_attempts THEN 'FAILED'
                    ELSE 'PENDING'
                  END,
         published_at = CASE WHEN p_published THEN now() ELSE published_at END,
         available_at = CASE WHEN p_published OR p_retry_seconds IS NULL THEN available_at
                             ELSE now() + make_interval(secs => LEAST(GREATEST(p_retry_seconds, 1), 900)) END,
         last_error_code = CASE WHEN p_published THEN NULL ELSE left(p_error_code, 128) END
   WHERE id = p_id AND status = 'PENDING' AND event_type = 'CONNECTOR_RECORD_PULLED_V1'
$$;

-- Deletes delivered facts after the retention window; pending and failed facts are kept. Connector Hub has no inbox,
-- so there are no receipts to sweep.
CREATE FUNCTION gigalibs_connectors.outbox_sweep(p_retention_days integer, p_receipt_retention_days integer, p_limit integer)
RETURNS TABLE (published bigint, unrouted bigint, receipts bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = gigalibs_connectors, pg_temp
AS $$
DECLARE
  retention interval := make_interval(days => GREATEST(p_retention_days, 7));
  batch integer := GREATEST(LEAST(p_limit, 50000), 1);
BEGIN
  WITH doomed AS (
    SELECT id FROM gigalibs_connectors.outbox_events
     WHERE status = 'PUBLISHED' AND created_at < now() - retention
     LIMIT batch)
  DELETE FROM gigalibs_connectors.outbox_events o USING doomed WHERE o.id = doomed.id;
  GET DIAGNOSTICS published = ROW_COUNT;
  unrouted := 0;
  receipts := 0;
  RETURN NEXT;
END
$$;

REVOKE ALL ON FUNCTION gigalibs_connectors.relay_lease_analytics_records(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_connectors.relay_settle_analytics_record(text, boolean, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_connectors.outbox_sweep(integer, integer, integer) FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA gigalibs_connectors REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

INSERT INTO gigalibs_connectors.schema_migrations (version, name, applied_at)
VALUES (7, '000007_analytics_relay', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
