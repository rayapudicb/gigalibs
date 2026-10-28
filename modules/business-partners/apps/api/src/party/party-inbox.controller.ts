import type { RelayRequest } from '@gigalibs/module-sdk';
import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { PartyInboxGuard } from './party-inbox.guard.js';
import { PartyInboxService } from './party-inbox.service.js';

/** Only a body-bound, kernel-signed relay token can deliver canonical Party facts. */
@Controller('internal/v1/party-inbox')
@UseGuards(PartyInboxGuard)
export class PartyInboxController {
  constructor(private readonly inbox: PartyInboxService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  receive(@Req() request: RelayRequest, @Body() body: unknown) {
    return this.inbox.receive(body, request.rawBody!.toString('utf8'));
  }
}
