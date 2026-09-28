-- WI-OI-064a: Analytics verifies the BFF-signed PlatformContextV1 like Workforce and Geospatial. Revoked
-- sessions and subject auth versions are recorded here; the runtime role may only read this table
-- (MODULE_READ_ONLY_TABLES). Forward-only; previously applied migrations remain immutable.

BEGIN;

CREATE TABLE gigalibs_analytics.auth_revocation_events (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  revocation_type VARCHAR(32) NOT NULL
    CHECK (revocation_type IN ('SESSION', 'SUBJECT_AUTH_VERSION')),
  session_id VARCHAR(128),
  subject_id VARCHAR(128),
  invalid_through_auth_version INTEGER,
  reason VARCHAR(256) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (revocation_type = 'SESSION' AND session_id IS NOT NULL
      AND subject_id IS NULL AND invalid_through_auth_version IS NULL)
    OR
    (revocation_type = 'SUBJECT_AUTH_VERSION' AND session_id IS NULL
      AND subject_id IS NOT NULL AND invalid_through_auth_version IS NOT NULL
      AND invalid_through_auth_version >= 0)
  )
);

CREATE INDEX auth_revocation_events_session_lookup
  ON gigalibs_analytics.auth_revocation_events (tenant_id, session_id)
  WHERE revocation_type = 'SESSION';
CREATE INDEX auth_revocation_events_subject_lookup
  ON gigalibs_analytics.auth_revocation_events (tenant_id, subject_id, invalid_through_auth_version)
  WHERE revocation_type = 'SUBJECT_AUTH_VERSION';

ALTER TABLE gigalibs_analytics.auth_revocation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.auth_revocation_events FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_revocation_events_tenant_isolation_v12
  ON gigalibs_analytics.auth_revocation_events
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

INSERT INTO gigalibs_analytics.schema_migrations (version, name, applied_at)
VALUES (12, '000012_platform_context_revocation', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
