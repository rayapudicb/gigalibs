import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, RequirePermissions, type IotPrincipal } from '../auth/authorization.js';
import { IotAuthorizationGuard } from '../auth/authorization.js';
import { AlertsService } from './alerts.service.js';

@Controller('v1/alerts')
@UseGuards(IotAuthorizationGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  @RequirePermissions('iot.alerts.read')
  list(@CurrentPrincipal() principal: IotPrincipal, @Query('status') status?: string) {
    return this.alerts.list(principal, status);
  }

  @Get(':alertId')
  @RequirePermissions('iot.alerts.read')
  get(@CurrentPrincipal() principal: IotPrincipal, @Param('alertId') alertId: string) {
    return this.alerts.get(principal, alertId);
  }
}
