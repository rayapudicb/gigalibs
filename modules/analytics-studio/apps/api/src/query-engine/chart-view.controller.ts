import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { type AnalyticsPrincipal, PlatformContextAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { CurrentPrincipal } from '../auth/principal.decorator.js';
import { ChartViewService } from './chart-view.service.js';

// WI-OI-103d: saved chart views (a question plus a chart type; never data).
@Controller('v1/chart-views')
@UseGuards(PlatformContextAuthorizationGuard)
export class ChartViewController {
  constructor(private readonly views: ChartViewService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('analytics:charts:write')
  create(@CurrentPrincipal() principal: AnalyticsPrincipal, @Body() body: unknown) {
    return this.views.create(principal, body);
  }

  @Get()
  @RequirePermissions('analytics:read')
  list(@CurrentPrincipal() principal: AnalyticsPrincipal) {
    return this.views.list(principal);
  }

  @Get(':id')
  @RequirePermissions('analytics:read')
  get(@CurrentPrincipal() principal: AnalyticsPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.views.get(principal, id);
  }

  @Get(':id/data')
  @RequirePermissions('analytics:read')
  data(@CurrentPrincipal() principal: AnalyticsPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.views.data(principal, id);
  }
}
