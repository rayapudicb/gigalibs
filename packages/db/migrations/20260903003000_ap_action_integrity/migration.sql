-- Strengthen append-only evidence and approval records. The initial AP migration
-- prohibited updates; production evidence must also reject direct deletion.
DROP TRIGGER "ap_match_evaluations_immutable" ON "ap_match_evaluations";
CREATE TRIGGER "ap_match_evaluations_immutable"
  BEFORE UPDATE OR DELETE ON "ap_match_evaluations"
  FOR EACH ROW EXECUTE FUNCTION prevent_ap_immutable_record_update();

DROP TRIGGER "ap_match_findings_immutable" ON "ap_match_findings";
CREATE TRIGGER "ap_match_findings_immutable"
  BEFORE UPDATE OR DELETE ON "ap_match_findings"
  FOR EACH ROW EXECUTE FUNCTION prevent_ap_immutable_record_update();

DROP TRIGGER "evidence_bundles_immutable" ON "evidence_bundles";
CREATE TRIGGER "evidence_bundles_immutable"
  BEFORE UPDATE OR DELETE ON "evidence_bundles"
  FOR EACH ROW EXECUTE FUNCTION prevent_ap_immutable_record_update();

DROP TRIGGER "evidence_items_immutable" ON "evidence_items";
CREATE TRIGGER "evidence_items_immutable"
  BEFORE UPDATE OR DELETE ON "evidence_items"
  FOR EACH ROW EXECUTE FUNCTION prevent_ap_immutable_record_update();

DROP TRIGGER "action_approvals_immutable" ON "action_approvals";
CREATE TRIGGER "action_approvals_immutable"
  BEFORE UPDATE OR DELETE ON "action_approvals"
  FOR EACH ROW EXECUTE FUNCTION prevent_ap_immutable_record_update();

DROP TRIGGER "action_results_immutable" ON "action_results";
CREATE TRIGGER "action_results_immutable"
  BEFORE UPDATE OR DELETE ON "action_results"
  FOR EACH ROW EXECUTE FUNCTION prevent_ap_immutable_record_update();

-- Proposed action content is immutable. Only the controlled state machine and
-- its state timestamps may change after creation.
CREATE FUNCTION enforce_business_action_integrity() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'business action history is immutable';
  END IF;

  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."environmentId" IS DISTINCT FROM OLD."environmentId"
     OR NEW."supplierInvoiceId" IS DISTINCT FROM OLD."supplierInvoiceId"
     OR NEW."policyRuleVersionId" IS DISTINCT FROM OLD."policyRuleVersionId"
     OR NEW."actionType" IS DISTINCT FROM OLD."actionType"
     OR NEW."risk" IS DISTINCT FROM OLD."risk"
     OR NEW."requestedById" IS DISTINCT FROM OLD."requestedById"
     OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
     OR NEW."preview" IS DISTINCT FROM OLD."preview"
     OR NEW."parameters" IS DISTINCT FROM OLD."parameters"
     OR NEW."inputHash" IS DISTINCT FROM OLD."inputHash"
     OR NEW."requiredApprovals" IS DISTINCT FROM OLD."requiredApprovals"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'business action proposal is immutable';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
    (OLD."status" = 'PENDING_APPROVAL' AND NEW."status" IN ('APPROVED', 'REJECTED', 'SUCCEEDED'))
    OR (OLD."status" = 'APPROVED' AND NEW."status" IN ('EXECUTING', 'SUCCEEDED', 'FAILED'))
    OR (OLD."status" = 'EXECUTING' AND NEW."status" IN ('SUCCEEDED', 'FAILED', 'RECONCILIATION_REQUIRED'))
    OR (OLD."status" = 'FAILED' AND NEW."status" = 'RECONCILIATION_REQUIRED')
    OR (OLD."status" = 'RECONCILIATION_REQUIRED' AND NEW."status" IN ('EXECUTING', 'SUCCEEDED', 'FAILED'))
  ) THEN
    RAISE EXCEPTION 'invalid business action state transition from % to %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "business_actions_integrity"
  BEFORE UPDATE OR DELETE ON "business_actions"
  FOR EACH ROW EXECUTE FUNCTION enforce_business_action_integrity();

-- Source business fields are immutable after ingestion. Out-of-order references
-- may only be resolved once, from NULL to their canonical foreign key.
CREATE FUNCTION enforce_ap_source_record_integrity() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'canonical AP source records are immutable';
  END IF;

  IF TG_TABLE_NAME = 'supplier_invoices' THEN
    IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
       OR NEW."environmentId" IS DISTINCT FROM OLD."environmentId"
       OR NEW."supplierId" IS DISTINCT FROM OLD."supplierId"
       OR NEW."sourceEventId" IS DISTINCT FROM OLD."sourceEventId"
       OR NEW."externalId" IS DISTINCT FROM OLD."externalId"
       OR NEW."invoiceNumber" IS DISTINCT FROM OLD."invoiceNumber"
       OR NEW."purchaseOrderExternalId" IS DISTINCT FROM OLD."purchaseOrderExternalId"
       OR NEW."currency" IS DISTINCT FROM OLD."currency"
       OR NEW."subtotalMinor" IS DISTINCT FROM OLD."subtotalMinor"
       OR NEW."taxMinor" IS DISTINCT FROM OLD."taxMinor"
       OR NEW."totalMinor" IS DISTINCT FROM OLD."totalMinor"
       OR NEW."invoiceDate" IS DISTINCT FROM OLD."invoiceDate"
       OR NEW."dueDate" IS DISTINCT FROM OLD."dueDate"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
      RAISE EXCEPTION 'canonical supplier invoice fields are immutable';
    END IF;
    IF NEW."purchaseOrderId" IS DISTINCT FROM OLD."purchaseOrderId"
       AND NOT (OLD."purchaseOrderId" IS NULL AND NEW."purchaseOrderId" IS NOT NULL) THEN
      RAISE EXCEPTION 'supplier invoice purchase order can only be resolved once';
    END IF;
  ELSIF TG_TABLE_NAME = 'goods_receipts' THEN
    IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
       OR NEW."environmentId" IS DISTINCT FROM OLD."environmentId"
       OR NEW."sourceEventId" IS DISTINCT FROM OLD."sourceEventId"
       OR NEW."externalId" IS DISTINCT FROM OLD."externalId"
       OR NEW."purchaseOrderExternalId" IS DISTINCT FROM OLD."purchaseOrderExternalId"
       OR NEW."receivedAt" IS DISTINCT FROM OLD."receivedAt"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
      RAISE EXCEPTION 'canonical goods receipt fields are immutable';
    END IF;
    IF NEW."purchaseOrderId" IS DISTINCT FROM OLD."purchaseOrderId"
       AND NOT (OLD."purchaseOrderId" IS NULL AND NEW."purchaseOrderId" IS NOT NULL) THEN
      RAISE EXCEPTION 'goods receipt purchase order can only be resolved once';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "supplier_invoices_integrity"
  BEFORE UPDATE OR DELETE ON "supplier_invoices"
  FOR EACH ROW EXECUTE FUNCTION enforce_ap_source_record_integrity();

CREATE TRIGGER "goods_receipts_integrity"
  BEFORE UPDATE OR DELETE ON "goods_receipts"
  FOR EACH ROW EXECUTE FUNCTION enforce_ap_source_record_integrity();

CREATE FUNCTION enforce_ap_line_resolution() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'canonical AP source lines are immutable';
  END IF;
  IF NEW."purchaseOrderLineId" IS DISTINCT FROM OLD."purchaseOrderLineId"
     AND NOT (OLD."purchaseOrderLineId" IS NULL AND NEW."purchaseOrderLineId" IS NOT NULL) THEN
    RAISE EXCEPTION 'AP line purchase order reference can only be resolved once';
  END IF;
  IF TG_TABLE_NAME = 'supplier_invoice_lines' AND (
       NEW."supplierInvoiceId" IS DISTINCT FROM OLD."supplierInvoiceId"
       OR NEW."purchaseOrderLineNumber" IS DISTINCT FROM OLD."purchaseOrderLineNumber"
       OR NEW."lineNumber" IS DISTINCT FROM OLD."lineNumber"
       OR NEW."description" IS DISTINCT FROM OLD."description"
       OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
       OR NEW."unitPriceMinor" IS DISTINCT FROM OLD."unitPriceMinor"
       OR NEW."totalMinor" IS DISTINCT FROM OLD."totalMinor"
     ) THEN
    RAISE EXCEPTION 'canonical supplier invoice line fields are immutable';
  END IF;
  IF TG_TABLE_NAME = 'goods_receipt_lines' AND (
       NEW."goodsReceiptId" IS DISTINCT FROM OLD."goodsReceiptId"
       OR NEW."purchaseOrderLineNumber" IS DISTINCT FROM OLD."purchaseOrderLineNumber"
       OR NEW."quantityReceived" IS DISTINCT FROM OLD."quantityReceived"
     ) THEN
    RAISE EXCEPTION 'canonical goods receipt line fields are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "supplier_invoice_lines_resolution"
  BEFORE UPDATE OR DELETE ON "supplier_invoice_lines"
  FOR EACH ROW EXECUTE FUNCTION enforce_ap_line_resolution();

CREATE TRIGGER "goods_receipt_lines_resolution"
  BEFORE UPDATE OR DELETE ON "goods_receipt_lines"
  FOR EACH ROW EXECUTE FUNCTION enforce_ap_line_resolution();

CREATE FUNCTION prevent_purchase_order_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'canonical purchase order records are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "purchase_orders_immutable"
  BEFORE UPDATE OR DELETE ON "purchase_orders"
  FOR EACH ROW EXECUTE FUNCTION prevent_purchase_order_mutation();

CREATE TRIGGER "purchase_order_lines_immutable"
  BEFORE UPDATE OR DELETE ON "purchase_order_lines"
  FOR EACH ROW EXECUTE FUNCTION prevent_purchase_order_mutation();
