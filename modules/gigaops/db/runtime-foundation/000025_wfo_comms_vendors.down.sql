BEGIN;

DROP TABLE IF EXISTS gigalibs_workforce.wfo_support_tickets CASCADE;
DROP TABLE IF EXISTS gigalibs_workforce.wfo_notification_log CASCADE;

ALTER TABLE gigalibs_workforce.wfo_workers
  DROP CONSTRAINT IF EXISTS fk_wfo_workers_vendor,
  DROP COLUMN IF EXISTS vendor_id;

DROP TABLE IF EXISTS gigalibs_workforce.wfo_vendors CASCADE;

COMMIT;
