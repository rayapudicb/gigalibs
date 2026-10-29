BEGIN;

DROP TRIGGER IF EXISTS inventory_landed_cost_adjustments_immutable ON gigalibs_inventory.inventory_landed_cost_adjustments;
DROP FUNCTION IF EXISTS gigalibs_inventory.prevent_landed_cost_adjustment_mutation();
DROP TABLE IF EXISTS gigalibs_inventory.inventory_landed_cost_adjustments;

DELETE FROM gigalibs_inventory.schema_migrations WHERE version = 13;

COMMIT;
