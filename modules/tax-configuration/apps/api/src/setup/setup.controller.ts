import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  type AuthenticatedRequest,
  OidcAuthorizationGuard,
  RequirePermissions,
} from '../auth/authorization.js';
import { SetupService } from './setup.service.js';

@Controller('v1/setup')
@UseGuards(OidcAuthorizationGuard)
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Get()
  @RequirePermissions('tax.settings.manage')
  status(@Req() request: AuthenticatedRequest) {
    if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
    return this.setup.status(request.principal);
  }

  @Post()
  @RequirePermissions('tax.settings.manage')
  configure(@Req() request: AuthenticatedRequest) {
    if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
    return this.setup.configure(request.principal);
  }
}
