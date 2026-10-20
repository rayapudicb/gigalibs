-- WI-OI-120fv (F2.5): Finance posting visibility on completed goods receipts (ADR-0033 D3).
-- WI-OI-120bp: status updates via Finance → Inventory relay (no cross-schema function).
ALTER TABLE gigalibs_inventory.receipts
  ADD COLUMN IF NOT EXISTS finance_posting_status VARCHAR(32),
  ADD COLUMN IF NOT EXISTS finance_posting_rejection_code VARCHAR(128);

INSERT INTO gigalibs_inventory.schema_migrations (version, name)
VALUES (5, '000005_inventory_receipt_finance_posting_status')
ON CONFLICT (version) DO NOTHING;
