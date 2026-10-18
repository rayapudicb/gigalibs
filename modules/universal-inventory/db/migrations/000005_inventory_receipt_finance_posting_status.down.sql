DROP FUNCTION IF EXISTS gigalibs_inventory.set_receipt_finance_posting_status(character varying, uuid, character varying, character varying);
ALTER TABLE gigalibs_inventory.receipts
  DROP COLUMN IF EXISTS finance_posting_rejection_code,
  DROP COLUMN IF EXISTS finance_posting_status;
