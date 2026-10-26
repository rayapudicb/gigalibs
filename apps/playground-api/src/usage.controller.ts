import { MeteredPlanSchema, billingPeriodKey, isBillingPeriodKey } from '@gigalibs/contracts';
import { RequirePermissions } from '@gigalibs/rbac-nest';
import { CurrentTenant } from '@gigalibs/tenancy-nest';
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { UsageMeteringService } from './usage-metering.service.js';

// WI-OI-015 (T8b): the billing hand-off surface — read a tenant's metered usage for a period and the reconciled
// statement against a plan. Read-only and gated on `billing:read` (workspace administrators hold `billing:*`); metered
// work is recorded in-process through UsageMeteringService, not here.
@Controller('usage')
export class UsageController {
  constructor(private readonly usage: UsageMeteringService) {}

  @Get()
  @RequirePermissions('billing:read')
  async getUsage(@CurrentTenant('tenantId') tenantId: string, @Query('period') period?: string) {
    const periodKey = this.resolvePeriod(period);
    return { periodKey, usage: await this.usage.periodUsage(tenantId, periodKey) };
  }

  @Get('statement')
  @RequirePermissions('billing:read')
  getStatement(
    @CurrentTenant('tenantId') tenantId: string,
    @Query('plan') plan?: string,
    @Query('period') period?: string,
  ) {
    const parsedPlan = MeteredPlanSchema.safeParse(plan);
    if (!parsedPlan.success)
      throw new BadRequestException('A valid plan is required: STARTER, GROWTH or ENTERPRISE.');
    return this.usage.statement(tenantId, this.resolvePeriod(period), parsedPlan.data);
  }

  private resolvePeriod(period?: string): string {
    if (period === undefined || period === '') return billingPeriodKey();
    if (!isBillingPeriodKey(period))
      throw new BadRequestException('period must be in YYYY-MM form.');
    return period;
  }
}
