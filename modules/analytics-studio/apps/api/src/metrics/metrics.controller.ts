import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  type AnalyticsPrincipal,
  PlatformContextAuthorizationGuard,
  Principal,
  RequirePermissions,
} from '../auth/authorization.js';
import { MetricsService } from './metrics.service.js';
import { TelemetryService } from './telemetry.service.js';

@Controller('v1/metrics')
@UseGuards(PlatformContextAuthorizationGuard)
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly telemetryService: TelemetryService,
  ) {}

  @Get('summary')
  @RequirePermissions('analytics:read')
  async getSummary(@Principal() principal: AnalyticsPrincipal) {
    return this.metricsService.getExecutiveSummary(principal.tenantId);
  }

  @Get('timeseries')
  @RequirePermissions('analytics:read')
  async getTimeSeries(@Principal() principal: AnalyticsPrincipal) {
    return this.metricsService.getTimeSeries(principal.tenantId);
  }

  @Get('lineage/:metricKey')
  @RequirePermissions('analytics:read')
  async getLineage(
    @Principal() principal: AnalyticsPrincipal,
    @Param('metricKey') metricKey: string,
  ) {
    return this.metricsService.getLineageProof(principal.tenantId, metricKey);
  }

  @Get('charts')
  @RequirePermissions('analytics:read')
  async getCharts(@Principal() principal: AnalyticsPrincipal) {
    return this.telemetryService.getTelemetryCharts(principal.tenantId);
  }

  @Get('charts/:chartId')
  @RequirePermissions('analytics:read')
  async getChartById(
    @Principal() principal: AnalyticsPrincipal,
    @Param('chartId') chartId: string,
  ) {
    return this.telemetryService.getTelemetryChartById(principal.tenantId, chartId);
  }
}

