import type { AnalysedMaterial, GateResult } from './gate.js';
import type { MaterialRole } from './types.js';

export interface MassByStream {
  readonly reactantsG: number;
  readonly additivesG: number;
  readonly solventsG: number;
  readonly workUpG: number;
}

const STREAM: Partial<Record<MaterialRole, keyof MassByStream>> = {
  Reactant: 'reactantsG',
  Additive: 'additivesG',
  Solvent: 'solventsG',
  'Work-up': 'workUpG',
};

export type GreenOutcome =
  | {
      readonly status: 'OK';
      readonly atomEconomyPercent: number;
      readonly yieldPercent: number;
      readonly reactionMassEfficiencyPercent: number;
      readonly processMassIntensity: number;
      readonly eFactor: number;
      readonly eFactorExcludingWater: number;
      readonly solventIntensity: number;
      readonly byStream: MassByStream;
      readonly inputsG: number;
      readonly waterG: number;
      readonly productG: number;
    }
  | { readonly status: 'NO_PRODUCT_MASS'; readonly atomEconomyPercent: number; readonly byStream: MassByStream; readonly inputsG: number }
  | { readonly status: 'LOCKED' };

function productOf(gate: GateResult): AnalysedMaterial | undefined {
  return gate.materials.find((m) => m.input.id === gate.productId);
}

/**
 * Green metrics for one step (FR-GRN-01 to 04; BRD §15; BP-01 2.4, 4.B): AE, yield, RME, PMI, E-factor (with and
 * without water) and solvent intensity, over the full bill of materials including work-up and washes.
 */
export function greenMetrics(gate: GateResult): GreenOutcome {
  const product = productOf(gate);
  if (!gate.pass || gate.extentMol === null || !product?.formula.ok) return { status: 'LOCKED' };
  const productCoefficient = product.input.coefficient ?? 0;
  const reactantMolarMass = gate.materials
    .filter((m) => m.input.role === 'Reactant' && m.formula.ok)
    .reduce((sum, m) => sum + (m.input.coefficient ?? 0) * (m.formula.ok ? m.formula.molarMassGPerMol : 0), 0);
  const atomEconomyPercent = ((productCoefficient * product.formula.molarMassGPerMol) / reactantMolarMass) * 100;

  const byStream = { reactantsG: 0, additivesG: 0, solventsG: 0, workUpG: 0 };
  let waterG = 0;
  for (const m of gate.materials) {
    const stream = STREAM[m.input.role];
    const mass = m.input.massG ?? 0;
    if (!stream || !(mass > 0)) continue;
    byStream[stream] += mass;
    if (m.formula.ok && m.formula.hill === 'H2O') waterG += mass;
  }
  const inputsG = byStream.reactantsG + byStream.additivesG + byStream.solventsG + byStream.workUpG;
  const productG = product.input.massG ?? 0;
  if (!(productG > 0)) return { status: 'NO_PRODUCT_MASS', atomEconomyPercent, byStream, inputsG };

  const productMol = productG / product.formula.molarMassGPerMol;
  const processMassIntensity = inputsG / productG;
  return {
    status: 'OK',
    atomEconomyPercent,
    yieldPercent: (productMol / (gate.extentMol * productCoefficient)) * 100,
    reactionMassEfficiencyPercent: (productG / byStream.reactantsG) * 100,
    processMassIntensity,
    eFactor: processMassIntensity - 1,
    eFactorExcludingWater: (inputsG - waterG - productG) / productG,
    solventIntensity: byStream.solventsG / productG,
    byStream,
    inputsG,
    waterG,
    productG,
  };
}

export type RouteRollup =
  | {
      readonly status: 'OK';
      readonly processMassIntensity: number;
      readonly eFactor: number;
      readonly overallYieldPercent: number;
      readonly atomEconomyPercent: number;
      readonly totalInputsG: number;
      readonly finalProductG: number;
      /** Reactants that are the previous step's product: not counted again as inputs or in the route AE. */
      readonly carriedMaterialIds: readonly string[];
    }
  | { readonly status: 'BLOCKED'; readonly blockedStepIndex: number };

/**
 * Route roll-up (FR-GRN-04): inputs summed over the steps without double-counting carried intermediates; overall yield
 * as the product of step yields; route AE as the final product's molar mass over the non-carried reactants.
 */
export function routeRollup(steps: readonly { readonly gate: GateResult; readonly green: GreenOutcome }[]): RouteRollup {
  let totalInputsG = 0;
  let yieldFraction = 1;
  let atomEconomyDenominator = 0;
  const carriedMaterialIds: string[] = [];
  let previousProductHill: string | null = null;
  let finalProduct: AnalysedMaterial | undefined;
  for (const [index, step] of steps.entries()) {
    if (step.green.status !== 'OK') return { status: 'BLOCKED', blockedStepIndex: index };
    let carriedG = 0;
    for (const m of step.gate.materials) {
      if (m.input.role !== 'Reactant' || !m.formula.ok) continue;
      if (previousProductHill !== null && m.formula.hill === previousProductHill) {
        carriedG += m.input.massG ?? 0;
        carriedMaterialIds.push(m.input.id);
      } else {
        atomEconomyDenominator += (m.input.coefficient ?? 0) * m.formula.molarMassGPerMol;
      }
    }
    totalInputsG += step.green.inputsG - carriedG;
    yieldFraction *= step.green.yieldPercent / 100;
    finalProduct = productOf(step.gate);
    previousProductHill = finalProduct?.formula.ok ? finalProduct.formula.hill : null;
  }
  if (!finalProduct?.formula.ok) return { status: 'BLOCKED', blockedStepIndex: Math.max(steps.length - 1, 0) };
  const finalProductG = finalProduct.input.massG ?? 0;
  const processMassIntensity = totalInputsG / finalProductG;
  return {
    status: 'OK',
    processMassIntensity,
    eFactor: processMassIntensity - 1,
    overallYieldPercent: yieldFraction * 100,
    atomEconomyPercent: (finalProduct.formula.molarMassGPerMol / atomEconomyDenominator) * 100,
    totalInputsG,
    finalProductG,
    carriedMaterialIds,
  };
}
