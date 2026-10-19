import {
  Controller,
  Get,
  Headers,
  Inject,
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
import { requireIdempotencyKey } from '../database/persistence-helpers.js';
import { DeliveriesService, type DeliveryResponse } from './deliveries.service.js';

interface PassthroughResponse {
  status(code: number): void;
  setHeader(name: string, value: string): void;
}

// Raw Express / Fastify response for PDF streaming
interface RawResponse {
  status(code: number): RawResponse;
  setHeader(name: string, value: string): void;
  end(buffer: Buffer): void;
}

@Controller('v1/invoices')
@UseGuards(ArAuthorizationGuard)
export class DeliveriesController {
  constructor(@Inject(DeliveriesService) private readonly deliveries: DeliveriesService) {}

  // POST /v1/invoices/:invoiceId/deliver
  // Renders the PDF (if not already cached), sends to customer email, records delivery.
  // Idempotent on Idempotency-Key header.
  @Post(':invoiceId/deliver')
  @RequirePermissions('ar.invoices.deliver')
  async deliver(
    @Param('invoiceId') invoiceId: string,
    @Headers('idempotency-key') idempotencyHeader: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<DeliveryResponse> {
    const principal = requirePrincipal(request);
    const idempotencyKey = requireIdempotencyKey(idempotencyHeader);
    const correlationId = request.correlationId ?? 'unavailable';
    const result = await this.deliveries.deliver(invoiceId, principal, idempotencyKey, correlationId);
    response.status(result.replayed ? 200 : result.status);
    response.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.body;
  }

  // GET /v1/invoices/:invoiceId/deliveries
  // Returns all delivery attempts for the invoice, newest first.
  @Get(':invoiceId/deliveries')
  @RequirePermissions('ar.invoices.read')
  listDeliveries(
    @Param('invoiceId') invoiceId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ items: DeliveryResponse[] }> {
    return this.deliveries.list(invoiceId, requirePrincipal(request));
  }

  // GET /v1/invoices/:invoiceId/pdf
  // Streams the latest rendered PDF for the invoice.
  // Returns 404 if the invoice has never been rendered.
  @Get(':invoiceId/pdf')
  @RequirePermissions('ar.invoices.read')
  async streamPdf(
    @Param('invoiceId') invoiceId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: RawResponse,
  ): Promise<void> {
    const { filename, bytes } = await this.deliveries.streamPdf(invoiceId, requirePrincipal(request));
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    response.setHeader('Content-Length', String(bytes.byteLength));
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.status(200).end(bytes);
  }

  // GET /v1/invoices/:invoiceId/download-url
  // Returns presigned temporary download URL or stream URL for the invoice PDF.
  @Get(':invoiceId/download-url')
  @RequirePermissions('ar.invoices.read')
  async downloadUrl(
    @Param('invoiceId') invoiceId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ downloadUrl: string; expiresAt?: string; filename: string }> {
    return this.deliveries.getDownloadUrl(invoiceId, requirePrincipal(request));
  }
}

function requirePrincipal(request: AuthenticatedRequest): ArPrincipal {
  if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
  return request.principal;
}
