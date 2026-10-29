-- WI-OI-128 S2: idempotent DocAction outcomes for RMA transitions.
BEGIN;

CREATE TABLE gigalibs_universal_returns.document_action_outcomes (
  tenant_id varchar(64) NOT NULL,
  document_id uuid NOT NULL,
  action varchar(64) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, document_id, action, idempotency_key)
);

ALTER TABLE gigalibs_universal_returns.document_action_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_universal_returns.document_action_outcomes FORCE ROW LEVEL SECURITY;
CREATE POLICY document_action_outcomes_tenant_isolation ON gigalibs_universal_returns.document_action_outcomes
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

INSERT INTO gigalibs_universal_returns.schema_migrations (version, name)
VALUES (3, '000003_rma_document_actions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
