-- WI-OI-140: removes the request-link and report tables. Run only while empty; otherwise keep migration 32 and roll forward.
BEGIN;
DROP TABLE gigalibs_cmms.request_report_photos;
DROP TABLE gigalibs_cmms.request_reports;
DROP TABLE gigalibs_cmms.portal_submission_photos;
DROP TABLE gigalibs_cmms.portal_submissions;
DROP TABLE gigalibs_cmms.portal_links;
DELETE FROM gigalibs_cmms.schema_migrations WHERE version = 32;
COMMIT;
