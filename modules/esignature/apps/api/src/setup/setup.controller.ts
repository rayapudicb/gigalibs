import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  type EsignPrincipal,
  OidcAuthorizationGuard,
  Principal,
  RequirePermissions,
} from '../auth/authorization.js';
import { SetupService } from './setup.service.js';

@Controller('v1/setup')
@UseGuards(OidcAuthorizationGuard)
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('status')
  @RequirePermissions('esign:read')
  async getStatus(@Principal() principal: EsignPrincipal) {
    return this.setupService.getStatus(principal.tenantId);
  }

  @Post()
  @RequirePermissions('esign:create')
  async setup(@Principal() principal: EsignPrincipal) {
    return this.setupService.setupTenant(principal.tenantId, principal);
  }
}
