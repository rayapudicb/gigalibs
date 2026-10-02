-- WI-WFO-001 Step 2: Universal engagements and position requirements
-- Supports flexible work containers across all industries:
--   - EVENT / PROJECT / WORK_ORDER / ROUTE / VOYAGE / ROSTER_PERIOD / SHOOT_DAY / POST / DUTY_ROSTER
--   - Integrates with WI-OI-109 organization hierarchy via org_unit_id
--   - Integrates with WI-OI-105 Geospatial via place_id
BEGIN;

CREATE TABLE gigalibs_workforce.wfo_engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  org_unit_id VARCHAR(64),
  place_id UUID,
  source_type VARCHAR(32) NOT NULL DEFAULT 'MANUAL'
    CHECK (source_type IN ('MANUAL', 'IDEMPIERE_PROJECT', 'IDEMPIERE_WORK_ORDER', 'IDEMPIERE_SO', 'CRM_OPPORTUNITY')),
  external_id VARCHAR(128),
  client_id VARCHAR(64),
  engagement_type VARCHAR(32) NOT NULL DEFAULT 'EVENT'
    CHECK (engagement_type IN ('EVENT', 'PROJECT', 'WORK_ORDER', 'ROUTE', 'VOYAGE', 'ROSTER_PERIOD', 'SHOOT_DAY', 'POST', 'DUTY_ROSTER')),
  name VARCHAR(200) NOT NULL CHECK (length(btrim(name)) > 0),
  starts_at DATE NOT NULL,
  ends_at DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  per_diem_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  per_diem_amount NUMERIC(10,2) CHECK (per_diem_amount IS NULL OR per_diem_amount >= 0),
  guaranteed_hours NUMERIC(5,2) CHECK (guaranteed_hours IS NULL OR guaranteed_hours >= 0),
  config JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(config) = 'object'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by VARCHAR(128) NOT NULL,
  updated_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at),
  UNIQUE (tenant_id, id)
);

CREATE INDEX wfo_engagements_tenant_status ON gigalibs_workforce.wfo_engagements (tenant_id, status);
CREATE INDEX wfo_engagements_tenant_dates ON gigalibs_workforce.wfo_engagements (tenant_id, starts_at, ends_at);
CREATE INDEX wfo_engagements_tenant_org ON gigalibs_workforce.wfo_engagements (tenant_id, org_unit_id);

CREATE TABLE gigalibs_workforce.wfo_engagement_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  engagement_id UUID NOT NULL,
  job_profile_id UUID,
  title VARCHAR(200) NOT NULL CHECK (length(btrim(title)) > 0),
  org_unit_id VARCHAR(64),
  quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 1000),
  filled INTEGER NOT NULL DEFAULT 0 CHECK (filled >= 0),
  rate_type VARCHAR(20) NOT NULL DEFAULT 'HOURLY'
    CHECK (rate_type IN ('HOURLY', 'DAILY', 'PIECE_RATE', 'FLAT', 'DIFFERENTIAL')),
  rate_amount NUMERIC(10,2) NOT NULL CHECK (rate_amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(config) = 'object'),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (filled <= quantity),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, engagement_id) REFERENCES gigalibs_workforce.wfo_engagements (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX wfo_engagement_positions_tenant_eng ON gigalibs_workforce.wfo_engagement_positions (tenant_id, engagement_id);

-- Enable and force row-level security for tenant isolation
ALTER TABLE gigalibs_workforce.wfo_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workforce.wfo_engagements FORCE ROW LEVEL SECURITY;
CREATE POLICY wfo_engagements_tenant_isolation ON gigalibs_workforce.wfo_engagements
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_workforce.wfo_engagement_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workforce.wfo_engagement_positions FORCE ROW LEVEL SECURITY;
CREATE POLICY wfo_eng_positions_tenant_isolation ON gigalibs_workforce.wfo_engagement_positions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

COMMIT;
