-- WI-OI-121g / ADR-0003, ADR-0018: private Assistant data, no legacy ChatChannel backfill.
-- Additive and forward-only. Policy rows are absent until Configuration Studio publishes a reviewed policy.
BEGIN;

CREATE SCHEMA IF NOT EXISTS gigalibs_assistant;
CREATE TABLE gigalibs_assistant.schema_migrations (
  version bigint PRIMARY KEY CHECK (version > 0),
  name text NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE gigalibs_assistant.tenant_policies (
  tenant_id varchar(64) PRIMARY KEY,
  source_manifest_version varchar(128) NOT NULL,
  source_checksum char(64) NOT NULL CHECK (source_checksum ~ '^[0-9a-f]{64}$'),
  retention_days integer NOT NULL CHECK (retention_days BETWEEN 1 AND 365),
  status varchar(16) NOT NULL CHECK (status IN ('PUBLISHED', 'DISABLED')),
  published_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE gigalibs_assistant.assistant_threads (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  title varchar(120) NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  idempotency_key varchar(128) NOT NULL,
  request_sha256 char(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  policy_version varchar(128) NOT NULL,
  policy_checksum char(64) NOT NULL,
  classification varchar(32) NOT NULL DEFAULT 'TENANT_INTERNAL'
    CHECK (classification = 'TENANT_INTERNAL'),
  expires_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, id, owner_user_id),
  UNIQUE (tenant_id, owner_user_id, idempotency_key),
  CHECK (expires_at > created_at)
);
CREATE INDEX assistant_threads_owner_page
  ON gigalibs_assistant.assistant_threads (tenant_id, owner_user_id, created_at DESC, id DESC);
CREATE INDEX assistant_threads_expiry ON gigalibs_assistant.assistant_threads (expires_at);

CREATE TABLE gigalibs_assistant.assistant_messages (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  thread_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  actor_user_id varchar(128) NOT NULL,
  role varchar(16) NOT NULL CHECK (role IN ('USER', 'ASSISTANT')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 8192),
  run_id uuid,
  idempotency_key varchar(128) NOT NULL,
  request_sha256 char(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, owner_user_id, thread_id, idempotency_key),
  FOREIGN KEY (tenant_id, thread_id, owner_user_id)
    REFERENCES gigalibs_assistant.assistant_threads (tenant_id, id, owner_user_id) ON DELETE CASCADE
);
CREATE INDEX assistant_messages_thread_page
  ON gigalibs_assistant.assistant_messages (tenant_id, thread_id, owner_user_id, created_at DESC, id DESC);

CREATE TABLE gigalibs_assistant.assistant_runs (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  thread_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  actor_user_id varchar(128) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  request_sha256 char(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  status varchar(16) NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  policy_version varchar(128) NOT NULL,
  provider varchar(80),
  model varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, owner_user_id, idempotency_key),
  FOREIGN KEY (tenant_id, thread_id, owner_user_id)
    REFERENCES gigalibs_assistant.assistant_threads (tenant_id, id, owner_user_id) ON DELETE CASCADE
);

CREATE TABLE gigalibs_assistant.audit_events (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  actor_user_id varchar(128) NOT NULL,
  thread_id uuid,
  action varchar(40) NOT NULL,
  correlation_id varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assistant_audit_actor ON gigalibs_assistant.audit_events (tenant_id, actor_user_id, created_at DESC);

CREATE TABLE gigalibs_assistant.auth_revocation_events (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  revocation_type varchar(32) NOT NULL CHECK (revocation_type IN ('SESSION', 'SUBJECT_AUTH_VERSION')),
  session_id varchar(128),
  subject_id varchar(128),
  invalid_through_auth_version integer,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((revocation_type = 'SESSION' AND session_id IS NOT NULL AND subject_id IS NULL AND invalid_through_auth_version IS NULL)
      OR (revocation_type = 'SUBJECT_AUTH_VERSION' AND session_id IS NULL AND subject_id IS NOT NULL AND invalid_through_auth_version IS NOT NULL))
);
CREATE INDEX assistant_revoked_session ON gigalibs_assistant.auth_revocation_events (tenant_id, session_id)
  WHERE revocation_type = 'SESSION';
CREATE INDEX assistant_revoked_subject ON gigalibs_assistant.auth_revocation_events
  (tenant_id, subject_id, invalid_through_auth_version) WHERE revocation_type = 'SUBJECT_AUTH_VERSION';

DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['tenant_policies', 'assistant_threads', 'assistant_messages', 'assistant_runs', 'audit_events', 'auth_revocation_events'] LOOP
    EXECUTE format('ALTER TABLE gigalibs_assistant.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_assistant.%I FORCE ROW LEVEL SECURITY', relation);
  END LOOP;
END $$;

CREATE POLICY assistant_policy_tenant ON gigalibs_assistant.tenant_policies
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
CREATE POLICY assistant_thread_owner ON gigalibs_assistant.assistant_threads
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND owner_user_id = NULLIF(current_setting('app.actor_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND owner_user_id = NULLIF(current_setting('app.actor_id', true), ''));
CREATE POLICY assistant_message_owner ON gigalibs_assistant.assistant_messages
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND owner_user_id = NULLIF(current_setting('app.actor_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND owner_user_id = NULLIF(current_setting('app.actor_id', true), '')
    AND actor_user_id = NULLIF(current_setting('app.actor_id', true), ''));
CREATE POLICY assistant_run_owner ON gigalibs_assistant.assistant_runs
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND owner_user_id = NULLIF(current_setting('app.actor_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND owner_user_id = NULLIF(current_setting('app.actor_id', true), '')
    AND actor_user_id = NULLIF(current_setting('app.actor_id', true), ''));
CREATE POLICY assistant_audit_actor ON gigalibs_assistant.audit_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND actor_user_id = NULLIF(current_setting('app.actor_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND actor_user_id = NULLIF(current_setting('app.actor_id', true), ''));
CREATE POLICY assistant_revocation_tenant ON gigalibs_assistant.auth_revocation_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

INSERT INTO gigalibs_assistant.schema_migrations (version, name)
VALUES (1, '000001_assistant_private_threads');
COMMIT;
