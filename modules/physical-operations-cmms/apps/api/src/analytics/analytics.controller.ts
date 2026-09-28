import { Controller, Get, UseGuards } from '@nestjs/common';
import { CmmsAuthorizationGuard, CurrentPrincipal, RequirePermissions, type CmmsPrincipal } from '../auth/authorization.js';
import { AnalyticsService } from './analytics.service.js';

@Controller('v1/analytics')
@UseGuards(CmmsAuthorizationGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('work-orders/overview')
  @RequirePermissions('cmms.analytics.read')
  workOrders(@CurrentPrincipal() principal: CmmsPrincipal) {
    return this.analytics.workOrderOverview(principal);
  }

  @Get('inventory/summary')
  @RequirePermissions('cmms.analytics.read')
  inventory(@CurrentPrincipal() principal: CmmsPrincipal) {
    return this.analytics.inventorySummary(principal);
  }
}
