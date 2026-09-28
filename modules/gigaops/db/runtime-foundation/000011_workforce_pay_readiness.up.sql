-- WI-OI-070 (roadmap P8, ADR-0008): pay rates, calculation runs and earning lines. Forward-only.
-- Runs freeze their inputs (timesheets, pack versions, rates) in a snapshot and carry a SHA-256 digest of their
-- lines; earning lines are append-only (the migration runner revokes UPDATE/DELETE from the runtime role) and an
-- approved run is immutable for every role.
BEGIN;

CREATE TABLE gigalibs_workforce.pay_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  resource_id UUID NOT NULL,
  pack_code VARCHAR(32) NOT NULL CHECK (pack_code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'),
  effective_from DATE NOT NULL,
  effective_to DATE,
  hourly_rate_minor BIGINT NOT NULL CHECK (hourly_rate_minor > 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_by VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, resource_id) REFERENCES gigalibs_workforce.workforce_resources (tenant_id, id),
  CONSTRAINT pay_rates_no_overlap EXCLUDE USING gist (
    tenant_id WITH =,
    resource_id WITH =,
    daterange(effective_from, effective_to, '[]') WITH &&
  )
);
CREATE INDEX pay_rates_by_resource ON gigalibs_workforce.pay_rates (tenant_id, resource_id, effective_from);

CREATE TABLE gigalibs_workforce.pay_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  request_key UUID NOT NULL,
  period_start DATE NOT NULL CHECK (extract(isodow FROM period_start) = 1),
  period_end DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'CALCULATED' CHECK (status IN ('CALCULATED', 'APPROVED', 'VOIDED')),
  people INTEGER NOT NULL CHECK (people > 0),
  line_count INTEGER NOT NULL CHECK (line_count >= 0),
  totals JSONB NOT NULL CHECK (jsonb_typeof(totals) = 'array'),
  digest CHAR(64) NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  calculated_by VARCHAR(128) NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by VARCHAR(128),
  approved_at TIMESTAMPTZ,
  void_reason VARCHAR(500),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  correlation_id VARCHAR(128) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end = period_start + 6),
  CHECK ((status = 'APPROVED') = (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK ((status = 'VOIDED') = (void_reason IS NOT NULL)),
  CHECK (approved_by IS NULL OR approved_by <> calculated_by),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, request_key)
);
-- At most one live run per week.
CREATE UNIQUE INDEX pay_runs_one_live_per_week ON gigalibs_workforce.pay_runs (tenant_id, period_start) WHERE status <> 'VOIDED';

CREATE TABLE gigalibs_workforce.earning_lines (
  tenant_id VARCHAR(64) NOT NULL,
  run_id UUID NOT NULL,
  line_no INTEGER NOT NULL CHECK (line_no > 0),
  resource_id UUID NOT NULL,
  timesheet_id UUID NOT NULL,
  work_date DATE NOT NULL,
  category VARCHAR(32) NOT NULL CHECK (category IN (
    'REGULAR', 'DAILY_OVERTIME', 'DAILY_DOUBLE_TIME', 'WEEKLY_OVERTIME', 'SEVENTH_DAY_OVERTIME', 'SEVENTH_DAY_DOUBLE_TIME')),
  minutes INTEGER NOT NULL CHECK (minutes > 0),
  multiplier_bp INTEGER NOT NULL CHECK (multiplier_bp > 0),
  hourly_rate_minor BIGINT NOT NULL CHECK (hourly_rate_minor > 0),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency CHAR(3) NOT NULL,
  pack_code VARCHAR(32) NOT NULL,
  pack_version INTEGER NOT NULL CHECK (pack_version > 0),
  rule_trace VARCHAR(200) NOT NULL,
  PRIMARY KEY (tenant_id, run_id, line_no),
  FOREIGN KEY (tenant_id, run_id) REFERENCES gigalibs_workforce.pay_runs (tenant_id, id),
  FOREIGN KEY (tenant_id, resource_id) REFERENCES gigalibs_workforce.workforce_resources (tenant_id, id),
  FOREIGN KEY (tenant_id, timesheet_id) REFERENCES gigalibs_workforce.timesheets (tenant_id, id)
);

CREATE FUNCTION gigalibs_workforce.refuse_approved_pay_run_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = gigalibs_workforce, pg_temp
AS $$
BEGIN
  IF OLD.status = 'APPROVED' THEN
    RAISE EXCEPTION 'approved pay run % is immutable', OLD.id USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;
CREATE TRIGGER pay_runs_approved_immutable
  BEFORE UPDATE OR DELETE ON gigalibs_workforce.pay_runs
  FOR EACH ROW EXECUTE FUNCTION gigalibs_workforce.refuse_approved_pay_run_change();

DO $$
DECLARE
  relation TEXT;
BEGIN
  FOREACH relation IN ARRAY ARRAY['pay_rates', 'pay_runs', 'earning_lines']
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
VALUES (11, '000011_workforce_pay_readiness');

COMMIT;
