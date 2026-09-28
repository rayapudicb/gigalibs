import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { type AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { type HedgingContract, HedgingService } from './hedging.service.js';

@Controller('v1')
@UseGuards(OidcAuthorizationGuard)
export class HedgingController {
  constructor(private readonly service: HedgingService) {}

  @Get('hedging')
  @RequirePermissions('currency:read')
  async getHedging(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ data: HedgingContract[] }> {
    const tenantId = request.principal!.tenantId;
    const data = await this.service.getHedgingContracts(tenantId);
    return { data };
  }
}
