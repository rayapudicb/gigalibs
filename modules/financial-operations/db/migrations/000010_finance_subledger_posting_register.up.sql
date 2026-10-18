-- WI-OI-120ft (F2.4): Tie Inventory receipt inbox lines to posted GL journals for reconciliation (ADR-0033 D3).
BEGIN;

CREATE TABLE IF NOT EXISTS gigalibs_finance.subledger_posting_register (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  consumer_name VARCHAR(128) NOT NULL,
  message_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  source_document_type VARCHAR(64) NOT NULL,
  source_document_id VARCHAR(128) NOT NULL,
  journal_id UUID REFERENCES gigalibs_finance.gl_journals (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_subledger_posting_register_source UNIQUE (
    tenant_id,
    consumer_name,
    source_document_type,
    source_document_id
  )
);

CREATE INDEX IF NOT EXISTS subledger_posting_register_tenant_message
  ON gigalibs_finance.subledger_posting_register (tenant_id, message_id);

ALTER TABLE gigalibs_finance.subledger_posting_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.subledger_posting_register FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subledger_posting_register_tenant_isolation ON gigalibs_finance.subledger_posting_register;
CREATE POLICY subledger_posting_register_tenant_isolation ON gigalibs_finance.subledger_posting_register
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

COMMIT;
