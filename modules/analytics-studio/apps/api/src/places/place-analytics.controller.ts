import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Headers, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import {
  type AnalyticsPrincipal,
  PlatformContextAuthorizationGuard,
  PlatformPrincipal,
  RequirePermissions,
} from '../auth/authorization.js';
import { DemoLabService } from './demo-lab.service.js';
import { PlaceAnalyticsService } from './place-analytics.service.js';

@Controller('v1/places')
@UseGuards(PlatformContextAuthorizationGuard)
export class PlaceAnalyticsController {
  constructor(private readonly places: PlaceAnalyticsService) {}

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

/** WI-OI-064e: synthetic data for Demo Lab tenants; the BFF only routes here for tenants with `demo-lab`. */
@Controller('v1/demo-lab')
@UseGuards(PlatformContextAuthorizationGuard)
export class DemoLabController {
  constructor(private readonly demoLab: DemoLabService) {}

  @Get('dataset')
  @RequirePermissions('analytics:read')
  status(@PlatformPrincipal() principal: AnalyticsPrincipal) {
    return this.demoLab.status(principal);
  }

  @Post('generate')
  @HttpCode(200)
  @RequirePermissions('analytics:action')
  generate(
    @PlatformPrincipal() principal: AnalyticsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.demoLab.generate(principal, body, safeCorrelationId(correlationId));
  }

  @Post('reset')
  @HttpCode(200)
  @RequirePermissions('analytics:action')
  reset(@PlatformPrincipal() principal: AnalyticsPrincipal, @Headers('x-correlation-id') correlationId: string | undefined) {
    return this.demoLab.reset(principal, safeCorrelationId(correlationId));
  }
}

function safeCorrelationId(value: string | undefined): string {
  return value && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : randomUUID();
}
