import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Headers, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import {
  type AnalyticsPrincipal,
  PlatformContextAuthorizationGuard,
  PlatformPrincipal,
  RequirePermissions,
} from '../auth/authorization.js';
import { PlaceAnalyticsService } from './place-analytics.service.js';

@Controller('v1/places')
@UseGuards(PlatformContextAuthorizationGuard)
export class PlaceAnalyticsController {
  constructor(private readonly places: PlaceAnalyticsService) {}

  /** WI-OI-105e: the places this member may see, for place pickers and the place map. */
  @Get('directory')
  @RequirePermissions('analytics:read')
  directory(@PlatformPrincipal() principal: AnalyticsPrincipal, @Query() query: unknown) {
    return this.places.directory(principal, query);
  }

  @Get('drilldown')
  @RequirePermissions('analytics:read')
  drilldown(@PlatformPrincipal() principal: AnalyticsPrincipal, @Query() query: unknown) {
    return this.places.drilldown(principal, query);
  }

  @Post('metric-drilldown')
  @HttpCode(200)
  @RequirePermissions('analytics:read')
  metricDrilldown(@PlatformPrincipal() principal: AnalyticsPrincipal, @Body() body: unknown) {
    return this.places.metricDrilldown(principal, body);
  }

  @Post('rollups/rebuild')
  @HttpCode(200)
  @RequirePermissions('analytics:action')
  rebuild(
    @PlatformPrincipal() principal: AnalyticsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.places.rebuildRollups(principal, body, safeCorrelationId(correlationId));
  }
}

function safeCorrelationId(value: string | undefined): string {
  return value && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : randomUUID();
}
