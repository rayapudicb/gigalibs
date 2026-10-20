BEGIN;
DROP INDEX IF EXISTS gigalibs_finance.uq_inventory_cost_layers_source_document;
ALTER TABLE gigalibs_finance.inventory_cost_layers
  DROP COLUMN IF EXISTS source_document_id,
  DROP COLUMN IF EXISTS source_document_type;
DELETE FROM gigalibs_finance.schema_migrations WHERE version = 13;
COMMIT;
