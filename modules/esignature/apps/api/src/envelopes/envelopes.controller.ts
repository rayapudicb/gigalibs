import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  type EsignPrincipal,
  OidcAuthorizationGuard,
  Principal,
  RequirePermissions,
} from '../auth/authorization.js';
import { type CreateEnvelopeDto, EnvelopesService } from './envelopes.service.js';

@Controller('v1/envelopes')
@UseGuards(OidcAuthorizationGuard)
export class EnvelopesController {
  constructor(private readonly envelopesService: EnvelopesService) {}

  @Get()
  @RequirePermissions('esign:read')
  async listEnvelopes(
    @Principal() principal: EsignPrincipal,
    @Query('status') status?: string,
  ) {
    return this.envelopesService.listEnvelopes(principal.tenantId, status);
  }

  @Get(':id')
  @RequirePermissions('esign:read')
  async getEnvelope(
    @Principal() principal: EsignPrincipal,
    @Param('id') envelopeId: string,
  ) {
    return this.envelopesService.getEnvelope(principal.tenantId, envelopeId);
  }

  @Post()
  @RequirePermissions('esign:create')
  async createEnvelope(
    @Principal() principal: EsignPrincipal,
    @Body() dto: CreateEnvelopeDto,
  ) {
    return this.envelopesService.createEnvelope(principal.tenantId, dto, principal);
  }

  @Post(':id/send')
  @RequirePermissions('esign:create')
  async sendEnvelope(
    @Principal() principal: EsignPrincipal,
    @Param('id') envelopeId: string,
  ) {
    return this.envelopesService.sendEnvelope(principal.tenantId, envelopeId, principal);
  }
}
