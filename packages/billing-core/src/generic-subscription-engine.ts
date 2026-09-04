/**
 * @gigalibs/billing-core - Universal Generic Subscription Engine
 * Standard: Stripe Billing / Lago / Chargebee / KillBill.
 * Independent of invoices, capable of binding to any tenant, workspace, or user entity.
 */

import type {
  GenericSubscription,
  GenericPlan,
  SubscriptionStatus,
  BillingInterval,
  ProrationQuote,
  CouponDiscount,
} from './types.js';

export class GenericSubscriptionEngine {
  /**
   * Calculates valid next lifecycle status transitions.
   */
  static getValidTransitions(current: SubscriptionStatus): SubscriptionStatus[] {
    switch (current) {
      case 'trialing':
        return ['active', 'canceled', 'paused'];
      case 'active':
        return ['past_due', 'paused', 'canceled'];
      case 'past_due':
        return ['active', 'unpaid', 'canceled'];
      case 'unpaid':
        return ['active', 'canceled'];
      case 'paused':
        return ['active', 'canceled'];
      case 'canceled':
        return ['active']; // Reactivation
      case 'incomplete':
        return ['active', 'canceled'];
      default:
        return [];
    }
  }

  /**
   * Evaluates if a subscription is currently entitled to access features.
   */
  static isEntitled(sub: GenericSubscription): boolean {
    return sub.status === 'active' || sub.status === 'trialing';
  }

  /**
   * Checks specific feature entitlement and quota consumption.
   */
  static checkFeatureEntitlement(
    sub: GenericSubscription,
    plan: GenericPlan,
    featureKey: string,
    currentUsage = 0,
  ): {
    isAllowed: boolean;
    reason?: string | undefined;
    limitQuota?: number | undefined;
    remainingQuota?: number | undefined;
    hasOverage: boolean;
  } {
    if (!this.isEntitled(sub)) {
      return { isAllowed: false, reason: `Subscription is currently ${sub.status}`, hasOverage: false };
    }

    const entitlement = plan.entitlements[featureKey];
    if (!entitlement) {
      return { isAllowed: false, reason: `Feature '${featureKey}' is not included in plan ${plan.name}`, hasOverage: false };
    }

    if (!entitlement.isIncluded) {
      return { isAllowed: false, reason: `Feature '${featureKey}' is disabled for plan ${plan.name}`, hasOverage: false };
    }

    if (entitlement.limitQuota === undefined) {
      return { isAllowed: true, remainingQuota: undefined, hasOverage: false };
    }

    const remaining = Math.max(0, entitlement.limitQuota - currentUsage);
    const hasOverage = currentUsage > entitlement.limitQuota;

    return {
      isAllowed: !hasOverage || entitlement.overageUnitCostCents !== undefined,
      limitQuota: entitlement.limitQuota,
      remainingQuota: remaining,
      hasOverage,
      reason: hasOverage ? `Quota of ${entitlement.limitQuota} exceeded (current: ${currentUsage})` : undefined,
    };
  }

  /**
   * Calculates exact integer minor-unit proration quotes for mid-cycle plan switches.
   */
  static calculateProrationQuote(
    sub: GenericSubscription,
    currentPlan: GenericPlan,
    targetPlan: GenericPlan,
    targetInterval: BillingInterval = sub.billingInterval,
  ): ProrationQuote {
    const now = new Date();
    const periodStart = new Date(sub.currentPeriodStart);
    const periodEnd = new Date(sub.currentPeriodEnd);

    const totalPeriodMs = Math.max(1, periodEnd.getTime() - periodStart.getTime());
    const remainingMs = Math.max(0, periodEnd.getTime() - now.getTime());
    const fractionRemaining = remainingMs / totalPeriodMs;

    const totalDaysInPeriod = Math.round(totalPeriodMs / (1000 * 60 * 60 * 24));
    const daysRemainingInPeriod = Math.round(remainingMs / (1000 * 60 * 60 * 24));

    // Calculate current unused credit
    const currentPrice = sub.billingInterval === 'year' ? currentPlan.annualPriceCents : currentPlan.monthlyPriceCents;
    const creditAmountCents = Math.round(currentPrice * fractionRemaining);

    // Calculate target charge for remaining period
    const targetPrice = targetInterval === 'year' ? targetPlan.annualPriceCents : targetPlan.monthlyPriceCents;
    const chargeAmountCents = Math.round(targetPrice * fractionRemaining);

    const netProratedAmountCents = Math.max(0, chargeAmountCents - creditAmountCents);

    return {
      creditAmountCents,
      chargeAmountCents,
      netProratedAmountCents,
      effectiveDate: now.toISOString(),
      daysRemainingInPeriod,
      totalDaysInPeriod,
    };
  }

  /**
   * Initializes a brand-new generic subscription.
   */
  static createSubscription(params: {
    targetEntityId: string;
    targetEntityType?: 'tenant' | 'workspace' | 'user' | 'organization';
    plan: GenericPlan;
    billingInterval?: BillingInterval;
    quantity?: number;
    trialDays?: number;
    coupon?: CouponDiscount;
  }): GenericSubscription {
    const interval = params.billingInterval || 'month';
    const trialDays = params.trialDays !== undefined ? params.trialDays : params.plan.trialDays;
    const now = new Date();

    const currentPeriodStart = now.toISOString();
    const periodEndObj = new Date(now);

    if (interval === 'year') {
      periodEndObj.setFullYear(periodEndObj.getFullYear() + 1);
    } else {
      periodEndObj.setMonth(periodEndObj.getMonth() + 1);
    }
    const currentPeriodEnd = periodEndObj.toISOString();

    const isTrial = trialDays > 0;
    const status: SubscriptionStatus = isTrial ? 'trialing' : 'active';

    const trialStart = isTrial ? now.toISOString() : undefined;
    const trialEndObj = new Date(now);
    trialEndObj.setDate(trialEndObj.getDate() + trialDays);
    const trialEnd = isTrial ? trialEndObj.toISOString() : undefined;

    const unitPriceCents = interval === 'year' ? params.plan.annualPriceCents : params.plan.monthlyPriceCents;
    const quantity = params.quantity || 1;

    const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return {
      id: subId,
      targetEntityId: params.targetEntityId,
      targetEntityType: params.targetEntityType || 'tenant',
      planId: params.plan.id,
      status,
      billingInterval: interval,
      currency: params.plan.currency,
      quantity,
      unitPriceCents,
      currentPeriodStart,
      currentPeriodEnd,
      trialStart,
      trialEnd,
      cancelAtPeriodEnd: false,
      coupon: params.coupon,
      items: [
        {
          id: `si_base_${Date.now()}`,
          subscriptionId: subId,
          priceType: 'base_plan',
          itemDescription: `${params.plan.name} (${interval === 'year' ? 'Annual' : 'Monthly'})`,
          unitAmountCents: unitPriceCents,
          quantity: 1,
        },
      ],
      createdAt: now.toISOString(),
    };
  }

  /**
   * Executes plan upgrade/downgrade transition.
   */
  static transitionPlan(
    sub: GenericSubscription,
    targetPlan: GenericPlan,
    targetInterval: BillingInterval = sub.billingInterval,
  ): GenericSubscription {
    const unitPriceCents = targetInterval === 'year' ? targetPlan.annualPriceCents : targetPlan.monthlyPriceCents;

    return {
      ...sub,
      planId: targetPlan.id,
      billingInterval: targetInterval,
      unitPriceCents,
      status: 'active',
      items: [
        {
          id: `si_base_${Date.now()}`,
          subscriptionId: sub.id,
          priceType: 'base_plan',
          itemDescription: `${targetPlan.name} (${targetInterval === 'year' ? 'Annual' : 'Monthly'})`,
          unitAmountCents: unitPriceCents,
          quantity: sub.quantity,
        },
      ],
    };
  }
}
