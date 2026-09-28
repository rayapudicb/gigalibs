-- Migration 000006: Agreements (digital contracts / onboarding docs)
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  role_id UUID NOT NULL REFERENCES gigalibs_gigaops.roles (id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES gigalibs_gigaops.workers (id) ON DELETE CASCADE,
  position_id UUID REFERENCES gigalibs_gigaops.positions (id) ON DELETE SET NULL,
  document_key TEXT NOT NULL,
  agreement_version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'SIGNED', 'REJECTED', 'EXPIRED')),
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  signer_ip INET,
  signer_user_agent TEXT,
  signature_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- UNIQUE (worker_id, role_id) WHERE status NOT IN ('REJECTED','EXPIRED')
CREATE UNIQUE INDEX IF NOT EXISTS idx_gigaops_agreements_active_unique
  ON gigalibs_gigaops.agreements (worker_id, role_id)
  WHERE status NOT IN ('REJECTED', 'EXPIRED');

CREATE INDEX IF NOT EXISTS idx_gigaops_agreements_tenant_status
  ON gigalibs_gigaops.agreements (tenant_id, status);

ALTER TABLE gigalibs_gigaops.agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_gigaops.agreements FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'gigalibs_gigaops'
      AND tablename = 'agreements'
      AND policyname = 'agreements_tenant_rls'
  ) THEN
    CREATE POLICY agreements_tenant_rls ON gigalibs_gigaops.agreements
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
END $$;

INSERT INTO gigalibs_gigaops.schema_migrations (version, applied_at)
VALUES ('000006_gigaops_agreements', now())
ON CONFLICT (version) DO NOTHING;
