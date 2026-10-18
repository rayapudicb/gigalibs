-- WI-OI-120bi rollback: drop supervisor sign-off columns.
BEGIN;

ALTER TABLE gigalibs_cmms.work_orders
  DROP CONSTRAINT IF EXISTS work_orders_sign_off_fields_together_chk,
  DROP CONSTRAINT IF EXISTS work_orders_sign_off_completed_chk,
  DROP CONSTRAINT IF EXISTS work_orders_sign_off_note_len_chk;

ALTER TABLE gigalibs_cmms.work_orders
  DROP COLUMN IF EXISTS sign_off_note,
  DROP COLUMN IF EXISTS signed_off_by,
  DROP COLUMN IF EXISTS signed_off_at;

COMMIT;
