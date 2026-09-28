-- Migration 000004: Work units and roles
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.work_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  location_name TEXT,
  location_country_code TEXT NOT NULL DEFAULT 'US',
  location_state_code TEXT,
  guaranteed_hours NUMERIC NOT NULL DEFAULT 0,
  headcount_target INT NOT NULL DEFAULT 1,
  industry_slug TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gigaops_work_units_tenant_status
  ON gigalibs_gigaops.work_units (tenant_id, status, start_at);

ALTER TABLE gigalibs_gigaops.work_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_gigaops.work_units FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'gigalibs_gigaops'
      AND tablename = 'work_units'
      AND policyname = 'work_units_tenant_rls'
  ) THEN
    CREATE POLICY work_units_tenant_rls ON gigalibs_gigaops.work_units
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
END $$;

-- Roles under work units
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  work_unit_id UUID NOT NULL REFERENCES gigalibs_gigaops.work_units (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  required_skill_tags TEXT[] NOT NULL DEFAULT '{}',
  headcount_needed INT NOT NULL DEFAULT 1,
  requires_agreement BOOLEAN NOT NULL DEFAULT true,
  pay_type_code TEXT NOT NULL REFERENCES gigalibs_gigaops.pay_type_catalogue (code),
  agreement_template_key TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gigaops_roles_wu_lookup
  ON gigalibs_gigaops.roles (tenant_id, work_unit_id);

ALTER TABLE gigalibs_gigaops.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_gigaops.roles FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'gigalibs_gigaops'
      AND tablename = 'roles'
      AND policyname = 'roles_tenant_rls'
  ) THEN
    CREATE POLICY roles_tenant_rls ON gigalibs_gigaops.roles
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
END $$;

INSERT INTO gigalibs_gigaops.schema_migrations (version, applied_at)
VALUES ('000004_gigaops_work_units_roles', now())
ON CONFLICT (version) DO NOTHING;
