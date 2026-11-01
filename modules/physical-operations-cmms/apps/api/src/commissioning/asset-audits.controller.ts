import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { AssetAuditsService } from './asset-audits.service.js';

/** WI-OI-135 M-TAG: floor-walk audits of the asset register. */
@Controller('v1/asset-audits')
@UseGuards(CmmsAuthorizationGuard)
export class AssetAuditsController {
  constructor(private readonly audits: AssetAuditsService) {}

  @Get()
  @RequirePermissions('cmms.audits.read')
  list(@CurrentPrincipal() principal: CmmsPrincipal) {
    return this.audits.list(principal);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.audits.execute')
  start(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.audits.start(context, body);
  }

  @Post(':walkId/sightings')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.audits.execute')
  record(@CommandContext() context: CmmsCommandContext, @Param('walkId') walkId: string, @Body() body: unknown) {
    return this.audits.record(context, walkId, body);
  }

  @Post(':walkId/finish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.audits.execute')
  finish(@CommandContext() context: CmmsCommandContext, @Param('walkId') walkId: string) {
    return this.audits.finish(context, walkId);
  }

  @Get(':walkId/report')
  @RequirePermissions('cmms.audits.read')
  report(@CurrentPrincipal() principal: CmmsPrincipal, @Param('walkId') walkId: string) {
    return this.audits.report(principal, walkId);
  }
}
