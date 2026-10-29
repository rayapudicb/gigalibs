import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { DowntimesService } from './downtimes.service.js';

@Controller('v1/assets/:assetId/downtime')
@UseGuards(CmmsAuthorizationGuard)
export class DowntimesController {
  constructor(private readonly downtimes: DowntimesService) {}

  @Get()
  @RequirePermissions('cmms.assets.read')
  list(@CurrentPrincipal() principal: CmmsPrincipal, @Param('assetId') assetId: string) {
    return this.downtimes.list(principal, assetId);
  }

  @Post('start')
  @RequirePermissions('cmms.assets.write')
  start(@CommandContext() context: CmmsCommandContext, @Param('assetId') assetId: string, @Body() body: unknown) {
    return this.downtimes.start(context, assetId, body);
  }

  @Post('end')
  @RequirePermissions('cmms.assets.write')
  end(@CommandContext() context: CmmsCommandContext, @Param('assetId') assetId: string, @Body() body: unknown) {
    return this.downtimes.end(context, assetId, body);
  }
}
