BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE gigalibs_workforce.workforce_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  reference_code VARCHAR(64) NOT NULL CHECK (reference_code ~ '^[A-Z0-9][A-Z0-9._-]*$'),
  display_name VARCHAR(200) NOT NULL CHECK (length(btrim(display_name)) > 0),
  resource_type VARCHAR(16) NOT NULL CHECK (resource_type IN ('HUMAN', 'CREW', 'POOL')),
  platform_user_id VARCHAR(128),
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by VARCHAR(128) NOT NULL,
  updated_by VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, reference_code)
);

CREATE UNIQUE INDEX workforce_resources_tenant_platform_user
  ON gigalibs_workforce.workforce_resources (tenant_id, platform_user_id)
  WHERE platform_user_id IS NOT NULL;
CREATE INDEX workforce_resources_tenant_search
  ON gigalibs_workforce.workforce_resources (tenant_id, status, resource_type, display_name);

CREATE TABLE gigalibs_workforce.capability_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  code VARCHAR(64) NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._-]*$'),
  name VARCHAR(160) NOT NULL CHECK (length(btrim(name)) > 0),
  description VARCHAR(1000),
  evidence_required BOOLEAN NOT NULL DEFAULT false,
  default_validity_days INTEGER CHECK (default_validity_days BETWEEN 1 AND 36500),
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by VARCHAR(128) NOT NULL,
  updated_by VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);

CREATE INDEX capability_definitions_tenant_search
  ON gigalibs_workforce.capability_definitions (tenant_id, status, name);

CREATE TABLE gigalibs_workforce.resource_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  resource_id UUID NOT NULL,
  capability_definition_id UUID NOT NULL,
  proficiency VARCHAR(16) NOT NULL DEFAULT 'STANDARD'
    CHECK (proficiency IN ('STANDARD', 'ADVANCED', 'EXPERT', 'MASTER')),
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED')),
  valid_from TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  issuing_authority VARCHAR(200),
  evidence_reference VARCHAR(300),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by VARCHAR(128) NOT NULL,
  updated_by VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at > valid_from),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, resource_id, capability_definition_id),
  FOREIGN KEY (tenant_id, resource_id)
    REFERENCES gigalibs_workforce.workforce_resources (tenant_id, id),
  FOREIGN KEY (tenant_id, capability_definition_id)
    REFERENCES gigalibs_workforce.capability_definitions (tenant_id, id)
);

CREATE INDEX resource_capabilities_resource_lookup
  ON gigalibs_workforce.resource_capabilities (tenant_id, resource_id, status);
CREATE INDEX resource_capabilities_expiry_lookup
  ON gigalibs_workforce.resource_capabilities (tenant_id, status, expires_at)
  WHERE expires_at IS NOT NULL;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'workforce_resources',
    'capability_definitions',
    'resource_capabilities'
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
VALUES (3, '000003_workforce_resources_and_capabilities');

COMMIT;
