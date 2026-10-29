BEGIN;

DROP INDEX IF EXISTS gigalibs_inventory.stock_ledger_transfer_reversal_once;

DROP TABLE IF EXISTS gigalibs_inventory.inventory_reservation_allocations;
DROP TABLE IF EXISTS gigalibs_inventory.inventory_reservation_issues;
DROP TABLE IF EXISTS gigalibs_inventory.inventory_receipt_cost_records;
DROP TRIGGER IF EXISTS stock_ledger_entries_cost_layer_mirror ON gigalibs_inventory.stock_ledger_entries;
DROP FUNCTION IF EXISTS gigalibs_inventory.mirror_ledger_entry_to_cost_layer();
DROP TRIGGER IF EXISTS inventory_cost_layers_immutable ON gigalibs_inventory.inventory_cost_layers;
DROP FUNCTION IF EXISTS gigalibs_inventory.prevent_cost_layer_mutation();
DROP TABLE IF EXISTS gigalibs_inventory.inventory_cost_layers;
DROP TABLE IF EXISTS gigalibs_inventory.inventory_org_valuation_settings;

DELETE FROM gigalibs_inventory.schema_migrations WHERE version = 10;

COMMIT;
