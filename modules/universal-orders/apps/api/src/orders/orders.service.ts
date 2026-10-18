import { createHash, randomUUID } from 'node:crypto';
import {
  type AllocateOrderLineInputV1,
  type CreateCustomerCreditMemoInputV1,
  type CreateCustomerInvoiceInputV1,
  type CreateFulfillmentOrderInputV1,
  type CreateSalesOrderInputV1,
  type CreateSalesQuoteInputV1,
  type CustomerCreditMemoV1,
  type CustomerInvoiceV1,
  type FulfillmentOrderV1,
  type SalesOrderV1,
  type SalesQuoteV1,
  ExactDecimal,
  SCALE_FACTOR,
} from '@gigalibs/contracts';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import { requireActiveCustomerParty } from './party-reference.js';

@Injectable()
export class OrderService {
  constructor(private readonly database: DatabaseService) {}

  // ─── 1. Sales Quotations ───────────────────────────────────────────────────

  async createQuote(
    tenantId: string,
    actorId: string,
    input: CreateSalesQuoteInputV1,
  ): Promise<SalesQuoteV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await requireActiveCustomerParty(client, tenantId, input.customerPartyId);

      let subtotal = 0n;
      let discountTotal = 0n;
      let taxTotal = 0n;

      const processedLines = input.lines.map((line, idx) => {
        const qtyScaled = ExactDecimal.toScaledBigInt(line.quotedQuantity);
        const unitPrice = BigInt(line.unitPriceMinor);
        const rawSubtotal = (qtyScaled * unitPrice) / SCALE_FACTOR;
        const discountBasisPoints = BigInt(line.discountPercentBasisPoints ?? 0);
        const discountAmount = (rawSubtotal * discountBasisPoints) / 10000n;
        const lineSubtotal = rawSubtotal - discountAmount;
        const taxBasisPoints = BigInt(line.taxRateBasisPoints ?? 0);
        const lineTax = (lineSubtotal * taxBasisPoints) / 10000n;
        const lineTotal = lineSubtotal + lineTax;

        subtotal += rawSubtotal;
        discountTotal += discountAmount;
        taxTotal += lineTax;

        return {
          ...line,
          lineNumber: idx + 1,
          lineSubtotal: lineSubtotal.toString(),
          lineTax: lineTax.toString(),
          lineTotal: lineTotal.toString(),
        };
      });

      const totalAmount = subtotal - discountTotal + taxTotal;
      const quoteNumber = `QT-${Date.now().toString().slice(-6)}`;

      const quoteRes = await client.query(
        `INSERT INTO gigalibs_orders.sales_quotes (
          tenant_id, quote_number, org_unit_id, customer_party_id, customer_name,
          currency_code, subtotal_minor, discount_total_minor, tax_total_minor,
          total_amount_minor, status, valid_until, payment_term_days, notes,
          custom_extensions, version, created_by, updated_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'DRAFT', $11, $12, $13, $14, 1, $15, $15
        ) RETURNING *`,
        [
          tenantId,
          quoteNumber,
          input.orgUnitId,
          input.customerPartyId,
          input.customerName,
          input.currencyCode,
          subtotal.toString(),
          discountTotal.toString(),
          taxTotal.toString(),
          totalAmount.toString(),
          input.validUntil,
          input.paymentTermDays ?? 30,
          input.notes ?? null,
          JSON.stringify(input.customExtensions ?? {}),
          actorId,
        ],
      );

      const quote = quoteRes.rows[0];

      for (const line of processedLines) {
        await client.query(
          `INSERT INTO gigalibs_orders.sales_quote_lines (
            tenant_id, quote_id, line_number, product_id, product_code, product_name,
            quoted_quantity, uom_id, unit_price_minor, discount_percent_basis_points,
            line_subtotal_minor, tax_rate_basis_points, line_tax_minor, line_total_minor,
            lead_time_days, custom_extensions
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
          )`,
          [
            tenantId,
            quote.id,
            line.lineNumber,
            line.productId,
            line.productCode,
            line.productName,
            line.quotedQuantity,
            line.uomId,
            line.unitPriceMinor,
            line.discountPercentBasisPoints ?? 0,
            line.lineSubtotal,
            line.taxRateBasisPoints ?? 0,
            line.lineTax,
            line.lineTotal,
            line.leadTimeDays ?? null,
            JSON.stringify(line.customExtensions ?? {}),
          ],
        );
      }

      await client.query(
        `INSERT INTO gigalibs_orders.audit_events (
          tenant_id, entity_type, entity_id, action, actor_id, payload
        ) VALUES ($1, 'sales_quote', $2, 'QUOTE_CREATED', $3, $4)`,
        [tenantId, quote.id, actorId, JSON.stringify({ quoteNumber, totalAmount: totalAmount.toString() })],
      );

      return this.mapQuote(quote);
    });
  }

  async getQuote(tenantId: string, quoteId: string): Promise<SalesQuoteV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM gigalibs_orders.sales_quotes WHERE tenant_id = $1 AND id = $2`,
        [tenantId, quoteId],
      );
      if (res.rows.length === 0) throw new NotFoundException('Quote not found');
      const lines = await client.query(
        `SELECT * FROM gigalibs_orders.sales_quote_lines WHERE tenant_id = $1 AND quote_id = $2 ORDER BY line_number ASC`,
        [tenantId, quoteId],
      );
      return this.mapQuote(res.rows[0], lines.rows);
    });
  }

  async listSalesQuotes(principal: { tenantId: string }): Promise<SalesQuoteV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query<{ id: string }>(
        `SELECT id FROM gigalibs_orders.sales_quotes WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [principal.tenantId],
      );
      const items: SalesQuoteV1[] = [];
      for (const row of res.rows) {
        const quoteRes = await client.query(`SELECT * FROM gigalibs_orders.sales_quotes WHERE tenant_id = $1 AND id = $2`, [
          principal.tenantId,
          row.id,
        ]);
        const lines = await client.query(
          `SELECT * FROM gigalibs_orders.sales_quote_lines WHERE tenant_id = $1 AND quote_id = $2 ORDER BY line_number ASC`,
          [principal.tenantId, row.id],
        );
        items.push(this.mapQuote(quoteRes.rows[0], lines.rows));
      }
      return items;
    });
  }

  async acceptQuote(tenantId: string, actorId: string, quoteId: string): Promise<SalesQuoteV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const quote = await client.query(
        `SELECT * FROM gigalibs_orders.sales_quotes WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, quoteId],
      );
      if (quote.rows.length === 0) throw new NotFoundException('Quote not found');
      if (quote.rows[0].status === 'CANCELLED' || quote.rows[0].status === 'CONVERTED') {
        throw new BadRequestException(`Cannot accept quote in state ${quote.rows[0].status}`);
      }

      const res = await client.query(
        `UPDATE gigalibs_orders.sales_quotes
         SET status = 'ACCEPTED', updated_at = CURRENT_TIMESTAMP, updated_by = $3, version = version + 1
         WHERE tenant_id = $1 AND id = $2
         RETURNING *`,
        [tenantId, quoteId, actorId],
      );

      await client.query(
        `INSERT INTO gigalibs_orders.audit_events (
          tenant_id, entity_type, entity_id, action, actor_id, payload
        ) VALUES ($1, 'sales_quote', $2, 'QUOTE_ACCEPTED', $3, '{}'::jsonb)`,
        [tenantId, quoteId, actorId],
      );

      return this.mapQuote(res.rows[0]);
    });
  }

  async convertQuoteToOrder(
    tenantId: string,
    actorId: string,
    quoteId: string,
    warehouseId: string,
  ): Promise<SalesOrderV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const quoteRes = await client.query(
        `SELECT * FROM gigalibs_orders.sales_quotes WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, quoteId],
      );
      if (quoteRes.rows.length === 0) throw new NotFoundException('Quote not found');
      const quote = quoteRes.rows[0];

      if (quote.status !== 'ACCEPTED') {
        throw new BadRequestException(`Quote must be in ACCEPTED state to convert; currently ${quote.status}`);
      }
      if (quote.converted_order_id) {
        throw new BadRequestException('Quote has already been converted to an order');
      }

      const linesRes = await client.query(
        `SELECT * FROM gigalibs_orders.sales_quote_lines WHERE tenant_id = $1 AND quote_id = $2 ORDER BY line_number ASC`,
        [tenantId, quoteId],
      );

      const orderNumber = `SO-${Date.now().toString().slice(-6)}`;

      const orderRes = await client.query(
        `INSERT INTO gigalibs_orders.sales_orders (
          tenant_id, order_number, org_unit_id, customer_party_id, customer_name,
          order_type, currency_code, subtotal_minor, discount_total_minor, tax_total_minor,
          total_amount_minor, warehouse_id, status, quote_id, payment_term_days,
          custom_extensions, version, created_by, updated_by
        ) VALUES (
          $1, $2, $3, $4, $5, 'STANDARD', $6, $7, $8, $9, $10, $11, 'DRAFT', $12, $13, $14, 1, $15, $15
        ) RETURNING *`,
        [
          tenantId,
          orderNumber,
          quote.org_unit_id,
          quote.customer_party_id,
          quote.customer_name,
          quote.currency_code,
          quote.subtotal_minor,
          quote.discount_total_minor,
          quote.tax_total_minor,
          quote.total_amount_minor,
          warehouseId,
          quote.id,
          quote.payment_term_days,
          quote.custom_extensions,
          actorId,
        ],
      );
      const order = orderRes.rows[0];

      for (const qLine of linesRes.rows) {
        await client.query(
          `INSERT INTO gigalibs_orders.sales_order_lines (
            tenant_id, order_id, line_number, product_id, product_code, product_name,
            ordered_quantity, uom_id, unit_price_minor, discount_minor, tax_rate_basis_points,
            line_subtotal_minor, line_tax_minor, line_total_minor, warehouse_id, status
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'OPEN'
          )`,
          [
            tenantId,
            order.id,
            qLine.line_number,
            qLine.product_id,
            qLine.product_code,
            qLine.product_name,
            qLine.quoted_quantity,
            qLine.uom_id,
            qLine.unit_price_minor,
            qLine.discount_percent_basis_points > 0 ? (BigInt(qLine.line_subtotal_minor) * BigInt(qLine.discount_percent_basis_points) / 10000n).toString() : '0',
            qLine.tax_rate_basis_points,
            qLine.line_subtotal_minor,
            qLine.line_tax_minor,
            qLine.line_total_minor,
            warehouseId,
          ],
        );
      }

      await client.query(
        `UPDATE gigalibs_orders.sales_quotes
         SET status = 'CONVERTED', converted_order_id = $3, updated_at = CURRENT_TIMESTAMP, updated_by = $4
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, quote.id, order.id, actorId],
      );

      await client.query(
        `INSERT INTO gigalibs_orders.audit_events (
          tenant_id, entity_type, entity_id, action, actor_id, payload
        ) VALUES ($1, 'sales_order', $2, 'ORDER_CREATED_FROM_QUOTE', $3, $4)`,
        [tenantId, order.id, actorId, JSON.stringify({ quoteId, orderNumber })],
      );

      return this.mapOrder(order);
    });
  }

  // ─── 2. Sales Orders ───────────────────────────────────────────────────────

  async createOrder(
    tenantId: string,
    actorId: string,
    input: CreateSalesOrderInputV1,
  ): Promise<SalesOrderV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await requireActiveCustomerParty(client, tenantId, input.customerPartyId);

      let subtotal = 0n;
      let discountTotal = 0n;
      let taxTotal = 0n;

      const processedLines = input.lines.map((line, idx) => {
        const qtyScaled = ExactDecimal.toScaledBigInt(line.orderedQuantity);
        const unitPrice = BigInt(line.unitPriceMinor);
        const rawSubtotal = (qtyScaled * unitPrice) / SCALE_FACTOR;
        const discountAmount = BigInt(line.discountMinor ?? '0');
        const lineSubtotal = rawSubtotal - discountAmount;
        const taxBasisPoints = BigInt(line.taxRateBasisPoints ?? 0);
        const lineTax = (lineSubtotal * taxBasisPoints) / 10000n;
        const lineTotal = lineSubtotal + lineTax;

        subtotal += rawSubtotal;
        discountTotal += discountAmount;
        taxTotal += lineTax;

        return {
          ...line,
          lineNumber: idx + 1,
          lineSubtotal: lineSubtotal.toString(),
          lineTax: lineTax.toString(),
          lineTotal: lineTotal.toString(),
        };
      });

      const totalAmount = subtotal - discountTotal + taxTotal;
      const orderNumber = `SO-${Date.now().toString().slice(-6)}`;

      const orderRes = await client.query(
        `INSERT INTO gigalibs_orders.sales_orders (
          tenant_id, order_number, org_unit_id, customer_party_id, customer_name,
          order_type, currency_code, subtotal_minor, discount_total_minor, tax_total_minor,
          total_amount_minor, warehouse_id, status, quote_id, customer_po_reference,
          payment_term_days, shipping_address, custom_extensions, version, created_by, updated_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'DRAFT', $13, $14, $15, $16, $17, 1, $18, $18
        ) RETURNING *`,
        [
          tenantId,
          orderNumber,
          input.orgUnitId,
          input.customerPartyId,
          input.customerName,
          input.orderType ?? 'STANDARD',
          input.currencyCode ?? 'USD',
          subtotal.toString(),
          discountTotal.toString(),
          taxTotal.toString(),
          totalAmount.toString(),
          input.warehouseId,
          input.quoteId ?? null,
          input.customerPoReference ?? null,
          input.paymentTermDays ?? 30,
          input.shippingAddress ?? null,
          JSON.stringify(input.customExtensions ?? {}),
          actorId,
        ],
      );
      const order = orderRes.rows[0];

      for (const line of processedLines) {
        await client.query(
          `INSERT INTO gigalibs_orders.sales_order_lines (
            tenant_id, order_id, line_number, product_id, product_code, product_name,
            ordered_quantity, uom_id, unit_price_minor, discount_minor, tax_rate_basis_points,
            line_subtotal_minor, line_tax_minor, line_total_minor, warehouse_id, promised_date,
            status, custom_extensions
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'OPEN', $17
          )`,
          [
            tenantId,
            order.id,
            line.lineNumber,
            line.productId,
            line.productCode,
            line.productName,
            line.orderedQuantity,
            line.uomId,
            line.unitPriceMinor,
            line.discountMinor ?? '0',
            line.taxRateBasisPoints ?? 0,
            line.lineSubtotal,
            line.lineTax,
            line.lineTotal,
            line.warehouseId,
            line.promisedDate ?? null,
            JSON.stringify(line.customExtensions ?? {}),
          ],
        );
      }

      await client.query(
        `INSERT INTO gigalibs_orders.audit_events (
          tenant_id, entity_type, entity_id, action, actor_id, payload
        ) VALUES ($1, 'sales_order', $2, 'ORDER_CREATED', $3, $4)`,
        [tenantId, order.id, actorId, JSON.stringify({ orderNumber, totalAmount: totalAmount.toString() })],
      );

      return this.mapOrder(order);
    });
  }

  async listSalesOrders(principal: { tenantId: string }): Promise<SalesOrderV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query<{ id: string }>(
        `SELECT id FROM gigalibs_orders.sales_orders WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [principal.tenantId],
      );
      const items: SalesOrderV1[] = [];
      for (const row of res.rows) {
        const orderRes = await client.query(`SELECT * FROM gigalibs_orders.sales_orders WHERE tenant_id = $1 AND id = $2`, [
          principal.tenantId,
          row.id,
        ]);
        const lines = await client.query(
          `SELECT * FROM gigalibs_orders.sales_order_lines WHERE tenant_id = $1 AND order_id = $2 ORDER BY line_number ASC`,
          [principal.tenantId, row.id],
        );
        items.push(this.mapOrder(orderRes.rows[0], lines.rows));
      }
      return items;
    });
  }

  async getOrder(tenantId: string, orderId: string): Promise<SalesOrderV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM gigalibs_orders.sales_orders WHERE tenant_id = $1 AND id = $2`,
        [tenantId, orderId],
      );
      if (res.rows.length === 0) throw new NotFoundException('Sales Order not found');
      const lines = await client.query(
        `SELECT * FROM gigalibs_orders.sales_order_lines WHERE tenant_id = $1 AND order_id = $2 ORDER BY line_number ASC`,
        [tenantId, orderId],
      );
      return this.mapOrder(res.rows[0], lines.rows);
    });
  }

  async confirmOrder(tenantId: string, actorId: string, orderId: string): Promise<SalesOrderV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const order = await client.query(
        `SELECT * FROM gigalibs_orders.sales_orders WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, orderId],
      );
      if (order.rows.length === 0) throw new NotFoundException('Sales Order not found');
      if (order.rows[0].status !== 'DRAFT' && order.rows[0].status !== 'SUBMITTED') {
        throw new BadRequestException(`Order cannot be confirmed in state ${order.rows[0].status}`);
      }

      const res = await client.query(
        `UPDATE gigalibs_orders.sales_orders
         SET status = 'CONFIRMED', confirmed_by = $3, confirmed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP, updated_by = $3, version = version + 1
         WHERE tenant_id = $1 AND id = $2
         RETURNING *`,
        [tenantId, orderId, actorId],
      );

      const lines = await client.query(
        `SELECT * FROM gigalibs_orders.sales_order_lines WHERE tenant_id = $1 AND order_id = $2 ORDER BY line_number ASC`,
        [tenantId, orderId],
      );

      return this.mapOrder(res.rows[0], lines.rows);
    });
  }

  // ─── 3. Available-to-Promise (ATP) Allocation ──────────────────────────────

  async allocateOrderLine(
    tenantId: string,
    actorId: string,
    input: AllocateOrderLineInputV1,
  ): Promise<SalesOrderV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const lineRes = await client.query(
        `SELECT * FROM gigalibs_orders.sales_order_lines
         WHERE tenant_id = $1 AND id = $2 AND order_id = $3 FOR UPDATE`,
        [tenantId, input.orderLineId, input.orderId],
      );
      if (lineRes.rows.length === 0) throw new NotFoundException('Order line not found');
      const line = lineRes.rows[0];

      const orderedScaled = ExactDecimal.toScaledBigInt(line.ordered_quantity);
      const currentAllocatedScaled = ExactDecimal.toScaledBigInt(line.allocated_quantity);
      const requestedAllocScaled = ExactDecimal.toScaledBigInt(input.allocatedQuantity);

      // ATP Mathematical Invariant Check: Total Allocated <= Ordered Quantity
      if (currentAllocatedScaled + requestedAllocScaled > orderedScaled) {
        throw new BadRequestException(
          `Cannot allocate ${input.allocatedQuantity}. Total allocated (${ExactDecimal.fromScaledBigInt(currentAllocatedScaled + requestedAllocScaled)}) would exceed ordered quantity (${line.ordered_quantity})`,
        );
      }

      const allocationId = randomUUID();
      // Record allocation
      await client.query(
        `INSERT INTO gigalibs_orders.order_inventory_allocations (
          id, tenant_id, order_id, order_line_id, product_id, warehouse_id, location_id,
          allocated_quantity, uom_id, status, allocated_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 'HARD_RESERVED', $10
        )`,
        [
          allocationId,
          tenantId,
          input.orderId,
          line.id,
          line.product_id,
          input.warehouseId,
          input.locationId ?? null,
          input.allocatedQuantity,
          line.uom_id,
          actorId,
        ],
      );

      const newAllocTotal = ExactDecimal.fromScaledBigInt(currentAllocatedScaled + requestedAllocScaled);
      await client.query(
        `UPDATE gigalibs_orders.sales_order_lines
         SET allocated_quantity = $3, status = CASE WHEN $3::numeric >= ordered_quantity THEN 'ALLOCATED' ELSE status END,
             updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, line.id, newAllocTotal],
      );

      // Emit orders.allocation.requested.v1 outbox event
      // The next aggregate version per record, under a per-record lock, so a second event for the same sales order line
      // (for example a second partial allocation) never collides with the unique key (WI-OI-120c, audit P1-09).
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `gigalibs_orders:outbox:${tenantId}:sales_order_line:${line.id}`,
      ]);
      const allocationEventVersion = await client.query<{ version: number }>(
        `SELECT COALESCE(MAX(aggregate_version), 0)::int + 1 AS version FROM gigalibs_orders.outbox_events
          WHERE tenant_id = $1 AND aggregate_type = 'sales_order_line' AND aggregate_id = $2`,
        [tenantId, line.id],
      );
      await client.query(
        `INSERT INTO gigalibs_orders.outbox_events (
          id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version,
          correlation_id, schema_version, payload, status, created_at
        ) VALUES ($1, $2, 'orders.allocation', 'orders.allocation.requested.v1', 'sales_order_line', $3, $6, $4, 1, $5::jsonb, 'PENDING', NOW())`,
        [
          randomUUID(),
          tenantId,
          line.id,
          input.orderId,
          JSON.stringify({
            allocationKey: allocationId,
            orderId: input.orderId,
            orderLineId: line.id,
            productId: line.product_id,
            warehouseId: input.warehouseId,
            requestedQuantity: input.allocatedQuantity,
            uomId: line.uom_id,
          }),
          allocationEventVersion.rows[0]?.version ?? 1,
        ],
      );

      // Check if all order lines are fully allocated to transition order to PROCESSING
      const allLines = await client.query(
        `SELECT ordered_quantity, allocated_quantity FROM gigalibs_orders.sales_order_lines
         WHERE tenant_id = $1 AND order_id = $2`,
        [tenantId, input.orderId],
      );
      const allAllocated = allLines.rows.every(
        (l) => ExactDecimal.isGreaterThanOrEqual(l.allocated_quantity, l.ordered_quantity),
      );

      if (allAllocated) {
        await client.query(
          `UPDATE gigalibs_orders.sales_orders
           SET status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = $1 AND id = $2 AND status = 'CONFIRMED'`,
          [tenantId, input.orderId],
        );
      }

      await client.query(
        `INSERT INTO gigalibs_orders.audit_events (
          tenant_id, entity_type, entity_id, action, actor_id, payload
        ) VALUES ($1, 'order_allocation', $2, 'INVENTORY_ALLOCATED', $3, $4)`,
        [tenantId, line.id, actorId, JSON.stringify({ allocatedQuantity: input.allocatedQuantity })],
      );

      const orderRes = await client.query(
        `SELECT * FROM gigalibs_orders.sales_orders WHERE tenant_id = $1 AND id = $2`,
        [tenantId, input.orderId],
      );
      const linesRes = await client.query(
        `SELECT * FROM gigalibs_orders.sales_order_lines WHERE tenant_id = $1 AND order_id = $2 ORDER BY line_number ASC`,
        [tenantId, input.orderId],
      );
      return this.mapOrder(orderRes.rows[0], linesRes.rows);
    });
  }

  // ─── 4. Fulfillment Orders & Dispatch ──────────────────────────────────────

  async createFulfillment(
    tenantId: string,
    actorId: string,
    input: CreateFulfillmentOrderInputV1,
  ): Promise<FulfillmentOrderV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const orderRes = await client.query(
        `SELECT * FROM gigalibs_orders.sales_orders WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, input.orderId],
      );
      if (orderRes.rows.length === 0) throw new NotFoundException('Order not found');

      const fulfillmentNumber = `FO-${Date.now().toString().slice(-6)}`;
      const foRes = await client.query(
        `INSERT INTO gigalibs_orders.fulfillment_orders (
          tenant_id, fulfillment_number, order_id, warehouse_id, carrier, tracking_number,
          status, custom_extensions, version
        ) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7, 1) RETURNING *`,
        [
          tenantId,
          fulfillmentNumber,
          input.orderId,
          input.warehouseId,
          input.carrier ?? null,
          input.trackingNumber ?? null,
          JSON.stringify(input.customExtensions ?? {}),
        ],
      );
      const fo = foRes.rows[0];

      for (const line of input.lines) {
        const oLineRes = await client.query(
          `SELECT * FROM gigalibs_orders.sales_order_lines
           WHERE tenant_id = $1 AND id = $2 AND order_id = $3 FOR UPDATE`,
          [tenantId, line.orderLineId, input.orderId],
        );
        if (oLineRes.rows.length === 0) throw new NotFoundException(`Order line ${line.orderLineId} not found`);
        const oLine = oLineRes.rows[0];

        const shipScaled = ExactDecimal.toScaledBigInt(line.shippedQuantity);
        const allocatedScaled = ExactDecimal.toScaledBigInt(oLine.allocated_quantity);
        const currentShippedScaled = ExactDecimal.toScaledBigInt(oLine.shipped_quantity);

        // Fulfillment Invariant Check: Shipped Qty <= Allocated Qty
        if (currentShippedScaled + shipScaled > allocatedScaled) {
          throw new BadRequestException(
            `Cannot fulfill ${line.shippedQuantity}. Total shipped (${ExactDecimal.fromScaledBigInt(currentShippedScaled + shipScaled)}) would exceed allocated quantity (${oLine.allocated_quantity})`,
          );
        }

        await client.query(
          `INSERT INTO gigalibs_orders.fulfillment_order_lines (
            tenant_id, fulfillment_order_id, order_line_id, product_id, shipped_quantity,
            uom_id, warehouse_id, lot_number, serial_number, custom_extensions
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            tenantId,
            fo.id,
            oLine.id,
            oLine.product_id,
            line.shippedQuantity,
            oLine.uom_id,
            input.warehouseId,
            line.lotNumber ?? null,
            line.serialNumber ?? null,
            JSON.stringify(line.customExtensions ?? {}),
          ],
        );

        const newShipped = ExactDecimal.fromScaledBigInt(currentShippedScaled + shipScaled);
        await client.query(
          `UPDATE gigalibs_orders.sales_order_lines
           SET shipped_quantity = $3, status = CASE WHEN $3::numeric >= ordered_quantity THEN 'SHIPPED' ELSE 'PARTIALLY_SHIPPED' END,
               updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = $1 AND id = $2`,
          [tenantId, oLine.id, newShipped],
        );
      }

      await client.query(
        `INSERT INTO gigalibs_orders.audit_events (
          tenant_id, entity_type, entity_id, action, actor_id, payload
        ) VALUES ($1, 'fulfillment_order', $2, 'FULFILLMENT_CREATED', $3, $4)`,
        [tenantId, fo.id, actorId, JSON.stringify({ fulfillmentNumber })],
      );

      const lines = await client.query(
        `SELECT * FROM gigalibs_orders.fulfillment_order_lines WHERE tenant_id = $1 AND fulfillment_order_id = $2`,
        [tenantId, fo.id],
      );

      return this.mapFulfillment(fo, lines.rows);
    });
  }

  async getFulfillment(tenantId: string, fulfillmentId: string): Promise<FulfillmentOrderV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM gigalibs_orders.fulfillment_orders WHERE tenant_id = $1 AND id = $2`,
        [tenantId, fulfillmentId],
      );
      if (res.rows.length === 0) throw new NotFoundException('Fulfillment not found');
      const lines = await client.query(
        `SELECT * FROM gigalibs_orders.fulfillment_order_lines WHERE tenant_id = $1 AND fulfillment_order_id = $2`,
        [tenantId, fulfillmentId],
      );
      return this.mapFulfillment(res.rows[0], lines.rows);
    });
  }

  async dispatchFulfillment(
    tenantId: string,
    actorId: string,
    fulfillmentId: string,
    issueId?: string,
  ): Promise<FulfillmentOrderV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const foRes = await client.query(
        `SELECT * FROM gigalibs_orders.fulfillment_orders WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, fulfillmentId],
      );
      if (foRes.rows.length === 0) throw new NotFoundException('Fulfillment not found');
      const fo = foRes.rows[0];

      if (fo.status === 'SHIPPED') {
        const lines = await client.query(
          `SELECT * FROM gigalibs_orders.fulfillment_order_lines WHERE tenant_id = $1 AND fulfillment_order_id = $2`,
          [tenantId, fulfillmentId],
        );
        return this.mapFulfillment(fo, lines.rows);
      }

      // Invariant: Physical stock deduction proof required before dispatching
      const effectiveIssueId = issueId || fo.custom_extensions?.issueId || fo.custom_extensions?.inventoryIssueId;
      if (!effectiveIssueId) {
        throw new BadRequestException(
          'Cannot dispatch fulfillment without authoritative physical inventory issue proof (issueId required). Physical stock must be deducted first.',
        );
      }

      const res = await client.query(
        `UPDATE gigalibs_orders.fulfillment_orders
         SET status = 'SHIPPED', dispatched_at = CURRENT_TIMESTAMP, dispatched_by = $3,
             custom_extensions = jsonb_set(COALESCE(custom_extensions, '{}'::jsonb), '{issueId}', to_jsonb($4::text)),
             updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE tenant_id = $1 AND id = $2
         RETURNING *`,
        [tenantId, fulfillmentId, actorId, effectiveIssueId],
      );

      // Check if order is fully fulfilled
      const orderLines = await client.query(
        `SELECT ordered_quantity, shipped_quantity FROM gigalibs_orders.sales_order_lines
         WHERE tenant_id = $1 AND order_id = $2`,
        [tenantId, fo.order_id],
      );
      const allShipped = orderLines.rows.every(
        (l) => ExactDecimal.isGreaterThanOrEqual(l.shipped_quantity, l.ordered_quantity),
      );

      await client.query(
        `UPDATE gigalibs_orders.sales_orders
         SET status = $3, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, fo.order_id, allShipped ? 'FULFILLED' : 'PARTIALLY_FULFILLED'],
      );

      const lines = await client.query(
        `SELECT * FROM gigalibs_orders.fulfillment_order_lines WHERE tenant_id = $1 AND fulfillment_order_id = $2`,
        [tenantId, fulfillmentId],
      );

      const orderRes = await client.query(
        `SELECT order_number, customer_party_id, currency_code FROM gigalibs_orders.sales_orders WHERE tenant_id = $1 AND id = $2`,
        [tenantId, fo.order_id],
      );
      const order = orderRes.rows[0];

      const oLinesRes = await client.query(
        `SELECT id, product_code, product_name, unit_price_minor FROM gigalibs_orders.sales_order_lines WHERE tenant_id = $1 AND order_id = $2`,
        [tenantId, fo.order_id],
      );
      const oLineMap = new Map(oLinesRes.rows.map((ol) => [ol.id, ol]));

      const dispatchedLines = lines.rows.map((fl) => {
        const ol = oLineMap.get(fl.order_line_id);
        return {
          orderLineId: fl.order_line_id,
          productId: fl.product_id,
          productCode: ol?.product_code ?? 'PRODUCT',
          productName: ol?.product_name ?? 'Product Item',
          quantity: fl.shipped_quantity,
          unitPriceMinor: ol?.unit_price_minor?.toString() ?? '0',
          uomId: fl.uom_id,
        };
      });

      // Emit orders.fulfillment.dispatched.v1 outbox event
      // The next aggregate version per record, under a per-record lock, so a second event for the same fulfillment order
      // (for example a second partial allocation) never collides with the unique key (WI-OI-120c, audit P1-09).
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `gigalibs_orders:outbox:${tenantId}:fulfillment_order:${fulfillmentId}`,
      ]);
      const dispatchEventVersion = await client.query<{ version: number }>(
        `SELECT COALESCE(MAX(aggregate_version), 0)::int + 1 AS version FROM gigalibs_orders.outbox_events
          WHERE tenant_id = $1 AND aggregate_type = 'fulfillment_order' AND aggregate_id = $2`,
        [tenantId, fulfillmentId],
      );
      await client.query(
        `INSERT INTO gigalibs_orders.outbox_events (
          id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version,
          correlation_id, schema_version, payload, status, created_at
        ) VALUES ($1, $2, 'orders.fulfillment', 'orders.fulfillment.dispatched.v1', 'fulfillment_order', $3, $6, $4, 1, $5::jsonb, 'PENDING', NOW())`,
        [
          randomUUID(),
          tenantId,
          fulfillmentId,
          fo.order_id,
          JSON.stringify({
            fulfillmentId,
            orderId: fo.order_id,
            orderNumber: order.order_number,
            customerPartyId: order.customer_party_id,
            currencyCode: order.currency_code,
            issueId: effectiveIssueId,
            lines: dispatchedLines,
            dispatchedAt: res.rows[0].dispatched_at?.toISOString() || new Date().toISOString(),
          }),
          dispatchEventVersion.rows[0]?.version ?? 1,
        ],
      );

      return this.mapFulfillment(res.rows[0], lines.rows);
    });
  }

  async projectArInvoice(
    tenantId: string,
    event: {
      id: string;
      source?: string;
      type: string;
      data: {
        invoiceId: string;
        invoiceNumber: string;
        orderId: string;
        fulfillmentId: string;
        customerPartyId: string;
        totalAmountMinor: string;
        currencyCode: string;
        sealHash: string;
        issuedAt: string;
      };
    },
  ): Promise<{ processed: boolean; duplicate: boolean }> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const messageId = event.id;
      const sha256 = createHash('sha256').update(JSON.stringify(event)).digest('hex');

      // Deduplicate inbox
      const existing = await client.query<{ status: string }>(
        `SELECT status FROM gigalibs_orders.inbox_receipts
         WHERE tenant_id = $1 AND consumer_name = 'orders_ar_invoice_consumer' AND message_id = $2`,
        [tenantId, messageId],
      );
      if (existing.rows.length > 0 && existing.rows[0].status === 'PROCESSED') {
        return { processed: true, duplicate: true };
      }

      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO gigalibs_orders.inbox_receipts (
            id, tenant_id, consumer_name, message_id, event_type, source_module,
            source_version, correlation_id, payload_sha256, status, created_at
          ) VALUES ($1, $2, 'orders_ar_invoice_consumer', $3, $4, 'accounts_receivable', 1, $5, $6, 'PROCESSING', NOW())`,
          [randomUUID(), tenantId, messageId, event.type, event.data.orderId, sha256],
        );
      }

      // Upsert into order_ar_invoice_projections
      await client.query(
        `INSERT INTO gigalibs_orders.order_ar_invoice_projections (
          id, tenant_id, order_id, fulfillment_id, ar_invoice_id, ar_invoice_number,
          total_amount_minor, currency_code, status, seal_hash, issued_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ISSUED', $9, $10, NOW(), NOW())
        ON CONFLICT (tenant_id, order_id, fulfillment_id)
        DO UPDATE SET
          ar_invoice_id = EXCLUDED.ar_invoice_id,
          ar_invoice_number = EXCLUDED.ar_invoice_number,
          total_amount_minor = EXCLUDED.total_amount_minor,
          seal_hash = EXCLUDED.seal_hash,
          updated_at = NOW()`,
        [
          randomUUID(),
          tenantId,
          event.data.orderId,
          event.data.fulfillmentId,
          event.data.invoiceId,
          event.data.invoiceNumber,
          event.data.totalAmountMinor,
          event.data.currencyCode,
          event.data.sealHash,
          event.data.issuedAt,
        ],
      );

      await client.query(
        `UPDATE gigalibs_orders.inbox_receipts
         SET status = 'PROCESSED', processed_at = NOW()
         WHERE tenant_id = $1 AND consumer_name = 'orders_ar_invoice_consumer' AND message_id = $2`,
        [tenantId, messageId],
      );

      return { processed: true, duplicate: false };
    });
  }

  // ─── 5. Customer Invoices (AR) ─────────────────────────────────────────────

  async createCustomerInvoice(
    tenantId: string,
    actorId: string,
    input: CreateCustomerInvoiceInputV1,
  ): Promise<CustomerInvoiceV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const orderRes = await client.query(
        `SELECT * FROM gigalibs_orders.sales_orders WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, input.orderId],
      );
      if (orderRes.rows.length === 0) throw new NotFoundException('Order not found');
      const order = orderRes.rows[0];

      const linesRes = await client.query(
        `SELECT * FROM gigalibs_orders.sales_order_lines
         WHERE tenant_id = $1 AND order_id = $2 ORDER BY line_number ASC FOR UPDATE`,
        [tenantId, input.orderId],
      );

      let subtotal = 0n;
      let taxTotal = 0n;
      let discountTotal = 0n;
      const invoiceLinesToInsert = [];

      for (const oLine of linesRes.rows) {
        const shippedScaled = ExactDecimal.toScaledBigInt(oLine.shipped_quantity);
        const invoicedScaled = ExactDecimal.toScaledBigInt(oLine.invoiced_quantity);
        const billableScaled = shippedScaled - invoicedScaled;

        if (billableScaled <= 0n) continue; // Nothing to bill on this line

        // Invoicing Invariant: Invoiced Quantity <= Shipped Quantity
        const unitPrice = BigInt(oLine.unit_price_minor);
        const rawSubtotal = (billableScaled * unitPrice) / SCALE_FACTOR;
        const lineTax = (rawSubtotal * BigInt(oLine.tax_rate_basis_points)) / 10000n;
        const lineTotal = rawSubtotal + lineTax;

        subtotal += rawSubtotal;
        taxTotal += lineTax;

        invoiceLinesToInsert.push({
          orderLineId: oLine.id,
          productId: oLine.product_id,
          productCode: oLine.product_code,
          productName: oLine.product_name,
          invoicedQuantity: ExactDecimal.fromScaledBigInt(billableScaled),
          uomId: oLine.uom_id,
          unitPriceMinor: oLine.unit_price_minor,
          discountMinor: '0',
          taxRateBasisPoints: oLine.tax_rate_basis_points,
          lineSubtotalMinor: rawSubtotal.toString(),
          lineTaxMinor: lineTax.toString(),
          lineTotalMinor: lineTotal.toString(),
        });
      }

      if (invoiceLinesToInsert.length === 0) {
        throw new BadRequestException('No un-invoiced shipped quantities available to bill on this order');
      }

      const totalAmount = subtotal - discountTotal + taxTotal;
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

      const invRes = await client.query(
        `INSERT INTO gigalibs_orders.customer_invoices (
          tenant_id, invoice_number, order_id, customer_party_id, customer_name,
          currency_code, subtotal_minor, discount_total_minor, tax_total_minor,
          total_amount_minor, status, due_date, issued_by, notes, custom_extensions, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ISSUED', $11, $12, $13, $14, 1)
        RETURNING *`,
        [
          tenantId,
          invoiceNumber,
          order.id,
          order.customer_party_id,
          order.customer_name,
          order.currency_code,
          subtotal.toString(),
          discountTotal.toString(),
          taxTotal.toString(),
          totalAmount.toString(),
          input.dueDate,
          actorId,
          input.notes ?? null,
          JSON.stringify(input.customExtensions ?? {}),
        ],
      );
      const invoice = invRes.rows[0];

      let lineNum = 1;
      for (const line of invoiceLinesToInsert) {
        await client.query(
          `INSERT INTO gigalibs_orders.customer_invoice_lines (
            tenant_id, invoice_id, line_number, order_line_id, product_id, product_code,
            product_name, invoiced_quantity, uom_id, unit_price_minor, discount_minor,
            tax_rate_basis_points, line_subtotal_minor, line_tax_minor, line_total_minor
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            tenantId,
            invoice.id,
            lineNum++,
            line.orderLineId,
            line.productId,
            line.productCode,
            line.productName,
            line.invoicedQuantity,
            line.uomId,
            line.unitPriceMinor,
            line.discountMinor,
            line.taxRateBasisPoints,
            line.lineSubtotalMinor,
            line.lineTaxMinor,
            line.lineTotalMinor,
          ],
        );

        // Update sales order line invoiced_quantity
        await client.query(
          `UPDATE gigalibs_orders.sales_order_lines
           SET invoiced_quantity = invoiced_quantity + $3::numeric, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = $1 AND id = $2`,
          [tenantId, line.orderLineId, line.invoicedQuantity],
        );
      }

      await client.query(
        `INSERT INTO gigalibs_orders.audit_events (
          tenant_id, entity_type, entity_id, action, actor_id, payload
        ) VALUES ($1, 'customer_invoice', $2, 'INVOICE_ISSUED', $3, $4)`,
        [tenantId, invoice.id, actorId, JSON.stringify({ invoiceNumber, totalAmount: totalAmount.toString() })],
      );

      const lines = await client.query(
        `SELECT * FROM gigalibs_orders.customer_invoice_lines WHERE tenant_id = $1 AND invoice_id = $2 ORDER BY line_number ASC`,
        [tenantId, invoice.id],
      );

      return this.mapInvoice(invoice, lines.rows);
    });
  }

  async getCustomerInvoice(tenantId: string, invoiceId: string): Promise<CustomerInvoiceV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM gigalibs_orders.customer_invoices WHERE tenant_id = $1 AND id = $2`,
        [tenantId, invoiceId],
      );
      if (res.rows.length === 0) throw new NotFoundException('Customer invoice not found');
      const lines = await client.query(
        `SELECT * FROM gigalibs_orders.customer_invoice_lines WHERE tenant_id = $1 AND invoice_id = $2 ORDER BY line_number ASC`,
        [tenantId, invoiceId],
      );
      return this.mapInvoice(res.rows[0], lines.rows);
    });
  }

  // ─── 6. Customer Credit Memos ──────────────────────────────────────────────

  async createCreditMemo(
    tenantId: string,
    actorId: string,
    input: CreateCustomerCreditMemoInputV1,
  ): Promise<CustomerCreditMemoV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await requireActiveCustomerParty(client, tenantId, input.customerPartyId);

      let totalAmount = 0n;
      const creditMemoNumber = `CM-${Date.now().toString().slice(-6)}`;

      const processedLines = input.lines.map((line, idx) => {
        const qtyScaled = ExactDecimal.toScaledBigInt(line.quantity);
        const unitPrice = BigInt(line.unitPriceMinor);
        const lineTotal = (qtyScaled * unitPrice) / SCALE_FACTOR;
        totalAmount += lineTotal;
        return {
          ...line,
          lineNumber: idx + 1,
          lineTotalMinor: lineTotal.toString(),
        };
      });

      const cmRes = await client.query(
        `INSERT INTO gigalibs_orders.customer_credit_memos (
          tenant_id, credit_memo_number, invoice_id, order_id, customer_party_id,
          currency_code, total_amount_minor, status, reason, issued_by, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ISSUED', $8, $9, 1) RETURNING *`,
        [
          tenantId,
          creditMemoNumber,
          input.invoiceId ?? null,
          input.orderId ?? null,
          input.customerPartyId,
          input.currencyCode,
          totalAmount.toString(),
          input.reason,
          actorId,
        ],
      );
      const cm = cmRes.rows[0];

      for (const line of processedLines) {
        await client.query(
          `INSERT INTO gigalibs_orders.customer_credit_memo_lines (
            tenant_id, credit_memo_id, line_number, product_id, quantity,
            unit_price_minor, line_total_minor, reason
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            tenantId,
            cm.id,
            line.lineNumber,
            line.productId ?? null,
            line.quantity,
            line.unitPriceMinor,
            line.lineTotalMinor,
            line.reason,
          ],
        );
      }

      await client.query(
        `INSERT INTO gigalibs_orders.audit_events (
          tenant_id, entity_type, entity_id, action, actor_id, payload
        ) VALUES ($1, 'credit_memo', $2, 'CREDIT_MEMO_ISSUED', $3, $4)`,
        [tenantId, cm.id, actorId, JSON.stringify({ creditMemoNumber, totalAmount: totalAmount.toString() })],
      );

      return this.mapCreditMemo(cm, processedLines as any);
    });
  }

  // ─── Mapping Helpers ───────────────────────────────────────────────────────

  private mapQuote(row: any, lines: any[] = []): SalesQuoteV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      quoteNumber: row.quote_number,
      orgUnitId: row.org_unit_id,
      customerPartyId: row.customer_party_id,
      customerName: row.customer_name,
      currencyCode: row.currency_code,
      subtotalMinor: row.subtotal_minor.toString(),
      discountTotalMinor: row.discount_total_minor.toString(),
      taxTotalMinor: row.tax_total_minor.toString(),
      totalAmountMinor: row.total_amount_minor.toString(),
      status: row.status,
      validUntil: new Date(row.valid_until).toISOString(),
      paymentTermDays: row.payment_term_days,
      notes: row.notes,
      convertedOrderId: row.converted_order_id,
      customExtensions: row.custom_extensions ?? {},
      version: row.version,
      lines: lines.map((l) => ({
        id: l.id,
        tenantId: l.tenant_id,
        quoteId: l.quote_id,
        lineNumber: l.line_number,
        productId: l.product_id,
        productCode: l.product_code,
        productName: l.product_name,
        quotedQuantity: l.quoted_quantity.toString(),
        uomId: l.uom_id,
        unitPriceMinor: l.unit_price_minor.toString(),
        discountPercentBasisPoints: l.discount_percent_basis_points,
        lineSubtotalMinor: l.line_subtotal_minor.toString(),
        taxRateBasisPoints: l.tax_rate_basis_points,
        lineTaxMinor: l.line_tax_minor.toString(),
        lineTotalMinor: l.line_total_minor.toString(),
        leadTimeDays: l.lead_time_days,
        customExtensions: l.custom_extensions ?? {},
        createdAt: new Date(l.created_at).toISOString(),
        updatedAt: new Date(l.updated_at).toISOString(),
      })),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    };
  }

  private mapOrder(row: any, lines: any[] = []): SalesOrderV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      orderNumber: row.order_number,
      orgUnitId: row.org_unit_id,
      customerPartyId: row.customer_party_id,
      customerName: row.customer_name,
      orderType: row.order_type,
      currencyCode: row.currency_code,
      subtotalMinor: row.subtotal_minor.toString(),
      discountTotalMinor: row.discount_total_minor.toString(),
      taxTotalMinor: row.tax_total_minor.toString(),
      totalAmountMinor: row.total_amount_minor.toString(),
      warehouseId: row.warehouse_id,
      status: row.status,
      quoteId: row.quote_id,
      customerPoReference: row.customer_po_reference,
      paymentTermDays: row.payment_term_days,
      shippingAddress: row.shipping_address,
      confirmedBy: row.confirmed_by,
      confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
      customExtensions: row.custom_extensions ?? {},
      version: row.version,
      lines: lines.map((l) => ({
        id: l.id,
        tenantId: l.tenant_id,
        orderId: l.order_id,
        lineNumber: l.line_number,
        productId: l.product_id,
        productCode: l.product_code,
        productName: l.product_name,
        orderedQuantity: l.ordered_quantity.toString(),
        allocatedQuantity: l.allocated_quantity.toString(),
        shippedQuantity: l.shipped_quantity.toString(),
        invoicedQuantity: l.invoiced_quantity.toString(),
        uomId: l.uom_id,
        unitPriceMinor: l.unit_price_minor.toString(),
        discountMinor: l.discount_minor.toString(),
        taxRateBasisPoints: l.tax_rate_basis_points,
        lineSubtotalMinor: l.line_subtotal_minor.toString(),
        lineTaxMinor: l.line_tax_minor.toString(),
        lineTotalMinor: l.line_total_minor.toString(),
        warehouseId: l.warehouse_id,
        promisedDate: l.promised_date ? new Date(l.promised_date).toISOString() : null,
        status: l.status,
        customExtensions: l.custom_extensions ?? {},
        createdAt: new Date(l.created_at).toISOString(),
        updatedAt: new Date(l.updated_at).toISOString(),
      })),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    };
  }

  private mapFulfillment(row: any, lines: any[] = []): FulfillmentOrderV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      fulfillmentNumber: row.fulfillment_number,
      orderId: row.order_id,
      warehouseId: row.warehouse_id,
      carrier: row.carrier,
      trackingNumber: row.tracking_number,
      status: row.status,
      dispatchedAt: row.dispatched_at ? new Date(row.dispatched_at).toISOString() : null,
      dispatchedBy: row.dispatched_by,
      deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
      customExtensions: row.custom_extensions ?? {},
      version: row.version,
      lines: lines.map((l) => ({
        id: l.id,
        tenantId: l.tenant_id,
        fulfillmentOrderId: l.fulfillment_order_id,
        orderLineId: l.order_line_id,
        productId: l.product_id,
        shippedQuantity: l.shipped_quantity.toString(),
        uomId: l.uom_id,
        warehouseId: l.warehouse_id,
        lotNumber: l.lot_number,
        serialNumber: l.serial_number,
        customExtensions: l.custom_extensions ?? {},
        createdAt: new Date(l.created_at).toISOString(),
      })),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapInvoice(row: any, lines: any[] = []): CustomerInvoiceV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      invoiceNumber: row.invoice_number,
      orderId: row.order_id,
      customerPartyId: row.customer_party_id,
      customerName: row.customer_name,
      currencyCode: row.currency_code,
      subtotalMinor: row.subtotal_minor.toString(),
      discountTotalMinor: row.discount_total_minor.toString(),
      taxTotalMinor: row.tax_total_minor.toString(),
      totalAmountMinor: row.total_amount_minor.toString(),
      amountPaidMinor: row.amount_paid_minor.toString(),
      status: row.status,
      dueDate: new Date(row.due_date).toISOString(),
      issuedAt: new Date(row.issued_at).toISOString(),
      issuedBy: row.issued_by,
      notes: row.notes,
      customExtensions: row.custom_extensions ?? {},
      version: row.version,
      lines: lines.map((l) => ({
        id: l.id,
        tenantId: l.tenant_id,
        invoiceId: l.invoice_id,
        lineNumber: l.line_number,
        orderLineId: l.order_line_id,
        fulfillmentOrderLineId: l.fulfillment_order_line_id,
        productId: l.product_id,
        productCode: l.product_code,
        productName: l.product_name,
        invoicedQuantity: l.invoiced_quantity.toString(),
        uomId: l.uom_id,
        unitPriceMinor: l.unit_price_minor.toString(),
        discountMinor: l.discount_minor.toString(),
        taxRateBasisPoints: l.tax_rate_basis_points,
        lineSubtotalMinor: l.line_subtotal_minor.toString(),
        lineTaxMinor: l.line_tax_minor.toString(),
        lineTotalMinor: l.line_total_minor.toString(),
        customExtensions: l.custom_extensions ?? {},
        createdAt: new Date(l.created_at).toISOString(),
      })),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapCreditMemo(row: any, lines: any[] = []): CustomerCreditMemoV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      creditMemoNumber: row.credit_memo_number,
      invoiceId: row.invoice_id,
      orderId: row.order_id,
      customerPartyId: row.customer_party_id,
      currencyCode: row.currency_code,
      totalAmountMinor: row.total_amount_minor.toString(),
      status: row.status,
      reason: row.reason,
      issuedAt: new Date(row.issued_at).toISOString(),
      issuedBy: row.issued_by,
      version: row.version,
      lines: lines.map((l) => ({
        id: l.id ?? '00000000-0000-0000-0000-000000000000',
        tenantId: row.tenant_id,
        creditMemoId: row.id,
        lineNumber: l.lineNumber ?? 1,
        productId: l.productId,
        quantity: l.quantity.toString(),
        unitPriceMinor: l.unitPriceMinor.toString(),
        lineTotalMinor: l.lineTotalMinor.toString(),
        reason: l.reason,
        createdAt: new Date().toISOString(),
      })),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
