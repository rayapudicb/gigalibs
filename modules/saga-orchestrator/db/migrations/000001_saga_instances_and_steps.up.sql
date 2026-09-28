CREATE SCHEMA IF NOT EXISTS gigalibs_saga;

CREATE TABLE gigalibs_saga.saga_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saga_id TEXT NOT NULL UNIQUE,
  tenant_id UUID NOT NULL,
  saga_type TEXT NOT NULL CHECK (saga_type IN (
    'DISPUTE_ESCROW_SETTLEMENT',
    'GRID_CONTINGENCY_FAILOVER',
    'TREASURY_RTGS_SETTLEMENT',
    'CUSTOM'
  )),
  status TEXT NOT NULL CHECK (status IN (
    'STARTED', 'IN_PROGRESS', 'COMPLETED', 'COMPENSATING', 'COMPENSATED', 'FAILED'
  )) DEFAULT 'STARTED',
  payload JSONB NOT NULL DEFAULT '{}',
  compensation_triggered BOOLEAN NOT NULL DEFAULT false,
  audit_ledger_digest TEXT,
  log_summary TEXT[] NOT NULL DEFAULT '{}',
  fail_at_step INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE gigalibs_saga.saga_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saga_id TEXT NOT NULL REFERENCES gigalibs_saga.saga_instances(saga_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  step_index INTEGER NOT NULL,
  name TEXT NOT NULL,
  target_system TEXT NOT NULL CHECK (target_system IN (
    'SAP_S4HANA', 'SALESFORCE_CRM', 'TREASURY_DTS', 'CRYPTOGRAPHIC_VAULT', 'SCADA_GRID'
  )),
  forward_action TEXT NOT NULL,
  compensating_action TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'PENDING', 'EXECUTING', 'SUCCESS', 'FAILED', 'COMPENSATED'
  )) DEFAULT 'PENDING',
  fips_sha256_checksum TEXT,
  executed_at TIMESTAMPTZ,
  compensated_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE gigalibs_saga.saga_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_saga.saga_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON gigalibs_saga.saga_instances
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
CREATE POLICY tenant_isolation ON gigalibs_saga.saga_steps
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE INDEX idx_saga_instances_tenant ON gigalibs_saga.saga_instances(tenant_id);
CREATE INDEX idx_saga_steps_saga_id ON gigalibs_saga.saga_steps(saga_id);
