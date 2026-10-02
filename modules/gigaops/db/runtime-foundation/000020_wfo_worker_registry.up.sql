-- WI-WFO-001 Step 2: Universal worker registry and compliance documents
-- Follows canonical gigalibs_workforce patterns:
--   - tenant_id VARCHAR(64) with forced RLS
--   - composite unique keys (tenant_id, id) for safe multi-tenant foreign keys
--   - deterministic status enums and validation checks
BEGIN;

CREATE TABLE gigalibs_workforce.wfo_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  portal_user_id VARCHAR(64),
  first_name VARCHAR(100) NOT NULL CHECK (length(btrim(first_name)) > 0),
  last_name VARCHAR(100) NOT NULL CHECK (length(btrim(last_name)) > 0),
  email VARCHAR(255) NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  phone VARCHAR(32),
  worker_type VARCHAR(20) NOT NULL DEFAULT 'INDIVIDUAL'
    CHECK (worker_type IN ('INDIVIDUAL', 'AGENCY', 'TPV', 'CONTINGENT')),
  lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'PROSPECT_LEAD'
    CHECK (lifecycle_status IN ('PROSPECT_LEAD', 'PROSPECT', 'ONBOARDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED')),
  onboarding_pct SMALLINT NOT NULL DEFAULT 0
    CHECK (onboarding_pct BETWEEN 0 AND 100),
  identity_hash VARCHAR(128),
  union_id VARCHAR(64),
  primary_org_unit_id VARCHAR(64),
  skills JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(skills) = 'array'),
  external_ids JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(external_ids) = 'object'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by VARCHAR(128) NOT NULL,
  updated_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, email)
);

CREATE INDEX wfo_workers_tenant_status ON gigalibs_workforce.wfo_workers (tenant_id, lifecycle_status);
CREATE INDEX wfo_workers_tenant_org_unit ON gigalibs_workforce.wfo_workers (tenant_id, primary_org_unit_id);
CREATE UNIQUE INDEX wfo_workers_identity_hash_idx ON gigalibs_workforce.wfo_workers (tenant_id, identity_hash)
  WHERE identity_hash IS NOT NULL;

CREATE TABLE gigalibs_workforce.wfo_compliance_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  worker_id UUID NOT NULL,
  doc_type VARCHAR(64) NOT NULL CHECK (length(btrim(doc_type)) > 0),
  file_url VARCHAR(1024) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  expires_at DATE,
  verified_by VARCHAR(128),
  verified_at TIMESTAMPTZ,
  notes VARCHAR(1000),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, worker_id) REFERENCES gigalibs_workforce.wfo_workers (tenant_id, id) ON DELETE CASCADE,
  CHECK (status <> 'APPROVED' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);

CREATE INDEX wfo_compliance_docs_worker ON gigalibs_workforce.wfo_compliance_documents (tenant_id, worker_id, status);
CREATE INDEX wfo_compliance_docs_expiry ON gigalibs_workforce.wfo_compliance_documents (tenant_id, expires_at)
  WHERE expires_at IS NOT NULL;

-- Enable and force row-level security for tenant isolation
ALTER TABLE gigalibs_workforce.wfo_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workforce.wfo_workers FORCE ROW LEVEL SECURITY;
CREATE POLICY wfo_workers_tenant_isolation ON gigalibs_workforce.wfo_workers
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_workforce.wfo_compliance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workforce.wfo_compliance_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY wfo_compliance_docs_tenant_isolation ON gigalibs_workforce.wfo_compliance_documents
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

COMMIT;
