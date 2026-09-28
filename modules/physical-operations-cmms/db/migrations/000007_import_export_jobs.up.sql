-- WI-OI-043 / Phase 1: import_jobs, import_job_rows, export_jobs
-- Enables async background Excel import and streaming export for all CMMS entities.
BEGIN;

-- ─── import_jobs ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.import_jobs (
  tenant_id           uuid        NOT NULL,
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  entity_type         text        NOT NULL,
  status              text        NOT NULL DEFAULT 'PENDING',
  total_rows          integer,
  success_rows        integer     NOT NULL DEFAULT 0,
  failed_rows         integer     NOT NULL DEFAULT 0,
  column_warnings     jsonb       NOT NULL DEFAULT '[]',
  options             jsonb       NOT NULL DEFAULT '{}',
  s3_key              text,
  error_report_s3_key text,
  created_by          uuid        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at          timestamptz NOT NULL DEFAULT transaction_timestamp(),
  completed_at        timestamptz,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT import_jobs_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT import_jobs_status_check CHECK (status IN (
    'PENDING','PARSING','VALIDATING','AWAITING_REVIEW','COMMITTING',
    'COMPLETED','COMPLETED_WITH_ERRORS','FAILED','CANCELLED'
  )),
  CONSTRAINT import_jobs_entity_type_check CHECK (entity_type IN (
    'assets','locations','parts','vendors','customers',
    'workforce_resources','departments'
  ))
);

CREATE INDEX IF NOT EXISTS idx_cmms_import_jobs_tenant_status
  ON gigalibs_cmms.import_jobs (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmms_import_jobs_tenant_actor
  ON gigalibs_cmms.import_jobs (tenant_id, created_by, created_at DESC);

ALTER TABLE gigalibs_cmms.import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.import_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY cmms_import_jobs_tenant ON gigalibs_cmms.import_jobs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ─── import_job_rows ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.import_job_rows (
  tenant_id    uuid    NOT NULL,
  id           uuid    NOT NULL DEFAULT gen_random_uuid(),
  job_id       uuid    NOT NULL,
  row_number   integer NOT NULL,
  external_id  text,
  status       text    NOT NULL DEFAULT 'PENDING',
  error_detail jsonb,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT import_job_rows_job_fk FOREIGN KEY (tenant_id, job_id)
    REFERENCES gigalibs_cmms.import_jobs (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT import_job_rows_status_check CHECK (status IN (
    'PENDING','VALID','FAILED','COMMITTED'
  ))
);

CREATE INDEX IF NOT EXISTS idx_cmms_import_job_rows_job_status
  ON gigalibs_cmms.import_job_rows (tenant_id, job_id, status);

ALTER TABLE gigalibs_cmms.import_job_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.import_job_rows FORCE ROW LEVEL SECURITY;

CREATE POLICY cmms_import_job_rows_tenant ON gigalibs_cmms.import_job_rows
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ─── export_jobs ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.export_jobs (
  tenant_id               uuid        NOT NULL,
  id                      uuid        NOT NULL DEFAULT gen_random_uuid(),
  entity_type             text        NOT NULL,
  status                  text        NOT NULL DEFAULT 'PENDING',
  filters                 jsonb       NOT NULL DEFAULT '{}',
  row_count               integer,
  s3_key                  text,
  download_url_expires_at timestamptz,
  exported_by             uuid        NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT transaction_timestamp(),
  completed_at            timestamptz,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT export_jobs_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT export_jobs_status_check CHECK (status IN (
    'PENDING','RUNNING','COMPLETED','FAILED'
  )),
  CONSTRAINT export_jobs_entity_type_check CHECK (entity_type IN (
    'assets','locations','parts','vendors','customers',
    'workforce_resources','departments'
  ))
);

CREATE INDEX IF NOT EXISTS idx_cmms_export_jobs_tenant_status
  ON gigalibs_cmms.export_jobs (tenant_id, status, created_at DESC);

ALTER TABLE gigalibs_cmms.export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.export_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY cmms_export_jobs_tenant ON gigalibs_cmms.export_jobs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ─── schema_migrations ledger ─────────────────────────────────────────────────
INSERT INTO gigalibs_cmms.schema_migrations (version, name, applied_at)
VALUES (7, 'import_export_jobs', transaction_timestamp())
ON CONFLICT (version) DO NOTHING;

COMMIT;
