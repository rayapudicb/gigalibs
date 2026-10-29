BEGIN;
DELETE FROM gigalibs_universal_manufacturing.schema_migrations WHERE version = 3;
ALTER TABLE gigalibs_universal_manufacturing.production_orders
  DROP COLUMN IF EXISTS inventory_receipt_id,
  DROP COLUMN IF EXISTS finished_uom_id;
COMMIT;
