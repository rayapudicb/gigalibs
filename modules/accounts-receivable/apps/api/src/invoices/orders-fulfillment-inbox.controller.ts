import { OrdersFulfillmentDispatchedV1Schema, RelayEnvelopeV1Schema } from '@gigalibs/contracts';
import type { RelayRequest } from '@gigalibs/module-sdk';
import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AR_PLATFORM_CONTEXT_ISSUER } from '../config.module-sdk.js';
import { InvoicesService } from './invoices.service.js';
import { OrdersFulfillmentInboxGuard } from './orders-fulfillment-inbox.guard.js';

@Controller('internal/v1/orders-fulfillments')
@UseGuards(OrdersFulfillmentInboxGuard)
export class OrdersFulfillmentInboxController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async receive(@Req() request: RelayRequest, @Body() raw: unknown): Promise<object> {
    if (!request.relayClaims) throw new BadRequestException({ code: 'FULFILLMENT_RELAY_REQUIRED' });
    const parsed = RelayEnvelopeV1Schema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException({ code: 'FULFILLMENT_ENVELOPE_INVALID' });
    const envelope = parsed.data;
    const payload = OrdersFulfillmentDispatchedV1Schema.safeParse(envelope.payload);
    if (envelope.eventType !== 'orders.fulfillment.dispatched.v1' ||
        envelope.aggregateType !== 'fulfillment_order' || envelope.aggregateVersion !== 1 ||
        envelope.schemaVersion !== 1 || !z.uuid().safeParse(envelope.tenantId).success ||
        !payload.success || envelope.aggregateId !== payload.data.fulfillmentId) {
      throw new BadRequestException({ code: 'FULFILLMENT_EVENT_UNSUPPORTED' });
    }
    const result = await this.invoices.issueInvoiceFromFulfillment(
      { tenantId: envelope.tenantId, subject: 'orders-relay', issuer: AR_PLATFORM_CONTEXT_ISSUER, permissions: [] },
      payload.data,
      envelope.correlationId,
      envelope.messageId,
    );
    return { status: result.duplicate ? 'DUPLICATE' : 'PROCESSED', ...result };
  }
}
