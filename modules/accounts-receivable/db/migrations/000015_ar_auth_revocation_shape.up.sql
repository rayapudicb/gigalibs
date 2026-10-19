-- WI-OI-120gy (M-AR0): auth revocation ledger for module SDK SignedContextGuardBase.
BEGIN;

CREATE TABLE IF NOT EXISTS gigalibs_ar.auth_revocation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    revocation_type VARCHAR(32) NOT NULL,
    session_id VARCHAR(128),
    subject_id VARCHAR(128),
    invalid_through_auth_version INTEGER,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT auth_revocation_events_type CHECK (revocation_type IN ('SESSION', 'SUBJECT_AUTH_VERSION')),
    CONSTRAINT auth_revocation_events_shape CHECK (
      (revocation_type = 'SESSION' AND session_id IS NOT NULL AND subject_id IS NULL AND invalid_through_auth_version IS NULL)
      OR (revocation_type = 'SUBJECT_AUTH_VERSION' AND session_id IS NULL AND subject_id IS NOT NULL AND invalid_through_auth_version IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS ar_auth_session ON gigalibs_ar.auth_revocation_events (tenant_id, session_id)
  WHERE revocation_type = 'SESSION';
CREATE INDEX IF NOT EXISTS ar_auth_subject
  ON gigalibs_ar.auth_revocation_events (tenant_id, subject_id, invalid_through_auth_version)
  WHERE revocation_type = 'SUBJECT_AUTH_VERSION';

ALTER TABLE gigalibs_ar.auth_revocation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.auth_revocation_events FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_revocation_events_tenant_policy ON gigalibs_ar.auth_revocation_events
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

INSERT INTO gigalibs_ar.schema_migrations (version, name)
VALUES (15, '000015_ar_auth_revocation_shape')
ON CONFLICT (version) DO NOTHING;

COMMIT;
