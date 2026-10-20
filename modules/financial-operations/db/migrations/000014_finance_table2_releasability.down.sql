BEGIN;

DROP TABLE IF EXISTS gigalibs_finance.subledger_posting_retries;
DROP TABLE IF EXISTS gigalibs_finance.inventory_posting_cutoff_confirmations;
DROP TABLE IF EXISTS gigalibs_finance.product_standard_costs;
ALTER TABLE gigalibs_finance.inbox_receipts
  DROP COLUMN IF EXISTS posting_date,
  DROP COLUMN IF EXISTS raw_body;

DELETE FROM gigalibs_finance.schema_migrations WHERE version = 14;

COMMIT;
