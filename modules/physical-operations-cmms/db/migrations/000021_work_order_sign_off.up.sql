-- WI-OI-120bi: Supervisor sign-off on completed work orders (status stays COMPLETED; UI shows Closed).
BEGIN;

ALTER TABLE gigalibs_cmms.work_orders
  ADD COLUMN signed_off_at timestamptz,
  ADD COLUMN signed_off_by gigalibs_cmms.principal_ref,
  ADD COLUMN sign_off_note text;

ALTER TABLE gigalibs_cmms.work_orders
  ADD CONSTRAINT work_orders_sign_off_note_len_chk
    CHECK (sign_off_note IS NULL OR char_length(sign_off_note) BETWEEN 1 AND 4000);

ALTER TABLE gigalibs_cmms.work_orders
  ADD CONSTRAINT work_orders_sign_off_completed_chk
    CHECK (signed_off_at IS NULL OR status = 'COMPLETED');

ALTER TABLE gigalibs_cmms.work_orders
  ADD CONSTRAINT work_orders_sign_off_fields_together_chk
    CHECK (
      (signed_off_at IS NULL AND signed_off_by IS NULL AND sign_off_note IS NULL)
      OR (signed_off_at IS NOT NULL AND signed_off_by IS NOT NULL AND sign_off_note IS NOT NULL)
    );

COMMIT;
