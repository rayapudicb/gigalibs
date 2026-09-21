import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { AnalyticsService } from './analytics.service.js';

@Controller('v1/analytics')
@UseGuards(OidcAuthorizationGuard)
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @Get('work-orders/overview')
  @RequirePermissions('cmms.analytics.read')
  getWorkOrderOverview(@Req() req: AuthenticatedRequest) {
    const departmentIds = req.principal!.departmentScope.mode === 'SCOPED_DEPARTMENTS'
      ? req.principal!.departmentScope.departmentIds : undefined;
    return this.svc.getWorkOrderOverview(req.principal!.tenantId, departmentIds);
  }

  @Get('assets/reliability')
  @RequirePermissions('cmms.analytics.read')
  getAssetReliability(@Req() req: AuthenticatedRequest) {
    const departmentIds = req.principal!.departmentScope.mode === 'SCOPED_DEPARTMENTS'
      ? req.principal!.departmentScope.departmentIds : undefined;
    return this.svc.getAssetReliability(req.principal!.tenantId, departmentIds);
  }

  @Get('inventory/summary')
  @RequirePermissions('cmms.analytics.read')
  getInventorySummary(@Req() req: AuthenticatedRequest) {
    const departmentIds = req.principal!.departmentScope.mode === 'SCOPED_DEPARTMENTS'
      ? req.principal!.departmentScope.departmentIds : undefined;
    return this.svc.getInventorySummary(req.principal!.tenantId, departmentIds);
  }
}
