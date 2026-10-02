-- WI-WFO-004: Demand forecasting and shift self-service swap requests
BEGIN;

CREATE TABLE gigalibs_workforce.wfo_demand_forecast (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  org_unit_id VARCHAR(64) NOT NULL,
  skill_id VARCHAR(64),
  forecast_date DATE NOT NULL,
  demand_units NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (demand_units >= 0),
  filled_units NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (filled_units >= 0),
  confidence_pct SMALLINT NOT NULL DEFAULT 85 CHECK (confidence_pct >= 0 AND confidence_pct <= 100),
  source VARCHAR(32) NOT NULL DEFAULT 'HISTORICAL'
    CHECK (source IN ('HISTORICAL', 'CONNECTOR_PULL', 'AI_MODEL', 'MANUAL')),
  notes VARCHAR(500),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, org_unit_id, forecast_date, skill_id)
);

CREATE INDEX wfo_demand_forecast_tenant_date ON gigalibs_workforce.wfo_demand_forecast (tenant_id, forecast_date);
CREATE INDEX wfo_demand_forecast_tenant_org ON gigalibs_workforce.wfo_demand_forecast (tenant_id, org_unit_id);

CREATE TABLE gigalibs_workforce.wfo_shift_swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  from_booking_id UUID NOT NULL,
  from_worker_id UUID NOT NULL,
  to_worker_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  approved_by VARCHAR(128),
  approved_at TIMESTAMPTZ,
  reason VARCHAR(500),
  rejection_reason VARCHAR(500),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, from_booking_id) REFERENCES gigalibs_workforce.bookings (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, from_worker_id) REFERENCES gigalibs_workforce.wfo_workers (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, to_worker_id) REFERENCES gigalibs_workforce.wfo_workers (tenant_id, id) ON DELETE CASCADE,
  CHECK (from_worker_id <> to_worker_id),
  CHECK (status <> 'APPROVED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE INDEX wfo_shift_swap_tenant_status ON gigalibs_workforce.wfo_shift_swap_requests (tenant_id, status);
CREATE INDEX wfo_shift_swap_tenant_from_worker ON gigalibs_workforce.wfo_shift_swap_requests (tenant_id, from_worker_id);
CREATE INDEX wfo_shift_swap_tenant_to_worker ON gigalibs_workforce.wfo_shift_swap_requests (tenant_id, to_worker_id);

-- Row-level security for tenant isolation
ALTER TABLE gigalibs_workforce.wfo_demand_forecast ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workforce.wfo_demand_forecast FORCE ROW LEVEL SECURITY;
CREATE POLICY wfo_demand_forecast_tenant_isolation ON gigalibs_workforce.wfo_demand_forecast
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_workforce.wfo_shift_swap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workforce.wfo_shift_swap_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY wfo_shift_swap_requests_tenant_isolation ON gigalibs_workforce.wfo_shift_swap_requests
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

COMMIT;
