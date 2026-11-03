-- WI-OI-169: a work order's Workforce booking keeps the booked person's login, so a technician booked through
-- Workforce may execute the work order they are booked for (as its assignee may). Additive and forward-only: one
-- nullable column and an index; existing bookings stay without a login until their next booking fact.
-- Recovery: the down migration drops the column; execute-own then falls back to the assignee only.
BEGIN;

ALTER TABLE gigalibs_cmms.work_order_bookings
  ADD COLUMN resource_user_ref text CHECK (char_length(resource_user_ref) BETWEEN 1 AND 128);

CREATE INDEX work_order_bookings_by_user ON gigalibs_cmms.work_order_bookings (tenant_id, work_order_id, resource_user_ref)
  WHERE resource_user_ref IS NOT NULL;

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (34, '000034_booking_user_reference');

COMMIT;
