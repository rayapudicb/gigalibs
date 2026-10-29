import {
  RMA_CREDIT_MEMO_REQUESTED_V1,
  RmaCreditMemoRequestedPayloadV1Schema,
  RelayEnvelopeV1Schema,
} from '@gigalibs/contracts';
import type { RelayRequest } from '@gigalibs/module-sdk';
import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { OrderService } from '../orders/orders.service.js';
import { OrdersReturnsRmaInboxGuard } from './returns-rma-inbox.guard.js';

@Controller('internal/v1/returns-rma-inbox')
@UseGuards(OrdersReturnsRmaInboxGuard)
export class OrdersReturnsRmaInboxController {
  constructor(private readonly orders: OrderService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async receive(@Req() request: RelayRequest, @Body() raw: unknown): Promise<object> {
    if (!request.relayClaims) throw new BadRequestException({ code: 'RETURNS_RMA_RELAY_REQUIRED' });
    const envelope = RelayEnvelopeV1Schema.parse(raw);
    if (envelope.eventType !== RMA_CREDIT_MEMO_REQUESTED_V1 || envelope.aggregateType !== 'rma') {
      throw new BadRequestException({ code: 'RETURNS_RMA_EVENT_UNSUPPORTED' });
    }
    const payload = RmaCreditMemoRequestedPayloadV1Schema.parse(envelope.payload);
    if (envelope.aggregateId !== payload.rmaId) {
      throw new BadRequestException({ code: 'RETURNS_RMA_AGGREGATE_MISMATCH' });
    }
    const result = await this.orders.applyRmaCreditMemoFromRelay(envelope, request.rawBody!.toString('utf8'), payload);
    return { status: result.duplicate ? 'DUPLICATE' : 'PROCESSED', creditMemoId: result.creditMemoId };
  }
}
