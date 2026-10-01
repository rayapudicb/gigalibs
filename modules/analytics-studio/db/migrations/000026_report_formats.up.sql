BEGIN;

-- WI-OI-106 (ADR-0016 F17): a report produces one file per chosen format (CSV, Excel, PDF). Existing reports keep
-- CSV only, so their output does not change; existing files are CSV.
ALTER TABLE gigalibs_analytics.report_definitions
    ADD COLUMN formats TEXT[] NOT NULL DEFAULT ARRAY['CSV']::TEXT[]
    CHECK (cardinality(formats) BETWEEN 1 AND 3 AND formats <@ ARRAY['CSV', 'XLSX', 'PDF']::TEXT[]);

ALTER TABLE gigalibs_analytics.report_artifacts
    ADD COLUMN format TEXT NOT NULL DEFAULT 'CSV' CHECK (format IN ('CSV', 'XLSX', 'PDF'));

CREATE UNIQUE INDEX report_artifacts_run_format ON gigalibs_analytics.report_artifacts (run_id, format);

-- WI-OI-106 safe token renewal: grants issued on demand when downloading an artifact.
-- Immutable artifacts stay stored; grants hold short-lived hashed tokens with tenant isolation.
CREATE TABLE IF NOT EXISTS gigalibs_analytics.report_download_grants (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     TEXT NOT NULL,
    artifact_id   UUID NOT NULL REFERENCES gigalibs_analytics.report_artifacts(id) ON DELETE CASCADE,
    token_hash    TEXT NOT NULL UNIQUE,
    user_id       TEXT NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gigalibs_analytics.report_download_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.report_download_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY report_download_grants_tenant_isolation ON gigalibs_analytics.report_download_grants
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE INDEX idx_report_download_grants_lookup ON gigalibs_analytics.report_download_grants (token_hash, expires_at);
CREATE INDEX idx_report_download_grants_expiry ON gigalibs_analytics.report_download_grants (tenant_id, expires_at);

INSERT INTO gigalibs_analytics.schema_migrations (version, name)
VALUES (26, '000026_report_formats')
ON CONFLICT (version) DO NOTHING;

COMMIT;
