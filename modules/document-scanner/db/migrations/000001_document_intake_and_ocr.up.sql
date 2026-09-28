-- Migration 000001: Document Intake and OCR Extraction Engine
-- Establishes tenant-scoped document storage metadata and durable extraction jobs with RLS.

CREATE SCHEMA IF NOT EXISTS gigalibs_scanner;

-- 1. Document Uploads Table
CREATE TABLE IF NOT EXISTS gigalibs_scanner.document_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  sha256_checksum char(64) NOT NULL,
  storage_key text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 26214400), -- 25MB max
  uploaded_by text NOT NULL,
  status text NOT NULL DEFAULT 'QUARANTINED' CHECK (status IN ('QUARANTINED', 'CLEARED', 'FAILED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scanner_uploads_tenant_created 
  ON gigalibs_scanner.document_uploads(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scanner_uploads_sha256 
  ON gigalibs_scanner.document_uploads(sha256_checksum);

-- 2. Extraction Jobs Table
CREATE TABLE IF NOT EXISTS gigalibs_scanner.extraction_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  document_id uuid NOT NULL REFERENCES gigalibs_scanner.document_uploads(id) ON DELETE CASCADE,
  model_adapter text NOT NULL DEFAULT 'GIGALIBS_OCR_V1',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'EXTRACTED', 'FAILED', 'APPROVED', 'HANDED_OFF')),
  confidence_score numeric(4,3) NOT NULL DEFAULT 0.000 CHECK (confidence_score >= 0.000 AND confidence_score <= 1.000),
  extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  corrected_data jsonb,
  is_arithmetic_reconciled boolean NOT NULL DEFAULT false,
  approved_by text,
  approved_at timestamptz,
  handoff_target text CHECK (handoff_target IS NULL OR handoff_target IN ('ACCOUNTS_PAYABLE', 'SPEND_MANAGEMENT')),
  handoff_reference_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scanner_jobs_tenant_created 
  ON gigalibs_scanner.extraction_jobs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scanner_jobs_document_id 
  ON gigalibs_scanner.extraction_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_scanner_jobs_status 
  ON gigalibs_scanner.extraction_jobs(status);

-- 3. Row-Level Security (RLS) Configuration
ALTER TABLE gigalibs_scanner.document_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_scanner.extraction_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_document_uploads ON gigalibs_scanner.document_uploads;
CREATE POLICY tenant_isolation_document_uploads ON gigalibs_scanner.document_uploads
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_extraction_jobs ON gigalibs_scanner.extraction_jobs;
CREATE POLICY tenant_isolation_extraction_jobs ON gigalibs_scanner.extraction_jobs
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
