import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { type AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { type CurrencyPair, PairsService } from './pairs.service.js';

@Controller('v1')
@UseGuards(OidcAuthorizationGuard)
export class PairsController {
  constructor(private readonly service: PairsService) {}

  @Get('pairs')
  @RequirePermissions('currency:read')
  async getPairs(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ data: CurrencyPair[] }> {
    const tenantId = request.principal!.tenantId;
    const data = await this.service.getPairs(tenantId);
    return { data };
  }
}
