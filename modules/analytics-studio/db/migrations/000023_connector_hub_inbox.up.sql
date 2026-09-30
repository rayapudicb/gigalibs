-- WI-OI-104e: Connector Hub's pulled records arrive through the relay inbox (ADR-0007). One CONNECTOR_HUB source per
-- Hub connection holds them as raw record versions, so discovery, mapping and dataset builds apply unchanged. Only
-- Postgres sources carry a host, port and database. Receipts deduplicate relay messages. Forward-only; no data
-- changes. Postgres and the Demo Lab's synthetic sources keep their host, port and database.

BEGIN;

ALTER TABLE gigalibs_analytics.source_connections
    ALTER COLUMN host DROP NOT NULL,
    ALTER COLUMN port DROP NOT NULL,
    ALTER COLUMN database_name DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS hub_connection_id TEXT;

ALTER TABLE gigalibs_analytics.source_connections
    ADD CONSTRAINT source_connections_kind_fields CHECK (
      (source_type IN ('POSTGRES', 'SYNTHETIC') AND host IS NOT NULL AND port IS NOT NULL AND database_name IS NOT NULL AND hub_connection_id IS NULL)
      OR (source_type = 'CONNECTOR_HUB' AND hub_connection_id IS NOT NULL)
    );

CREATE UNIQUE INDEX source_connections_hub_connection
    ON gigalibs_analytics.source_connections (tenant_id, hub_connection_id)
    WHERE hub_connection_id IS NOT NULL;

ALTER TABLE gigalibs_analytics.source_sync_runs
    ADD COLUMN IF NOT EXISTS hub_sync_job_id TEXT;

CREATE UNIQUE INDEX source_sync_runs_hub_job
    ON gigalibs_analytics.source_sync_runs (connection_id, hub_sync_job_id)
    WHERE hub_sync_job_id IS NOT NULL;

CREATE TABLE gigalibs_analytics.inbox_receipts (
    message_id  TEXT        PRIMARY KEY,
    tenant_id   TEXT        NOT NULL,
    source      TEXT        NOT NULL,
    event_type  TEXT        NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gigalibs_analytics.inbox_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.inbox_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY inbox_receipts_tenant_isolation ON gigalibs_analytics.inbox_receipts
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
CREATE INDEX inbox_receipts_sweep ON gigalibs_analytics.inbox_receipts (received_at);

-- Old receipts are deleted after the retention window (the module SDK's sweeper). Analytics has no outbox.
CREATE FUNCTION gigalibs_analytics.outbox_sweep(p_retention_days integer, p_receipt_retention_days integer, p_limit integer)
RETURNS TABLE (published bigint, unrouted bigint, receipts bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = gigalibs_analytics, pg_temp
AS $$
DECLARE
  receipt_retention interval := make_interval(days => GREATEST(p_receipt_retention_days, p_retention_days, 7) + 1);
  batch integer := GREATEST(LEAST(p_limit, 50000), 1);
BEGIN
  WITH doomed AS (
    SELECT message_id FROM gigalibs_analytics.inbox_receipts WHERE received_at < now() - receipt_retention LIMIT batch)
  DELETE FROM gigalibs_analytics.inbox_receipts r USING doomed WHERE r.message_id = doomed.message_id;
  GET DIAGNOSTICS receipts = ROW_COUNT;
  published := 0;
  unrouted := 0;
  RETURN NEXT;
END
$$;
REVOKE ALL ON FUNCTION gigalibs_analytics.outbox_sweep(integer, integer, integer) FROM PUBLIC;

INSERT INTO gigalibs_analytics.schema_migrations (version, name)
VALUES (23, '000023_connector_hub_inbox')
ON CONFLICT (version) DO NOTHING;

COMMIT;
