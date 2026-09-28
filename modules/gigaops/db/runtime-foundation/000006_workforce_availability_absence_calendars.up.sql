-- WI-OI-066 (roadmap P5): availability patterns, absences and working calendars on the canonical Workforce
-- runtime. Forward-only. Patterns are effective-dated weekly slots in an IANA time zone; absences are
-- [starts_at, ends_at) instants with a four-eyes decision; calendars hold dated closures for the tenant or a
-- Geospatial site (plain place reference). Overlaps are refused by exclusion constraints.
BEGIN;

CREATE TABLE gigalibs_workforce.availability_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  resource_id UUID NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  time_zone VARCHAR(64) NOT NULL CHECK (length(time_zone) > 0),
  weekly_slots JSONB NOT NULL
    CHECK (jsonb_typeof(weekly_slots) = 'array' AND jsonb_array_length(weekly_slots) BETWEEN 1 AND 28),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by VARCHAR(128) NOT NULL,
  updated_by VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, resource_id) REFERENCES gigalibs_workforce.workforce_resources (tenant_id, id),
  CONSTRAINT availability_patterns_no_overlap EXCLUDE USING gist (
    tenant_id WITH =,
    resource_id WITH =,
    daterange(effective_from, effective_to, '[)') WITH &&
  )
);

CREATE TABLE gigalibs_workforce.absence_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  code VARCHAR(64) NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._-]*$'),
  name VARCHAR(160) NOT NULL CHECK (length(btrim(name)) > 0),
  paid BOOLEAN NOT NULL DEFAULT false,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
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

CREATE TABLE gigalibs_workforce.absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  resource_id UUID NOT NULL,
  absence_type_id UUID NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED')),
  note VARCHAR(1000),
  requested_by VARCHAR(128) NOT NULL,
  decided_by VARCHAR(128),
  decided_at TIMESTAMPTZ,
  decision_reason VARCHAR(500),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  correlation_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (ends_at - starts_at <= interval '366 days'),
  -- Every decision names its decider; the service requires the decider to differ from the requester (four-eyes)
  -- for types that need approval. A cancelled absence keeps any earlier decision as history.
  CHECK (status NOT IN ('APPROVED', 'REJECTED') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, resource_id) REFERENCES gigalibs_workforce.workforce_resources (tenant_id, id),
  FOREIGN KEY (tenant_id, absence_type_id) REFERENCES gigalibs_workforce.absence_types (tenant_id, id),
  CONSTRAINT absences_no_overlap EXCLUDE USING gist (
    tenant_id WITH =,
    resource_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('REQUESTED', 'APPROVED'))
);

CREATE INDEX absences_queue ON gigalibs_workforce.absences (tenant_id, status, starts_at);

CREATE TABLE gigalibs_workforce.working_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  code VARCHAR(64) NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._-]*$'),
  name VARCHAR(160) NOT NULL CHECK (length(btrim(name)) > 0),
  site_ref UUID,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by VARCHAR(128) NOT NULL,
  updated_by VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);

-- At most one tenant-wide calendar and one calendar per site.
CREATE UNIQUE INDEX working_calendars_one_per_site
  ON gigalibs_workforce.working_calendars (tenant_id, COALESCE(site_ref, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE gigalibs_workforce.calendar_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  calendar_id UUID NOT NULL,
  closure_date DATE NOT NULL,
  label VARCHAR(160) NOT NULL CHECK (length(btrim(label)) > 0),
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'WITHDRAWN')),
  created_by VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, calendar_id) REFERENCES gigalibs_workforce.working_calendars (tenant_id, id)
);

CREATE UNIQUE INDEX calendar_closures_one_active_per_day
  ON gigalibs_workforce.calendar_closures (tenant_id, calendar_id, closure_date) WHERE status = 'ACTIVE';

DO $$
DECLARE
  relation TEXT;
BEGIN
  FOREACH relation IN ARRAY ARRAY['availability_patterns', 'absence_types', 'absences', 'working_calendars', 'calendar_closures']
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
VALUES (6, '000006_workforce_availability_absence_calendars');

COMMIT;
