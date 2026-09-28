-- WI-OI-067 (roadmap P6): demand requirements and bookings on the canonical Workforce runtime. Forward-only.
-- A requirement is demand from any source (manual, CMMS work order, project) at a Geospatial site; a booking
-- assigns one person to part or all of it. The database refuses a person holding two overlapping live bookings;
-- the service locks the requirement to keep bookings within its headcount.
BEGIN;

CREATE TABLE gigalibs_workforce.work_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  request_key UUID NOT NULL,
  title VARCHAR(240) NOT NULL CHECK (length(btrim(title)) > 0),
  source_type VARCHAR(32) NOT NULL CHECK (source_type IN ('MANUAL', 'CMMS_WORK_ORDER', 'PROJECT')),
  source_ref VARCHAR(128),
  site_ref UUID,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  headcount INTEGER NOT NULL DEFAULT 1 CHECK (headcount BETWEEN 1 AND 500),
  required_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(required_capabilities) = 'array' AND jsonb_array_length(required_capabilities) <= 20),
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'FILLED', 'CANCELLED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by VARCHAR(128) NOT NULL,
  updated_by VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at AND ends_at - starts_at <= interval '31 days'),
  CHECK ((source_type = 'MANUAL') = (source_ref IS NULL)),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, request_key)
);

-- One live requirement per external source record (a CMMS work order is staffed through one requirement).
CREATE UNIQUE INDEX work_requirements_one_per_source
  ON gigalibs_workforce.work_requirements (tenant_id, source_type, source_ref)
  WHERE source_ref IS NOT NULL AND status <> 'CANCELLED';
CREATE INDEX work_requirements_board ON gigalibs_workforce.work_requirements (tenant_id, status, starts_at);

CREATE TABLE gigalibs_workforce.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  request_key UUID NOT NULL,
  requirement_id UUID NOT NULL,
  resource_id UUID NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'CONFIRMED', 'DISPATCHED', 'ON_SITE', 'COMPLETED', 'CANCELLED')),
  override_reason VARCHAR(500),
  cancel_reason VARCHAR(500),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by VARCHAR(128) NOT NULL,
  updated_by VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK ((status = 'CANCELLED') = (cancel_reason IS NOT NULL)),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, request_key),
  FOREIGN KEY (tenant_id, requirement_id) REFERENCES gigalibs_workforce.work_requirements (tenant_id, id),
  FOREIGN KEY (tenant_id, resource_id) REFERENCES gigalibs_workforce.workforce_resources (tenant_id, id),
  CONSTRAINT bookings_no_double_booking EXCLUDE USING gist (
    tenant_id WITH =,
    resource_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status <> 'CANCELLED')
);

CREATE INDEX bookings_by_requirement ON gigalibs_workforce.bookings (tenant_id, requirement_id, status);
CREATE INDEX bookings_by_resource ON gigalibs_workforce.bookings (tenant_id, resource_id, starts_at);

CREATE TABLE gigalibs_workforce.booking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  booking_id UUID NOT NULL,
  from_status VARCHAR(16),
  to_status VARCHAR(16) NOT NULL,
  actor_subject VARCHAR(128) NOT NULL,
  reason VARCHAR(500),
  correlation_id VARCHAR(128) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_id, booking_id) REFERENCES gigalibs_workforce.bookings (tenant_id, id)
);

CREATE INDEX booking_events_timeline ON gigalibs_workforce.booking_events (tenant_id, booking_id, occurred_at);

DO $$
DECLARE
  relation TEXT;
BEGIN
  FOREACH relation IN ARRAY ARRAY['work_requirements', 'bookings', 'booking_events']
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
VALUES (7, '000007_workforce_demand_and_bookings');

COMMIT;
