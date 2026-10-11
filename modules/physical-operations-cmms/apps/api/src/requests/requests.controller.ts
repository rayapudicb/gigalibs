import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { RequestsService } from './requests.service.js';

@Controller('v1/requests')
@UseGuards(CmmsAuthorizationGuard)
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.requests.read')
  search(@CurrentPrincipal() principal: CmmsPrincipal, @Body() body: unknown) {
    return this.requests.search(principal, body);
  }

  @Get(':requestId')
  @RequirePermissions('cmms.requests.read')
  get(@CurrentPrincipal() principal: CmmsPrincipal, @Param('requestId') requestId: string) {
    return this.requests.get(principal, requestId);
  }

  @Post()
  @RequirePermissions('cmms.requests.create')
  submit(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.requests.submit(context, body);
  }

  @Post(':requestId/triage')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.requests.write')
  triage(
    @CommandContext() context: CmmsCommandContext,
    @Param('requestId') requestId: string,
    @Body() body: unknown,
  ) {
    return this.requests.triage(context, requestId, body);
  }

  @Post(':requestId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.requests.create')
  cancel(
    @CommandContext() context: CmmsCommandContext,
    @Param('requestId') requestId: string,
    @Body() body: unknown,
  ) {
    return this.requests.cancel(context, requestId, body);
  }
}
