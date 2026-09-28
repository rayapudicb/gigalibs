CREATE SCHEMA IF NOT EXISTS gigalibs_ontology;

CREATE TABLE gigalibs_ontology.parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('SUPPLIER','CUSTOMER','FEDERAL_AGENCY','REGIONAL_OPERATOR')),
  tax_id TEXT,
  country TEXT NOT NULL DEFAULT 'US',
  risk_tier TEXT NOT NULL CHECK (risk_tier IN ('LOW','MEDIUM','HIGH')) DEFAULT 'LOW',
  credit_score INTEGER CHECK (credit_score >= 0 AND credit_score <= 1000),
  active_agreements_count INTEGER NOT NULL DEFAULT 0,
  total_transaction_volume_usd NUMERIC(18,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);

CREATE TABLE gigalibs_ontology.agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  party_code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('MASTER_SERVICES_AGREEMENT','PROCUREMENT_CONTRACT','POWER_PURCHASE_AGREEMENT','TREASURY_ACCOUNT_ACCORD')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','DISPUTED','EXPIRING_SOON')) DEFAULT 'ACTIVE',
  effective_date DATE NOT NULL,
  expiration_date DATE NOT NULL,
  total_value_usd NUMERIC(18,4) NOT NULL DEFAULT 0,
  payment_terms TEXT NOT NULL DEFAULT 'NET30',
  governing_law TEXT NOT NULL DEFAULT 'US-Federal',
  sla_commitment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);

CREATE TABLE gigalibs_ontology.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  code TEXT NOT NULL,
  party_code TEXT NOT NULL,
  agreement_code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('INVOICE','DISBURSEMENT','BUDGET_OBLIGATION','TELEMETRY_READING')),
  amount_usd NUMERIC(18,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('RECONCILED','PENDING_MATCH','DISCREPANCY_FLAGGED')) DEFAULT 'PENDING_MATCH',
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  discrepancy_amount_usd NUMERIC(18,4),
  fips_sha256_checksum TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);

CREATE TABLE gigalibs_ontology.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('CLOUD_GPU_CLUSTER','GRID_SUBSTATION','FEDERAL_DATA_CENTER','TREASURY_RESERVE_NODE')),
  party_code TEXT NOT NULL,
  agreement_code TEXT NOT NULL,
  operational_status TEXT NOT NULL CHECK (operational_status IN ('OPTIMAL','DEGRADED','MAINTENANCE')) DEFAULT 'OPTIMAL',
  location TEXT NOT NULL,
  telemetry_metric TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);

-- RLS
ALTER TABLE gigalibs_ontology.parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ontology.agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ontology.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ontology.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON gigalibs_ontology.parties
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
CREATE POLICY tenant_isolation ON gigalibs_ontology.agreements
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
CREATE POLICY tenant_isolation ON gigalibs_ontology.transactions
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
CREATE POLICY tenant_isolation ON gigalibs_ontology.assets
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE INDEX idx_ontology_parties_tenant ON gigalibs_ontology.parties(tenant_id);
CREATE INDEX idx_ontology_agreements_tenant ON gigalibs_ontology.agreements(tenant_id);
CREATE INDEX idx_ontology_transactions_tenant ON gigalibs_ontology.transactions(tenant_id);
CREATE INDEX idx_ontology_assets_tenant ON gigalibs_ontology.assets(tenant_id);
