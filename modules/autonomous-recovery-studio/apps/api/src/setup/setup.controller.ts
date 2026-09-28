import { Controller, Get, Post, Headers, UseGuards } from '@nestjs/common';
import { SetupService } from './setup.service.js';
import {
  OidcAuthorizationGuard,
  Principal,
  type RecoveryPrincipal,
  RequirePermissions,
} from '../auth/authorization.js';

@Controller('v1/setup')
@UseGuards(OidcAuthorizationGuard)
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get()
  @RequirePermissions('recovery:read')
  async getStatus(@Principal() principal: RecoveryPrincipal) {
    return this.setupService.getStatus(principal.tenantId);
  }

  @Post()
  @RequirePermissions('recovery:*')
  async setup(
    @Principal() principal: RecoveryPrincipal,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.setupService.setupTenant(principal.tenantId, principal, correlationId);
  }
}
