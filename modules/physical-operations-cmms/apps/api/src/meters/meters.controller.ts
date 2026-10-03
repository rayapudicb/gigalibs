import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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

  // ─── Telemetry Batch Ingestion ──────────────────────────────────────────────

  @Post('telemetry/batch')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.meters.write')
  recordBatch(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.meters.recordBatchReadings(context, body);
  }

  // ─── Meter Triggers (Condition-based Automation) ─────────────────────────────

  @Get('triggers')
  @RequirePermissions('cmms.meters.read')
  listTriggers(@CurrentPrincipal() principal: CmmsPrincipal, @Query('meterId') meterId?: string) {
    return this.meters.listTriggers(principal, meterId);
  }

  @Post('triggers')
  @RequirePermissions('cmms.meters.write')
  createTrigger(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.meters.createTrigger(context, body);
  }

  @Patch('triggers/:triggerId')
  @RequirePermissions('cmms.meters.write')
  updateTrigger(@CommandContext() context: CmmsCommandContext, @Param('triggerId') triggerId: string, @Body() body: unknown) {
    return this.meters.updateTrigger(context, triggerId, body);
  }

  @Delete('triggers/:triggerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('cmms.meters.write')
  deleteTrigger(@CommandContext() context: CmmsCommandContext, @Param('triggerId') triggerId: string) {
    return this.meters.deleteTrigger(context, triggerId);
  }

  // ─── Single Meter Readings ──────────────────────────────────────────────────

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
