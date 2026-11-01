import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { CommissioningService } from './commissioning.service.js';

/** WI-OI-135 M-TAG: field commissioning requests and their four-eyes decision. */
@Controller('v1/commissioning')
@UseGuards(CmmsAuthorizationGuard)
export class CommissioningController {
  constructor(private readonly commissioning: CommissioningService) {}

  @Get('context')
  @RequirePermissions('cmms.commissioning.read')
  context(@CurrentPrincipal() principal: CmmsPrincipal) {
    return this.commissioning.context(principal);
  }

  @Get('requests')
  @RequirePermissions('cmms.commissioning.read')
  search(@CurrentPrincipal() principal: CmmsPrincipal, @Query() query: Record<string, string>) {
    return this.commissioning.search(principal, query);
  }

  @Post('requests')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.commissioning.submit')
  submit(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.commissioning.submit(context, body);
  }

  @Get('requests/:requestId')
  @RequirePermissions('cmms.commissioning.read')
  get(@CurrentPrincipal() principal: CmmsPrincipal, @Param('requestId') requestId: string) {
    return this.commissioning.get(principal, requestId);
  }

  @Post('requests/:requestId/decision')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.commissioning.approve')
  decide(@CommandContext() context: CmmsCommandContext, @Param('requestId') requestId: string, @Body() body: unknown) {
    return this.commissioning.decide(context, requestId, body);
  }
}
