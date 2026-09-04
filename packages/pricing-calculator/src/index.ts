/**
 * @gigalibs/pricing-calculator
 *
 * Enterprise Dynamic Quoting, Graduated Volume Tiers,
 * and Direct Invoicing Line-Item Bridge.
 * Benchmark: Stripe Billing Tier Engine / Zuora CPQ.
 *
 * @module
 */

export type PricingModel =
  | 'FLAT_FEE'
  | 'PER_SEAT'
  | 'VOLUME_TIERED'
  | 'GRADUATED_TIERED'
  | 'USAGE_BASED';

export interface VolumeTier {
  upToUnits: number | 'infinity';
  unitPriceCents: number; // in minor units / cents
  flatFeeCents?: number;
}

export interface PricingPlanConfig {
  id: string;
  name: string;
  model: PricingModel;
  basePriceCents: number; // in cents
  seatPriceCents?: number;
  tiers?: VolumeTier[];
  annualDiscountPercent?: number; // e.g. 20 for 20% off annual
}

export interface PriceCalculationResult {
  monthlyTotalCents: number;
  annualTotalCents: number;
  annualSavingsCents: number;
  effectiveBilledAmountCents: number;
  effectiveUnitPriceCents: number;
  breakdown: {
    baseAmountCents: number;
    seatsAmountCents: number;
    usageAmountCents: number;
  };
}

export class PricingCalculator {
  /**
   * Calculates subscription pricing across Flat, Per-Seat, Volume, and Graduated tiers.
   */
  static calculate(
    plan: PricingPlanConfig,
    units = 1,
    isAnnual = false,
  ): PriceCalculationResult {
    let baseAmountCents = plan.basePriceCents;
    let seatsAmountCents = 0;
    let usageAmountCents = 0;

    switch (plan.model) {
      case 'FLAT_FEE':
        // Base price only
        break;

      case 'PER_SEAT':
        seatsAmountCents = (plan.seatPriceCents ?? 0) * units;
        break;

      case 'VOLUME_TIERED':
        if (plan.tiers && plan.tiers.length > 0) {
          let matchedTier = plan.tiers[plan.tiers.length - 1];
          for (const tier of plan.tiers) {
            if (tier.upToUnits === 'infinity' || units <= tier.upToUnits) {
              matchedTier = tier;
              break;
            }
          }
          if (matchedTier) {
            usageAmountCents = matchedTier.unitPriceCents * units + (matchedTier.flatFeeCents ?? 0);
          }
        }
        break;

      case 'GRADUATED_TIERED':
        if (plan.tiers && plan.tiers.length > 0) {
          let remainingUnits = units;
          let prevLimit = 0;
          for (const tier of plan.tiers) {
            const currentLimit = tier.upToUnits === 'infinity' ? Infinity : tier.upToUnits;
            const tierCapacity = currentLimit - prevLimit;
            const unitsInThisTier = Math.min(remainingUnits, tierCapacity);

            if (unitsInThisTier > 0) {
              usageAmountCents += unitsInThisTier * tier.unitPriceCents + (tier.flatFeeCents ?? 0);
              remainingUnits -= unitsInThisTier;
              prevLimit = currentLimit;
            }

            if (remainingUnits <= 0) break;
          }
        }
        break;

      case 'USAGE_BASED':
        usageAmountCents = (plan.seatPriceCents ?? 0) * units;
        break;
    }

    const monthlyTotalCents = baseAmountCents + seatsAmountCents + usageAmountCents;
    const discountFactor = (100 - (plan.annualDiscountPercent ?? 0)) / 100;
    const annualTotalCents = Math.round(monthlyTotalCents * 12 * discountFactor);
    const annualSavingsCents = Math.round(monthlyTotalCents * 12 - annualTotalCents);
    const effectiveUnitPriceCents = units > 0 ? Math.round(monthlyTotalCents / units) : monthlyTotalCents;
    const effectiveBilledAmount = isAnnual ? annualTotalCents : monthlyTotalCents;

    return {
      monthlyTotalCents,
      annualTotalCents,
      annualSavingsCents,
      effectiveBilledAmountCents: effectiveBilledAmount,
      effectiveUnitPriceCents,
      breakdown: {
        baseAmountCents,
        seatsAmountCents,
        usageAmountCents,
      },
    };
  }

  /**
   * Converts calculated quote directly into @gigalibs/invoices-core line items.
   */
  static toInvoiceLineItems(
    plan: PricingPlanConfig,
    units = 1,
    isAnnual = false,
  ): Array<{ id: string; description: string; quantity: number; unitPriceCents: number; taxRatePercent: number; amountCents: number }> {
    const quote = this.calculate(plan, units, isAnnual);
    const isYearly = isAnnual;
    const periodLabel = isYearly ? '(Annual Subscription)' : '(Monthly Subscription)';

    const items: Array<{ id: string; description: string; quantity: number; unitPriceCents: number; taxRatePercent: number; amountCents: number }> = [];

    if (quote.breakdown.baseAmountCents > 0) {
      items.push({
        id: `li_base_${plan.id}`,
        description: `${plan.name} Platform Base License ${periodLabel}`,
        quantity: 1,
        unitPriceCents: isYearly ? Math.round(quote.breakdown.baseAmountCents * 12 * 0.8) : quote.breakdown.baseAmountCents,
        taxRatePercent: 0,
        amountCents: isYearly ? Math.round(quote.breakdown.baseAmountCents * 12 * 0.8) : quote.breakdown.baseAmountCents,
      });
    }

    if (quote.breakdown.seatsAmountCents > 0) {
      const perSeatPrice = isYearly ? Math.round((plan.seatPriceCents ?? 0) * 12 * 0.8) : (plan.seatPriceCents ?? 0);
      items.push({
        id: `li_seats_${plan.id}`,
        description: `${plan.name} User Seats (${units} active seats) ${periodLabel}`,
        quantity: units,
        unitPriceCents: perSeatPrice,
        taxRatePercent: 0,
        amountCents: perSeatPrice * units,
      });
    }

    return items;
  }
}
