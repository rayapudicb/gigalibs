BEGIN;

CREATE TABLE gigalibs_workforce.auth_revocation_events (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
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
  ON gigalibs_workforce.auth_revocation_events (tenant_id, session_id)
  WHERE revocation_type = 'SESSION';
CREATE INDEX auth_revocation_events_subject_lookup
  ON gigalibs_workforce.auth_revocation_events
    (tenant_id, subject_id, invalid_through_auth_version)
  WHERE revocation_type = 'SUBJECT_AUTH_VERSION';

CREATE TABLE gigalibs_workforce.audit_events (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  actor_subject VARCHAR(128) NOT NULL,
  action VARCHAR(128) NOT NULL,
  entity_type VARCHAR(128) NOT NULL,
  entity_id VARCHAR(128),
  correlation_id VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_tenant_time
  ON gigalibs_workforce.audit_events (tenant_id, occurred_at DESC);

CREATE TABLE gigalibs_workforce.outbox_events (
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
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  last_error_code VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, aggregate_type, aggregate_id, aggregate_version, event_type)
);

CREATE INDEX outbox_events_delivery
  ON gigalibs_workforce.outbox_events (status, available_at, created_at);

CREATE TABLE gigalibs_workforce.inbox_receipts (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  consumer_name VARCHAR(128) NOT NULL,
  message_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  source_module VARCHAR(128) NOT NULL,
  source_version INTEGER NOT NULL CHECK (source_version > 0),
  correlation_id VARCHAR(128) NOT NULL,
  payload_sha256 CHAR(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status VARCHAR(16) NOT NULL DEFAULT 'RECEIVED'
    CHECK (status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  last_error_code VARCHAR(128),
  UNIQUE (tenant_id, consumer_name, message_id)
);

CREATE INDEX inbox_receipts_processing
  ON gigalibs_workforce.inbox_receipts (tenant_id, status, received_at);

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'auth_revocation_events',
    'audit_events',
    'outbox_events',
    'inbox_receipts'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE gigalibs_workforce.%I ENABLE ROW LEVEL SECURITY',
      table_name
    );
    EXECUTE format(
      'ALTER TABLE gigalibs_workforce.%I FORCE ROW LEVEL SECURITY',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_workforce.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      table_name || '_tenant_isolation',
      table_name
    );
  END LOOP;
END
$$;

INSERT INTO gigalibs_workforce.schema_migrations (version, name)
VALUES (2, '000002_workforce_security_and_delivery_foundation');

COMMIT;
