import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type ArPrincipal,
  type AuthenticatedRequest,
  ArAuthorizationGuard,
  RequirePermissions,
} from '../auth/authorization.js';
import {
  type CheckoutSessionResponse,
  type PaymentResponse,
  type VoidResponse,
  PaymentsService,
} from './payments.service.js';

interface PassthroughResponse {
  status(code: number): void;
}

@Controller('v1/invoices')
@UseGuards(ArAuthorizationGuard)
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  // POST /v1/invoices/:invoiceId/payments
  // Record a payment against an issued invoice.
  @Post(':invoiceId/payments')
  @RequirePermissions('ar.invoices.pay')
  async recordPayment(
    @Param('invoiceId') invoiceId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<PaymentResponse> {
    const result = await this.payments.record(
      invoiceId,
      body,
      requirePrincipal(request),
      request.correlationId ?? 'unavailable',
    );
    response.status(201);
    return result;
  }

  // POST /v1/invoices/:invoiceId/checkout-session
  // Create a hosted payment checkout session (Stripe / Adyen).
  @Post(':invoiceId/checkout-session')
  @RequirePermissions('ar.invoices.pay')
  async createCheckoutSession(
    @Param('invoiceId') invoiceId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<CheckoutSessionResponse> {
    const result = await this.payments.createCheckoutSession(
      invoiceId,
      body,
      requirePrincipal(request),
      request.correlationId ?? 'unavailable',
    );
    response.status(201);
    return result;
  }

  // GET /v1/invoices/:invoiceId/payments
  // List all payments recorded against an invoice.
  @Get(':invoiceId/payments')
  @RequirePermissions('ar.invoices.read')
  listPayments(
    @Param('invoiceId') invoiceId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ items: PaymentResponse[] }> {
    return this.payments.list(invoiceId, requirePrincipal(request));
  }

  // POST /v1/invoices/:invoiceId/void
  // Void an issued invoice.  Idempotent if already voided (returns existing record).
  @Post(':invoiceId/void')
  @RequirePermissions('ar.invoices.void')
  async voidInvoice(
    @Param('invoiceId') invoiceId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<VoidResponse> {
    const result = await this.payments.voidInvoice(
      invoiceId,
      body,
      requirePrincipal(request),
      request.correlationId ?? 'unavailable',
    );
    response.status(201);
    return result;
  }

  // GET /v1/invoices/:invoiceId/void
  // Get the void record for an invoice (404 if not voided).
  @Get(':invoiceId/void')
  @RequirePermissions('ar.invoices.read')
  async getVoid(
    @Param('invoiceId') invoiceId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<VoidResponse> {
    const result = await this.payments.getVoid(invoiceId, requirePrincipal(request));
    if (!result) throw new NotFoundException('This invoice has not been voided.');
    return result;
  }
}

function requirePrincipal(request: AuthenticatedRequest): ArPrincipal {
  if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
  return request.principal;
}
