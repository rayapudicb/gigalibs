import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { FinanceInventoryInboxService } from './finance-inbox.service.js';
import { InventoryRelayInboxGuard, type RelayRequest } from './inbox.guard.js';

@Controller('internal/v1/inbox')
@UseGuards(InventoryRelayInboxGuard)
export class FinanceInventoryInboxController {
  constructor(private readonly inbox: FinanceInventoryInboxService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  receive(@Req() request: RelayRequest, @Body() body: unknown) {
    return this.inbox.receive(body, request.rawBody!.toString('utf8'));
  }
}
