-- WI-EAM-005 Down Migration

ALTER TABLE gigalibs_cmms.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_storeroom_fk,
  DROP COLUMN IF EXISTS bin_location,
  DROP COLUMN IF EXISTS storeroom_id;

DROP TABLE IF EXISTS gigalibs_cmms.cmms_part_balances CASCADE;
DROP TABLE IF EXISTS gigalibs_cmms.cmms_storerooms CASCADE;
