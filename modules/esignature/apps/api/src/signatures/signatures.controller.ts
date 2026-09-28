import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  type EsignPrincipal,
  OidcAuthorizationGuard,
  Principal,
  RequirePermissions,
} from '../auth/authorization.js';
import { type SignEnvelopeDto, SignaturesService } from './signatures.service.js';

@Controller('v1/signatures')
@UseGuards(OidcAuthorizationGuard)
export class SignaturesController {
  constructor(private readonly signaturesService: SignaturesService) {}

  @Post(':envelopeId/sign')
  @RequirePermissions('esign:sign')
  async sign(
    @Principal() principal: EsignPrincipal,
    @Param('envelopeId') envelopeId: string,
    @Body() dto: SignEnvelopeDto,
  ) {
    return this.signaturesService.signEnvelope(principal.tenantId, envelopeId, dto, principal);
  }

  @Get(':envelopeId/certificate')
  @RequirePermissions('esign:read')
  async getCertificate(
    @Principal() principal: EsignPrincipal,
    @Param('envelopeId') envelopeId: string,
  ) {
    return this.signaturesService.getCertificate(principal.tenantId, envelopeId);
  }
}
