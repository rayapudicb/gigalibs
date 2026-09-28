import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { type AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { parseInput, rateInputSchema } from '../validation.js';
import { RatesService } from './rates.service.js';

@Controller('api/tax/v1/rates')
@UseGuards(OidcAuthorizationGuard)
export class RatesController {
  constructor(private readonly service: RatesService) {}

  @Get()
  @RequirePermissions('tax.rates.read')
  async list(@Req() request: AuthenticatedRequest) {
    if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
    return { data: await this.service.list(request.principal.tenantId) };
  }

  @Post()
  @RequirePermissions('tax.rates.write')
  async create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
    const input = parseInput(rateInputSchema, body);
    return { data: await this.service.create(request.principal.tenantId, request.principal.subject, input) };
  }
}
