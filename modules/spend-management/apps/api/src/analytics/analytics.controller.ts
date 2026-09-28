import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  AuthenticatedRequest,
  OidcAuthorizationGuard,
  RequirePermissions,
} from '../auth/authorization.js';
import { AnalyticsService } from './analytics.service.js';

@Controller('v1/analytics')
@UseGuards(OidcAuthorizationGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('metrics')
  @RequirePermissions('spend.analytics.read')
  async getMetrics(@Req() req: AuthenticatedRequest) {
    const tenantId = req.principal!.tenantId;
    return this.analyticsService.getExecutiveMetrics(tenantId);
  }
}
