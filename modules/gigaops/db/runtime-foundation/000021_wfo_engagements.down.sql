-- Rollback migration for 000021_wfo_engagements
BEGIN;

DROP TABLE IF EXISTS gigalibs_workforce.wfo_engagement_positions CASCADE;
DROP TABLE IF EXISTS gigalibs_workforce.wfo_engagements CASCADE;

COMMIT;
