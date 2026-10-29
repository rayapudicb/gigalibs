-- WI-OI-126 S2: finished-goods UOM + inventory receipt linkage.
BEGIN;

ALTER TABLE gigalibs_universal_manufacturing.production_orders
  ADD COLUMN IF NOT EXISTS finished_uom_id uuid,
  ADD COLUMN IF NOT EXISTS inventory_receipt_id uuid;

INSERT INTO gigalibs_universal_manufacturing.schema_migrations (version, name)
VALUES (3, '000003_manufacturing_inventory_handshake');

COMMIT;
