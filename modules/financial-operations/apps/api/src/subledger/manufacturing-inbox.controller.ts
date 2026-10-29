import type { RelayRequest } from '@gigalibs/module-sdk';
import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { FinanceManufacturingInboxGuard } from '../relay/manufacturing-inbox.guard.js';
import { InventorySubledgerInboxService } from './inventory-inbox.service.js';

@Controller('internal/v1/manufacturing-inbox')
@UseGuards(FinanceManufacturingInboxGuard)
export class FinanceManufacturingInboxController {
  constructor(private readonly inbox: InventorySubledgerInboxService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  receive(@Req() request: RelayRequest, @Body() body: unknown) {
    return this.inbox.receive(body, request.rawBody!.toString('utf8'), 'manufacturing');
  }
}
