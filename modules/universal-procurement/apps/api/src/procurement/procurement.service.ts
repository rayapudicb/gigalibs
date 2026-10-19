import { createHash, randomUUID } from 'node:crypto';
import { validateDictionaryRules } from '@gigalibs/configuration-core';
import {
  type ApprovalPolicyV1,
  type ApprovePriceVarianceInputV1,
  type CreateApprovalPolicyInputV1,
  type CreateDebitMemoInputV1,
  type CreatePurchaseOrderInputV1,
  type CreateRequisitionInputV1,
  type CreateVendorBillInputV1,
  type DebitMemoV1,
  type DictionaryValidationRuleV1,
  type MatchInvoiceInputV1,
  type MatchPoInvoiceRecordV1,
  type MatchPoReceiptRecordV1,
  type MatchReceiptInputV1,
  type ProcurementRequisitionLineV1,
  type ProcurementRequisitionV1,
  type PurchaseOrderLineV1,
  type PurchaseOrderV1,
  type VendorBillLineV1,
  type VendorBillV1,
  ExactDecimal,
  SCALE_FACTOR,
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
import { requireActiveVendorParty } from './party-reference.js';

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
        const lineTotal = (BigInt(l.estimatedUnitPriceMinor) * ExactDecimal.toScaledBigInt(l.quantity)) / SCALE_FACTOR;
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
      await requireActiveVendorParty(client, principal.tenantId, input.vendorPartyId);

      const countRes = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM ${SCHEMA}.purchase_orders WHERE tenant_id = $1`,
        [principal.tenantId],
      );
      const seq = Number.parseInt(countRes.rows[0]?.count ?? '0', 10) + 1;
      const orderNumber = `PO-${String(seq).padStart(5, '0')}`;

      let subtotalMinor = 0n;
      let taxTotalMinor = 0n;

      const computedLines = input.lines.map((l, idx) => {
        const qtyScaled = ExactDecimal.toScaledBigInt(l.orderedQuantity);
        const unitPrice = BigInt(l.unitPriceMinor);
        const lineSubtotal = (qtyScaled * unitPrice) / SCALE_FACTOR;
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
      const orderedScaled = ExactDecimal.toScaledBigInt(poLine.ordered_quantity);
      const currentReceivedScaled = ExactDecimal.toScaledBigInt(poLine.received_quantity);
      const deltaScaled = ExactDecimal.toScaledBigInt(input.matchedQuantity);

      const newReceivedScaled = currentReceivedScaled + deltaScaled;
      if (newReceivedScaled > orderedScaled) {
        throw new BadRequestException(
          `Cannot match receipt quantity ${input.matchedQuantity}: total received (${ExactDecimal.fromScaledBigInt(newReceivedScaled)}) would exceed ordered quantity (${poLine.ordered_quantity}).`,
        );
      }

      // If receipt projection exists, lock it FOR UPDATE and validate consistency
      if (input.receiptLineId) {
        const projRes = await client.query<{
          id: string;
          received_quantity: string;
          matched_quantity: string;
          purchase_order_id: string | null;
          purchase_order_line_id: string | null;
        }>(
          `SELECT id, received_quantity, matched_quantity, purchase_order_id, purchase_order_line_id
           FROM ${SCHEMA}.procurement_receipt_projections
           WHERE tenant_id = $1 AND receipt_line_id = $2
           FOR UPDATE`,
          [principal.tenantId, input.receiptLineId],
        );

        if (projRes.rows.length > 0) {
          const proj = projRes.rows[0];
          if (proj.purchase_order_id && proj.purchase_order_id !== input.purchaseOrderId) {
            throw new BadRequestException(
              `Receipt line ${input.receiptLineId} belongs to PO ${proj.purchase_order_id}, not ${input.purchaseOrderId}.`,
            );
          }
          if (proj.purchase_order_line_id && proj.purchase_order_line_id !== input.purchaseOrderLineId) {
            throw new BadRequestException(
              `Receipt line ${input.receiptLineId} belongs to PO line ${proj.purchase_order_line_id}, not ${input.purchaseOrderLineId}.`,
            );
          }
          const projReceivedScaled = ExactDecimal.toScaledBigInt(proj.received_quantity);
          const projMatchedScaled = ExactDecimal.toScaledBigInt(proj.matched_quantity);
          const nextProjMatchedScaled = projMatchedScaled + deltaScaled;
          if (nextProjMatchedScaled > projReceivedScaled) {
            throw new BadRequestException(
              `Matched quantity (${ExactDecimal.fromScaledBigInt(nextProjMatchedScaled)}) would exceed received quantity (${proj.received_quantity}) on projection.`,
            );
          }
          await client.query(
            `UPDATE ${SCHEMA}.procurement_receipt_projections
             SET matched_quantity = $1, updated_at = NOW()
             WHERE tenant_id = $2 AND receipt_line_id = $3`,
            [ExactDecimal.fromScaledBigInt(nextProjMatchedScaled), principal.tenantId, input.receiptLineId],
          );
        }
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

      const newReceivedQtyStr = ExactDecimal.fromScaledBigInt(newReceivedScaled);
      const lineStatus = newReceivedScaled >= orderedScaled ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
      await client.query(
        `UPDATE ${SCHEMA}.purchase_order_lines
         SET received_quantity = $1, status = $2, updated_at = NOW()
         WHERE tenant_id = $3 AND id = $4`,
        [newReceivedQtyStr, lineStatus, principal.tenantId, input.purchaseOrderLineId],
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

  async projectInventoryReceipt(
    principal: ModulePrincipal,
    event: {
      id: string;
      source?: string;
      type: string;
      data: {
        receiptId: string;
        receiptNumber: string;
        warehouseId: string;
        receivedAt: string;
        lines: Array<{
          id: string;
          productId: string;
          quantity: string;
          uomId: string;
          purchaseOrderId?: string | null;
          purchaseOrderLineId?: string | null;
        }>;
      };
    },
  ): Promise<{ processed: boolean; duplicate: boolean }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const messageId = event.id;
      const sha256 = createHash('sha256').update(JSON.stringify(event)).digest('hex');

      // Check inbox deduplication
      const existingInbox = await client.query<{ status: string }>(
        `SELECT status FROM ${SCHEMA}.inbox_receipts
         WHERE tenant_id = $1 AND consumer_name = 'procurement_receipt_consumer' AND message_id = $2`,
        [principal.tenantId, messageId],
      );

      if (existingInbox.rows.length > 0 && existingInbox.rows[0].status === 'PROCESSED') {
        return { processed: true, duplicate: true };
      }

      if (existingInbox.rows.length === 0) {
        await client.query(
          `INSERT INTO ${SCHEMA}.inbox_receipts (
            id, tenant_id, consumer_name, message_id, event_type, source_module,
            source_version, correlation_id, payload_sha256, status, created_at
          ) VALUES ($1, $2, 'procurement_receipt_consumer', $3, $4, 'universal_inventory', 1, $5, $6, 'PROCESSING', NOW())`,
          [randomUUID(), principal.tenantId, messageId, event.type, messageId, sha256],
        );
      }

      // Upsert receipt projections for each line
      for (const line of event.data.lines) {
        await client.query(
          `INSERT INTO ${SCHEMA}.procurement_receipt_projections (
            id, tenant_id, receipt_id, receipt_number, receipt_line_id, product_id,
            received_quantity, uom_id, purchase_order_id, purchase_order_line_id,
            warehouse_id, matched_quantity, received_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '0.000000', $12, NOW(), NOW())
          ON CONFLICT (tenant_id, receipt_id, receipt_line_id)
          DO UPDATE SET
            received_quantity = EXCLUDED.received_quantity,
            purchase_order_id = COALESCE(EXCLUDED.purchase_order_id, ${SCHEMA}.procurement_receipt_projections.purchase_order_id),
            purchase_order_line_id = COALESCE(EXCLUDED.purchase_order_line_id, ${SCHEMA}.procurement_receipt_projections.purchase_order_line_id),
            updated_at = NOW()`,
          [
            randomUUID(),
            principal.tenantId,
            event.data.receiptId,
            event.data.receiptNumber,
            line.id,
            line.productId,
            line.quantity,
            line.uomId,
            line.purchaseOrderId ?? null,
            line.purchaseOrderLineId ?? null,
            event.data.warehouseId,
            event.data.receivedAt || new Date().toISOString(),
          ],
        );
      }

      await client.query(
        `UPDATE ${SCHEMA}.inbox_receipts
         SET status = 'PROCESSED', processed_at = NOW()
         WHERE tenant_id = $1 AND consumer_name = 'procurement_receipt_consumer' AND message_id = $2`,
        [principal.tenantId, messageId],
      );

      return { processed: true, duplicate: false };
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

      const receivedScaled = ExactDecimal.toScaledBigInt(poLine.received_quantity);
      const currentInvoicedScaled = ExactDecimal.toScaledBigInt(poLine.invoiced_quantity);
      const matchScaled = ExactDecimal.toScaledBigInt(input.matchedQuantity);

      const newInvoicedScaled = currentInvoicedScaled + matchScaled;
      if (newInvoicedScaled > receivedScaled) {
        throw new BadRequestException(
          `3-Way Match Invariant Violation: Invoiced quantity (${ExactDecimal.fromScaledBigInt(newInvoicedScaled)}) cannot exceed physical received quantity (${poLine.received_quantity}).`,
        );
      }

      const poUnitPrice = BigInt(poLine.unit_price_minor);
      const billedUnitPrice = BigInt(billLine.unit_price_minor);
      const priceVarianceMinor = billedUnitPrice - poUnitPrice;
      const absVariance = priceVarianceMinor < 0n ? -priceVarianceMinor : priceVarianceMinor;

      // Tolerance check in integer basis points: 1% = 100 bps
      const varianceBasisPoints = poUnitPrice > 0n ? (absVariance * 10000n) / poUnitPrice : (billedUnitPrice > 0n ? 10000n : 0n);
      const toleranceExceeded = varianceBasisPoints > 100n;
      const status = toleranceExceeded ? 'VARIANCE_HOLD' : 'FULLY_MATCHED';
      const priceVariancePercent = poUnitPrice > 0n ? Number(absVariance * 10000n / poUnitPrice) / 100 : 0;

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

      const newInvoicedQtyStr = ExactDecimal.fromScaledBigInt(newInvoicedScaled);
      await client.query(
        `UPDATE ${SCHEMA}.purchase_order_lines
         SET invoiced_quantity = $1, updated_at = NOW()
         WHERE tenant_id = $2 AND id = $3`,
        [newInvoicedQtyStr, principal.tenantId, input.purchaseOrderLineId],
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
      await requireActiveVendorParty(client, principal.tenantId, input.vendorPartyId);

      let subtotalMinor = 0n;
      let taxTotalMinor = 0n;

      const computedLines = input.lines.map((l, idx) => {
        const qtyScaled = ExactDecimal.toScaledBigInt(l.billedQuantity);
        const unitPrice = BigInt(l.unitPriceMinor);
        const lineSubtotal = (qtyScaled * unitPrice) / SCALE_FACTOR;
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
      await requireActiveVendorParty(client, principal.tenantId, input.vendorPartyId);

      const countRes = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM ${SCHEMA}.debit_memos WHERE tenant_id = $1`,
        [principal.tenantId],
      );
      const seq = Number.parseInt(countRes.rows[0]?.count ?? '0', 10) + 1;
      const memoNumber = `DM-${String(seq).padStart(5, '0')}`;

      let totalAmountMinor = 0n;
      const computedLines = input.lines.map((l, idx) => {
        const qtyScaled = ExactDecimal.toScaledBigInt(l.quantity);
        const unitPrice = BigInt(l.unitPriceMinor);
        const lineTotal = (qtyScaled * unitPrice) / SCALE_FACTOR;
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

  async getDebitMemo(principal: ModulePrincipal, id: string): Promise<DebitMemoV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      return this.fetchDebitMemo(client, principal.tenantId, id);
    });
  }

  async listDebitMemos(principal: ModulePrincipal): Promise<DebitMemoV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.debit_memos WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [principal.tenantId],
      );
      const items: DebitMemoV1[] = [];
      for (const row of res.rows) {
        items.push(await this.fetchDebitMemo(client, principal.tenantId, row.id));
      }
      return items;
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
        const isMatchValid =
          ExactDecimal.isLessThanOrEqual(row.invoiced_quantity, row.received_quantity) &&
          ExactDecimal.isLessThanOrEqual(row.received_quantity, row.ordered_quantity);
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

  private async fetchDebitMemo(client: PoolClient, tenantId: string, id: string): Promise<DebitMemoV1> {
    const res = await client.query(
      `SELECT * FROM ${SCHEMA}.debit_memos WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Debit memo ${id} not found.`);
    }
    const row = res.rows[0];
    const linesRes = await client.query(
      `SELECT * FROM ${SCHEMA}.debit_memo_lines WHERE tenant_id = $1 AND debit_memo_id = $2 ORDER BY line_number ASC`,
      [tenantId, id],
    );
    const lines = linesRes.rows.map((l) => ({
      id: l.id,
      tenantId: l.tenant_id,
      debitMemoId: l.debit_memo_id,
      lineNumber: l.line_number,
      productId: l.product_id,
      description: l.description,
      quantity: l.quantity,
      unitPriceMinor: l.unit_price_minor,
      lineTotalMinor: l.line_total_minor,
      reason: l.reason,
      createdAt: l.created_at,
    }));
    return {
      id: row.id,
      tenantId: row.tenant_id,
      debitMemoNumber: row.debit_memo_number,
      vendorPartyId: row.vendor_party_id,
      vendorBillId: row.vendor_bill_id,
      purchaseOrderId: row.purchase_order_id,
      currencyCode: row.currency_code,
      totalAmountMinor: row.total_amount_minor,
      status: row.status,
      reason: row.reason,
      issuedAt: row.issued_at,
      issuedBy: row.issued_by,
      version: row.version ?? 1,
      lines,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
