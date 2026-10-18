import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { FinanceRelayInboxGuard, type RelayRequest } from '../relay/inbox.guard.js';
import { InventorySubledgerInboxService } from './inventory-inbox.service.js';

@Controller('internal/v1/inbox')
@UseGuards(FinanceRelayInboxGuard)
export class FinanceInventoryInboxController {
  constructor(private readonly inbox: InventorySubledgerInboxService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  receive(@Req() request: RelayRequest, @Body() body: unknown) {
    return this.inbox.receive(body, request.rawBody!.toString('utf8'));
  }
}
