import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, RequirePermissions, type IotPrincipal } from '../auth/authorization.js';
import { IotAuthorizationGuard } from '../auth/authorization.js';
import { DashboardService } from '../dashboard/dashboard.service.js';

@Controller('v1/protocols')
@UseGuards(IotAuthorizationGuard)
export class ProtocolsController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequirePermissions('iot.protocols.read')
  async list(@CurrentPrincipal() principal: IotPrincipal) {
    const summary = await this.dashboard.summary(principal);
    return { adapters: summary.protocolAdapters };
  }
}
