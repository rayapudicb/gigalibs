import {
  type MeterKey,
  type MeteredPlan,
  billingPeriodKey,
  buildUsageStatement,
} from '@gigalibs/contracts';
import { prisma } from '@gigalibs/db';
import { Injectable } from '@nestjs/common';
import { resolveTenantId } from './tenant-resolver.js';

// WI-OI-015 (T8b): usage metering and the billing hand-off. `record` is an in-process meter call made by whatever does
// metered work; it increments a per-tenant, per-period, per-meter counter atomically. `periodUsage` and `statement`
// read a period back — `statement` is the reconciled hand-off a billing system consumes.
@Injectable()
export class UsageMeteringService {
  /** Add `quantity` to the tenant's counter for the billing period `at` falls in (now by default). A no-op for ≤ 0. */
  async record(
    tenantId: string,
    meter: MeterKey,
    quantity: number,
    at: Date = new Date(),
  ): Promise<void> {
    const whole = Math.trunc(quantity);
    if (whole <= 0) return;
    const resolvedTenantId = await resolveTenantId(tenantId);
    const periodKey = billingPeriodKey(at);
    const delta = BigInt(whole);
    await prisma.usageCounter.upsert({
      where: {
        tenantId_periodKey_meterKey: { tenantId: resolvedTenantId, periodKey, meterKey: meter },
      },
      create: { tenantId: resolvedTenantId, periodKey, meterKey: meter, quantity: delta },
      update: { quantity: { increment: delta } },
    });
  }

  /** A period's counters, meter → quantity. Quantities are returned as safe JS numbers (usage stays well under 2^53). */
  async periodUsage(tenantId: string, periodKey: string): Promise<Record<string, number>> {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const rows = await prisma.usageCounter.findMany({
      where: { tenantId: resolvedTenantId, periodKey },
      select: { meterKey: true, quantity: true },
    });
    return Object.fromEntries(rows.map((row) => [row.meterKey, Number(row.quantity)]));
  }

  /** The reconciled billing statement for a period and plan — the hand-off (included allowance free, overage billed). */
  async statement(tenantId: string, periodKey: string, plan: MeteredPlan) {
    const usage = await this.periodUsage(tenantId, periodKey);
    return buildUsageStatement(usage as Partial<Record<MeterKey, number>>, plan, periodKey);
  }
}
