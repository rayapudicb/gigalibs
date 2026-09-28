-- WI-OI-069 (roadmap P7): time and attendance. Forward-only.
-- Punches are the device inbox: a (device, event) pair is unique, so a resend never records twice. Punches,
-- voids and corrections are append-only (the migration runner revokes UPDATE/DELETE from the runtime role);
-- approved timesheets and their lines are immutable for every role (triggers below).
BEGIN;

CREATE TABLE gigalibs_workforce.punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  resource_id UUID NOT NULL,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('CLOCK_IN', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT')),
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  time_zone VARCHAR(64) NOT NULL,
  work_date DATE NOT NULL,
  source VARCHAR(16) NOT NULL CHECK (source IN ('DEVICE', 'CORRECTION')),
  device_id VARCHAR(128),
  device_event_id UUID,
  site_ref UUID,
  booking_id UUID,
  latitude NUMERIC(9,6) CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9,6) CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters NUMERIC(9,1) CHECK (accuracy_meters >= 0),
  geofence_result VARCHAR(16) NOT NULL
    CHECK (geofence_result IN ('INSIDE', 'OUTSIDE', 'UNKNOWN', 'NOT_CHECKED', 'NO_LOCATION')),
  distance_to_edge_meters NUMERIC(12,1) CHECK (distance_to_edge_meters >= 0),
  late BOOLEAN NOT NULL DEFAULT false,
  recorded_by VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(128) NOT NULL,
  CHECK ((source = 'DEVICE') = (device_id IS NOT NULL AND device_event_id IS NOT NULL)),
  CHECK ((latitude IS NULL) = (longitude IS NULL)),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, device_id, device_event_id),
  FOREIGN KEY (tenant_id, resource_id) REFERENCES gigalibs_workforce.workforce_resources (tenant_id, id),
  FOREIGN KEY (tenant_id, booking_id) REFERENCES gigalibs_workforce.bookings (tenant_id, id)
);
CREATE INDEX punches_by_resource_day ON gigalibs_workforce.punches (tenant_id, resource_id, work_date, occurred_at);

CREATE TABLE gigalibs_workforce.time_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  resource_id UUID NOT NULL,
  action VARCHAR(8) NOT NULL CHECK (action IN ('ADD', 'VOID', 'REPLACE')),
  voided_punch_id UUID,
  new_punch_id UUID,
  reason_code VARCHAR(32) NOT NULL CHECK (reason_code IN (
    'MISSED_PUNCH', 'DEVICE_FAULT', 'WRONG_KIND', 'WRONG_TIME', 'WRONG_SITE', 'SUPERVISOR_ADJUSTMENT')),
  note VARCHAR(500) NOT NULL CHECK (length(btrim(note)) >= 3),
  created_by VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((action = 'ADD') = (voided_punch_id IS NULL)),
  CHECK ((action = 'VOID') = (new_punch_id IS NULL)),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, resource_id) REFERENCES gigalibs_workforce.workforce_resources (tenant_id, id),
  FOREIGN KEY (tenant_id, voided_punch_id) REFERENCES gigalibs_workforce.punches (tenant_id, id),
  FOREIGN KEY (tenant_id, new_punch_id) REFERENCES gigalibs_workforce.punches (tenant_id, id)
);

-- A punch is voided at most once; effective punches are those without a void.
CREATE TABLE gigalibs_workforce.punch_voids (
  tenant_id VARCHAR(64) NOT NULL,
  punch_id UUID NOT NULL,
  correction_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, punch_id),
  FOREIGN KEY (tenant_id, punch_id) REFERENCES gigalibs_workforce.punches (tenant_id, id),
  FOREIGN KEY (tenant_id, correction_id) REFERENCES gigalibs_workforce.time_corrections (tenant_id, id)
);

CREATE TABLE gigalibs_workforce.time_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  resource_id UUID NOT NULL,
  punch_id UUID,
  work_date DATE NOT NULL,
  kind VARCHAR(32) NOT NULL CHECK (kind IN (
    'OUT_OF_FENCE', 'GEOFENCE_UNVERIFIED', 'LOCATION_MISSING', 'LATE_PUNCH', 'AFTER_SUBMISSION')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  site_ref UUID,
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
  resolution VARCHAR(16) CHECK (resolution IN ('ACCEPTED', 'CORRECTED', 'DISMISSED')),
  resolution_note VARCHAR(500),
  resolved_by VARCHAR(128),
  resolved_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  correlation_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'RESOLVED') = (resolution IS NOT NULL AND resolution_note IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, punch_id, kind),
  FOREIGN KEY (tenant_id, resource_id) REFERENCES gigalibs_workforce.workforce_resources (tenant_id, id),
  FOREIGN KEY (tenant_id, punch_id) REFERENCES gigalibs_workforce.punches (tenant_id, id)
);
CREATE INDEX time_exceptions_inbox ON gigalibs_workforce.time_exceptions (tenant_id, status, work_date);
CREATE INDEX time_exceptions_by_resource ON gigalibs_workforce.time_exceptions (tenant_id, resource_id, work_date);

CREATE TABLE gigalibs_workforce.timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  resource_id UUID NOT NULL,
  period_start DATE NOT NULL CHECK (extract(isodow FROM period_start) = 1),
  period_end DATE NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('SUBMITTED', 'APPROVED', 'REJECTED')),
  worked_minutes INTEGER NOT NULL CHECK (worked_minutes >= 0),
  break_minutes INTEGER NOT NULL CHECK (break_minutes >= 0),
  submitted_by VARCHAR(128) NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  decided_by VARCHAR(128),
  decided_at TIMESTAMPTZ,
  rejection_reason VARCHAR(500),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  correlation_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end = period_start + 6),
  CHECK ((status = 'SUBMITTED') = (decided_by IS NULL AND decided_at IS NULL)),
  CHECK ((status = 'REJECTED') = (rejection_reason IS NOT NULL)),
  CHECK (decided_by IS NULL OR decided_by <> submitted_by),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, resource_id, period_start),
  FOREIGN KEY (tenant_id, resource_id) REFERENCES gigalibs_workforce.workforce_resources (tenant_id, id)
);
CREATE INDEX timesheets_by_status ON gigalibs_workforce.timesheets (tenant_id, status, period_start);

CREATE TABLE gigalibs_workforce.timesheet_lines (
  tenant_id VARCHAR(64) NOT NULL,
  timesheet_id UUID NOT NULL,
  line_no INTEGER NOT NULL CHECK (line_no > 0),
  work_date DATE NOT NULL,
  clock_in_punch_id UUID NOT NULL,
  clock_out_punch_id UUID NOT NULL,
  clock_in_at TIMESTAMPTZ NOT NULL,
  clock_out_at TIMESTAMPTZ NOT NULL,
  break_minutes INTEGER NOT NULL CHECK (break_minutes >= 0),
  worked_minutes INTEGER NOT NULL CHECK (worked_minutes >= 0),
  site_ref UUID,
  booking_id UUID,
  PRIMARY KEY (tenant_id, timesheet_id, line_no),
  CHECK (clock_out_at > clock_in_at),
  FOREIGN KEY (tenant_id, timesheet_id) REFERENCES gigalibs_workforce.timesheets (tenant_id, id),
  FOREIGN KEY (tenant_id, clock_in_punch_id) REFERENCES gigalibs_workforce.punches (tenant_id, id),
  FOREIGN KEY (tenant_id, clock_out_punch_id) REFERENCES gigalibs_workforce.punches (tenant_id, id)
);

-- Approved timesheets are immutable for every role, including the migration owner.
CREATE FUNCTION gigalibs_workforce.refuse_approved_timesheet_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = gigalibs_workforce, pg_temp
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.status = 'APPROVED' THEN
    RAISE EXCEPTION 'approved timesheet % is immutable', OLD.id USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;
CREATE TRIGGER timesheets_approved_immutable
  BEFORE UPDATE OR DELETE ON gigalibs_workforce.timesheets
  FOR EACH ROW EXECUTE FUNCTION gigalibs_workforce.refuse_approved_timesheet_change();

CREATE FUNCTION gigalibs_workforce.refuse_approved_timesheet_line_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = gigalibs_workforce, pg_temp
AS $$
DECLARE
  parent_status TEXT;
BEGIN
  SELECT status INTO parent_status FROM gigalibs_workforce.timesheets
   WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id) AND id = COALESCE(NEW.timesheet_id, OLD.timesheet_id);
  IF parent_status = 'APPROVED' THEN
    RAISE EXCEPTION 'lines of an approved timesheet are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;
CREATE TRIGGER timesheet_lines_approved_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON gigalibs_workforce.timesheet_lines
  FOR EACH ROW EXECUTE FUNCTION gigalibs_workforce.refuse_approved_timesheet_line_change();

DO $$
DECLARE
  relation TEXT;
BEGIN
  FOREACH relation IN ARRAY ARRAY['punches', 'time_corrections', 'punch_voids', 'time_exceptions', 'timesheets', 'timesheet_lines']
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
VALUES (9, '000009_workforce_time_and_attendance');

COMMIT;
