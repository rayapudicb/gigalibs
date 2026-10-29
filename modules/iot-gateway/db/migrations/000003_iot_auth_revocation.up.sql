BEGIN;

CREATE TABLE gigalibs_iot.auth_revocation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id gigalibs_iot.tenant_ref NOT NULL,
  revocation_type text NOT NULL CHECK (revocation_type IN ('SESSION', 'SUBJECT_AUTH_VERSION')),
  session_id text,
  subject_id text,
  invalid_through_auth_version integer,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_revocation_events_shape CHECK (
    (revocation_type = 'SESSION' AND session_id IS NOT NULL AND subject_id IS NULL AND invalid_through_auth_version IS NULL)
    OR (revocation_type = 'SUBJECT_AUTH_VERSION' AND session_id IS NULL AND subject_id IS NOT NULL AND invalid_through_auth_version IS NOT NULL)
  )
);

ALTER TABLE gigalibs_iot.auth_revocation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_iot.auth_revocation_events FORCE ROW LEVEL SECURITY;
CREATE POLICY iot_auth_revocation_events_tenant_isolation ON gigalibs_iot.auth_revocation_events
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));

INSERT INTO gigalibs_iot.schema_migrations (version, name)
VALUES (3, '000003_iot_auth_revocation');

COMMIT;
