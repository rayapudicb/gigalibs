-- Migration 000008: Payroll periods, worker pay records, and daily breakdowns
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.pay_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  work_unit_id UUID NOT NULL REFERENCES gigalibs_gigaops.work_units (id) ON DELETE CASCADE,
  payroll_export_code TEXT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_days INT GENERATED ALWAYS AS (period_end - period_start + 1) STORED,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CALCULATED', 'APPROVED', 'EXPORTED', 'LOCKED')),
  total_regular_pay NUMERIC NOT NULL DEFAULT 0,
  total_ot_pay NUMERIC NOT NULL DEFAULT 0,
  total_dt_pay NUMERIC NOT NULL DEFAULT 0,
  total_weekly_ot_pay NUMERIC NOT NULL DEFAULT 0,
  total_holiday_pay NUMERIC NOT NULL DEFAULT 0,
  total_flat_pay NUMERIC NOT NULL DEFAULT 0,
  total_per_diem NUMERIC NOT NULL DEFAULT 0,
  grand_total NUMERIC NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  exported_at TIMESTAMPTZ,
  exported_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gigaops_pay_periods_lookup
  ON gigalibs_gigaops.pay_periods (tenant_id, work_unit_id, status);

ALTER TABLE gigalibs_gigaops.pay_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_gigaops.pay_periods FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'gigalibs_gigaops'
      AND tablename = 'pay_periods'
      AND policyname = 'pay_periods_tenant_rls'
  ) THEN
    CREATE POLICY pay_periods_tenant_rls ON gigalibs_gigaops.pay_periods
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
END $$;

-- Worker pay records
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.worker_pay_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  pay_period_id UUID NOT NULL REFERENCES gigalibs_gigaops.pay_periods (id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES gigalibs_gigaops.workers (id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES gigalibs_gigaops.positions (id) ON DELETE CASCADE,
  pay_type_code TEXT NOT NULL REFERENCES gigalibs_gigaops.pay_type_catalogue (code),
  is_california BOOLEAN NOT NULL DEFAULT false,
  rate_amount NUMERIC NOT NULL DEFAULT 0,
  rate_type TEXT NOT NULL DEFAULT 'HOURLY',
  exclude_payroll BOOLEAN NOT NULL DEFAULT false,
  is_vendor_pay BOOLEAN NOT NULL DEFAULT false,
  is_holiday_pay BOOLEAN NOT NULL DEFAULT false,
  regular_hours NUMERIC NOT NULL DEFAULT 0,
  daily_ot_hours NUMERIC NOT NULL DEFAULT 0,
  daily_dt_hours NUMERIC NOT NULL DEFAULT 0,
  weekly_ot_hours NUMERIC NOT NULL DEFAULT 0,
  guaranteed_hours_used NUMERIC NOT NULL DEFAULT 0,
  lunch_hours NUMERIC NOT NULL DEFAULT 0,
  regular_pay NUMERIC NOT NULL DEFAULT 0,
  daily_ot_pay NUMERIC NOT NULL DEFAULT 0,
  daily_dt_pay NUMERIC NOT NULL DEFAULT 0,
  weekly_ot_pay NUMERIC NOT NULL DEFAULT 0,
  holiday_pay NUMERIC NOT NULL DEFAULT 0,
  flat_rate_pay NUMERIC NOT NULL DEFAULT 0,
  per_diem_amount NUMERIC NOT NULL DEFAULT 0,
  gross_pay NUMERIC GENERATED ALWAYS AS (
    CASE 
      WHEN exclude_payroll THEN 0 
      ELSE regular_pay + daily_ot_pay + daily_dt_pay + weekly_ot_pay + holiday_pay + flat_rate_pay 
    END
  ) STORED,
  total_days_worked INT NOT NULL DEFAULT 0,
  first_work_date DATE,
  last_work_date DATE,
  payroll_ref TEXT,
  payroll_exported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT worker_pay_records_period_worker_unique UNIQUE (pay_period_id, worker_id, position_id)
);

CREATE INDEX IF NOT EXISTS idx_gigaops_worker_pay_lookup
  ON gigalibs_gigaops.worker_pay_records (tenant_id, pay_period_id, worker_id);

ALTER TABLE gigalibs_gigaops.worker_pay_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_gigaops.worker_pay_records FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'gigalibs_gigaops'
      AND tablename = 'worker_pay_records'
      AND policyname = 'worker_pay_records_tenant_rls'
  ) THEN
    CREATE POLICY worker_pay_records_tenant_rls ON gigalibs_gigaops.worker_pay_records
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
END $$;

-- Daily pay breakdowns
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.daily_pay_breakdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  worker_pay_id UUID NOT NULL REFERENCES gigalibs_gigaops.worker_pay_records (id) ON DELETE CASCADE,
  time_entry_id UUID NOT NULL REFERENCES gigalibs_gigaops.time_entries (id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  weekly_accum_hrs NUMERIC NOT NULL DEFAULT 0,
  regular_hours NUMERIC NOT NULL DEFAULT 0,
  daily_ot_hours NUMERIC NOT NULL DEFAULT 0,
  daily_dt_hours NUMERIC NOT NULL DEFAULT 0,
  weekly_ot_hrs NUMERIC NOT NULL DEFAULT 0,
  regular_amount NUMERIC NOT NULL DEFAULT 0,
  ot_amount NUMERIC NOT NULL DEFAULT 0,
  dt_amount NUMERIC NOT NULL DEFAULT 0,
  weekly_ot_amount NUMERIC NOT NULL DEFAULT 0,
  daily_total NUMERIC NOT NULL DEFAULT 0,
  is_seventh_day BOOLEAN NOT NULL DEFAULT false,
  is_holiday BOOLEAN NOT NULL DEFAULT false,
  is_guaranteed_day BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gigalibs_gigaops.daily_pay_breakdowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_gigaops.daily_pay_breakdowns FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'gigalibs_gigaops'
      AND tablename = 'daily_pay_breakdowns'
      AND policyname = 'daily_pay_breakdowns_tenant_rls'
  ) THEN
    CREATE POLICY daily_pay_breakdowns_tenant_rls ON gigalibs_gigaops.daily_pay_breakdowns
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
END $$;

-- Holiday calendar
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.holiday_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  state_code TEXT,
  holiday_date DATE NOT NULL,
  holiday_name TEXT NOT NULL,
  tenant_id UUID, -- NULL = national public holiday, non-null = tenant specific holiday
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT holiday_cal_unique UNIQUE (country_code, COALESCE(state_code, ''), holiday_date, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::UUID))
);

CREATE INDEX IF NOT EXISTS idx_gigaops_holiday_lookup
  ON gigalibs_gigaops.holiday_calendar (country_code, holiday_date);

INSERT INTO gigalibs_gigaops.schema_migrations (version, applied_at)
VALUES ('000008_gigaops_payroll', now())
ON CONFLICT (version) DO NOTHING;
