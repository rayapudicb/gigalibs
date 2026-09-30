import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { type AnalyticsPrincipal, PlatformContextAuthorizationGuard, Principal, RequirePermissions } from '../auth/authorization.js';
import { DashboardService } from './dashboard.service.js';

/** WI-OI-103e: dashboards of saved chart views with shared filters. Reading needs analytics:read. */
@Controller('v1/dashboards')
@UseGuards(PlatformContextAuthorizationGuard)
export class DashboardController {
  constructor(private readonly dashboards: DashboardService) {}

  @Post()
  @RequirePermissions('analytics:dashboards:write')
  @HttpCode(HttpStatus.CREATED)
  create(@Principal() principal: AnalyticsPrincipal, @Body() body: unknown) {
    return this.dashboards.create(principal, body);
  }

  @Get()
  @RequirePermissions('analytics:read')
  list(@Principal() principal: AnalyticsPrincipal) {
    return this.dashboards.list(principal);
  }

  @Get(':dashboardId')
  @RequirePermissions('analytics:read')
  get(@Principal() principal: AnalyticsPrincipal, @Param('dashboardId', ParseUUIDPipe) id: string) {
    return this.dashboards.get(principal, id);
  }

  @Patch(':dashboardId')
  @RequirePermissions('analytics:dashboards:write')
  update(@Principal() principal: AnalyticsPrincipal, @Param('dashboardId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.dashboards.update(principal, id, body);
  }

  /** The viewer's filter values are posted; the call only reads. */
  @Post(':dashboardId/data')
  @RequirePermissions('analytics:read')
  @HttpCode(HttpStatus.OK)
  data(@Principal() principal: AnalyticsPrincipal, @Param('dashboardId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.dashboards.data(principal, id, body);
  }

  @Get(':dashboardId/filter-values/:field')
  @RequirePermissions('analytics:read')
  filterValues(
    @Principal() principal: AnalyticsPrincipal,
    @Param('dashboardId', ParseUUIDPipe) id: string,
    @Param('field') field: string,
  ) {
    return this.dashboards.filterValues(principal, id, field);
  }
}
