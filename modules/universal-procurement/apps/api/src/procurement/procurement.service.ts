import { validateDictionaryRules } from '@gigalibs/configuration-core';
import type {
  ApprovalPolicyV1,
  ApprovePriceVarianceInputV1,
  CreateApprovalPolicyInputV1,
  CreateDebitMemoInputV1,
  CreatePurchaseOrderInputV1,
  CreateRequisitionInputV1,
  CreateVendorBillInputV1,
  DebitMemoV1,
  DictionaryValidationRuleV1,
  MatchInvoiceInputV1,
  MatchPoInvoiceRecordV1,
  MatchPoReceiptRecordV1,
  MatchReceiptInputV1,
  ProcurementRequisitionLineV1,
  ProcurementRequisitionV1,
  PurchaseOrderLineV1,
  PurchaseOrderV1,
  VendorBillLineV1,
  VendorBillV1,
} from '@gigalibs/contracts';
import {
  type ModulePrincipal,
  OrganizationReplica,
  moduleErrors,
} from '@gigalibs/module-sdk';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';

export const errors = moduleErrors('UNIVERSAL_PROCUREMENT', 'Universal Procurement');

/**
 * Validates custom extension fields against Application Dictionary constraints and Safe AST rules.
 */
export function validateCustomExtensions(
  extensions: Record<string, unknown> | undefined,
  rules: readonly DictionaryValidationRuleV1[] = [],
): void {
  if (!extensions) return;
  if (typeof extensions !== 'object' || Array.isArray(extensions)) {
    throw new BadRequestException('Custom extensions must be a JSON object.');
  }
  if (
    Object.prototype.hasOwnProperty.call(extensions, '__proto__') ||
    (Object.getPrototypeOf(extensions) !== Object.prototype && Object.getPrototypeOf(extensions) !== null)
  ) {
    throw new BadRequestException('Extension key "__proto__" is prohibited.');
  }
  const propNames = Object.getOwnPropertyNames(extensions);
  if (propNames.length > 100) {
    throw new BadRequestException('Custom extensions exceed maximum limit of 100 fields.');
  }
  for (const key of propNames) {
    if (key.length > 100) {
      throw new BadRequestException(`Extension key "${key}" exceeds maximum length of 100 characters.`);
    }
    if (key.startsWith('__') || key === 'constructor' || key === 'prototype') {
      throw new BadRequestException(`Extension key "${key}" is prohibited.`);
    }
    const val = extensions[key];
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      validateCustomExtensions(val as Record<string, unknown>, rules);
    }
  }
  if (rules.length > 0) {
    const errorMap = validateDictionaryRules(rules, extensions);
    const errKeys = Object.keys(errorMap);
    if (errKeys.length > 0) {
      throw new BadRequestException(
        `Application Dictionary validation failed: ${errKeys.map((k) => `${k}: ${errorMap[k]}`).join(', ')}`,
      );
    }
  }
}

@Injectable()
export class ProcurementService {
  private readonly orgReplica = new OrganizationReplica(SCHEMA);

  constructor(private readonly database: DatabaseService) {}

  // ─── 1. Requisitions ─────────────────────────────────────────────────────────

  async createRequisition(
    principal: ModulePrincipal,
    input: CreateRequisitionInputV1,
    rules: readonly DictionaryValidationRuleV1[] = [],
  ): Promise<ProcurementRequisitionV1> {
    validateCustomExtensions(input.customExtensions, rules);
    for (const line of input.lines) {
      validateCustomExtensions(line.customExtensions, rules);
    }

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const countRes = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM ${SCHEMA}.procurement_requisitions WHERE tenant_id = $1`,
        [principal.tenantId],
      );
      const seq = Number.parseInt(countRes.rows[0]?.count ?? '0', 10) + 1;
      const reqNumber = `REQ-${String(seq).padStart(5, '0')}`;

      let totalEstimatedMinor = 0n;
      const computedLines = input.lines.map((l, idx) => {
        const qty = Number.parseFloat(l.quantity);
        const unitPrice = BigInt(l.estimatedUnitPriceMinor);
        const lineTotal = BigInt(Math.round(qty * Number(unitPrice)));
        totalEstimatedMinor += lineTotal;
        return {
          ...l,
          lineNumber: idx + 1,
          estimatedTotalMinor: lineTotal.toString(),
        };
      });

      const reqRes = await client.query<{ id: string; created_at: string; updated_at: string }>(
        `INSERT INTO ${SCHEMA}.procurement_requisitions (
          tenant_id, requisition_number, org_unit_id, requested_by, description,
          status, total_estimated_minor, currency_code, custom_extensions, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6, $7, $8, $9, $9)
        RETURNING id, created_at, updated_at`,
        [
          principal.tenantId,
          reqNumber,
          input.orgUnitId,
          principal.subject,
          input.description ?? null,
          totalEstimatedMinor.toString(),
          input.currencyCode ?? 'USD',
          JSON.stringify(input.customExtensions ?? {}),
          principal.subject,
        ],
      );
      const requisitionId = reqRes.rows[0].id;

      const createdLines: ProcurementRequisitionLineV1[] = [];
      for (const line of computedLines) {
        const lineRes = await client.query<{ id: string; created_at: string; updated_at: string }>(
          `INSERT INTO ${SCHEMA}.procurement_requisition_lines (
            tenant_id, requisition_id, line_number, product_id, product_code, product_name,
            quantity, uom_id, estimated_unit_price_minor, estimated_total_minor,
            required_date, cost_center_id, project_id, status, custom_extensions
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'DRAFT', $14)
          RETURNING id, created_at, updated_at`,
          [
            principal.tenantId,
            requisitionId,
            line.lineNumber,
            line.productId,
            line.productCode,
            line.productName,
            line.quantity,
            line.uomId,
            line.estimatedUnitPriceMinor,
            line.estimatedTotalMinor,
            line.requiredDate ?? null,
            line.costCenterId ?? null,
            line.projectId ?? null,
            JSON.stringify(line.customExtensions ?? {}),
          ],
        );
        createdLines.push({
          id: lineRes.rows[0].id,
          tenantId: principal.tenantId,
          requisitionId,
          lineNumber: line.lineNumber,
          productId: line.productId,
          productCode: line.productCode,
          productName: line.productName,
          quantity: line.quantity,
          uomId: line.uomId,
          estimatedUnitPriceMinor: line.estimatedUnitPriceMinor,
          estimatedTotalMinor: line.estimatedTotalMinor,
          requiredDate: line.requiredDate ?? null,
          costCenterId: line.costCenterId ?? null,
          projectId: line.projectId ?? null,
          status: 'DRAFT',
          customExtensions: line.customExtensions ?? {},
          createdAt: lineRes.rows[0].created_at,
          updatedAt: lineRes.rows[0].updated_at,
        });
      }

      return {
        id: requisitionId,
        tenantId: principal.tenantId,
        requisitionNumber: reqNumber,
        orgUnitId: input.orgUnitId,
        requestedBy: principal.subject,
        description: input.description ?? null,
        status: 'DRAFT',
        totalEstimatedMinor: totalEstimatedMinor.toString(),
        currencyCode: input.currencyCode ?? 'USD',
        approvalPolicyId: null,
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null,
        customExtensions: input.customExtensions ?? {},
        version: 1,
        lines: createdLines,
        createdAt: reqRes.rows[0].created_at,
        updatedAt: reqRes.rows[0].updated_at,
        createdBy: principal.subject,
        updatedBy: principal.subject,
      };
    });
  }

  async getRequisition(principal: ModulePrincipal, id: string): Promise<ProcurementRequisitionV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      return this.fetchRequisition(client, principal.tenantId, id);
    });
  }

  async submitRequisition(principal: ModulePrincipal, id: string): Promise<ProcurementRequisitionV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const req = await this.fetchRequisition(client, principal.tenantId, id);
      if (req.status !== 'DRAFT') {
        throw new ConflictException(`Requisition ${req.requisitionNumber} is not in DRAFT status (current: ${req.status}).`);
      }

      await client.query(
        `UPDATE ${SCHEMA}.procurement_requisitions
         SET status = 'PENDING_APPROVAL', updated_at = NOW(), updated_by = $1
         WHERE tenant_id = $2 AND id = $3`,
        [principal.subject, principal.tenantId, id],
      );

      return this.fetchRequisition(client, principal.tenantId, id);
    });
  }

  async approveRequisition(principal: ModulePrincipal, id: string): Promise<ProcurementRequisitionV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const req = await this.fetchRequisition(client, principal.tenantId, id);
      if (req.status !== 'PENDING_APPROVAL' && req.status !== 'DRAFT') {
        throw new ConflictException(`Requisition ${req.requisitionNumber} cannot be approved from status ${req.status}.`);
      }

      await client.query(
        `UPDATE ${SCHEMA}.procurement_requisitions
         SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), updated_at = NOW(), updated_by = $1
         WHERE tenant_id = $2 AND id = $3`,
        [principal.subject, principal.tenantId, id],
      );

      await client.query(
        `UPDATE ${SCHEMA}.procurement_requisition_lines
         SET status = 'APPROVED', updated_at = NOW()
         WHERE tenant_id = $1 AND requisition_id = $2`,
        [principal.tenantId, id],
      );

      return this.fetchRequisition(client, principal.tenantId, id);
    });
  }

  async listRequisitions(principal: ModulePrincipal): Promise<ProcurementRequisitionV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.procurement_requisitions WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [principal.tenantId],
      );
      const items: ProcurementRequisitionV1[] = [];
      for (const row of res.rows) {
        items.push(await this.fetchRequisition(client, principal.tenantId, row.id));
      }
      return items;
    });
  }

  async rejectRequisition(principal: ModulePrincipal, id: string, reason?: string): Promise<ProcurementRequisitionV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const req = await this.fetchRequisition(client, principal.tenantId, id);
      if (req.status !== 'PENDING_APPROVAL' && req.status !== 'DRAFT') {
        throw new ConflictException(`Requisition ${req.requisitionNumber} cannot be rejected from status ${req.status}.`);
      }

      await client.query(
        `UPDATE ${SCHEMA}.procurement_requisitions
         SET status = 'REJECTED', rejection_reason = $1, updated_at = NOW(), updated_by = $2
         WHERE tenant_id = $3 AND id = $4`,
        [reason ?? 'Rejected by supervisor', principal.subject, principal.tenantId, id],
      );

      return this.fetchRequisition(client, principal.tenantId, id);
    });
  }

  // ─── 2. Purchase Orders ──────────────────────────────────────────────────────

  async createPurchaseOrder(
    principal: ModulePrincipal,
    input: CreatePurchaseOrderInputV1,
    rules: readonly DictionaryValidationRuleV1[] = [],
  ): Promise<PurchaseOrderV1> {
    validateCustomExtensions(input.customExtensions, rules);
    for (const line of input.lines) {
      validateCustomExtensions(line.customExtensions, rules);
    }

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const countRes = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM ${SCHEMA}.purchase_orders WHERE tenant_id = $1`,
        [principal.tenantId],
      );
      const seq = Number.parseInt(countRes.rows[0]?.count ?? '0', 10) + 1;
      const orderNumber = `PO-${String(seq).padStart(5, '0')}`;

      let subtotalMinor = 0n;
      let taxTotalMinor = 0n;

      const computedLines = input.lines.map((l, idx) => {
        const qty = Number.parseFloat(l.orderedQuantity);
        const unitPrice = BigInt(l.unitPriceMinor);
        const lineSubtotal = BigInt(Math.round(qty * Number(unitPrice)));
        const lineTax = (lineSubtotal * BigInt(l.taxRateBasisPoints ?? 0)) / 10000n;
        const lineTotal = lineSubtotal + lineTax;

        subtotalMinor += lineSubtotal;
        taxTotalMinor += lineTax;

        return {
          ...l,
          lineNumber: idx + 1,
          lineSubtotalMinor: lineSubtotal.toString(),
          lineTaxMinor: lineTax.toString(),
          lineTotalMinor: lineTotal.toString(),
        };
      });

      const totalAmountMinor = subtotalMinor + taxTotalMinor;

      const poRes = await client.query<{ id: string; created_at: string; updated_at: string }>(
        `INSERT INTO ${SCHEMA}.purchase_orders (
          tenant_id, order_number, org_unit_id, vendor_party_id, vendor_name,
          order_type, status, currency_code, subtotal_minor, tax_total_minor,
          total_amount_minor, payment_term_days, incoterm, requisition_id,
          destination_warehouse_id, custom_extensions, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, 'STANDARD', 'DRAFT', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
        RETURNING id, created_at, updated_at`,
        [
          principal.tenantId,
          orderNumber,
          input.orgUnitId,
          input.vendorPartyId,
          input.vendorName,
          input.currencyCode ?? 'USD',
          subtotalMinor.toString(),
          taxTotalMinor.toString(),
          totalAmountMinor.toString(),
          input.paymentTermDays ?? 30,
          input.incoterm ?? null,
          input.requisitionId ?? null,
          input.destinationWarehouseId,
          JSON.stringify(input.customExtensions ?? {}),
          principal.subject,
        ],
      );
      const purchaseOrderId = poRes.rows[0].id;

      const createdLines: PurchaseOrderLineV1[] = [];
      for (const line of computedLines) {
        const lineRes = await client.query<{ id: string; created_at: string; updated_at: string }>(
          `INSERT INTO ${SCHEMA}.purchase_order_lines (
            tenant_id, purchase_order_id, line_number, requisition_line_id, product_id,
            product_code, product_name, ordered_quantity, uom_id, unit_price_minor,
            tax_rate_basis_points, line_tax_minor, line_subtotal_minor, line_total_minor,
            destination_warehouse_id, destination_location_id, promised_date, status, custom_extensions
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'OPEN', $18)
          RETURNING id, created_at, updated_at`,
          [
            principal.tenantId,
            purchaseOrderId,
            line.lineNumber,
            line.requisitionLineId ?? null,
            line.productId,
            line.productCode,
            line.productName,
            line.orderedQuantity,
            line.uomId,
            line.unitPriceMinor,
            line.taxRateBasisPoints ?? 0,
            line.lineTaxMinor,
            line.lineSubtotalMinor,
            line.lineTotalMinor,
            line.destinationWarehouseId,
            line.destinationLocationId ?? null,
            line.promisedDate ?? null,
            JSON.stringify(line.customExtensions ?? {}),
          ],
        );

        createdLines.push({
          id: lineRes.rows[0].id,
          tenantId: principal.tenantId,
          purchaseOrderId,
          lineNumber: line.lineNumber,
          requisitionLineId: line.requisitionLineId ?? null,
          productId: line.productId,
          productCode: line.productCode,
          productName: line.productName,
          orderedQuantity: line.orderedQuantity,
          uomId: line.uomId,
          unitPriceMinor: line.unitPriceMinor,
          taxRateBasisPoints: line.taxRateBasisPoints ?? 0,
          lineTaxMinor: line.lineTaxMinor,
          lineSubtotalMinor: line.lineSubtotalMinor,
          lineTotalMinor: line.lineTotalMinor,
          receivedQuantity: '0',
          invoicedQuantity: '0',
          destinationWarehouseId: line.destinationWarehouseId,
          destinationLocationId: line.destinationLocationId ?? null,
          promisedDate: line.promisedDate ?? null,
          status: 'OPEN',
          customExtensions: line.customExtensions ?? {},
          createdAt: lineRes.rows[0].created_at,
          updatedAt: lineRes.rows[0].updated_at,
        });
      }

      return {
        id: purchaseOrderId,
        tenantId: principal.tenantId,
        orderNumber,
        orgUnitId: input.orgUnitId,
        vendorPartyId: input.vendorPartyId,
        vendorName: input.vendorName,
        orderType: 'STANDARD',
        status: 'DRAFT',
        currencyCode: input.currencyCode ?? 'USD',
        subtotalMinor: subtotalMinor.toString(),
        taxTotalMinor: taxTotalMinor.toString(),
        totalAmountMinor: totalAmountMinor.toString(),
        paymentTermDays: input.paymentTermDays ?? 30,
        incoterm: input.incoterm ?? null,
        requisitionId: input.requisitionId ?? null,
        destinationWarehouseId: input.destinationWarehouseId,
        revisionNumber: 0,
        issuedAt: null,
        issuedBy: null,
        acknowledgedAt: null,
        customExtensions: input.customExtensions ?? {},
        version: 1,
        lines: createdLines,
        createdAt: poRes.rows[0].created_at,
        updatedAt: poRes.rows[0].updated_at,
        createdBy: principal.subject,
        updatedBy: principal.subject,
      };
    });
  }

  async getPurchaseOrder(principal: ModulePrincipal, id: string): Promise<PurchaseOrderV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      return this.fetchPurchaseOrder(client, principal.tenantId, id);
    });
  }

  async listPurchaseOrders(principal: ModulePrincipal): Promise<PurchaseOrderV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.purchase_orders WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [principal.tenantId],
      );
      const items: PurchaseOrderV1[] = [];
      for (const row of res.rows) {
        items.push(await this.fetchPurchaseOrder(client, principal.tenantId, row.id));
      }
      return items;
    });
  }

  async issuePurchaseOrder(principal: ModulePrincipal, id: string): Promise<PurchaseOrderV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const po = await this.fetchPurchaseOrder(client, principal.tenantId, id);
      if (po.status !== 'DRAFT' && po.status !== 'APPROVED') {
        throw new ConflictException(`Purchase Order ${po.orderNumber} cannot be issued from status ${po.status}.`);
      }

      await client.query(
        `UPDATE ${SCHEMA}.purchase_orders
         SET status = 'ISSUED', issued_at = NOW(), issued_by = $1, updated_at = NOW(), updated_by = $1
         WHERE tenant_id = $2 AND id = $3`,
        [principal.subject, principal.tenantId, id],
      );

      return this.fetchPurchaseOrder(client, principal.tenantId, id);
    });
  }

  async acknowledgePurchaseOrder(principal: ModulePrincipal, id: string): Promise<PurchaseOrderV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const po = await this.fetchPurchaseOrder(client, principal.tenantId, id);
      if (po.status !== 'ISSUED') {
        throw new ConflictException(`Purchase Order ${po.orderNumber} cannot be acknowledged from status ${po.status}.`);
      }

      await client.query(
        `UPDATE ${SCHEMA}.purchase_orders
         SET status = 'ACKNOWLEDGED', acknowledged_at = NOW(), updated_at = NOW(), updated_by = $1
         WHERE tenant_id = $2 AND id = $3`,
        [principal.subject, principal.tenantId, id],
      );

      return this.fetchPurchaseOrder(client, principal.tenantId, id);
    });
  }

  // ─── 3. 3-Way Matching Engine ────────────────────────────────────────────────

  async matchReceipt(principal: ModulePrincipal, input: MatchReceiptInputV1): Promise<MatchPoReceiptRecordV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const lineRes = await client.query<{
        ordered_quantity: string;
        received_quantity: string;
        uom_id: string;
      }>(
        `SELECT ordered_quantity, received_quantity, uom_id
         FROM ${SCHEMA}.purchase_order_lines
         WHERE tenant_id = $1 AND id = $2 AND purchase_order_id = $3
         FOR UPDATE`,
        [principal.tenantId, input.purchaseOrderLineId, input.purchaseOrderId],
      );

      if (lineRes.rows.length === 0) {
        throw new NotFoundException(`Purchase Order Line ${input.purchaseOrderLineId} not found.`);
      }

      const poLine = lineRes.rows[0];
      const orderedQty = Number.parseFloat(poLine.ordered_quantity);
      const currentReceivedQty = Number.parseFloat(poLine.received_quantity);
      const deltaQty = Number.parseFloat(input.matchedQuantity);

      const newReceivedQty = currentReceivedQty + deltaQty;
      if (newReceivedQty > orderedQty) {
        throw new BadRequestException(
          `Cannot match receipt quantity ${deltaQty}: total received (${newReceivedQty}) would exceed ordered quantity (${orderedQty}).`,
        );
      }

      const matchRes = await client.query<{ id: string; created_at: string }>(
        `INSERT INTO ${SCHEMA}.match_po_receipt_records (
          tenant_id, purchase_order_id, purchase_order_line_id, receipt_id,
          receipt_line_id, matched_quantity, uom_id, matched_by, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'FULLY_MATCHED')
        RETURNING id, created_at`,
        [
          principal.tenantId,
          input.purchaseOrderId,
          input.purchaseOrderLineId,
          input.receiptId,
          input.receiptLineId,
          input.matchedQuantity,
          input.uomId,
          principal.subject,
        ],
      );

      const lineStatus = newReceivedQty >= orderedQty ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
      await client.query(
        `UPDATE ${SCHEMA}.purchase_order_lines
         SET received_quantity = $1, status = $2, updated_at = NOW()
         WHERE tenant_id = $3 AND id = $4`,
        [newReceivedQty.toFixed(6), lineStatus, principal.tenantId, input.purchaseOrderLineId],
      );

      await client.query(
        `UPDATE ${SCHEMA}.purchase_orders
         SET status = $1, updated_at = NOW(), updated_by = $2
         WHERE tenant_id = $3 AND id = $4`,
        [lineStatus, principal.subject, principal.tenantId, input.purchaseOrderId],
      );

      return {
        id: matchRes.rows[0].id,
        tenantId: principal.tenantId,
        purchaseOrderId: input.purchaseOrderId,
        purchaseOrderLineId: input.purchaseOrderLineId,
        receiptId: input.receiptId,
        receiptLineId: input.receiptLineId,
        matchedQuantity: input.matchedQuantity,
        uomId: input.uomId,
        matchedBy: principal.subject,
        matchedAt: matchRes.rows[0].created_at,
        status: 'FULLY_MATCHED',
        createdAt: matchRes.rows[0].created_at,
      };
    });
  }

  async matchInvoice(principal: ModulePrincipal, input: MatchInvoiceInputV1): Promise<MatchPoInvoiceRecordV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const poLineRes = await client.query<{
        ordered_quantity: string;
        received_quantity: string;
        invoiced_quantity: string;
        unit_price_minor: string;
      }>(
        `SELECT ordered_quantity, received_quantity, invoiced_quantity, unit_price_minor
         FROM ${SCHEMA}.purchase_order_lines
         WHERE tenant_id = $1 AND id = $2 AND purchase_order_id = $3
         FOR UPDATE`,
        [principal.tenantId, input.purchaseOrderLineId, input.purchaseOrderId],
      );

      if (poLineRes.rows.length === 0) {
        throw new NotFoundException(`Purchase Order Line ${input.purchaseOrderLineId} not found.`);
      }

      const billLineRes = await client.query<{
        unit_price_minor: string;
        billed_quantity: string;
      }>(
        `SELECT unit_price_minor, billed_quantity
         FROM ${SCHEMA}.vendor_bill_lines
         WHERE tenant_id = $1 AND id = $2 AND vendor_bill_id = $3
         FOR UPDATE`,
        [principal.tenantId, input.vendorBillLineId, input.vendorBillId],
      );

      if (billLineRes.rows.length === 0) {
        throw new NotFoundException(`Vendor Bill Line ${input.vendorBillLineId} not found.`);
      }

      const poLine = poLineRes.rows[0];
      const billLine = billLineRes.rows[0];

      const receivedQty = Number.parseFloat(poLine.received_quantity);
      const currentInvoicedQty = Number.parseFloat(poLine.invoiced_quantity);
      const matchQty = Number.parseFloat(input.matchedQuantity);

      const newInvoicedQty = currentInvoicedQty + matchQty;
      if (newInvoicedQty > receivedQty) {
        throw new BadRequestException(
          `3-Way Match Invariant Violation: Invoiced quantity (${newInvoicedQty}) cannot exceed physical received quantity (${receivedQty}).`,
        );
      }

      const poUnitPrice = BigInt(poLine.unit_price_minor);
      const billedUnitPrice = BigInt(billLine.unit_price_minor);
      const priceVarianceMinor = billedUnitPrice - poUnitPrice;

      const priceVariancePercent =
        poUnitPrice > 0n
          ? (Math.abs(Number(priceVarianceMinor)) / Number(poUnitPrice)) * 100
          : 0;

      const toleranceExceeded = priceVariancePercent > 1.0;
      const status = toleranceExceeded ? 'VARIANCE_HOLD' : 'FULLY_MATCHED';

      const matchRes = await client.query<{ id: string; created_at: string }>(
        `INSERT INTO ${SCHEMA}.match_po_invoice_records (
          tenant_id, purchase_order_id, purchase_order_line_id, vendor_bill_id,
          vendor_bill_line_id, receipt_line_id, matched_quantity, po_unit_price_minor,
          billed_unit_price_minor, price_variance_minor, price_variance_percent,
          status, tolerance_exceeded, matched_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id, created_at`,
        [
          principal.tenantId,
          input.purchaseOrderId,
          input.purchaseOrderLineId,
          input.vendorBillId,
          input.vendorBillLineId,
          input.receiptLineId ?? null,
          input.matchedQuantity,
          poUnitPrice.toString(),
          billedUnitPrice.toString(),
          priceVarianceMinor.toString(),
          priceVariancePercent.toFixed(4),
          status,
          toleranceExceeded,
          principal.subject,
        ],
      );

      await client.query(
        `UPDATE ${SCHEMA}.purchase_order_lines
         SET invoiced_quantity = $1, updated_at = NOW()
         WHERE tenant_id = $2 AND id = $3`,
        [newInvoicedQty.toFixed(6), principal.tenantId, input.purchaseOrderLineId],
      );

      const billStatus = toleranceExceeded ? 'PRICE_VARIANCE_HOLD' : 'MATCHED';
      await client.query(
        `UPDATE ${SCHEMA}.vendor_bills
         SET status = $1, updated_at = NOW(), updated_by = $2
         WHERE tenant_id = $3 AND id = $4`,
        [billStatus, principal.subject, principal.tenantId, input.vendorBillId],
      );

      return {
        id: matchRes.rows[0].id,
        tenantId: principal.tenantId,
        purchaseOrderId: input.purchaseOrderId,
        purchaseOrderLineId: input.purchaseOrderLineId,
        vendorBillId: input.vendorBillId,
        vendorBillLineId: input.vendorBillLineId,
        receiptLineId: input.receiptLineId ?? null,
        matchedQuantity: input.matchedQuantity,
        poUnitPriceMinor: poUnitPrice.toString(),
        billedUnitPriceMinor: billedUnitPrice.toString(),
        priceVarianceMinor: priceVarianceMinor.toString(),
        priceVariancePercent,
        status,
        toleranceExceeded,
        overrideAuthorizedBy: null,
        overrideReason: null,
        matchedBy: principal.subject,
        matchedAt: matchRes.rows[0].created_at,
        createdAt: matchRes.rows[0].created_at,
      };
    });
  }

  async approvePriceVariance(
    principal: ModulePrincipal,
    input: ApprovePriceVarianceInputV1,
  ): Promise<MatchPoInvoiceRecordV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const matchRes = await client.query<{
        id: string;
        tenant_id: string;
        purchase_order_id: string;
        purchase_order_line_id: string;
        vendor_bill_id: string;
        vendor_bill_line_id: string;
        receipt_line_id: string | null;
        matched_quantity: string;
        po_unit_price_minor: string;
        billed_unit_price_minor: string;
        price_variance_minor: string;
        price_variance_percent: string;
        status: string;
        tolerance_exceeded: boolean;
        matched_by: string;
        matched_at: string;
        created_at: string;
      }>(
        `SELECT * FROM ${SCHEMA}.match_po_invoice_records
         WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, input.matchRecordId],
      );

      if (matchRes.rows.length === 0) {
        throw new NotFoundException(`Match record ${input.matchRecordId} not found.`);
      }

      const rec = matchRes.rows[0];

      await client.query(
        `UPDATE ${SCHEMA}.match_po_invoice_records
         SET status = 'FORCE_MATCHED', override_authorized_by = $1, override_reason = $2
         WHERE tenant_id = $3 AND id = $4`,
        [principal.subject, input.overrideReason, principal.tenantId, input.matchRecordId],
      );

      await client.query(
        `UPDATE ${SCHEMA}.vendor_bills
         SET status = 'MATCHED', updated_at = NOW(), updated_by = $1
         WHERE tenant_id = $2 AND id = $3`,
        [principal.subject, principal.tenantId, rec.vendor_bill_id],
      );

      return {
        id: rec.id,
        tenantId: rec.tenant_id,
        purchaseOrderId: rec.purchase_order_id,
        purchaseOrderLineId: rec.purchase_order_line_id,
        vendorBillId: rec.vendor_bill_id,
        vendorBillLineId: rec.vendor_bill_line_id,
        receiptLineId: rec.receipt_line_id,
        matchedQuantity: rec.matched_quantity,
        poUnitPriceMinor: rec.po_unit_price_minor,
        billedUnitPriceMinor: rec.billed_unit_price_minor,
        priceVarianceMinor: rec.price_variance_minor,
        priceVariancePercent: Number.parseFloat(rec.price_variance_percent),
        status: 'FORCE_MATCHED',
        toleranceExceeded: rec.tolerance_exceeded,
        overrideAuthorizedBy: principal.subject,
        overrideReason: input.overrideReason,
        matchedBy: rec.matched_by,
        matchedAt: rec.matched_at,
        createdAt: rec.created_at,
      };
    });
  }

  // ─── 4. Vendor Bills ─────────────────────────────────────────────────────────

  async createVendorBill(
    principal: ModulePrincipal,
    input: CreateVendorBillInputV1,
    rules: readonly DictionaryValidationRuleV1[] = [],
  ): Promise<VendorBillV1> {
    validateCustomExtensions(input.customExtensions, rules);
    for (const line of input.lines) {
      validateCustomExtensions(line.customExtensions, rules);
    }

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      let subtotalMinor = 0n;
      let taxTotalMinor = 0n;

      const computedLines = input.lines.map((l, idx) => {
        const qty = Number.parseFloat(l.billedQuantity);
        const unitPrice = BigInt(l.unitPriceMinor);
        const lineSubtotal = BigInt(Math.round(qty * Number(unitPrice)));
        const lineTax = BigInt(l.lineTaxMinor ?? '0');
        const lineTotal = lineSubtotal + lineTax;

        subtotalMinor += lineSubtotal;
        taxTotalMinor += lineTax;

        return {
          ...l,
          lineNumber: idx + 1,
          lineSubtotalMinor: lineSubtotal.toString(),
          lineTaxMinor: lineTax.toString(),
          lineTotalMinor: lineTotal.toString(),
        };
      });

      const totalAmountMinor = subtotalMinor + taxTotalMinor;

      const billRes = await client.query<{ id: string; created_at: string; updated_at: string }>(
        `INSERT INTO ${SCHEMA}.vendor_bills (
          tenant_id, vendor_party_id, vendor_invoice_number, invoice_date, due_date,
          currency_code, subtotal_minor, tax_total_minor, total_amount_minor,
          purchase_order_id, status, custom_extensions, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'DRAFT', $11, $12, $12)
        RETURNING id, created_at, updated_at`,
        [
          principal.tenantId,
          input.vendorPartyId,
          input.vendorInvoiceNumber,
          input.invoiceDate,
          input.dueDate,
          input.currencyCode ?? 'USD',
          subtotalMinor.toString(),
          taxTotalMinor.toString(),
          totalAmountMinor.toString(),
          input.purchaseOrderId ?? null,
          JSON.stringify(input.customExtensions ?? {}),
          principal.subject,
        ],
      );
      const vendorBillId = billRes.rows[0].id;

      const createdLines: VendorBillLineV1[] = [];
      for (const line of computedLines) {
        const lineRes = await client.query<{ id: string; created_at: string; updated_at: string }>(
          `INSERT INTO ${SCHEMA}.vendor_bill_lines (
            tenant_id, vendor_bill_id, line_number, purchase_order_id, purchase_order_line_id,
            product_id, description, billed_quantity, uom_id, unit_price_minor,
            line_subtotal_minor, line_tax_minor, line_total_minor, matched_receipt_line_id, custom_extensions
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING id, created_at, updated_at`,
          [
            principal.tenantId,
            vendorBillId,
            line.lineNumber,
            line.purchaseOrderId ?? null,
            line.purchaseOrderLineId ?? null,
            line.productId ?? null,
            line.description,
            line.billedQuantity,
            line.uomId,
            line.unitPriceMinor,
            line.lineSubtotalMinor,
            line.lineTaxMinor,
            line.lineTotalMinor,
            line.matchedReceiptLineId ?? null,
            JSON.stringify(line.customExtensions ?? {}),
          ],
        );

        createdLines.push({
          id: lineRes.rows[0].id,
          tenantId: principal.tenantId,
          vendorBillId,
          lineNumber: line.lineNumber,
          purchaseOrderId: line.purchaseOrderId ?? null,
          purchaseOrderLineId: line.purchaseOrderLineId ?? null,
          productId: line.productId ?? null,
          description: line.description,
          billedQuantity: line.billedQuantity,
          uomId: line.uomId,
          unitPriceMinor: line.unitPriceMinor,
          lineSubtotalMinor: line.lineSubtotalMinor,
          lineTaxMinor: line.lineTaxMinor,
          lineTotalMinor: line.lineTotalMinor,
          matchedReceiptLineId: line.matchedReceiptLineId ?? null,
          customExtensions: line.customExtensions ?? {},
          createdAt: lineRes.rows[0].created_at,
          updatedAt: lineRes.rows[0].updated_at,
        });
      }

      return {
        id: vendorBillId,
        tenantId: principal.tenantId,
        vendorPartyId: input.vendorPartyId,
        vendorInvoiceNumber: input.vendorInvoiceNumber,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate,
        currencyCode: input.currencyCode ?? 'USD',
        subtotalMinor: subtotalMinor.toString(),
        taxTotalMinor: taxTotalMinor.toString(),
        totalAmountMinor: totalAmountMinor.toString(),
        purchaseOrderId: input.purchaseOrderId ?? null,
        status: 'DRAFT',
        approvedBy: null,
        approvedAt: null,
        customExtensions: input.customExtensions ?? {},
        version: 1,
        lines: createdLines,
        createdAt: billRes.rows[0].created_at,
        updatedAt: billRes.rows[0].updated_at,
        createdBy: principal.subject,
        updatedBy: principal.subject,
      };
    });
  }

  async getVendorBill(principal: ModulePrincipal, id: string): Promise<VendorBillV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      return this.fetchVendorBill(client, principal.tenantId, id);
    });
  }

  async listVendorBills(principal: ModulePrincipal): Promise<VendorBillV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.vendor_bills WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [principal.tenantId],
      );
      const items: VendorBillV1[] = [];
      for (const row of res.rows) {
        items.push(await this.fetchVendorBill(client, principal.tenantId, row.id));
      }
      return items;
    });
  }

  async approveVendorBill(principal: ModulePrincipal, id: string): Promise<VendorBillV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const bill = await this.fetchVendorBill(client, principal.tenantId, id);
      if (bill.status === 'PRICE_VARIANCE_HOLD') {
        throw new ConflictException(`Vendor Bill ${bill.vendorInvoiceNumber} is on PRICE_VARIANCE_HOLD and cannot be approved without variance resolution.`);
      }

      await client.query(
        `UPDATE ${SCHEMA}.vendor_bills
         SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), updated_at = NOW(), updated_by = $1
         WHERE tenant_id = $2 AND id = $3`,
        [principal.subject, principal.tenantId, id],
      );

      return this.fetchVendorBill(client, principal.tenantId, id);
    });
  }

  // ─── 5. Debit Memos ──────────────────────────────────────────────────────────

  async createDebitMemo(
    principal: ModulePrincipal,
    input: CreateDebitMemoInputV1,
  ): Promise<DebitMemoV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const countRes = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM ${SCHEMA}.debit_memos WHERE tenant_id = $1`,
        [principal.tenantId],
      );
      const seq = Number.parseInt(countRes.rows[0]?.count ?? '0', 10) + 1;
      const memoNumber = `DM-${String(seq).padStart(5, '0')}`;

      let totalAmountMinor = 0n;
      const computedLines = input.lines.map((l, idx) => {
        const qty = Number.parseFloat(l.quantity);
        const unitPrice = BigInt(l.unitPriceMinor);
        const lineTotal = BigInt(Math.round(qty * Number(unitPrice)));
        totalAmountMinor += lineTotal;
        return {
          ...l,
          lineNumber: idx + 1,
          lineTotalMinor: lineTotal.toString(),
        };
      });

      const memoRes = await client.query<{ id: string; created_at: string; updated_at: string }>(
        `INSERT INTO ${SCHEMA}.debit_memos (
          tenant_id, debit_memo_number, vendor_party_id, vendor_bill_id, purchase_order_id,
          currency_code, total_amount_minor, status, reason, issued_at, issued_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ISSUED', $8, NOW(), $9)
        RETURNING id, created_at, updated_at`,
        [
          principal.tenantId,
          memoNumber,
          input.vendorPartyId,
          input.vendorBillId ?? null,
          input.purchaseOrderId ?? null,
          input.currencyCode ?? 'USD',
          totalAmountMinor.toString(),
          input.reason,
          principal.subject,
        ],
      );
      const debitMemoId = memoRes.rows[0].id;

      const createdLines = [];
      for (const line of computedLines) {
        const lineRes = await client.query<{ id: string; created_at: string }>(
          `INSERT INTO ${SCHEMA}.debit_memo_lines (
            tenant_id, debit_memo_id, line_number, product_id, description,
            quantity, unit_price_minor, line_total_minor, reason
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id, created_at`,
          [
            principal.tenantId,
            debitMemoId,
            line.lineNumber,
            line.productId ?? null,
            line.description,
            line.quantity,
            line.unitPriceMinor,
            line.lineTotalMinor,
            line.reason,
          ],
        );

        createdLines.push({
          id: lineRes.rows[0].id,
          tenantId: principal.tenantId,
          debitMemoId,
          lineNumber: line.lineNumber,
          productId: line.productId ?? null,
          description: line.description,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          lineTotalMinor: line.lineTotalMinor,
          reason: line.reason,
          createdAt: lineRes.rows[0].created_at,
        });
      }

      return {
        id: debitMemoId,
        tenantId: principal.tenantId,
        debitMemoNumber: memoNumber,
        vendorPartyId: input.vendorPartyId,
        vendorBillId: input.vendorBillId ?? null,
        purchaseOrderId: input.purchaseOrderId ?? null,
        currencyCode: input.currencyCode ?? 'USD',
        totalAmountMinor: totalAmountMinor.toString(),
        status: 'ISSUED',
        reason: input.reason,
        issuedAt: memoRes.rows[0].created_at,
        issuedBy: principal.subject,
        version: 1,
        lines: createdLines,
        createdAt: memoRes.rows[0].created_at,
        updatedAt: memoRes.rows[0].updated_at,
      };
    });
  }

  async listDebitMemos(principal: ModulePrincipal): Promise<DebitMemoV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query<{
        id: string;
        tenant_id: string;
        debit_memo_number: string;
        vendor_party_id: string;
        vendor_bill_id: string | null;
        purchase_order_id: string | null;
        currency_code: string;
        total_amount_minor: string;
        status: string;
        reason: string;
        issued_at: string;
        issued_by: string;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT * FROM ${SCHEMA}.debit_memos WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [principal.tenantId],
      );
      return res.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        debitMemoNumber: r.debit_memo_number,
        vendorPartyId: r.vendor_party_id,
        vendorBillId: r.vendor_bill_id,
        purchaseOrderId: r.purchase_order_id,
        currencyCode: r.currency_code,
        totalAmountMinor: r.total_amount_minor,
        status: r.status as any,
        reason: r.reason,
        issuedAt: r.issued_at,
        issuedBy: r.issued_by,
        version: 1,
        lines: [],
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    });
  }

  // ─── 6. Approval Policies (DoA) ─────────────────────────────────────────────

  async listApprovalPolicies(principal: ModulePrincipal): Promise<ApprovalPolicyV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query<{
        id: string;
        tenant_id: string;
        policy_name: string;
        org_unit_id: string | null;
        max_amount_minor: string;
        currency_code: string;
        required_role: string;
        sort_order: number;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT * FROM ${SCHEMA}.procurement_approval_policies WHERE tenant_id = $1 ORDER BY sort_order ASC, max_amount_minor ASC`,
        [principal.tenantId],
      );
      return res.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        policyName: r.policy_name,
        orgUnitId: r.org_unit_id,
        maxAmountMinor: r.max_amount_minor,
        currencyCode: r.currency_code,
        requiredRole: r.required_role,
        sortOrder: r.sort_order,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    });
  }

  async createApprovalPolicy(
    principal: ModulePrincipal,
    input: CreateApprovalPolicyInputV1,
  ): Promise<ApprovalPolicyV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query<{
        id: string;
        created_at: string;
        updated_at: string;
      }>(
        `INSERT INTO ${SCHEMA}.procurement_approval_policies (
          tenant_id, policy_name, org_unit_id, max_amount_minor, currency_code,
          required_role, sort_order, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, created_at, updated_at`,
        [
          principal.tenantId,
          input.policyName,
          input.orgUnitId ?? null,
          input.maxAmountMinor,
          input.currencyCode ?? 'USD',
          input.requiredRole,
          input.sortOrder ?? 0,
          input.isActive ?? true,
        ],
      );
      const row = res.rows[0];
      return {
        id: row.id,
        tenantId: principal.tenantId,
        policyName: input.policyName,
        orgUnitId: input.orgUnitId ?? null,
        maxAmountMinor: input.maxAmountMinor,
        currencyCode: input.currencyCode ?? 'USD',
        requiredRole: input.requiredRole,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  // ─── 7. Three-Way Match Verification Engine ──────────────────────────────────

  async verifyThreeWayMatch(
    principal: ModulePrincipal,
    purchaseOrderId: string,
  ): Promise<{
    purchaseOrderId: string;
    verified: boolean;
    lines: Array<{
      lineNumber: number;
      orderedQuantity: string;
      receivedQuantity: string;
      invoicedQuantity: string;
      isMatchValid: boolean;
    }>;
  }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const linesRes = await client.query<{
        line_number: number;
        ordered_quantity: string;
        received_quantity: string;
        invoiced_quantity: string;
      }>(
        `SELECT line_number, ordered_quantity, received_quantity, invoiced_quantity
         FROM ${SCHEMA}.purchase_order_lines
         WHERE tenant_id = $1 AND purchase_order_id = $2
         ORDER BY line_number ASC`,
        [principal.tenantId, purchaseOrderId],
      );

      const verificationLines = linesRes.rows.map((row) => {
        const ord = Number.parseFloat(row.ordered_quantity);
        const rec = Number.parseFloat(row.received_quantity);
        const inv = Number.parseFloat(row.invoiced_quantity);
        const isMatchValid = inv <= rec && rec <= ord;
        return {
          lineNumber: row.line_number,
          orderedQuantity: row.ordered_quantity,
          receivedQuantity: row.received_quantity,
          invoicedQuantity: row.invoiced_quantity,
          isMatchValid,
        };
      });

      const verified = verificationLines.every((l) => l.isMatchValid);
      return {
        purchaseOrderId,
        verified,
        lines: verificationLines,
      };
    });
  }

  // ─── Private Query Helpers ───────────────────────────────────────────────────

  private async fetchRequisition(client: PoolClient, tenantId: string, id: string): Promise<ProcurementRequisitionV1> {
    const res = await client.query<{
      id: string;
      tenant_id: string;
      requisition_number: string;
      org_unit_id: string;
      requested_by: string;
      description: string | null;
      status: string;
      total_estimated_minor: string;
      currency_code: string;
      approval_policy_id: string | null;
      approved_by: string | null;
      approved_at: string | null;
      rejection_reason: string | null;
      custom_extensions: Record<string, unknown>;
      version: number;
      created_at: string;
      updated_at: string;
      created_by?: string;
      updated_by?: string;
    }>(
      `SELECT * FROM ${SCHEMA}.procurement_requisitions WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Requisition ${id} not found.`);
    }

    const row = res.rows[0];
    const linesRes = await client.query<{
      id: string;
      tenant_id: string;
      requisition_id: string;
      line_number: number;
      product_id: string;
      product_code: string;
      product_name: string;
      quantity: string;
      uom_id: string;
      estimated_unit_price_minor: string;
      estimated_total_minor: string;
      required_date: string | null;
      cost_center_id: string | null;
      project_id: string | null;
      status: string;
      custom_extensions: Record<string, unknown>;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM ${SCHEMA}.procurement_requisition_lines WHERE tenant_id = $1 AND requisition_id = $2 ORDER BY line_number ASC`,
      [tenantId, id],
    );

    const lines: ProcurementRequisitionLineV1[] = linesRes.rows.map((l) => ({
      id: l.id,
      tenantId: l.tenant_id,
      requisitionId: l.requisition_id,
      lineNumber: l.line_number,
      productId: l.product_id,
      productCode: l.product_code,
      productName: l.product_name,
      quantity: l.quantity,
      uomId: l.uom_id,
      estimatedUnitPriceMinor: l.estimated_unit_price_minor,
      estimatedTotalMinor: l.estimated_total_minor,
      requiredDate: l.required_date,
      costCenterId: l.cost_center_id,
      projectId: l.project_id,
      status: l.status as any,
      customExtensions: l.custom_extensions ?? {},
      createdAt: l.created_at,
      updatedAt: l.updated_at,
    }));

    return {
      id: row.id,
      tenantId: row.tenant_id,
      requisitionNumber: row.requisition_number,
      orgUnitId: row.org_unit_id,
      requestedBy: row.requested_by,
      description: row.description,
      status: row.status as any,
      totalEstimatedMinor: row.total_estimated_minor,
      currencyCode: row.currency_code,
      approvalPolicyId: row.approval_policy_id,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      rejectionReason: row.rejection_reason,
      customExtensions: row.custom_extensions ?? {},
      version: row.version,
      lines,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    };
  }

  private async fetchPurchaseOrder(client: PoolClient, tenantId: string, id: string): Promise<PurchaseOrderV1> {
    const res = await client.query<{
      id: string;
      tenant_id: string;
      order_number: string;
      org_unit_id: string;
      vendor_party_id: string;
      vendor_name: string;
      order_type: string;
      status: string;
      currency_code: string;
      subtotal_minor: string;
      tax_total_minor: string;
      total_amount_minor: string;
      payment_term_days: number;
      incoterm: string | null;
      requisition_id: string | null;
      destination_warehouse_id: string;
      revision_number: number;
      issued_at: string | null;
      issued_by: string | null;
      acknowledged_at: string | null;
      custom_extensions: Record<string, unknown>;
      version: number;
      created_at: string;
      updated_at: string;
      created_by?: string;
      updated_by?: string;
    }>(
      `SELECT * FROM ${SCHEMA}.purchase_orders WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Purchase Order ${id} not found.`);
    }

    const row = res.rows[0];
    const linesRes = await client.query<{
      id: string;
      tenant_id: string;
      purchase_order_id: string;
      line_number: number;
      requisition_line_id: string | null;
      product_id: string;
      product_code: string;
      product_name: string;
      ordered_quantity: string;
      uom_id: string;
      unit_price_minor: string;
      tax_rate_basis_points: number;
      line_tax_minor: string;
      line_subtotal_minor: string;
      line_total_minor: string;
      received_quantity: string;
      invoiced_quantity: string;
      destination_warehouse_id: string;
      destination_location_id: string | null;
      promised_date: string | null;
      status: string;
      custom_extensions: Record<string, unknown>;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM ${SCHEMA}.purchase_order_lines WHERE tenant_id = $1 AND purchase_order_id = $2 ORDER BY line_number ASC`,
      [tenantId, id],
    );

    const lines: PurchaseOrderLineV1[] = linesRes.rows.map((l) => ({
      id: l.id,
      tenantId: l.tenant_id,
      purchaseOrderId: l.purchase_order_id,
      lineNumber: l.line_number,
      requisitionLineId: l.requisition_line_id,
      productId: l.product_id,
      productCode: l.product_code,
      productName: l.product_name,
      orderedQuantity: l.ordered_quantity,
      uomId: l.uom_id,
      unitPriceMinor: l.unit_price_minor,
      taxRateBasisPoints: l.tax_rate_basis_points,
      lineTaxMinor: l.line_tax_minor,
      lineSubtotalMinor: l.line_subtotal_minor,
      lineTotalMinor: l.line_total_minor,
      receivedQuantity: l.received_quantity,
      invoicedQuantity: l.invoiced_quantity,
      destinationWarehouseId: l.destination_warehouse_id,
      destinationLocationId: l.destination_location_id,
      promisedDate: l.promised_date,
      status: l.status as any,
      customExtensions: l.custom_extensions ?? {},
      createdAt: l.created_at,
      updatedAt: l.updated_at,
    }));

    return {
      id: row.id,
      tenantId: row.tenant_id,
      orderNumber: row.order_number,
      orgUnitId: row.org_unit_id,
      vendorPartyId: row.vendor_party_id,
      vendorName: row.vendor_name,
      orderType: row.order_type as any,
      status: row.status as any,
      currencyCode: row.currency_code,
      subtotalMinor: row.subtotal_minor,
      taxTotalMinor: row.tax_total_minor,
      totalAmountMinor: row.total_amount_minor,
      paymentTermDays: row.payment_term_days,
      incoterm: row.incoterm as any,
      requisitionId: row.requisition_id,
      destinationWarehouseId: row.destination_warehouse_id,
      revisionNumber: row.revision_number,
      issuedAt: row.issued_at,
      issuedBy: row.issued_by,
      acknowledgedAt: row.acknowledged_at,
      customExtensions: row.custom_extensions ?? {},
      version: row.version,
      lines,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    };
  }

  private async fetchVendorBill(client: PoolClient, tenantId: string, id: string): Promise<VendorBillV1> {
    const res = await client.query<{
      id: string;
      tenant_id: string;
      vendor_party_id: string;
      vendor_invoice_number: string;
      invoice_date: string;
      due_date: string;
      currency_code: string;
      subtotal_minor: string;
      tax_total_minor: string;
      total_amount_minor: string;
      purchase_order_id: string | null;
      status: string;
      approved_by: string | null;
      approved_at: string | null;
      custom_extensions: Record<string, unknown>;
      version: number;
      created_at: string;
      updated_at: string;
      created_by?: string;
      updated_by?: string;
    }>(
      `SELECT * FROM ${SCHEMA}.vendor_bills WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Vendor Bill ${id} not found.`);
    }

    const row = res.rows[0];
    const linesRes = await client.query<{
      id: string;
      tenant_id: string;
      vendor_bill_id: string;
      line_number: number;
      purchase_order_id: string | null;
      purchase_order_line_id: string | null;
      product_id: string | null;
      description: string;
      billed_quantity: string;
      uom_id: string;
      unit_price_minor: string;
      line_subtotal_minor: string;
      line_tax_minor: string;
      line_total_minor: string;
      matched_receipt_line_id: string | null;
      custom_extensions: Record<string, unknown>;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM ${SCHEMA}.vendor_bill_lines WHERE tenant_id = $1 AND vendor_bill_id = $2 ORDER BY line_number ASC`,
      [tenantId, id],
    );

    const lines: VendorBillLineV1[] = linesRes.rows.map((l) => ({
      id: l.id,
      tenantId: l.tenant_id,
      vendorBillId: l.vendor_bill_id,
      lineNumber: l.line_number,
      purchaseOrderId: l.purchase_order_id,
      purchaseOrderLineId: l.purchase_order_line_id,
      productId: l.product_id,
      description: l.description,
      billedQuantity: l.billed_quantity,
      uomId: l.uom_id,
      unitPriceMinor: l.unit_price_minor,
      lineSubtotalMinor: l.line_subtotal_minor,
      lineTaxMinor: l.line_tax_minor,
      lineTotalMinor: l.line_total_minor,
      matchedReceiptLineId: l.matched_receipt_line_id,
      customExtensions: l.custom_extensions ?? {},
      createdAt: l.created_at,
      updatedAt: l.updated_at,
    }));

    return {
      id: row.id,
      tenantId: row.tenant_id,
      vendorPartyId: row.vendor_party_id,
      vendorInvoiceNumber: row.vendor_invoice_number,
      invoiceDate: row.invoice_date,
      dueDate: row.due_date,
      currencyCode: row.currency_code,
      subtotalMinor: row.subtotal_minor,
      taxTotalMinor: row.tax_total_minor,
      totalAmountMinor: row.total_amount_minor,
      purchaseOrderId: row.purchase_order_id,
      status: row.status as any,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      customExtensions: row.custom_extensions ?? {},
      version: row.version,
      lines,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    };
  }
}
