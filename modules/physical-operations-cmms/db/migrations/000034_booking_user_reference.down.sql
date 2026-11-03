-- WI-OI-169: removes the booked person's login from work-order bookings (execute-own falls back to the assignee).
BEGIN;
DROP INDEX gigalibs_cmms.work_order_bookings_by_user;
ALTER TABLE gigalibs_cmms.work_order_bookings DROP COLUMN resource_user_ref;
DELETE FROM gigalibs_cmms.schema_migrations WHERE version = 34;
COMMIT;
