-- Rollback migration for 000022_wfo_staffing
BEGIN;

DROP TABLE IF EXISTS gigalibs_workforce.wfo_contracts CASCADE;
DROP TABLE IF EXISTS gigalibs_workforce.wfo_invitations CASCADE;

COMMIT;
