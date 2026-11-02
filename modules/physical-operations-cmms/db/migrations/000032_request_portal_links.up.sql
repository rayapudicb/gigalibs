-- WI-OI-140 M-REQ: QR maintenance requests (CMMS extension). Additive: five new tenant-isolated tables: request links
-- (only the secret's SHA-256 is kept), no-login portal submissions, signed-in mobile reports, and their photos.
-- Submissions, reports and photos are append-only for the runtime role. Recovery: the down migration drops the tables
-- while empty; otherwise roll forward.
BEGIN;

CREATE TABLE gigalibs_cmms.portal_links (
  tenant_id      gigalibs_cmms.tenant_ref NOT NULL,
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_id       uuid NOT NULL,
  label          text CHECK (char_length(label) BETWEEN 1 AND 80),
  secret_sha256  text NOT NULL CHECK (secret_sha256 ~ '^[0-9a-f]{64}$'),
  status         text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  expires_at     timestamptz,
  created_by     gigalibs_cmms.principal_ref NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  revoked_by     gigalibs_cmms.principal_ref,
  revoked_at     timestamptz,
  revoke_reason  text CHECK (char_length(revoke_reason) BETWEEN 1 AND 500),
  last_used_at   timestamptz,
  version        integer NOT NULL DEFAULT 1 CHECK (version > 0),
  correlation_id text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT portal_links_secret_unique UNIQUE (secret_sha256),
  CONSTRAINT portal_links_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT portal_links_revocation CHECK (
    (status = 'REVOKED') = (revoked_by IS NOT NULL) AND (revoked_by IS NULL) = (revoked_at IS NULL)
    AND (revoked_by IS NULL) = (revoke_reason IS NULL)),
  CONSTRAINT portal_links_expiry CHECK (expires_at IS NULL OR expires_at > created_at)
);
CREATE INDEX portal_links_asset ON gigalibs_cmms.portal_links (tenant_id, asset_id);

CREATE TABLE gigalibs_cmms.portal_submissions (
  tenant_id           gigalibs_cmms.tenant_ref NOT NULL,
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  link_id             uuid NOT NULL,
  client_operation_id uuid NOT NULL,
  client_key          text NOT NULL CHECK (client_key ~ '^[0-9a-f]{64}$'),
  issue_type          text NOT NULL CHECK (issue_type IN ('STOPPED', 'NOISE', 'LEAK', 'QUALITY', 'SAFETY', 'OTHER')),
  request_id          uuid NOT NULL,
  status_secret_sha256 text NOT NULL CHECK (status_secret_sha256 ~ '^[0-9a-f]{64}$'),
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT portal_submissions_operation_unique UNIQUE (tenant_id, link_id, client_operation_id),
  CONSTRAINT portal_submissions_status_unique UNIQUE (status_secret_sha256),
  CONSTRAINT portal_submissions_link_fk FOREIGN KEY (tenant_id, link_id)
    REFERENCES gigalibs_cmms.portal_links (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT portal_submissions_request_fk FOREIGN KEY (tenant_id, request_id)
    REFERENCES gigalibs_cmms.maintenance_requests (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX portal_submissions_link_time ON gigalibs_cmms.portal_submissions (tenant_id, link_id, submitted_at DESC);
CREATE INDEX portal_submissions_tenant_time ON gigalibs_cmms.portal_submissions (tenant_id, submitted_at DESC);

CREATE TABLE gigalibs_cmms.portal_submission_photos (
  tenant_id     gigalibs_cmms.tenant_ref NOT NULL,
  submission_id uuid NOT NULL,
  content_type  text NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  bytes         bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 16 AND 307200),
  sha256        text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (tenant_id, submission_id),
  CONSTRAINT portal_submission_photos_submission_fk FOREIGN KEY (tenant_id, submission_id)
    REFERENCES gigalibs_cmms.portal_submissions (tenant_id, id) ON DELETE RESTRICT
);

-- Signed-in reports from the mobile app: one per member and operation, so a resend is the same request.
CREATE TABLE gigalibs_cmms.request_reports (
  tenant_id           gigalibs_cmms.tenant_ref NOT NULL,
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  client_operation_id uuid NOT NULL,
  requester_subject   gigalibs_cmms.principal_ref NOT NULL,
  asset_id            uuid NOT NULL,
  issue_type          text NOT NULL CHECK (issue_type IN ('STOPPED', 'NOISE', 'LEAK', 'QUALITY', 'SAFETY', 'OTHER')),
  request_id          uuid NOT NULL,
  payload_sha256      text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT request_reports_operation_unique UNIQUE (tenant_id, requester_subject, client_operation_id),
  CONSTRAINT request_reports_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT request_reports_request_fk FOREIGN KEY (tenant_id, request_id)
    REFERENCES gigalibs_cmms.maintenance_requests (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX request_reports_requester_time ON gigalibs_cmms.request_reports (tenant_id, requester_subject, submitted_at DESC);

CREATE TABLE gigalibs_cmms.request_report_photos (
  tenant_id    gigalibs_cmms.tenant_ref NOT NULL,
  report_id    uuid NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  bytes        bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 16 AND 307200),
  sha256       text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (tenant_id, report_id),
  CONSTRAINT request_report_photos_report_fk FOREIGN KEY (tenant_id, report_id)
    REFERENCES gigalibs_cmms.request_reports (tenant_id, id) ON DELETE RESTRICT
);

DO $rls$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['portal_links', 'portal_submissions', 'portal_submission_photos', 'request_reports',
    'request_report_photos'] LOOP
    EXECUTE format('ALTER TABLE gigalibs_cmms.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE gigalibs_cmms.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_cmms.%I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')) '
      'WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), ''''))',
      'cmms_' || table_name || '_tenant_isolation', table_name);
  END LOOP;
END
$rls$;

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (32, '000032_request_portal_links');

COMMIT;
