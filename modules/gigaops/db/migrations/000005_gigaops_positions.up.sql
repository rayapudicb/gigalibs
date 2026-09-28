-- Migration 000005: Positions (fillable slots)
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  role_id UUID NOT NULL REFERENCES gigalibs_gigaops.roles (id) ON DELETE CASCADE,
  worker_id UUID REFERENCES gigalibs_gigaops.workers (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  rate_amount NUMERIC NOT NULL DEFAULT 0,
  rate_type TEXT NOT NULL DEFAULT 'HOURLY' CHECK (rate_type IN ('HOURLY', 'FLAT_DAILY', 'FLAT_WEEKLY', 'FLAT_EVENT')),
  pay_type_code TEXT NOT NULL REFERENCES gigalibs_gigaops.pay_type_catalogue (code),
  worker_classification_code TEXT REFERENCES gigalibs_gigaops.worker_classifications (code),
  is_holiday_pay BOOLEAN NOT NULL DEFAULT false,
  exclude_payroll BOOLEAN NOT NULL DEFAULT false,
  is_vendor_pay BOOLEAN NOT NULL DEFAULT false,
  guaranteed_hours NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'FILLED', 'CONFIRMED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gigaops_positions_role_lookup
  ON gigalibs_gigaops.positions (tenant_id, role_id, status);

CREATE INDEX IF NOT EXISTS idx_gigaops_positions_worker_lookup
  ON gigalibs_gigaops.positions (tenant_id, worker_id);

ALTER TABLE gigalibs_gigaops.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_gigaops.positions FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'gigalibs_gigaops'
      AND tablename = 'positions'
      AND policyname = 'positions_tenant_rls'
  ) THEN
    CREATE POLICY positions_tenant_rls ON gigalibs_gigaops.positions
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
END $$;

INSERT INTO gigalibs_gigaops.schema_migrations (version, applied_at)
VALUES ('000005_gigaops_positions', now())
ON CONFLICT (version) DO NOTHING;
