import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { type AnalyticsPrincipal, PlatformContextAuthorizationGuard, Principal, RequirePermissions } from '../auth/authorization.js';
import { InspectionTrendService } from './inspection-trend.service.js';

@Controller('v1/rounds/trend')
@UseGuards(PlatformContextAuthorizationGuard)
export class InspectionTrendController {
  constructor(private readonly trends:InspectionTrendService) {}

  @Get()
  @RequirePermissions('analytics:read')
  get(@Principal() principal:AnalyticsPrincipal,@Query() query:unknown) {
    return this.trends.get(principal,query);
  }
}
