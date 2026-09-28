import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { MetersService } from './meters.service.js';

@Controller('v1/meters')
@UseGuards(CmmsAuthorizationGuard)
export class MetersController {
  constructor(private readonly meters: MetersService) {}

  @Get()
  @RequirePermissions('cmms.meters.read')
  list(@CurrentPrincipal() principal: CmmsPrincipal, @Query('assetId') assetId?: string) {
    return this.meters.list(principal, assetId);
  }

  @Post()
  @RequirePermissions('cmms.meters.write')
  create(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.meters.create(context, body);
  }

  @Get(':meterId/readings')
  @RequirePermissions('cmms.meters.read')
  readings(@CurrentPrincipal() principal: CmmsPrincipal, @Param('meterId') meterId: string) {
    return this.meters.readings(principal, meterId);
  }

  @Post(':meterId/readings')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.meters.write')
  record(@CommandContext() context: CmmsCommandContext, @Param('meterId') meterId: string, @Body() body: unknown) {
    return this.meters.recordReading(context, meterId, body);
  }
}
