import {
  AllocateOrderLineInputV1Schema,
  CreateCustomerCreditMemoInputV1Schema,
  CreateCustomerInvoiceInputV1Schema,
  CreateFulfillmentOrderInputV1Schema,
  CreateSalesOrderInputV1Schema,
  CreateSalesQuoteInputV1Schema,
} from '@gigalibs/contracts';
import { CurrentPrincipal, type ModulePrincipal, RequirePermissions } from '@gigalibs/module-sdk';
import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { DatabaseService } from '../database.service.js';
import { OrderService } from './orders.service.js';

@Controller('v1')
@UseGuards(AuthorizationGuard)
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly database: DatabaseService,
  ) {}

  // ─── Quotations ────────────────────────────────────────────────────────────

  @Get('quotes')
  @RequirePermissions('orders:read')
  async listQuotes(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM gigalibs_orders.sales_quotes WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [principal.tenantId],
      );
      return res.rows;
    });
  }

  @Get('quotes/:id')
  @RequirePermissions('orders:read')
  async getQuote(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.orderService.getQuote(principal.tenantId, id);
  }

  @Post('quotes')
  @RequirePermissions('orders:quotes:manage')
  async createQuote(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown) {
    const parsed = CreateSalesQuoteInputV1Schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.message);
    return this.orderService.createQuote(principal.tenantId, principal.subject, parsed.data);
  }

  @Post('quotes/:id/accept')
  @RequirePermissions('orders:quotes:approve')
  async acceptQuote(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.orderService.acceptQuote(principal.tenantId, principal.subject, id);
  }

  @Post('quotes/:id/convert')
  @RequirePermissions('orders:quotes:manage')
  async convertQuote(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: { warehouseId: string },
  ) {
    if (!body?.warehouseId) throw new BadRequestException('warehouseId is required to convert quote');
    return this.orderService.convertQuoteToOrder(principal.tenantId, principal.subject, id, body.warehouseId);
  }

  // ─── Sales Orders ──────────────────────────────────────────────────────────

  @Get('orders')
  @RequirePermissions('orders:read')
  async listOrders(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM gigalibs_orders.sales_orders WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [principal.tenantId],
      );
      return res.rows;
    });
  }

  @Get('orders/:id')
  @RequirePermissions('orders:read')
  async getOrder(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.orderService.getOrder(principal.tenantId, id);
  }

  @Post('orders')
  @RequirePermissions('orders:manage')
  async createOrder(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown) {
    const parsed = CreateSalesOrderInputV1Schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.message);
    return this.orderService.createOrder(principal.tenantId, principal.subject, parsed.data);
  }

  @Post('orders/:id/confirm')
  @RequirePermissions('orders:confirm')
  async confirmOrder(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.orderService.confirmOrder(principal.tenantId, principal.subject, id);
  }

  @Post('orders/:id/cancel')
  @RequirePermissions('orders:manage')
  async cancelOrder(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query(
        `UPDATE gigalibs_orders.sales_orders
         SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP, updated_by = $3
         WHERE tenant_id = $1 AND id = $2 AND status IN ('DRAFT', 'SUBMITTED')
         RETURNING *`,
        [principal.tenantId, id, principal.subject],
      );
      if (res.rows.length === 0) throw new BadRequestException('Cannot cancel order; not in DRAFT or SUBMITTED state');
      return res.rows[0];
    });
  }

  @Post('orders/:id/allocate')
  @RequirePermissions('orders:allocate')
  async allocateOrder(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = AllocateOrderLineInputV1Schema.safeParse({ ...(body as any), orderId: id });
    if (!parsed.success) throw new BadRequestException(parsed.error.message);
    return this.orderService.allocateOrderLine(principal.tenantId, principal.subject, parsed.data);
  }

  // ─── Fulfillments ──────────────────────────────────────────────────────────

  @Get('fulfillments')
  @RequirePermissions('orders:read')
  async listFulfillments(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM gigalibs_orders.fulfillment_orders WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [principal.tenantId],
      );
      return res.rows;
    });
  }

  @Get('fulfillments/:id')
  @RequirePermissions('orders:read')
  async getFulfillment(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.orderService.getFulfillment(principal.tenantId, id);
  }

  @Post('fulfillments')
  @RequirePermissions('orders:fulfill')
  async createFulfillment(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown) {
    const parsed = CreateFulfillmentOrderInputV1Schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.message);
    return this.orderService.createFulfillment(principal.tenantId, principal.subject, parsed.data);
  }

  @Post('fulfillments/:id/dispatch')
  @RequirePermissions('orders:fulfill')
  async dispatchFulfillment(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body?: { issueId?: string },
  ) {
    return this.orderService.dispatchFulfillment(principal.tenantId, principal.subject, id, body?.issueId);
  }

  @Post('inbox/invoices')
  @RequirePermissions('orders:read')
  async ingestArInvoice(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: any,
  ) {
    return this.orderService.projectArInvoice(principal.tenantId, body);
  }

  @Get('orders/:id/ar-invoice')
  @RequirePermissions('orders:read')
  async getOrderArInvoice(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM gigalibs_orders.order_ar_invoice_projections WHERE tenant_id = $1 AND order_id = $2`,
        [principal.tenantId, id],
      );
      return res.rows[0] ?? null;
    });
  }

  // ─── Customer Invoices (AR) ────────────────────────────────────────────────

  @Get('invoices')
  @RequirePermissions('orders:read')
  async listInvoices(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM gigalibs_orders.customer_invoices WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [principal.tenantId],
      );
      return res.rows;
    });
  }

  @Get('invoices/:id')
  @RequirePermissions('orders:read')
  async getInvoice(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.orderService.getCustomerInvoice(principal.tenantId, id);
  }

  @Post('invoices')
  @RequirePermissions('orders:invoices:manage')
  async createInvoice(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown) {
    const parsed = CreateCustomerInvoiceInputV1Schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.message);
    return this.orderService.createCustomerInvoice(principal.tenantId, principal.subject, parsed.data);
  }

  // ─── Credit Memos ──────────────────────────────────────────────────────────

  @Get('credit-memos')
  @RequirePermissions('orders:read')
  async listCreditMemos(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM gigalibs_orders.customer_credit_memos WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [principal.tenantId],
      );
      return res.rows;
    });
  }

  @Post('credit-memos')
  @RequirePermissions('orders:credit-memos:manage')
  async createCreditMemo(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown) {
    const parsed = CreateCustomerCreditMemoInputV1Schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.message);
    return this.orderService.createCreditMemo(principal.tenantId, principal.subject, parsed.data);
  }

  // ─── Returns (RMA) ─────────────────────────────────────────────────────────

  @Get('returns')
  @RequirePermissions('orders:read')
  async listReturns(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM gigalibs_orders.customer_returns WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [principal.tenantId],
      );
      return res.rows;
    });
  }
}
