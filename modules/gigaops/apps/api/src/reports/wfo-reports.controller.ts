import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  GigaOpsAuthorizationGuard,
  type AuthenticatedGigaOpsRequest,
} from '../auth/authorization.js';
import { WfoReportsService } from './wfo-reports.service.js';

@Controller('wfo/reports')
@UseGuards(GigaOpsAuthorizationGuard)
export class WfoReportsController {
  constructor(private readonly reportsService: WfoReportsService) {}

  @Get('staffing')
  async getStaffingReport(@Req() req: AuthenticatedGigaOpsRequest) {
    return this.reportsService.getStaffingReport(req.principal!);
  }

  @Get('time-labour')
  async getTimeLabourReport(@Req() req: AuthenticatedGigaOpsRequest) {
    return this.reportsService.getTimeLabourReport(req.principal!);
  }

  @Get('payroll-summary')
  async getPayrollSummaryReport(@Req() req: AuthenticatedGigaOpsRequest) {
    return this.reportsService.getPayrollSummaryReport(req.principal!);
  }

  @Get('compliance-status')
  async getComplianceStatusReport(@Req() req: AuthenticatedGigaOpsRequest) {
    return this.reportsService.getComplianceStatusReport(req.principal!);
  }

  @Get('expenses')
  async getExpenseReport(@Req() req: AuthenticatedGigaOpsRequest) {
    return this.reportsService.getExpenseReport(req.principal!);
  }

  @Get('utilisation')
  async getUtilisationReport(@Req() req: AuthenticatedGigaOpsRequest) {
    return this.reportsService.getUtilisationReport(req.principal!);
  }

  @Get('absenteeism')
  async getAbsenteeismReport(@Req() req: AuthenticatedGigaOpsRequest) {
    return this.reportsService.getAbsenteeismReport(req.principal!);
  }
}
