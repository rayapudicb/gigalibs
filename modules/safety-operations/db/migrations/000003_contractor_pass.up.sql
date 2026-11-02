-- WI-OI-143 M-CONTR: contractor companies, workers, induction, revocable passes, site visits and escorts.
BEGIN;

CREATE TABLE gigalibs_safety_operations.contractor_companies (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  code VARCHAR(32) NOT NULL CHECK (code ~ '^[A-Z0-9-]{2,32}$'),
  name VARCHAR(200) NOT NULL CHECK (char_length(btrim(name)) > 0),
  coi_expires_on DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE gigalibs_safety_operations.contractor_workers (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  company_id UUID NOT NULL REFERENCES gigalibs_safety_operations.contractor_companies (id) ON DELETE RESTRICT,
  display_name VARCHAR(200) NOT NULL CHECK (char_length(btrim(display_name)) > 0),
  platform_user_id VARCHAR(128),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, platform_user_id)
);

CREATE TABLE gigalibs_safety_operations.contractor_inductions (
  worker_id UUID PRIMARY KEY REFERENCES gigalibs_safety_operations.contractor_workers (id) ON DELETE RESTRICT,
  tenant_id VARCHAR(64) NOT NULL,
  quiz_key VARCHAR(64) NOT NULL,
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 3),
  passed BOOLEAN NOT NULL,
  client_operation_id UUID NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until DATE NOT NULL,
  UNIQUE (tenant_id, worker_id, client_operation_id)
);

CREATE TABLE gigalibs_safety_operations.contractor_passes (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  worker_id UUID NOT NULL REFERENCES gigalibs_safety_operations.contractor_workers (id) ON DELETE RESTRICT,
  secret_hash CHAR(64) NOT NULL CHECK (secret_hash ~ '^[a-f0-9]{64}$'),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED'))
);
CREATE UNIQUE INDEX contractor_passes_one_active_per_worker
  ON gigalibs_safety_operations.contractor_passes (tenant_id, worker_id)
  WHERE status = 'ACTIVE';

CREATE TABLE gigalibs_safety_operations.contractor_visits (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  worker_id UUID NOT NULL REFERENCES gigalibs_safety_operations.contractor_workers (id) ON DELETE RESTRICT,
  pass_id UUID NOT NULL REFERENCES gigalibs_safety_operations.contractor_passes (id) ON DELETE RESTRICT,
  site_ref UUID,
  check_in_operation_id UUID NOT NULL,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_in_by VARCHAR(128) NOT NULL,
  checked_out_at TIMESTAMPTZ,
  checked_out_by VARCHAR(128),
  UNIQUE (tenant_id, check_in_operation_id),
  CHECK (checked_out_at IS NULL OR checked_out_at >= checked_in_at)
);
CREATE INDEX contractor_visits_open ON gigalibs_safety_operations.contractor_visits (tenant_id, checked_in_at DESC)
  WHERE checked_out_at IS NULL;

CREATE TABLE gigalibs_safety_operations.contractor_escorts (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  visit_id UUID NOT NULL REFERENCES gigalibs_safety_operations.contractor_visits (id) ON DELETE RESTRICT,
  area VARCHAR(200) NOT NULL CHECK (char_length(btrim(area)) > 0),
  authorized_by VARCHAR(128) NOT NULL,
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_operation_id UUID NOT NULL,
  UNIQUE (tenant_id, client_operation_id)
);

DO $$
DECLARE
  relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'contractor_companies', 'contractor_workers', 'contractor_inductions', 'contractor_passes',
    'contractor_visits', 'contractor_escorts'
  ] LOOP
    EXECUTE format('ALTER TABLE gigalibs_safety_operations.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_safety_operations.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_safety_operations.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      relation || '_tenant_isolation',
      relation
    );
  END LOOP;
END
$$;

INSERT INTO gigalibs_safety_operations.schema_migrations (version, name)
VALUES (3, '000003_contractor_pass');

COMMIT;
