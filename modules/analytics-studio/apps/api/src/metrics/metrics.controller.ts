import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  type AnalyticsPrincipal,
  PlatformContextAuthorizationGuard,
  Principal,
  RequirePermissions,
} from '../auth/authorization.js';
import { MetricsService } from './metrics.service.js';

// WI-OI-103d d6: the stored-payload chart routes (`charts`, `charts/:chartId`) are retired; charts are chart views.
@Controller('v1/metrics')
@UseGuards(PlatformContextAuthorizationGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

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
}

