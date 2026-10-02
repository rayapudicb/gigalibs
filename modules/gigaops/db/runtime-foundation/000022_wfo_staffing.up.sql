-- WI-WFO-002: Universal Staffing Flow (Invitations & Digital Contracts)
BEGIN;

CREATE TABLE gigalibs_workforce.wfo_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  engagement_id UUID NOT NULL,
  position_id UUID NOT NULL,
  worker_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'INVITED'
    CHECK (status IN ('INVITED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED')),
  rate_override NUMERIC(10,2) CHECK (rate_override IS NULL OR rate_override >= 0),
  message VARCHAR(1000),
  responded_at TIMESTAMPTZ,
  response_reason VARCHAR(500),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, position_id, worker_id),
  FOREIGN KEY (tenant_id, engagement_id) REFERENCES gigalibs_workforce.wfo_engagements (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, position_id) REFERENCES gigalibs_workforce.wfo_engagement_positions (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, worker_id) REFERENCES gigalibs_workforce.wfo_workers (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX wfo_invitations_tenant_worker ON gigalibs_workforce.wfo_invitations (tenant_id, worker_id, status);
CREATE INDEX wfo_invitations_tenant_position ON gigalibs_workforce.wfo_invitations (tenant_id, position_id, status);

CREATE TABLE gigalibs_workforce.wfo_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  engagement_id UUID NOT NULL,
  position_id UUID NOT NULL,
  worker_id UUID NOT NULL,
  template_code VARCHAR(64) NOT NULL DEFAULT 'STANDARD_AGREEMENT',
  title VARCHAR(200) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SENT', 'SIGNED', 'APPROVED', 'VOIDED')),
  file_url VARCHAR(1024),
  terms_text TEXT,
  signature_hash VARCHAR(128),
  signed_at TIMESTAMPTZ,
  signed_by_ip VARCHAR(64),
  approved_by VARCHAR(128),
  approved_at TIMESTAMPTZ,
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, engagement_id) REFERENCES gigalibs_workforce.wfo_engagements (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, position_id) REFERENCES gigalibs_workforce.wfo_engagement_positions (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, worker_id) REFERENCES gigalibs_workforce.wfo_workers (tenant_id, id) ON DELETE CASCADE,
  CHECK (status <> 'SIGNED' OR (signed_at IS NOT NULL AND signature_hash IS NOT NULL)),
  CHECK (status <> 'APPROVED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE INDEX wfo_contracts_tenant_worker ON gigalibs_workforce.wfo_contracts (tenant_id, worker_id, status);
CREATE INDEX wfo_contracts_tenant_engagement ON gigalibs_workforce.wfo_contracts (tenant_id, engagement_id, status);

-- Row-level security for tenant isolation
ALTER TABLE gigalibs_workforce.wfo_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workforce.wfo_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY wfo_invitations_tenant_isolation ON gigalibs_workforce.wfo_invitations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_workforce.wfo_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workforce.wfo_contracts FORCE ROW LEVEL SECURITY;
CREATE POLICY wfo_contracts_tenant_isolation ON gigalibs_workforce.wfo_contracts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

COMMIT;
