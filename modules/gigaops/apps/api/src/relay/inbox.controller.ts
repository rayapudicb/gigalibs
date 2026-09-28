import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { type RelayRequest, RelayInboxGuard } from './relay-inbox.guard.js';
import { WorkforceInboxService } from './inbox.service.js';

/**
 * Internal inbox for CMMS relay deliveries (ADR-0007 option A). Not routed by the web BFF and not reachable
 * with a user context. 202 means the message is receipted (processed, a duplicate, or a recorded refusal).
 */
@Controller('internal/v1/inbox')
@UseGuards(RelayInboxGuard)
export class WorkforceInboxController {
  constructor(private readonly inbox: WorkforceInboxService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  receive(@Req() request: RelayRequest, @Body() body: unknown) {
    return this.inbox.receive(body, request.rawBody!.toString('utf8'));
  }
}
