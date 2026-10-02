-- WI-WFO-003: Frontline expense reports, mileage claims, and expense lines
BEGIN;

CREATE TABLE gigalibs_workforce.wfo_expense_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  worker_id UUID NOT NULL,
  engagement_id UUID,
  title VARCHAR(200) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID')),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  submitted_at TIMESTAMPTZ,
  approved_by VARCHAR(128),
  approved_at TIMESTAMPTZ,
  notes VARCHAR(1000),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, worker_id) REFERENCES gigalibs_workforce.wfo_workers (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, engagement_id) REFERENCES gigalibs_workforce.wfo_engagements (tenant_id, id) ON DELETE SET NULL,
  CHECK (status <> 'APPROVED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE INDEX wfo_expense_reports_tenant_worker ON gigalibs_workforce.wfo_expense_reports (tenant_id, worker_id, status);
CREATE INDEX wfo_expense_reports_tenant_eng ON gigalibs_workforce.wfo_expense_reports (tenant_id, engagement_id, status);

CREATE TABLE gigalibs_workforce.wfo_expense_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  report_id UUID NOT NULL,
  expense_type VARCHAR(32) NOT NULL DEFAULT 'OTHER'
    CHECK (expense_type IN ('TRAVEL', 'MEALS', 'EQUIPMENT', 'MILEAGE', 'PER_DIEM', 'OTHER')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  mileage_from VARCHAR(200),
  mileage_to VARCHAR(200),
  miles NUMERIC(8,2) CHECK (miles IS NULL OR miles >= 0),
  receipt_url VARCHAR(1024),
  description VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  approved_by VARCHAR(128),
  approved_at TIMESTAMPTZ,
  rejection_reason VARCHAR(500),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, report_id) REFERENCES gigalibs_workforce.wfo_expense_reports (tenant_id, id) ON DELETE CASCADE,
  CHECK (expense_type <> 'MILEAGE' OR (miles IS NOT NULL AND mileage_from IS NOT NULL AND mileage_to IS NOT NULL))
);

CREATE INDEX wfo_expense_lines_tenant_report ON gigalibs_workforce.wfo_expense_lines (tenant_id, report_id);

-- Row-level security for tenant isolation
ALTER TABLE gigalibs_workforce.wfo_expense_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workforce.wfo_expense_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY wfo_expense_reports_tenant_isolation ON gigalibs_workforce.wfo_expense_reports
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_workforce.wfo_expense_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workforce.wfo_expense_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY wfo_expense_lines_tenant_isolation ON gigalibs_workforce.wfo_expense_lines
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

COMMIT;
