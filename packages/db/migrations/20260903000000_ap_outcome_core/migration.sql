-- CreateEnum
CREATE TYPE "ApDocumentStatus" AS ENUM ('RECEIVED', 'MATCHING', 'MATCHED', 'EXCEPTION', 'PENDING_APPROVAL', 'APPROVED_FOR_PAYMENT', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApMatchOutcome" AS ENUM ('MATCHED', 'MISMATCH', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('INFO', 'WARNING', 'BLOCKING');

-- CreateEnum
CREATE TYPE "BusinessActionStatus" AS ENUM ('PROPOSED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'RECONCILIATION_REQUIRED');

-- CreateEnum
CREATE TYPE "ActionRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "rule_definitions" ADD COLUMN     "activeVersion" INTEGER,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'GENERIC';

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "orderedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "itemCode" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unitPriceMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "quantityReceived" DECIMAL(20,6) NOT NULL,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "sourceEventId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "subtotalMinor" BIGINT NOT NULL,
    "taxMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "status" "ApDocumentStatus" NOT NULL DEFAULT 'RECEIVED',
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoice_lines" (
    "id" TEXT NOT NULL,
    "supplierInvoiceId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unitPriceMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,

    CONSTRAINT "supplier_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_versions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "publishedById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ap_match_evaluations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "supplierInvoiceId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "ruleVersionId" TEXT NOT NULL,
    "outcome" "ApMatchOutcome" NOT NULL,
    "explanation" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ap_match_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ap_match_findings" (
    "id" TEXT NOT NULL,
    "matchEvaluationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "field" TEXT NOT NULL,
    "expected" TEXT,
    "actual" TEXT,
    "delta" TEXT,
    "explanation" TEXT NOT NULL,
    "evidenceRefs" JSONB NOT NULL,

    CONSTRAINT "ap_match_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_bundles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "matchEvaluationId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_items" (
    "id" TEXT NOT NULL,
    "evidenceBundleId" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "citation" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_actions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "supplierInvoiceId" TEXT NOT NULL,
    "policyRuleVersionId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "risk" "ActionRisk" NOT NULL,
    "status" "BusinessActionStatus" NOT NULL DEFAULT 'PROPOSED',
    "requestedById" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "preview" JSONB NOT NULL,
    "parameters" JSONB NOT NULL,
    "inputHash" TEXT NOT NULL,
    "requiredApprovals" INTEGER NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_approvals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_results" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "status" "BusinessActionStatus" NOT NULL,
    "result" JSONB NOT NULL,
    "beforeHash" TEXT NOT NULL,
    "afterHash" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppliers_tenantId_environmentId_status_idx" ON "suppliers"("tenantId", "environmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenantId_environmentId_externalId_key" ON "suppliers"("tenantId", "environmentId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_sourceEventId_key" ON "purchase_orders"("sourceEventId");

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_environmentId_supplierId_status_idx" ON "purchase_orders"("tenantId", "environmentId", "supplierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenantId_environmentId_externalId_key" ON "purchase_orders"("tenantId", "environmentId", "externalId");

-- CreateIndex
CREATE INDEX "purchase_order_lines_purchaseOrderId_idx" ON "purchase_order_lines"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_purchaseOrderId_lineNumber_key" ON "purchase_order_lines"("purchaseOrderId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_sourceEventId_key" ON "goods_receipts"("sourceEventId");

-- CreateIndex
CREATE INDEX "goods_receipts_tenantId_environmentId_purchaseOrderId_idx" ON "goods_receipts"("tenantId", "environmentId", "purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_tenantId_environmentId_externalId_key" ON "goods_receipts"("tenantId", "environmentId", "externalId");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_purchaseOrderLineId_idx" ON "goods_receipt_lines"("purchaseOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_lines_goodsReceiptId_purchaseOrderLineId_key" ON "goods_receipt_lines"("goodsReceiptId", "purchaseOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invoices_sourceEventId_key" ON "supplier_invoices"("sourceEventId");

-- CreateIndex
CREATE INDEX "supplier_invoices_tenantId_environmentId_status_dueDate_idx" ON "supplier_invoices"("tenantId", "environmentId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invoices_tenantId_environmentId_externalId_key" ON "supplier_invoices"("tenantId", "environmentId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invoices_tenantId_environmentId_supplierId_invoice_key" ON "supplier_invoices"("tenantId", "environmentId", "supplierId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "supplier_invoice_lines_purchaseOrderLineId_idx" ON "supplier_invoice_lines"("purchaseOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invoice_lines_supplierInvoiceId_lineNumber_key" ON "supplier_invoice_lines"("supplierInvoiceId", "lineNumber");

-- CreateIndex
CREATE INDEX "rule_versions_tenantId_publishedAt_idx" ON "rule_versions"("tenantId", "publishedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rule_versions_ruleId_version_key" ON "rule_versions"("ruleId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "rule_versions_ruleId_checksum_key" ON "rule_versions"("ruleId", "checksum");

-- CreateIndex
CREATE INDEX "ap_match_evaluations_tenantId_environmentId_outcome_evaluat_idx" ON "ap_match_evaluations"("tenantId", "environmentId", "outcome", "evaluatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ap_match_evaluations_supplierInvoiceId_inputHash_key" ON "ap_match_evaluations"("supplierInvoiceId", "inputHash");

-- CreateIndex
CREATE INDEX "ap_match_findings_matchEvaluationId_severity_idx" ON "ap_match_findings"("matchEvaluationId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_bundles_matchEvaluationId_key" ON "evidence_bundles"("matchEvaluationId");

-- CreateIndex
CREATE INDEX "evidence_bundles_tenantId_correlationId_idx" ON "evidence_bundles"("tenantId", "correlationId");

-- CreateIndex
CREATE INDEX "evidence_items_evidenceBundleId_recordType_idx" ON "evidence_items"("evidenceBundleId", "recordType");

-- CreateIndex
CREATE INDEX "business_actions_tenantId_environmentId_status_createdAt_idx" ON "business_actions"("tenantId", "environmentId", "status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "business_actions_tenantId_actionType_idempotencyKey_key" ON "business_actions"("tenantId", "actionType", "idempotencyKey");

-- CreateIndex
CREATE INDEX "action_approvals_tenantId_approverId_decidedAt_idx" ON "action_approvals"("tenantId", "approverId", "decidedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "action_approvals_actionId_approverId_key" ON "action_approvals"("actionId", "approverId");

-- CreateIndex
CREATE UNIQUE INDEX "action_results_actionId_key" ON "action_results"("actionId");

-- CreateIndex
CREATE INDEX "action_results_tenantId_executedAt_idx" ON "action_results"("tenantId", "executedAt" DESC);

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "source_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "source_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "source_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_supplierInvoiceId_fkey" FOREIGN KEY ("supplierInvoiceId") REFERENCES "supplier_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_versions" ADD CONSTRAINT "rule_versions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_versions" ADD CONSTRAINT "rule_versions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "rule_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_match_evaluations" ADD CONSTRAINT "ap_match_evaluations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_match_evaluations" ADD CONSTRAINT "ap_match_evaluations_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_match_evaluations" ADD CONSTRAINT "ap_match_evaluations_supplierInvoiceId_fkey" FOREIGN KEY ("supplierInvoiceId") REFERENCES "supplier_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_match_evaluations" ADD CONSTRAINT "ap_match_evaluations_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_match_evaluations" ADD CONSTRAINT "ap_match_evaluations_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_match_findings" ADD CONSTRAINT "ap_match_findings_matchEvaluationId_fkey" FOREIGN KEY ("matchEvaluationId") REFERENCES "ap_match_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_bundles" ADD CONSTRAINT "evidence_bundles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_bundles" ADD CONSTRAINT "evidence_bundles_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_bundles" ADD CONSTRAINT "evidence_bundles_matchEvaluationId_fkey" FOREIGN KEY ("matchEvaluationId") REFERENCES "ap_match_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_evidenceBundleId_fkey" FOREIGN KEY ("evidenceBundleId") REFERENCES "evidence_bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_actions" ADD CONSTRAINT "business_actions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_actions" ADD CONSTRAINT "business_actions_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_actions" ADD CONSTRAINT "business_actions_supplierInvoiceId_fkey" FOREIGN KEY ("supplierInvoiceId") REFERENCES "supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_actions" ADD CONSTRAINT "business_actions_policyRuleVersionId_fkey" FOREIGN KEY ("policyRuleVersionId") REFERENCES "rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_approvals" ADD CONSTRAINT "action_approvals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_approvals" ADD CONSTRAINT "action_approvals_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "business_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_results" ADD CONSTRAINT "action_results_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_results" ADD CONSTRAINT "action_results_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "business_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_total_nonnegative" CHECK ("totalMinor" >= 0);
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_values_positive" CHECK ("lineNumber" > 0 AND "quantity" > 0 AND "unitPriceMinor" >= 0 AND "totalMinor" >= 0);
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_quantity_positive" CHECK ("quantityReceived" > 0);
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_amounts_nonnegative" CHECK ("subtotalMinor" >= 0 AND "taxMinor" >= 0 AND "totalMinor" >= 0);
ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_values_positive" CHECK ("lineNumber" > 0 AND "quantity" > 0 AND "unitPriceMinor" >= 0 AND "totalMinor" >= 0);
ALTER TABLE "rule_versions" ADD CONSTRAINT "rule_versions_version_positive" CHECK ("version" > 0);
ALTER TABLE "business_actions" ADD CONSTRAINT "business_actions_approvals_positive" CHECK ("requiredApprovals" > 0);
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$');

CREATE FUNCTION prevent_ap_immutable_record_update() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'published AP policy and evidence records are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "rule_versions_immutable"
  BEFORE UPDATE OR DELETE ON "rule_versions"
  FOR EACH ROW EXECUTE FUNCTION prevent_ap_immutable_record_update();
CREATE TRIGGER "ap_match_evaluations_immutable"
  BEFORE UPDATE ON "ap_match_evaluations"
  FOR EACH ROW EXECUTE FUNCTION prevent_ap_immutable_record_update();
CREATE TRIGGER "ap_match_findings_immutable"
  BEFORE UPDATE ON "ap_match_findings"
  FOR EACH ROW EXECUTE FUNCTION prevent_ap_immutable_record_update();
CREATE TRIGGER "evidence_bundles_immutable"
  BEFORE UPDATE ON "evidence_bundles"
  FOR EACH ROW EXECUTE FUNCTION prevent_ap_immutable_record_update();
CREATE TRIGGER "evidence_items_immutable"
  BEFORE UPDATE ON "evidence_items"
  FOR EACH ROW EXECUTE FUNCTION prevent_ap_immutable_record_update();
CREATE TRIGGER "action_approvals_immutable"
  BEFORE UPDATE ON "action_approvals"
  FOR EACH ROW EXECUTE FUNCTION prevent_ap_immutable_record_update();
CREATE TRIGGER "action_results_immutable"
  BEFORE UPDATE ON "action_results"
  FOR EACH ROW EXECUTE FUNCTION prevent_ap_immutable_record_update();
