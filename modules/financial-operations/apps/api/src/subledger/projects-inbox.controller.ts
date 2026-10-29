import type { RelayRequest } from '@gigalibs/module-sdk';
import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { FinanceProjectsInboxGuard } from '../relay/projects-inbox.guard.js';
import { ProjectsInboxService } from './projects-inbox.service.js';

@Controller('internal/v1/projects-inbox')
@UseGuards(FinanceProjectsInboxGuard)
export class FinanceProjectsInboxController {
  constructor(private readonly inbox: ProjectsInboxService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  receive(@Req() request: RelayRequest, @Body() body: unknown) {
    return this.inbox.receive(body, request.rawBody!.toString('utf8'));
  }
}
