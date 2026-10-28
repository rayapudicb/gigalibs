import type { RelayRequest } from '@gigalibs/module-sdk';
import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { CreditInboxGuard } from './credit-inbox.guard.js';
import { CreditInboxService } from './credit-inbox.service.js';

@Controller('internal/v1/credit-inbox')
@UseGuards(CreditInboxGuard)
export class CreditInboxController {
  constructor(private readonly inbox: CreditInboxService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  receive(@Req() request: RelayRequest, @Body() body: unknown) {
    return this.inbox.receive(body, request.rawBody!.toString('utf8'));
  }
}
