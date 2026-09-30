-- WI-OI-104d: the pull framework. A sync lease per connection, fuller sync job records, and a quarantine for records
-- a pull could not identify. Forward-only; additive, no data changes.

BEGIN;

ALTER TABLE gigalibs_connectors.tenant_connections
    ADD COLUMN IF NOT EXISTS sync_lease_expires_at TIMESTAMPTZ;

ALTER TABLE gigalibs_connectors.sync_jobs
    ADD COLUMN IF NOT EXISTS watermark_before VARCHAR(256),
    ADD COLUMN IF NOT EXISTS duplicates_skipped INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS records_quarantined INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pages_fetched INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS truncated BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_connection_completed
    ON gigalibs_connectors.sync_jobs (tenant_id, connection_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS gigalibs_connectors.quarantined_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    connection_id VARCHAR(64) NOT NULL REFERENCES gigalibs_connectors.tenant_connections(id) ON DELETE CASCADE,
    sync_job_id VARCHAR(64),
    source_id VARCHAR(256),
    reason VARCHAR(256) NOT NULL,
    -- NULL when the record was too large or not JSON; the reason says which.
    raw_payload JSONB,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quarantined_records_connection
    ON gigalibs_connectors.quarantined_records (tenant_id, connection_id, received_at DESC);

ALTER TABLE gigalibs_connectors.quarantined_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_connectors.quarantined_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quarantined_records_tenant_isolation ON gigalibs_connectors.quarantined_records;
CREATE POLICY quarantined_records_tenant_isolation ON gigalibs_connectors.quarantined_records
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- The generic REST adapter: any JSON API configured as a pull source, with no code.
INSERT INTO gigalibs_connectors.connector_definitions (
  id, connector_code, name, category, description, icon, auth_types, supported_events, status, created_at
) VALUES (
  'cdef-rest-pull',
  'GENERIC_REST_PULL',
  'REST API (scheduled pull)',
  'GENERIC',
  'Pulls records from any JSON REST API: paging, incremental watermark, API key, bearer token or OAuth2 client login, retries and a quarantine for bad records.',
  'api',
  '["NONE","API_KEY","BEARER_TOKEN","OAUTH2_CLIENT_CREDENTIALS"]'::jsonb,
  '["generic_rest_pull.pulled"]'::jsonb,
  'ACTIVE',
  now()
)
ON CONFLICT (connector_code) DO NOTHING;

INSERT INTO gigalibs_connectors.schema_migrations (version, name, applied_at)
VALUES (6, '000006_pull_framework', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
