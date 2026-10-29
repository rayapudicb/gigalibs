import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, RequirePermissions, type IotPrincipal } from '../auth/authorization.js';
import { IotAuthorizationGuard } from '../auth/authorization.js';
import { DashboardService } from './dashboard.service.js';

@Controller('v1/dashboard')
@UseGuards(IotAuthorizationGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @RequirePermissions('iot.dashboard.read')
  summary(@CurrentPrincipal() principal: IotPrincipal) {
    return this.dashboard.summary(principal);
  }
}
