import type { RelayRequest } from '@gigalibs/module-sdk';
import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { FinanceReturnsInboxGuard } from '../relay/returns-inbox.guard.js';
import { ReturnsInboxService } from './returns-inbox.service.js';

@Controller('internal/v1/returns-inbox')
@UseGuards(FinanceReturnsInboxGuard)
export class FinanceReturnsInboxController {
  constructor(private readonly inbox: ReturnsInboxService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  receive(@Req() request: RelayRequest, @Body() body: unknown) {
    return this.inbox.receive(body, request.rawBody!.toString('utf8'));
  }
}
