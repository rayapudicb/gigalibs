import { Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { type AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { SetupService } from './setup.service.js';

@Controller('v1/setup')
@UseGuards(OidcAuthorizationGuard)
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get()
  @RequirePermissions('currency:read')
  async getStatus(@Req() request: AuthenticatedRequest) {
    const tenantId = request.principal!.tenantId;
    return this.setupService.getStatus(tenantId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('currency:admin')
  async setupTenant(@Req() request: AuthenticatedRequest) {
    const principal = request.principal!;
    const correlationId = request.headers['x-correlation-id']?.toString();
    return this.setupService.setupTenant(principal.tenantId, principal, correlationId);
  }
}
