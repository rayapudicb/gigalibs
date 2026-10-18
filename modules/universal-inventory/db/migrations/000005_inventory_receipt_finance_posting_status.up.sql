-- WI-OI-120fv (F2.5): Finance posting visibility on completed goods receipts (ADR-0033 D3).
ALTER TABLE gigalibs_inventory.receipts
  ADD COLUMN IF NOT EXISTS finance_posting_status VARCHAR(32),
  ADD COLUMN IF NOT EXISTS finance_posting_rejection_code VARCHAR(128);

CREATE OR REPLACE FUNCTION gigalibs_inventory.set_receipt_finance_posting_status(
  p_tenant_id character varying,
  p_receipt_id uuid,
  p_status character varying,
  p_rejection_code character varying
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = gigalibs_inventory, pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('AWAITING_POSTING', 'POSTED', 'POSTING_REJECTED') THEN
    RAISE EXCEPTION 'Invalid finance posting status %', p_status;
  END IF;
  UPDATE gigalibs_inventory.receipts
     SET finance_posting_status = p_status,
         finance_posting_rejection_code = CASE WHEN p_status = 'POSTING_REJECTED' THEN left(p_rejection_code, 128) ELSE NULL END,
         updated_at = clock_timestamp()
   WHERE tenant_id = p_tenant_id AND id = p_receipt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt % not found for tenant %', p_receipt_id, p_tenant_id;
  END IF;
END;
$$;
