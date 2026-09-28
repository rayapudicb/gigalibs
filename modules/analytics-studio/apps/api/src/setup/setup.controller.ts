import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  type AnalyticsPrincipal,
  PlatformContextAuthorizationGuard,
  Principal,
  RequirePermissions,
} from '../auth/authorization.js';
import { SetupService } from './setup.service.js';

@Controller('v1/setup')
@UseGuards(PlatformContextAuthorizationGuard)
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('status')
  @RequirePermissions('analytics:read')
  async getStatus(@Principal() principal: AnalyticsPrincipal) {
    return this.setupService.getStatus(principal.tenantId);
  }

  @Post()
  @RequirePermissions('analytics:action')
  async setup(@Principal() principal: AnalyticsPrincipal) {
    return this.setupService.setupTenant(principal.tenantId, principal);
  }
}
