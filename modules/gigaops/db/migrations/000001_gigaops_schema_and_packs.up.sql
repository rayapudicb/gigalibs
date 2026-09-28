-- Migration 000001: GigaOps schema and pack registry
CREATE SCHEMA IF NOT EXISTS gigalibs_gigaops;

CREATE TABLE IF NOT EXISTS gigalibs_gigaops.schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- tenant -> active industry + country pack
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.tenant_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  industry_slug TEXT NOT NULL,
  country_code TEXT NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_gigaops_tenant_packs_lookup
  ON gigalibs_gigaops.tenant_packs (tenant_id, is_active);

ALTER TABLE gigalibs_gigaops.tenant_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_gigaops.tenant_packs FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'gigalibs_gigaops'
      AND tablename = 'tenant_packs'
      AND policyname = 'tenant_packs_rls'
  ) THEN
    CREATE POLICY tenant_packs_rls ON gigalibs_gigaops.tenant_packs
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
END $$;

INSERT INTO gigalibs_gigaops.schema_migrations (version, applied_at)
VALUES ('000001_gigaops_schema_and_packs', now())
ON CONFLICT (version) DO NOTHING;
