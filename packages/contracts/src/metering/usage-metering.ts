import { z } from 'zod';
import type { InvoiceLineItem } from '../billing/index.js';

// WI-OI-015 (T8b): usage metering, plan quotas and the billing hand-off. Metered work increments a per-tenant,
// per-period, per-meter counter (see the UsageCounter model); the hand-off turns a period's counters into reconciled
// invoice line-items for a tenant's plan — the included allowance is free, only the overage is billed. Pure and
// browser-safe so the control plane, a future billing job and their tests all compute the same numbers.

/** The metered dimensions. A meter is a raw count — requests, runs, tokens, bytes — never a derived figure. */
export const MeterKeySchema = z.enum([
  'API_REQUESTS',
  'WORKFLOW_RUNS',
  'AI_TOKENS',
  'STORAGE_BYTES',
]);
export type MeterKey = z.infer<typeof MeterKeySchema>;

/** The billing plans a quota set is keyed by. These are the metered tiers, distinct from the governor's rate tiers. */
export const MeteredPlanSchema = z.enum(['STARTER', 'GROWTH', 'ENTERPRISE']);
export type MeteredPlan = z.infer<typeof MeteredPlanSchema>;

export interface MeterQuota {
  /** Units included in the plan each period. `null` means unlimited — nothing is ever billed as overage. */
  readonly includedQuantity: number | null;
  /** Minor currency units billed per unit over the allowance. May be fractional; the line amount is rounded up. */
  readonly overageRateMinorPerUnit: number;
}

export interface MeterDescriptor {
  readonly label: string;
  /** The unit shown in a line-item ("requests", "GB"). Display only; the stored counter is always the raw unit. */
  readonly unit: string;
}

export const METER_DESCRIPTORS: Readonly<Record<MeterKey, MeterDescriptor>> = {
  API_REQUESTS: { label: 'API requests', unit: 'requests' },
  WORKFLOW_RUNS: { label: 'Workflow runs', unit: 'runs' },
  AI_TOKENS: { label: 'AI tokens', unit: 'tokens' },
  STORAGE_BYTES: { label: 'Storage', unit: 'bytes' },
};

const GIB = 1_073_741_824;

/**
 * Plan quotas. The figures are deliberate round placeholders a finance owner tunes per market; the billing MATH (free
 * allowance, overage, rounding) is what matters and is tested. ENTERPRISE is unlimited on every meter.
 */
export const PLAN_METER_QUOTAS: Readonly<
  Record<MeteredPlan, Readonly<Record<MeterKey, MeterQuota>>>
> = {
  STARTER: {
    API_REQUESTS: { includedQuantity: 100_000, overageRateMinorPerUnit: 0.01 },
    WORKFLOW_RUNS: { includedQuantity: 1_000, overageRateMinorPerUnit: 2 },
    AI_TOKENS: { includedQuantity: 1_000_000, overageRateMinorPerUnit: 0.0002 },
    STORAGE_BYTES: { includedQuantity: 5 * GIB, overageRateMinorPerUnit: 0.0000001 },
  },
  GROWTH: {
    API_REQUESTS: { includedQuantity: 1_000_000, overageRateMinorPerUnit: 0.008 },
    WORKFLOW_RUNS: { includedQuantity: 25_000, overageRateMinorPerUnit: 1 },
    AI_TOKENS: { includedQuantity: 25_000_000, overageRateMinorPerUnit: 0.00015 },
    STORAGE_BYTES: { includedQuantity: 100 * GIB, overageRateMinorPerUnit: 0.00000008 },
  },
  ENTERPRISE: {
    API_REQUESTS: { includedQuantity: null, overageRateMinorPerUnit: 0 },
    WORKFLOW_RUNS: { includedQuantity: null, overageRateMinorPerUnit: 0 },
    AI_TOKENS: { includedQuantity: null, overageRateMinorPerUnit: 0 },
    STORAGE_BYTES: { includedQuantity: null, overageRateMinorPerUnit: 0 },
  },
};

/** The billing period a moment falls in, `YYYY-MM` in UTC — the key a counter is bucketed under. */
export function billingPeriodKey(at: Date = new Date()): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** `true` for a well-formed period key, so a route rejects a malformed one before it hits the database. */
export function isBillingPeriodKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** The highest quota band a usage crosses (80/90/100), or null when under 80% or the allowance is unlimited. */
export function usageThresholdBand(
  quantity: number,
  includedQuantity: number | null,
): 80 | 90 | 100 | null {
  if (includedQuantity === null || includedQuantity <= 0) return null;
  const fraction = quantity / includedQuantity;
  if (fraction >= 1) return 100;
  if (fraction >= 0.9) return 90;
  if (fraction >= 0.8) return 80;
  return null;
}

export interface MeterUsageDetail {
  readonly meter: MeterKey;
  readonly quantity: number;
  readonly includedQuantity: number | null;
  readonly overage: number;
  readonly amountMinor: number;
  readonly thresholdBand: 80 | 90 | 100 | null;
}

/** One meter's usage against its quota: how much is over the allowance and what that overage costs (rounded up). */
export function meterUsageDetail(
  meter: MeterKey,
  quantity: number,
  quota: MeterQuota,
): MeterUsageDetail {
  const overage =
    quota.includedQuantity === null ? 0 : Math.max(0, quantity - quota.includedQuantity);
  return {
    meter,
    quantity,
    includedQuantity: quota.includedQuantity,
    overage,
    amountMinor: overage === 0 ? 0 : Math.ceil(overage * quota.overageRateMinorPerUnit),
    thresholdBand: usageThresholdBand(quantity, quota.includedQuantity),
  };
}

export interface UsageStatement {
  readonly plan: MeteredPlan;
  readonly periodKey: string;
  readonly meters: MeterUsageDetail[];
  readonly lineItems: InvoiceLineItem[];
  /** Total overage across all meters, in minor currency units. Zero on an unlimited plan or within every allowance. */
  readonly totalAmountMinor: number;
}

/**
 * The billing hand-off: a reconciled statement for one period and plan. Every meter is reported (so a consumer sees
 * usage even within the allowance); a line-item is emitted only for a meter with billable overage.
 */
export function buildUsageStatement(
  usageByMeter: Partial<Record<MeterKey, number>>,
  plan: MeteredPlan,
  periodKey: string,
): UsageStatement {
  const quotas = PLAN_METER_QUOTAS[plan];
  const meters = MeterKeySchema.options.map((meter) =>
    meterUsageDetail(meter, usageByMeter[meter] ?? 0, quotas[meter]),
  );
  const lineItems: InvoiceLineItem[] = meters
    .filter((detail) => detail.amountMinor > 0)
    .map((detail) => {
      const descriptor = METER_DESCRIPTORS[detail.meter];
      return {
        description: `${descriptor.label} overage — ${detail.overage.toLocaleString('en-US')} ${descriptor.unit} over ${(detail.includedQuantity ?? 0).toLocaleString('en-US')} included (${periodKey})`,
        quantity: detail.overage,
        unitAmount: quotas[detail.meter].overageRateMinorPerUnit,
        amount: detail.amountMinor,
      };
    });
  return {
    plan,
    periodKey,
    meters,
    lineItems,
    totalAmountMinor: lineItems.reduce((sum, item) => sum + item.amount, 0),
  };
}

/** A metered increment reported to the control plane (an in-process meter call, not a public write). */
export const RecordUsageSchema = z
  .object({
    meter: MeterKeySchema,
    quantity: z.number().int().positive().max(1_000_000_000_000),
  })
  .strict();
export type RecordUsageDto = z.infer<typeof RecordUsageSchema>;
