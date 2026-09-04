-- PL/pgSQL trigger records are table-shaped. Keep table-specific record access
-- in mutually exclusive branches so PostgreSQL never resolves fields belonging
-- to the other AP line table.
CREATE OR REPLACE FUNCTION enforce_ap_line_resolution() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'canonical AP source lines are immutable';
  END IF;
  IF NEW."purchaseOrderLineId" IS DISTINCT FROM OLD."purchaseOrderLineId"
     AND NOT (OLD."purchaseOrderLineId" IS NULL AND NEW."purchaseOrderLineId" IS NOT NULL) THEN
    RAISE EXCEPTION 'AP line purchase order reference can only be resolved once';
  END IF;
  IF TG_TABLE_NAME = 'supplier_invoice_lines' THEN
    IF NEW."supplierInvoiceId" IS DISTINCT FROM OLD."supplierInvoiceId"
       OR NEW."purchaseOrderLineNumber" IS DISTINCT FROM OLD."purchaseOrderLineNumber"
       OR NEW."lineNumber" IS DISTINCT FROM OLD."lineNumber"
       OR NEW."description" IS DISTINCT FROM OLD."description"
       OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
       OR NEW."unitPriceMinor" IS DISTINCT FROM OLD."unitPriceMinor"
       OR NEW."totalMinor" IS DISTINCT FROM OLD."totalMinor" THEN
      RAISE EXCEPTION 'canonical supplier invoice line fields are immutable';
    END IF;
  ELSIF TG_TABLE_NAME = 'goods_receipt_lines' THEN
    IF NEW."goodsReceiptId" IS DISTINCT FROM OLD."goodsReceiptId"
       OR NEW."purchaseOrderLineNumber" IS DISTINCT FROM OLD."purchaseOrderLineNumber"
       OR NEW."quantityReceived" IS DISTINCT FROM OLD."quantityReceived" THEN
      RAISE EXCEPTION 'canonical goods receipt line fields are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
