import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { EamSpacesService } from './spaces.service.js';

@Controller('v1/spaces')
@UseGuards(CmmsAuthorizationGuard)
export class EamSpacesController {
  constructor(private readonly spaces: EamSpacesService) {}

  @Get('tree')
  @RequirePermissions('cmms.assets.read')
  tree(@CurrentPrincipal() principal: CmmsPrincipal) {
    return this.spaces.tree(principal);
  }

  @Get(':spaceId')
  @RequirePermissions('cmms.assets.read')
  get(@CurrentPrincipal() principal: CmmsPrincipal, @Param('spaceId') spaceId: string) {
    return this.spaces.get(principal, spaceId);
  }

  @Get(':spaceId/assets')
  @RequirePermissions('cmms.assets.read')
  getAssetsInSpace(@CurrentPrincipal() principal: CmmsPrincipal, @Param('spaceId') spaceId: string) {
    return this.spaces.getAssetsInSpace(principal, spaceId);
  }

  @Post()
  @RequirePermissions('cmms.assets.write')
  create(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.spaces.create(context, body);
  }

  @Patch(':spaceId')
  @RequirePermissions('cmms.assets.write')
  update(@CommandContext() context: CmmsCommandContext, @Param('spaceId') spaceId: string, @Body() body: unknown) {
    return this.spaces.update(context, spaceId, body);
  }

  @Delete(':spaceId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.assets.write')
  delete(@CommandContext() context: CmmsCommandContext, @Param('spaceId') spaceId: string) {
    return this.spaces.delete(context, spaceId);
  }

  @Post(':spaceId/cad-layers')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.assets.write')
  uploadCadLayer(@CommandContext() context: CmmsCommandContext, @Param('spaceId') spaceId: string, @Body() body: unknown) {
    return this.spaces.uploadCadLayer(context, spaceId, body);
  }
}
