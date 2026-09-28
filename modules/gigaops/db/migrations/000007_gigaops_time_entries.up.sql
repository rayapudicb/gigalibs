-- Migration 000007: Time entries, clock punches, and per diems
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  position_id UUID NOT NULL REFERENCES gigalibs_gigaops.positions (id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES gigalibs_gigaops.workers (id) ON DELETE CASCADE,
  work_unit_id UUID NOT NULL REFERENCES gigalibs_gigaops.work_units (id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  clocked_minutes INT NOT NULL DEFAULT 0,
  lunch_minutes INT NOT NULL DEFAULT 0 CHECK (lunch_minutes IN (0, 30, 60, 90, 120)),
  net_minutes INT GENERATED ALWAYS AS (GREATEST(clocked_minutes - lunch_minutes, 0)) STORED,
  use_guaranteed_hrs BOOLEAN NOT NULL DEFAULT false,
  guaranteed_minutes INT NOT NULL DEFAULT 0,
  effective_minutes INT GENERATED ALWAYS AS (
    CASE 
      WHEN use_guaranteed_hrs THEN GREATEST(GREATEST(clocked_minutes - lunch_minutes, 0), guaranteed_minutes)
      ELSE GREATEST(clocked_minutes - lunch_minutes, 0)
    END
  ) STORED,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'SUBMITTED', 'APPROVED', 'REJECTED')),
  is_prior_payroll BOOLEAN NOT NULL DEFAULT false,
  is_no_show BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  rejected_at TIMESTAMPTZ,
  rejected_by UUID,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT time_entries_pos_worker_date_unique UNIQUE (position_id, worker_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_gigaops_time_entries_lookup
  ON gigalibs_gigaops.time_entries (tenant_id, work_unit_id, status, work_date);

CREATE INDEX IF NOT EXISTS idx_gigaops_time_entries_worker
  ON gigalibs_gigaops.time_entries (tenant_id, worker_id, work_date);

ALTER TABLE gigalibs_gigaops.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_gigaops.time_entries FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'gigalibs_gigaops'
      AND tablename = 'time_entries'
      AND policyname = 'time_entries_tenant_rls'
  ) THEN
    CREATE POLICY time_entries_tenant_rls ON gigalibs_gigaops.time_entries
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
END $$;

-- Clock punches (up to 3 punches per shift)
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.clock_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  time_entry_id UUID NOT NULL REFERENCES gigalibs_gigaops.time_entries (id) ON DELETE CASCADE,
  punch_index INT NOT NULL CHECK (punch_index BETWEEN 1 AND 3),
  check_in_at TIMESTAMPTZ NOT NULL,
  check_out_at TIMESTAMPTZ,
  is_next_day_out BOOLEAN NOT NULL DEFAULT false,
  duration_minutes NUMERIC GENERATED ALWAYS AS (
    CASE 
      WHEN check_out_at IS NOT NULL THEN ROUND(EXTRACT(EPOCH FROM (check_out_at - check_in_at)) / 60)
      ELSE NULL
    END
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clock_punches_entry_index_unique UNIQUE (time_entry_id, punch_index)
);

ALTER TABLE gigalibs_gigaops.clock_punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_gigaops.clock_punches FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'gigalibs_gigaops'
      AND tablename = 'clock_punches'
      AND policyname = 'clock_punches_tenant_rls'
  ) THEN
    CREATE POLICY clock_punches_tenant_rls ON gigalibs_gigaops.clock_punches
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
END $$;

-- Per diem entries
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.per_diem_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  time_entry_id UUID NOT NULL REFERENCES gigalibs_gigaops.time_entries (id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES gigalibs_gigaops.workers (id) ON DELETE CASCADE,
  work_unit_id UUID NOT NULL REFERENCES gigalibs_gigaops.work_units (id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'APPROVE', 'REJECT', 'REVIEW')),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gigaops_per_diem_lookup
  ON gigalibs_gigaops.per_diem_entries (tenant_id, work_unit_id, status);

ALTER TABLE gigalibs_gigaops.per_diem_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_gigaops.per_diem_entries FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'gigalibs_gigaops'
      AND tablename = 'per_diem_entries'
      AND policyname = 'per_diem_tenant_rls'
  ) THEN
    CREATE POLICY per_diem_tenant_rls ON gigalibs_gigaops.per_diem_entries
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
END $$;

INSERT INTO gigalibs_gigaops.schema_migrations (version, applied_at)
VALUES ('000007_gigaops_time_entries', now())
ON CONFLICT (version) DO NOTHING;
