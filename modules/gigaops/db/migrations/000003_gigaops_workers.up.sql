-- Migration 000003: GigaOps workers and attributes
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  classification_code TEXT NOT NULL REFERENCES gigalibs_gigaops.worker_classifications (code),
  state_code TEXT,
  is_union BOOLEAN NOT NULL DEFAULT false,
  union_local TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  payroll_ref TEXT,
  onboarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  worker_id_ext TEXT GENERATED ALWAYS AS ('GW-' || UPPER(SUBSTRING(MD5(id::TEXT), 1, 8))) STORED,
  CONSTRAINT workers_tenant_email_unique UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_gigaops_workers_tenant_search
  ON gigalibs_gigaops.workers (tenant_id, last_name, first_name);

CREATE INDEX IF NOT EXISTS idx_gigaops_workers_ext_id
  ON gigalibs_gigaops.workers (tenant_id, worker_id_ext);

ALTER TABLE gigalibs_gigaops.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_gigaops.workers FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'gigalibs_gigaops'
      AND tablename = 'workers'
      AND policyname = 'workers_tenant_rls'
  ) THEN
    CREATE POLICY workers_tenant_rls ON gigalibs_gigaops.workers
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
END $$;

-- Worker skill tags
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.worker_skill_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  worker_id UUID NOT NULL REFERENCES gigalibs_gigaops.workers (id) ON DELETE CASCADE,
  tag_slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT worker_skill_tags_unique UNIQUE (worker_id, tag_slug)
);

CREATE INDEX IF NOT EXISTS idx_gigaops_worker_skills_lookup
  ON gigalibs_gigaops.worker_skill_tags (tenant_id, tag_slug);

ALTER TABLE gigalibs_gigaops.worker_skill_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_gigaops.worker_skill_tags FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'gigalibs_gigaops'
      AND tablename = 'worker_skill_tags'
      AND policyname = 'worker_skill_tags_tenant_rls'
  ) THEN
    CREATE POLICY worker_skill_tags_tenant_rls ON gigalibs_gigaops.worker_skill_tags
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
END $$;

-- Worker documents
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.worker_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  worker_id UUID NOT NULL REFERENCES gigalibs_gigaops.workers (id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gigalibs_gigaops.worker_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_gigaops.worker_documents FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'gigalibs_gigaops'
      AND tablename = 'worker_documents'
      AND policyname = 'worker_documents_tenant_rls'
  ) THEN
    CREATE POLICY worker_documents_tenant_rls ON gigalibs_gigaops.worker_documents
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
END $$;

INSERT INTO gigalibs_gigaops.schema_migrations (version, applied_at)
VALUES ('000003_gigaops_workers', now())
ON CONFLICT (version) DO NOTHING;
