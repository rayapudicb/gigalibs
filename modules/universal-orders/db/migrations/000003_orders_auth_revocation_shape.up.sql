-- WI-OI-120c (U2): align the sign-in revocation table with the module SDK guard.
BEGIN;

-- 1. The module SDK guard (packages/module-sdk/src/database.ts) reads revocation_type, session_id, subject_id and
--    invalid_through_auth_version. This table had an older shape, so every signed-in request failed (audit P1-02).
--    The table has no writer yet and was empty on every known database; SET NOT NULL fails loudly if it is not.
ALTER TABLE gigalibs_orders.auth_revocation_events
  ADD COLUMN IF NOT EXISTS revocation_type varchar(32),
  ADD COLUMN IF NOT EXISTS session_id varchar(128),
  ADD COLUMN IF NOT EXISTS subject_id varchar(128),
  ADD COLUMN IF NOT EXISTS invalid_through_auth_version integer,
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE gigalibs_orders.auth_revocation_events ALTER COLUMN token_id DROP NOT NULL;
ALTER TABLE gigalibs_orders.auth_revocation_events ALTER COLUMN revocation_type SET NOT NULL;
ALTER TABLE gigalibs_orders.auth_revocation_events
  ADD CONSTRAINT auth_revocation_events_type CHECK (revocation_type IN ('SESSION', 'SUBJECT_AUTH_VERSION')),
  ADD CONSTRAINT auth_revocation_events_shape
  CHECK ((revocation_type = 'SESSION' AND session_id IS NOT NULL AND subject_id IS NULL AND invalid_through_auth_version IS NULL)
      OR (revocation_type = 'SUBJECT_AUTH_VERSION' AND session_id IS NULL AND subject_id IS NOT NULL AND invalid_through_auth_version IS NOT NULL));
CREATE INDEX IF NOT EXISTS orders_auth_session ON gigalibs_orders.auth_revocation_events (tenant_id, session_id)
  WHERE revocation_type = 'SESSION';
CREATE INDEX IF NOT EXISTS orders_auth_subject
  ON gigalibs_orders.auth_revocation_events (tenant_id, subject_id, invalid_through_auth_version)
  WHERE revocation_type = 'SUBJECT_AUTH_VERSION';

INSERT INTO gigalibs_orders.schema_migrations (version)
VALUES (3)
ON CONFLICT (version) DO NOTHING;

COMMIT;
