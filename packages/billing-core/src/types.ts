/**
 * @gigalibs/billing-core - Universal Generic Subscription & Billing Engine Types
 * Benchmark: Stripe Billing / Lago Open Source / KillBill / Chargebee.
 */

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'paused'
  | 'canceled'
  | 'incomplete';

export type BillingInterval = 'week' | 'month' | 'quarter' | 'year';

export type ProrationBehavior = 'create_prorations' | 'none' | 'always_invoice';

export type PricingModel = 'flat_fee' | 'per_unit' | 'tiered' | 'metered_usage';

export interface PlanFeatureEntitlement {
  featureKey: string;
  featureName: string;
  isIncluded: boolean;
  limitQuota?: number | undefined; // e.g. 5000 API calls, 25 seats, undefined for unlimited
  overageUnitCostCents?: number | undefined; // e.g. $0.05 per 1,000 extra calls
}

export interface GenericPlan {
  id: string;
  name: string;
  description: string;
  code: string; // e.g. 'STARTER', 'GROWTH_PRO', 'ENTERPRISE_CUSTOM'
  pricingModel: PricingModel;
  currency: string;
  monthlyPriceCents: number;
  annualPriceCents: number; // typically 20% discount
  trialDays: number;
  isActive: boolean;
  entitlements: Record<string, PlanFeatureEntitlement>;
  metadata?: Record<string, any> | undefined;
}

export interface SubscriptionItem {
  id: string;
  subscriptionId: string;
  priceType: 'base_plan' | 'additional_seat' | 'metered_addon';
  itemDescription: string;
  unitAmountCents: number;
  quantity: number;
  metricKey?: string | undefined;
}

export interface MeteredUsageEvent {
  id: string;
  subscriptionId: string;
  targetEntityId: string;
  metricKey: string; // e.g. 'ai_copilot_tokens', 'api_requests', 'invoices_issued'
  quantity: number;
  timestamp: string;
}

export interface CouponDiscount {
  id: string;
  code: string;
  name: string;
  discountType: 'percentage' | 'fixed_amount';
  percentOff?: number | undefined; // e.g. 20
  amountOffCents?: number | undefined; // e.g. 5000 = $50.00
  duration: 'once' | 'repeating' | 'forever';
  durationInMonths?: number | undefined;
  isActive: boolean;
}

export interface GenericSubscription {
  id: string;
  targetEntityId: string; // Can be tenantId, workspaceId, userId, or organizationId
  targetEntityType: 'tenant' | 'workspace' | 'user' | 'organization';
  planId: string;
  status: SubscriptionStatus;
  billingInterval: BillingInterval;
  currency: string;
  quantity: number; // seats or base units
  unitPriceCents: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialStart?: string | undefined;
  trialEnd?: string | undefined;
  cancelAtPeriodEnd: boolean;
  canceledAt?: string | undefined;
  pausedAt?: string | undefined;
  resumesAt?: string | undefined;
  coupon?: CouponDiscount | undefined;
  items: SubscriptionItem[];
  metadata?: Record<string, any> | undefined;
  createdAt: string;
}

export interface ProrationQuote {
  creditAmountCents: number;
  chargeAmountCents: number;
  netProratedAmountCents: number;
  effectiveDate: string;
  daysRemainingInPeriod: number;
  totalDaysInPeriod: number;
}
