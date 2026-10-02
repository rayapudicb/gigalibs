import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  GigaOpsAuthorizationGuard,
  RequireRoles,
  type AuthenticatedGigaOpsRequest,
} from '../auth/authorization.js';
import { WfoComplianceService } from './wfo-compliance.service.js';

@Controller('wfo/compliance')
@UseGuards(GigaOpsAuthorizationGuard)
export class WfoComplianceController {
  constructor(private readonly complianceService: WfoComplianceService) {}

  @Get('dashboard')
  async getDashboard(@Req() req: AuthenticatedGigaOpsRequest) {
    return this.complianceService.getSummary(req.principal!);
  }

  @Get('audit-report')
  async getAuditReport(@Req() req: AuthenticatedGigaOpsRequest) {
    return this.complianceService.getAuditReport(req.principal!);
  }

  @Get('verify-queue')
  @RequireRoles('TENANT_ADMIN', 'SCHEDULER')
  async getVerificationQueue(@Req() req: AuthenticatedGigaOpsRequest) {
    return this.complianceService.getVerificationQueue(req.principal!);
  }
}
