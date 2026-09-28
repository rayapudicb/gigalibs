import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { AssetsService } from './assets.service.js';

@Controller('v1/assets')
@UseGuards(CmmsAuthorizationGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.assets.read')
  search(@CurrentPrincipal() principal: CmmsPrincipal, @Body() body: unknown) {
    return this.assets.search(principal, body);
  }

  @Get(':assetId')
  @RequirePermissions('cmms.assets.read')
  get(@CurrentPrincipal() principal: CmmsPrincipal, @Param('assetId') assetId: string) {
    return this.assets.get(principal, assetId);
  }

  @Post()
  @RequirePermissions('cmms.assets.write')
  create(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.assets.create(context, body);
  }

  @Patch(':assetId')
  @RequirePermissions('cmms.assets.write')
  update(@CommandContext() context: CmmsCommandContext, @Param('assetId') assetId: string, @Body() body: unknown) {
    return this.assets.update(context, assetId, body);
  }

  @Post(':assetId/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.assets.write')
  archive(@CommandContext() context: CmmsCommandContext, @Param('assetId') assetId: string, @Body() body: unknown) {
    return this.assets.archive(context, assetId, body);
  }
}
