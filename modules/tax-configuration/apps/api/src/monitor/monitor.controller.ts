import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { type AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { MonitorService } from './monitor.service.js';

@Controller('api/tax/v1/nexus-status')
@UseGuards(OidcAuthorizationGuard)
export class MonitorController {
  constructor(private readonly service: MonitorService) {}

  @Get()
  @RequirePermissions('tax.monitor.read')
  async getStatus(@Req() request: AuthenticatedRequest) {
    if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
    return { data: await this.service.getNexusStatus(request.principal.tenantId) };
  }
}
