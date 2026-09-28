-- WI-OI-065 (roadmap P5): effective-dated job profiles, positions and engagements on the canonical Workforce
-- runtime. Forward-only. Dates are calendar dates; every window is [from, to) with an open end as NULL.
-- Overlaps that would double-fill a position or give a profile two definitions at once are refused by exclusion
-- constraints, not only by the service. Sites are Geospatial place ids held as plain references.
BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE gigalibs_workforce.job_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  code VARCHAR(64) NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._-]*$'),
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

CREATE TABLE gigalibs_workforce.job_profile_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  job_profile_id UUID NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  title VARCHAR(200) NOT NULL CHECK (length(btrim(title)) > 0),
  description VARCHAR(2000),
  worker_category VARCHAR(16) NOT NULL
    CHECK (worker_category IN ('EMPLOYEE', 'CONTRACTOR', 'AGENCY', 'VOLUNTEER')),
  required_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(required_capabilities) = 'array' AND jsonb_array_length(required_capabilities) <= 50),
  created_by VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, job_profile_id) REFERENCES gigalibs_workforce.job_profiles (tenant_id, id),
  CONSTRAINT job_profile_revisions_no_overlap EXCLUDE USING gist (
    tenant_id WITH =,
    job_profile_id WITH =,
    daterange(effective_from, effective_to, '[)') WITH &&
  )
);

CREATE TABLE gigalibs_workforce.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  code VARCHAR(64) NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._-]*$'),
  job_profile_id UUID NOT NULL,
  site_ref UUID,
  department_id VARCHAR(64),
  fte NUMERIC(4, 2) NOT NULL DEFAULT 1.00 CHECK (fte > 0 AND fte <= 1),
  effective_from DATE NOT NULL,
  effective_to DATE,
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'FROZEN', 'CLOSED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by VARCHAR(128) NOT NULL,
  updated_by VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  FOREIGN KEY (tenant_id, job_profile_id) REFERENCES gigalibs_workforce.job_profiles (tenant_id, id)
);

CREATE INDEX positions_by_site ON gigalibs_workforce.positions (tenant_id, site_ref, status);

CREATE TABLE gigalibs_workforce.engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  resource_id UUID NOT NULL,
  position_id UUID NOT NULL,
  engagement_type VARCHAR(16) NOT NULL
    CHECK (engagement_type IN ('EMPLOYEE', 'CONTRACTOR', 'AGENCY', 'VOLUNTEER')),
  fte NUMERIC(4, 2) NOT NULL DEFAULT 1.00 CHECK (fte > 0 AND fte <= 1),
  start_date DATE NOT NULL,
  end_date DATE,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ENDED', 'CANCELLED')),
  end_reason VARCHAR(500),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by VARCHAR(128) NOT NULL,
  updated_by VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date > start_date),
  CHECK (status <> 'ENDED' OR end_date IS NOT NULL),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, resource_id) REFERENCES gigalibs_workforce.workforce_resources (tenant_id, id),
  FOREIGN KEY (tenant_id, position_id) REFERENCES gigalibs_workforce.positions (tenant_id, id),
  -- One incumbent per position at any time; a cancelled engagement never held the position.
  CONSTRAINT engagements_one_incumbent EXCLUDE USING gist (
    tenant_id WITH =,
    position_id WITH =,
    daterange(start_date, end_date, '[)') WITH &&
  ) WHERE (status <> 'CANCELLED')
);

CREATE INDEX engagements_by_resource ON gigalibs_workforce.engagements (tenant_id, resource_id, start_date);

DO $$
DECLARE
  relation TEXT;
BEGIN
  FOREACH relation IN ARRAY ARRAY['job_profiles', 'job_profile_revisions', 'positions', 'engagements']
  LOOP
    EXECUTE format('ALTER TABLE gigalibs_workforce.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_workforce.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_workforce.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      relation || '_tenant_isolation',
      relation
    );
  END LOOP;
END
$$;

INSERT INTO gigalibs_workforce.schema_migrations (version, name)
VALUES (5, '000005_workforce_jobs_positions_engagements');

COMMIT;
