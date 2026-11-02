import {
  CommandContext,
  CurrentPrincipal,
  type ModuleCommandContext,
  type ModulePrincipal,
  RequirePermissions,
} from '@gigalibs/module-sdk';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { HazardsService } from './hazards.service.js';

/** WI-OI-141 M-INC (ADR-0036): hazard reports, triage, stop-work alerts and investigations. */
@Controller('v1')
@UseGuards(AuthorizationGuard)
export class HazardsController {
  constructor(private readonly hazards: HazardsService) {}

  @Post('hazards')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('safety-operations.hazards.report')
  report(@CommandContext() context: ModuleCommandContext, @Body() body: unknown) {
    return this.hazards.report(context, body);
  }

  @Get('hazards/mine')
  @RequirePermissions('safety-operations.hazards.report')
  mine(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.hazards.mine(principal);
  }

  @Get('hazards')
  @RequirePermissions('safety-operations.hazards.read')
  list(@CurrentPrincipal() principal: ModulePrincipal, @Query() query: Record<string, string>) {
    return this.hazards.list(principal, { status: query.status, severity: query.severity });
  }

  @Get('hazards/insights')
  @RequirePermissions('safety-operations.hazards.read')
  insights(@CurrentPrincipal() principal: ModulePrincipal, @Query('days') days?: string) {
    return this.hazards.insights(principal, Number(days) || 90);
  }

  @Get('hazards/:reportId')
  @RequirePermissions('safety-operations.hazards.report')
  get(@CurrentPrincipal() principal: ModulePrincipal, @Param('reportId') reportId: string) {
    return this.hazards.get(principal, reportId);
  }

  @Get('hazards/:reportId/photo')
  @RequirePermissions('safety-operations.hazards.report')
  photo(@CurrentPrincipal() principal: ModulePrincipal, @Param('reportId') reportId: string) {
    return this.hazards.photo(principal, reportId);
  }

  @Post('hazards/:reportId/triage')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('safety-operations.hazards.triage')
  triage(@CommandContext() context: ModuleCommandContext, @Param('reportId') reportId: string, @Body() body: unknown) {
    return this.hazards.triage(context, reportId, body);
  }

  @Post('hazards/:reportId/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('safety-operations.hazards.triage')
  close(@CommandContext() context: ModuleCommandContext, @Param('reportId') reportId: string, @Body() body: unknown) {
    return this.hazards.close(context, reportId, body);
  }

  @Post('hazards/:reportId/investigation')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('safety-operations.investigations.manage')
  investigate(@CommandContext() context: ModuleCommandContext, @Param('reportId') reportId: string, @Body() body: unknown) {
    return this.hazards.saveInvestigation(context, reportId, body);
  }

  @Get('stop-work')
  @RequirePermissions('safety-operations.hazards.report')
  openAlerts(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.hazards.openAlerts(principal);
  }

  @Post('stop-work/:alertId/acknowledge')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('safety-operations.stop-work.acknowledge')
  acknowledge(@CommandContext() context: ModuleCommandContext, @Param('alertId') alertId: string) {
    return this.hazards.acknowledge(context, alertId);
  }

  @Post('stop-work/:alertId/lift')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('safety-operations.stop-work.lift')
  lift(@CommandContext() context: ModuleCommandContext, @Param('alertId') alertId: string, @Body() body: unknown) {
    return this.hazards.lift(context, alertId, body);
  }
}
