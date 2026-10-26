import { CurrentUser } from '@gigalibs/auth-nest';
import { type RecordExchangeRateDto, RecordExchangeRateSchema } from '@gigalibs/contracts';
import { RequirePermissions } from '@gigalibs/rbac-nest';
import { CurrentTenant } from '@gigalibs/tenancy-nest';
import { ZodValidationPipe } from '@gigalibs/validation-nest';
import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { TenantExchangeRateService } from './tenant-exchange-rate.service.js';

// WI-OI-120 (M-CUR, Phase 5A): the workspace exchange-rate surface. Recording a rate is gated on `currency:write` and
// reading on `currency:read` (workspace administrators hold `currency:*`). Every call is scoped to the caller's
// workspace. The FX engine converts with the table this returns, so a missing rate fails loudly rather than defaulting.
@Controller('currency/exchange-rates')
export class TenantExchangeRateController {
  constructor(private readonly rates: TenantExchangeRateService) {}

  @Post()
  @RequirePermissions('currency:write')
  record(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(RecordExchangeRateSchema)) dto: RecordExchangeRateDto,
  ) {
    return this.rates.recordRate(tenantId, userId, dto);
  }

  @Get('table')
  @RequirePermissions('currency:read')
  table(@CurrentTenant('tenantId') tenantId: string, @Query('base') base?: string) {
    return this.rates.ratesTable(tenantId, this.requireBase(base));
  }

  @Get()
  @RequirePermissions('currency:read')
  list(@CurrentTenant('tenantId') tenantId: string, @Query('base') base?: string) {
    return this.rates.listRates(tenantId, base ? this.requireBase(base) : undefined);
  }

  private requireBase(base?: string): string {
    if (!base || !/^[A-Z]{3}$/.test(base))
      throw new BadRequestException('base must be an ISO 4217 code, e.g. USD.');
    return base;
  }
}
