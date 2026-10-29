-- Recovery is roll-forward: first resolve all pending actions, then use this only on an isolated failed rollout.
BEGIN;

ALTER TABLE gigalibs_universal_manufacturing.production_orders
  DROP CONSTRAINT production_orders_status_check;
ALTER TABLE gigalibs_universal_manufacturing.production_orders
  ADD CONSTRAINT production_orders_status_check
  CHECK (status IN ('DRAFT', 'RELEASED', 'ISSUED', 'COMPLETED', 'CANCELLED'));
ALTER TABLE gigalibs_universal_manufacturing.production_orders
  DROP COLUMN last_error_code;
ALTER TABLE gigalibs_universal_manufacturing.production_plans
  DROP COLUMN org_unit_id;
DROP TABLE gigalibs_universal_manufacturing.routing_steps;
DROP TABLE gigalibs_universal_manufacturing.routings;
ALTER TABLE gigalibs_universal_manufacturing.work_centers DROP COLUMN org_unit_id;
DROP TABLE gigalibs_universal_manufacturing.production_order_counters;
DROP TABLE gigalibs_universal_manufacturing.org_replica_closure;
DROP TABLE gigalibs_universal_manufacturing.org_replica_units;
DROP TABLE gigalibs_universal_manufacturing.org_replica_versions;

DELETE FROM gigalibs_universal_manufacturing.schema_migrations WHERE version = 5;

COMMIT;
