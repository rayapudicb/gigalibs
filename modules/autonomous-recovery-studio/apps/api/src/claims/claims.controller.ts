import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  OidcAuthorizationGuard,
  Principal,
  type RecoveryPrincipal,
  RequirePermissions,
} from '../auth/authorization.js';
import { ClaimsService } from './claims.service.js';

@Controller('v1/claims')
@UseGuards(OidcAuthorizationGuard)
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  @Get()
  @RequirePermissions('recovery:read')
  async getClaims(@Principal() principal: RecoveryPrincipal) {
    return this.claimsService.getClaims(principal.tenantId);
  }

  @Post()
  @RequirePermissions('recovery:action')
  async createClaim(
    @Principal() principal: RecoveryPrincipal,
    @Body()
    body: {
      leakId: string;
      vendorName: string;
      vendorContactEmail: string;
      claimAmountUsd: number;
      settlementType: string;
      evidencePayload: unknown;
    },
  ) {
    return this.claimsService.createClaim(principal.tenantId, body, principal);
  }

  @Patch(':id/status')
  @RequirePermissions('recovery:action')
  async updateStatus(
    @Principal() principal: RecoveryPrincipal,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.claimsService.updateClaimStatus(principal.tenantId, id, body.status, principal);
  }
}
