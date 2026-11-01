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

/** WI-OI-135 M-TAG: physical tags bound to assets, and resolving a scanned tag to its asset. */
@Controller('v1')
@UseGuards(CmmsAuthorizationGuard)
export class AssetTagsController {
  constructor(private readonly commissioning: CommissioningService) {}

  @Get('asset-tags/resolve')
  @RequirePermissions('cmms.assets.read')
  resolve(@CurrentPrincipal() principal: CmmsPrincipal, @Query('kind') kind?: string, @Query('value') value?: string) {
    return this.commissioning.resolveTag(principal, kind, value);
  }

  @Post('asset-tags/:tagId/retire')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.assets.write')
  retire(@CommandContext() context: CmmsCommandContext, @Param('tagId') tagId: string, @Body() body: unknown) {
    return this.commissioning.retireTag(context, tagId, body);
  }

  @Get('assets/:assetId/tags')
  @RequirePermissions('cmms.assets.read')
  list(@CurrentPrincipal() principal: CmmsPrincipal, @Param('assetId') assetId: string) {
    return this.commissioning.listTags(principal, assetId);
  }

  @Post('assets/:assetId/tags')
  @RequirePermissions('cmms.assets.write')
  bind(@CommandContext() context: CmmsCommandContext, @Param('assetId') assetId: string, @Body() body: unknown) {
    return this.commissioning.bindTag(context, assetId, body);
  }
}
