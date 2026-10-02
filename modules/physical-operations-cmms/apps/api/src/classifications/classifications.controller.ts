import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { ClassificationsService } from './classifications.service.js';

@Controller('v1')
@UseGuards(CmmsAuthorizationGuard)
export class ClassificationsController {
  constructor(private readonly service: ClassificationsService) {}

  @Get('classifications/tree')
  @RequirePermissions('cmms.assets.read')
  async listTree(@CurrentPrincipal() principal: CmmsPrincipal) {
    const items = await this.service.listTree(principal);
    return { items };
  }

  @Get('classifications/:id')
  @RequirePermissions('cmms.assets.read')
  async get(@CurrentPrincipal() principal: CmmsPrincipal, @Param('id') id: string) {
    return this.service.get(principal, id);
  }

  @Post('classifications')
  @RequirePermissions('cmms.assets.write')
  async create(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.service.create(context, body);
  }

  @Patch('classifications/:id')
  @RequirePermissions('cmms.assets.write')
  async update(
    @CommandContext() context: CmmsCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(context, id, body);
  }

  @Delete('classifications/:id')
  @RequirePermissions('cmms.assets.write')
  async delete(@CommandContext() context: CmmsCommandContext, @Param('id') id: string) {
    return this.service.delete(context, id);
  }

  @Get('classifications/:id/spec-definitions')
  @RequirePermissions('cmms.assets.read')
  async listSpecDefs(@CurrentPrincipal() principal: CmmsPrincipal, @Param('id') id: string) {
    const items = await this.service.listSpecDefinitions(principal, id);
    return { items };
  }

  @Post('classifications/spec-definitions')
  @RequirePermissions('cmms.assets.write')
  async createSpecDef(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.service.createSpecDefinition(context, body);
  }

  @Get('assets/:id/specs')
  @RequirePermissions('cmms.assets.read')
  async getAssetSpecs(@CurrentPrincipal() principal: CmmsPrincipal, @Param('id') assetId: string) {
    const items = await this.service.getAssetSpecs(principal, assetId);
    return { items };
  }

  @Put('assets/:id/specs')
  @RequirePermissions('cmms.assets.write')
  async setAssetSpecs(
    @CommandContext() context: CmmsCommandContext,
    @Param('id') assetId: string,
    @Body() body: unknown,
  ) {
    const items = await this.service.setAssetSpecs(context, assetId, body);
    return { items };
  }

  @Get('assets/:id/equipment-tree')
  @RequirePermissions('cmms.assets.read')
  async getEquipmentTree(
    @CurrentPrincipal() principal: CmmsPrincipal,
    @Param('id') assetId: string,
  ) {
    return this.service.getEquipmentTree(principal, assetId);
  }

  @Post('assets/:id/cascade-status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.assets.write')
  async cascadeStatus(
    @CommandContext() context: CmmsCommandContext,
    @Param('id') assetId: string,
    @Body() body: { targetStatus: string; reason: string },
  ) {
    return this.service.cascadeStatus(context, assetId, body.targetStatus, body.reason);
  }
}
