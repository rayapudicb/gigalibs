-- Migration 000009: Immutable Audit Log (21 CFR Part 11 & SOC2 Compliant)
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  actor_id UUID,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gigaops_audit_lookup
  ON gigalibs_gigaops.audit_log (tenant_id, entity_type, entity_id, occurred_at DESC);

ALTER TABLE gigalibs_gigaops.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_gigaops.audit_log FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'gigalibs_gigaops'
      AND tablename = 'audit_log'
      AND policyname = 'audit_log_select_policy'
  ) THEN
    CREATE POLICY audit_log_select_policy ON gigalibs_gigaops.audit_log
      FOR SELECT
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'gigalibs_gigaops'
      AND tablename = 'audit_log'
      AND policyname = 'audit_log_insert_policy'
  ) THEN
    CREATE POLICY audit_log_insert_policy ON gigalibs_gigaops.audit_log
      FOR INSERT
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
  -- Note: NO UPDATE policy and NO DELETE policy are created.
  -- This guarantees append-only immutability.
END $$;

-- Convenience view: v_recent_audit
CREATE OR REPLACE VIEW gigalibs_gigaops.v_recent_audit AS
  SELECT 
    id,
    tenant_id,
    actor_id,
    actor_email,
    actor_role,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    ip_address,
    occurred_at
  FROM gigalibs_gigaops.audit_log
  ORDER BY id DESC
  LIMIT 1000;

INSERT INTO gigalibs_gigaops.schema_migrations (version, applied_at)
VALUES ('000009_gigaops_audit_log', now())
ON CONFLICT (version) DO NOTHING;
