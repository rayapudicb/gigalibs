import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { type AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { type RevaluationReport, RevaluationService } from './revaluation.service.js';

@Controller('v1')
@UseGuards(OidcAuthorizationGuard)
export class RevaluationController {
  constructor(private readonly service: RevaluationService) {}

  @Get('revaluation')
  @RequirePermissions('currency:read')
  async getRevaluation(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ data: RevaluationReport }> {
    const tenantId = request.principal!.tenantId;
    const data = await this.service.getRevaluationReport(tenantId);
    return { data };
  }
}
