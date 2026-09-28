import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { type AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { exemptionInputSchema, exemptionVerificationSchema, parseInput } from '../validation.js';
import { ExemptionsService } from './exemptions.service.js';

@Controller('api/tax/v1/exemptions')
@UseGuards(OidcAuthorizationGuard)
export class ExemptionsController {
  constructor(private readonly service: ExemptionsService) {}

  @Get()
  @RequirePermissions('tax.exemptions.read')
  async list(@Req() request: AuthenticatedRequest) {
    if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
    return { data: await this.service.list(request.principal.tenantId) };
  }

  @Post()
  @RequirePermissions('tax.exemptions.write')
  async create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
    const input = parseInput(exemptionInputSchema, body);
    return { data: await this.service.create(request.principal.tenantId, request.principal.subject, input) };
  }

  @Post(':certificateId/verify')
  @RequirePermissions('tax.exemptions.verify')
  async verify(
    @Param('certificateId') certificateId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
    const input = parseInput(exemptionVerificationSchema, body);
    return { data: await this.service.verify(
      request.principal.tenantId,
      request.principal.subject,
      certificateId,
      input.verificationReference,
    ) };
  }
}
