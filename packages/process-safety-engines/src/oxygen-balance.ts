import { type ScreeningCriteria, criteriaGap } from './criteria.js';
import type { AnalysedMaterial } from './gate.js';
import type { DataGap, ElementTable } from './types.js';

export type OxygenBalanceRecommendation = 'HIGH' | 'REVIEW' | 'LOW';

export type OxygenBalanceResult =
  | {
      readonly status: 'OK';
      readonly percent: number;
      readonly inAlertBand: boolean;
      readonly energetic: boolean;
      readonly recommendation: OxygenBalanceRecommendation;
      readonly criteriaVersion: string;
    }
  | { readonly status: 'NOT_APPLICABLE'; readonly reason: 'NO_CARBON' | 'CONTAINS_METAL' }
  | { readonly status: 'INVALID_FORMULA' };

/**
 * Oxygen balance (FR-OB-01 to 05, BRL-02; BRD §15): OB% = −1600/MW × (2C + (H − X)/2 + 2S − O), halogens taken as HX
 * and sulfur as SO2. Inorganic and metal-containing materials are not applicable (FR-OB-02). "High" needs both the
 * alert band and a tagged energetic group; either alone is "Review".
 */
export function oxygenBalance(
  material: AnalysedMaterial,
  elements: ElementTable,
  criteria: ScreeningCriteria,
): OxygenBalanceResult | DataGap {
  const gap = criteriaGap(criteria);
  if (gap) return gap;
  if (!material.formula.ok) return { status: 'INVALID_FORMULA' };
  const counts = material.formula.counts;
  if (!(counts.C ?? 0)) return { status: 'NOT_APPLICABLE', reason: 'NO_CARBON' };
  if (Object.keys(counts).some((symbol) => elements.elements[symbol]?.metal)) {
    return { status: 'NOT_APPLICABLE', reason: 'CONTAINS_METAL' };
  }
  const halogens = Object.entries(counts)
    .filter(([symbol]) => elements.elements[symbol]?.halogen)
    .reduce((sum, [, count]) => sum + count, 0);
  const percent =
    (-1600 / material.formula.molarMassGPerMol) *
    (2 * (counts.C ?? 0) +
      ((counts.H ?? 0) - halogens) / 2 +
      2 * (counts.S ?? 0) -
      (counts.O ?? 0));
  const band = criteria.oxygenBalanceAlertBandPercent;
  const inAlertBand = percent > band.lowerExclusive && percent < band.upperExclusive;
  const energetic = (material.input.energeticGroups ?? []).length > 0;
  const recommendation: OxygenBalanceRecommendation =
    inAlertBand && energetic ? 'HIGH' : inAlertBand || energetic ? 'REVIEW' : 'LOW';
  return {
    status: 'OK',
    percent,
    inAlertBand,
    energetic,
    recommendation,
    criteriaVersion: criteria.version,
  };
}
