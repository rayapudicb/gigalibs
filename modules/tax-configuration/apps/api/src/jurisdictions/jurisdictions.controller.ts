import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  type AuthenticatedRequest,
  OidcAuthorizationGuard,
  RequirePermissions,
} from '../auth/authorization.js';
import { jurisdictionInputSchema, parseInput } from '../validation.js';
import { JurisdictionsService } from './jurisdictions.service.js';

@Controller('api/tax/v1/jurisdictions')
@UseGuards(OidcAuthorizationGuard)
export class JurisdictionsController {
  constructor(private readonly service: JurisdictionsService) {}

  @Get()
  @RequirePermissions('tax.jurisdictions.read')
  async list(@Req() request: AuthenticatedRequest) {
    if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
    return { data: await this.service.list(request.principal.tenantId) };
  }

  @Post()
  @RequirePermissions('tax.jurisdictions.write')
  async create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
    const input = parseInput(jurisdictionInputSchema, body);
    return { data: await this.service.create(
      request.principal.tenantId,
      request.principal.subject,
      input,
    ) };
  }
}
