import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  GigaOpsAuthorizationGuard,
  RequireRoles,
  type AuthenticatedGigaOpsRequest,
} from '../auth/authorization.js';
import { WfoPayrollAdminService } from './wfo-payroll-admin.service.js';

@Controller('wfo/payroll')
@UseGuards(GigaOpsAuthorizationGuard)
export class WfoPayrollAdminController {
  constructor(private readonly payrollAdminService: WfoPayrollAdminService) {}

  @Get('grid')
  @RequireRoles('tenant_admin', 'workforce_admin', 'payroll_admin')
  async getGrid(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('periodStart') periodStart?: string,
  ) {
    const period = periodStart || new Date().toISOString().split('T')[0];
    return this.payrollAdminService.getPeriodGrid(req.principal!, period);
  }

  @Post('erp-gl-batch')
  @RequireRoles('tenant_admin', 'workforce_admin', 'payroll_admin')
  async generateGlBatch(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('periodStart') periodStart?: string,
  ) {
    const period = periodStart || new Date().toISOString().split('T')[0];
    return this.payrollAdminService.generateGlJournalBatch(req.principal!, period);
  }
}
