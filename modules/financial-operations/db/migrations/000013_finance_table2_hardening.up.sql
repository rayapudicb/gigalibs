-- WI-OI-120bq (H1, M1): cost-layer idempotency by source document; revoke PUBLIC execute on definer functions.
BEGIN;

ALTER TABLE gigalibs_finance.inventory_cost_layers
  ADD COLUMN IF NOT EXISTS source_document_type VARCHAR(64),
  ADD COLUMN IF NOT EXISTS source_document_id VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_cost_layers_source_document
  ON gigalibs_finance.inventory_cost_layers (tenant_id, source_document_type, source_document_id)
  WHERE source_document_id IS NOT NULL;

REVOKE ALL ON FUNCTION gigalibs_finance.relay_lease_finance_events(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_finance.relay_settle_finance_event(uuid, boolean, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_finance.list_inventory_receipt_posting_reconciliation_tenants(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gigalibs_finance.relay_lease_finance_events(integer, integer) TO gigalibs_finance_runtime;
GRANT EXECUTE ON FUNCTION gigalibs_finance.relay_settle_finance_event(uuid, boolean, text, integer, integer) TO gigalibs_finance_runtime;
GRANT EXECUTE ON FUNCTION gigalibs_finance.list_inventory_receipt_posting_reconciliation_tenants(text, text) TO gigalibs_finance_runtime;

INSERT INTO gigalibs_finance.schema_migrations (version) VALUES (13)
ON CONFLICT (version) DO NOTHING;

COMMIT;
