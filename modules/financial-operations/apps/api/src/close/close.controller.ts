import {
  SetSubledgerLockInputV1Schema,
  UpdateChecklistTaskInputV1Schema,
  CreateAccrualAmortizationScheduleInputV1Schema,
  ExecuteAmortizationLineInputV1Schema,
  PreviewYearEndCloseInputV1Schema,
  ExecuteYearEndCloseInputV1Schema,
  CreateForecastModelInputV1Schema,
  GenerateForecastInputV1Schema,
  QueryDrillThroughInputV1Schema,
} from '@gigalibs/contracts';
import {
  CurrentPrincipal,
  type ModulePrincipal,
  RequirePermissions,
} from '@gigalibs/module-sdk';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { CloseService } from './close.service.js';

function parse<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  body: unknown,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BadRequestException(
      `Validation error: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim(),
    );
  }
  return parsed.data;
}

@Controller('v1/close')
@UseGuards(AuthorizationGuard)
export class CloseController {
  constructor(private readonly closeService: CloseService) {}

  // ─── 1. Subledger Lockouts ───────────────────────────────────────────────────

  @Get('subledgers')
  @RequirePermissions('finance:read')
  async getSubledgerLocks(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('accountingBookId') bookId: string,
    @Query('fiscalPeriodId') periodId: string,
  ) {
    if (!bookId || !periodId) {
      throw new BadRequestException('accountingBookId and fiscalPeriodId are required');
    }
    return this.closeService.getPeriodSubledgerLocks(principal.tenantId, bookId, periodId);
  }

  @Post('subledgers/lock')
  @RequirePermissions('finance:periods:manage')
  async setSubledgerLock(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(SetSubledgerLockInputV1Schema, body);
    return this.closeService.setSubledgerLock(principal.tenantId, principal.subject, input);
  }

  // ─── 2. Period Close Checklists ──────────────────────────────────────────────

  @Get('checklists')
  @RequirePermissions('finance:read')
  async getChecklist(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('accountingBookId') bookId: string,
    @Query('fiscalPeriodId') periodId: string,
  ) {
    if (!bookId || !periodId) {
      throw new BadRequestException('accountingBookId and fiscalPeriodId are required');
    }
    return this.closeService.getPeriodChecklist(principal.tenantId, bookId, periodId);
  }

  @Post('checklists/tasks')
  @RequirePermissions('finance:periods:manage')
  async updateChecklistTask(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(UpdateChecklistTaskInputV1Schema, body);
    return this.closeService.updateChecklistTask(principal.tenantId, principal.subject, input);
  }

  // ─── 3. Accruals & Deferrals Amortization ────────────────────────────────────

  @Post('amortization/schedules')
  @RequirePermissions('finance:journals:manage')
  async createAmortizationSchedule(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(CreateAccrualAmortizationScheduleInputV1Schema, body);
    return this.closeService.createAccrualAmortizationSchedule(
      principal.tenantId,
      principal.subject,
      input,
    );
  }

  @Get('amortization/schedules')
  @RequirePermissions('finance:read')
  async getAmortizationSchedules(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('accountingBookId') bookId: string,
  ) {
    if (!bookId) {
      throw new BadRequestException('accountingBookId is required');
    }
    return this.closeService.getAmortizationSchedules(principal.tenantId, bookId);
  }

  @Get('amortization/schedules/:id/lines')
  @RequirePermissions('finance:read')
  async getAmortizationLines(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') scheduleId: string,
  ) {
    return this.closeService.getAmortizationLines(principal.tenantId, scheduleId);
  }

  @Post('amortization/lines/execute')
  @RequirePermissions('finance:journals:post')
  async executeAmortizationLine(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(ExecuteAmortizationLineInputV1Schema, body);
    return this.closeService.executeAmortizationLine(principal.tenantId, principal.subject, input);
  }

  // ─── 4. Year-End Close & Retained Earnings Rollover ───────────────────────────

  @Post('year-end/preview')
  @RequirePermissions('finance:read')
  async previewYearEnd(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(PreviewYearEndCloseInputV1Schema, body);
    return this.closeService.previewYearEndClose(principal.tenantId, input);
  }

  @Post('year-end/execute')
  @RequirePermissions('finance:periods:manage')
  async executeYearEnd(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(ExecuteYearEndCloseInputV1Schema, body);
    return this.closeService.executeYearEndClose(principal.tenantId, principal.subject, input);
  }

  // ─── 5. Multi-Period Financial Forecasting ──────────────────────────────────

  @Post('forecasting/models')
  @RequirePermissions('finance:books:manage')
  async createForecastModel(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(CreateForecastModelInputV1Schema, body);
    return this.closeService.createForecastModel(principal.tenantId, principal.subject, input);
  }

  @Get('forecasting/models')
  @RequirePermissions('finance:read')
  async getForecastModels(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('accountingBookId') bookId: string,
  ) {
    if (!bookId) {
      throw new BadRequestException('accountingBookId is required');
    }
    return this.closeService.getForecastModels(principal.tenantId, bookId);
  }

  @Post('forecasting/generate')
  @RequirePermissions('finance:journals:manage')
  async generateForecast(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(GenerateForecastInputV1Schema, body);
    return this.closeService.generateForecast(principal.tenantId, input.modelId);
  }

  @Get('forecasting/models/:id/lines')
  @RequirePermissions('finance:read')
  async getForecastLines(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') modelId: string,
  ) {
    return this.closeService.getForecastLines(principal.tenantId, modelId);
  }

  // ─── 6. Financial Health & Drill-Through ─────────────────────────────────────

  @Get('financial-health')
  @RequirePermissions('finance:reports:view')
  async getFinancialHealth(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('accountingBookId') bookId: string,
    @Query('fiscalPeriodId') periodId: string,
  ) {
    if (!bookId || !periodId) {
      throw new BadRequestException('accountingBookId and fiscalPeriodId are required');
    }
    return this.closeService.computeFinancialHealth(principal.tenantId, bookId, periodId);
  }

  @Post('drill-through')
  @RequirePermissions('finance:reports:view')
  async queryDrillThrough(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(QueryDrillThroughInputV1Schema, body);
    return this.closeService.queryDrillThrough(principal.tenantId, input);
  }
}
