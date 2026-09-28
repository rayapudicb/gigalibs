import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { PmSchedulesService } from './pm-schedules.service.js';

@Controller('v1/pm-schedules')
@UseGuards(CmmsAuthorizationGuard)
export class PmSchedulesController {
  constructor(private readonly schedules: PmSchedulesService) {}

  @Get()
  @RequirePermissions('cmms.pm.read')
  list(@CurrentPrincipal() principal: CmmsPrincipal, @Query('assetId') assetId?: string) {
    return this.schedules.list(principal, assetId);
  }

  @Get(':scheduleId')
  @RequirePermissions('cmms.pm.read')
  get(@CurrentPrincipal() principal: CmmsPrincipal, @Param('scheduleId') scheduleId: string) {
    return this.schedules.get(principal, scheduleId);
  }

  @Post()
  @RequirePermissions('cmms.pm.write')
  create(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.schedules.create(context, body);
  }

  @Patch(':scheduleId')
  @RequirePermissions('cmms.pm.write')
  update(@CommandContext() context: CmmsCommandContext, @Param('scheduleId') scheduleId: string, @Body() body: unknown) {
    return this.schedules.update(context, scheduleId, body);
  }

  /** Generates the due occurrence's work order; needs PM and work-order write permission. */
  @Post(':scheduleId/generate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.pm.write', 'cmms.work-orders.write')
  generate(@CommandContext() context: CmmsCommandContext, @Param('scheduleId') scheduleId: string, @Body() body: unknown) {
    return this.schedules.generate(context, scheduleId, body);
  }
}
