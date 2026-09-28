import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  CurrentWorkforcePrincipal,
  GigaOpsAuthorizationGuard,
  type GigaOpsPrincipal,
  RequirePermissions,
} from '../auth/authorization.js';
import { WorkforceDatabaseService } from '../database/database.service.js';

@Controller('v1/runtime')
@UseGuards(GigaOpsAuthorizationGuard)
export class WorkforceRuntimeController {
  constructor(private readonly database: WorkforceDatabaseService) {}

  @Get('tenant-scope')
  @RequirePermissions('workforce:read')
  async getTenantScope(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal) {
    const tenantId = await this.database.currentTenantScope(principal.tenantId);
    return {
      status: 'ready',
      service: 'gigalibs-workforce-api',
      tenantId,
      orgScope: principal.orgScope,
      businessCapabilitiesEnabled: true,
      enabledCapabilities: ['resources', 'capability-definitions', 'resource-qualifications'],
    };
  }
}
