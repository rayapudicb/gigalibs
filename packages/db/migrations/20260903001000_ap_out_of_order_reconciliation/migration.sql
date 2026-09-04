-- DropIndex
DROP INDEX "goods_receipt_lines_goodsReceiptId_purchaseOrderLineId_key";

-- AlterTable
ALTER TABLE "goods_receipt_lines" ADD COLUMN     "purchaseOrderLineNumber" INTEGER NOT NULL,
ALTER COLUMN "purchaseOrderLineId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "goods_receipts" ADD COLUMN     "purchaseOrderExternalId" TEXT NOT NULL,
ALTER COLUMN "purchaseOrderId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "supplier_invoice_lines" ADD COLUMN     "purchaseOrderLineNumber" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "supplier_invoices" ADD COLUMN     "purchaseOrderExternalId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_lines_goodsReceiptId_purchaseOrderLineNumber_key" ON "goods_receipt_lines"("goodsReceiptId", "purchaseOrderLineNumber");
