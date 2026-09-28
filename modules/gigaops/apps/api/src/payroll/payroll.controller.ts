import {
  Body,
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
import {
  type CreatePayPeriodDto,
  PayrollService,
} from './payroll.service.js';

@Controller('pay-periods')
@UseGuards(GigaOpsAuthorizationGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get()
  list(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('workUnitId') workUnitId?: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.payrollService.listPayPeriods(tenantId, workUnitId);
  }

  @Post()
  @RequireRoles('payroll_admin', 'org_admin')
  create(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Body() dto: CreatePayPeriodDto,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.payrollService.createPayPeriod(tenantId, dto);
  }

  @Get(':id/records')
  getRecords(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.payrollService.getRecords(tenantId, id);
  }

  @Post(':id/calculate')
  @RequireRoles('payroll_admin', 'org_admin')
  calculate(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.payrollService.calculate(tenantId, id);
  }

  @Post(':id/approve')
  @RequireRoles('payroll_admin', 'org_admin')
  approve(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal!.tenantId;
    const approverId = req.principal!.subject;
    return this.payrollService.approve(tenantId, id, approverId);
  }

  @Post(':id/export')
  @RequireRoles('payroll_admin', 'org_admin')
  export(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal!.tenantId;
    const exporterId = req.principal!.subject;
    return this.payrollService.export(tenantId, id, exporterId);
  }
}
