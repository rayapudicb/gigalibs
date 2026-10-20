import {
  GAS_CONSTANT_J_PER_MOL_K,
  MOLAR_VOLUME_STP_L_PER_MOL,
  SECONDS_PER_HOUR,
  TD24_HORIZON_HOURS,
  ZERO_CELSIUS_K,
} from './constants.js';
import { type Range, type ScreeningCriteria, criteriaGap } from './criteria.js';
import { type GateResult, isEquationRole } from './gate.js';
import type { ScreeningLibrary } from './library.js';
import { type StoesselClass, stoesselClass } from './stoessel.js';
import type { DataGap, EngineMessage } from './types.js';

export type ReactionEnthalpySource =
  | { readonly source: 'MANUAL'; readonly kJPerMol: number }
  | { readonly source: 'REACTION_CLASS'; readonly reactionClassId: string }
  | { readonly source: 'HESS' };

export interface DecompositionKinetics {
  readonly activationEnergyKJPerMol: number;
  /** Heat release rate q_ref at the reference temperature, W/kg. */
  readonly heatReleaseRateWPerKg: number;
  readonly referenceTemperatureC: number;
}

/** Process conditions of one step. Null means "not entered". */
export interface ThermalConditions {
  readonly processTemperatureC: number | null;
  readonly maximumTechnicalTemperatureC: number | null;
  readonly heatCapacityJPerGK: number | null;
  /** Thermal accumulation Xac, % (0 to 100). */
  readonly accumulationPercent: number | null;
  readonly reactionEnthalpy: ReactionEnthalpySource | null;
  readonly decomposition: DecompositionKinetics | null;
  readonly td24EnteredC: number | null;
  readonly dscOnsetC: number | null;
}

export interface ConditionCheck {
  readonly errors: readonly EngineMessage[];
  readonly warnings: readonly EngineMessage[];
}

function outside(value: number, range: Range): boolean {
  return value < range.min || value > range.max;
}

/** Input ranges (BRD §15.1), all taken from the criteria in force. */
export function validateConditions(
  conditions: ThermalConditions,
  criteria: ScreeningCriteria,
): ConditionCheck {
  const errors: EngineMessage[] = [];
  const warnings: EngineMessage[] = [];
  const ranges = criteria.inputRanges;
  const block = (field: string, value: number | null | undefined, range: Range) => {
    if (typeof value === 'number' && outside(value, range)) {
      errors.push({
        code: 'INPUT_OUT_OF_RANGE',
        requirement: 'BRD-15.1',
        params: { field, min: range.min, max: range.max },
      });
    }
  };
  block('processTemperatureC', conditions.processTemperatureC, ranges.temperatureC);
  block(
    'maximumTechnicalTemperatureC',
    conditions.maximumTechnicalTemperatureC,
    ranges.temperatureC,
  );
  block(
    'referenceTemperatureC',
    conditions.decomposition?.referenceTemperatureC,
    ranges.temperatureC,
  );
  block('dscOnsetC', conditions.dscOnsetC, ranges.temperatureC);
  block('td24EnteredC', conditions.td24EnteredC, ranges.temperatureC);
  block('heatCapacityJPerGK', conditions.heatCapacityJPerGK, ranges.heatCapacityJPerGK.block);
  block('accumulationPercent', conditions.accumulationPercent, ranges.accumulationPercent);
  block(
    'activationEnergyKJPerMol',
    conditions.decomposition?.activationEnergyKJPerMol,
    ranges.activationEnergyKJPerMol,
  );

  const cp = conditions.heatCapacityJPerGK;
  if (
    typeof cp === 'number' &&
    !outside(cp, ranges.heatCapacityJPerGK.block) &&
    outside(cp, ranges.heatCapacityJPerGK.warn)
  ) {
    warnings.push({
      code: 'INPUT_UNUSUAL',
      requirement: 'BRD-15.1',
      params: {
        field: 'heatCapacityJPerGK',
        min: ranges.heatCapacityJPerGK.warn.min,
        max: ranges.heatCapacityJPerGK.warn.max,
      },
    });
  }
  const enthalpy = conditions.reactionEnthalpy;
  if (enthalpy?.source === 'MANUAL') {
    const limits = ranges.reactionEnthalpyKJPerMol;
    block('reactionEnthalpyKJPerMol', enthalpy.kJPerMol, limits.block);
    if (!outside(enthalpy.kJPerMol, limits.block) && enthalpy.kJPerMol < limits.warnBelow) {
      warnings.push({
        code: 'INPUT_UNUSUAL',
        requirement: 'BRD-15.1',
        params: { field: 'reactionEnthalpyKJPerMol', warnBelow: limits.warnBelow },
      });
    }
  }
  return { errors, warnings };
}

/** Decomposition heat release rate q(T), W/kg (BRD §15): q_ref · exp[−Ea/R · (1/T − 1/T_ref)]. */
function heatReleaseRate(kinetics: DecompositionKinetics, temperatureC: number): number {
  const activationJ = kinetics.activationEnergyKJPerMol * 1000;
  const t = temperatureC + ZERO_CELSIUS_K;
  const tRef = kinetics.referenceTemperatureC + ZERO_CELSIUS_K;
  return (
    kinetics.heatReleaseRateWPerKg *
    Math.exp((-activationJ / GAS_CONSTANT_J_PER_MOL_K) * (1 / t - 1 / tRef))
  );
}

/** TMRad at a temperature, hours (BRD §15): Cp·R·T² / (q(T)·Ea), with Cp in J/(kg·K). */
export function timeToMaximumRateHours(
  heatCapacityJPerGK: number,
  kinetics: DecompositionKinetics,
  temperatureC: number,
): number {
  const cpJPerKgK = heatCapacityJPerGK * 1000;
  const t = temperatureC + ZERO_CELSIUS_K;
  const seconds =
    (cpJPerKgK * GAS_CONSTANT_J_PER_MOL_K * t * t) /
    (heatReleaseRate(kinetics, temperatureC) * kinetics.activationEnergyKJPerMol * 1000);
  return seconds / SECONDS_PER_HOUR;
}

/** TD24 by bisection over the criteria's search range; null when TMRad does not cross 24 h inside it. */
export function td24FromKinetics(
  heatCapacityJPerGK: number,
  kinetics: DecompositionKinetics,
  searchRangeC: Range,
): number | null {
  let low = searchRangeC.min;
  let high = searchRangeC.max;
  const tmr = (temperatureC: number) =>
    timeToMaximumRateHours(heatCapacityJPerGK, kinetics, temperatureC);
  if (tmr(low) < TD24_HORIZON_HOURS || tmr(high) > TD24_HORIZON_HOURS) return null;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const middle = (low + high) / 2;
    if (tmr(middle) > TD24_HORIZON_HOURS) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export type Td24Basis =
  | 'KINETICS'
  | 'ENTERED'
  | 'CONSERVATIVE_ONSET'
  | 'OUT_OF_SEARCH_RANGE'
  | 'MISSING';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH';
export type Probability = Severity | 'UNKNOWN';

export interface EvolvedGas {
  readonly materialId: string;
  readonly gasId: string;
  readonly moles: number;
  readonly litresAtStp: number;
}

export interface ThermalResult {
  readonly status: 'OK';
  readonly warnings: readonly EngineMessage[];
  /** Why the thermal figures are absent, when they are. */
  readonly notComputed: EngineMessage | null;
  readonly reactionEnthalpyKJPerMol: number | null;
  readonly reactionEnthalpySource: ReactionEnthalpySource['source'] | null;
  readonly enthalpyIsEstimate: boolean;
  readonly reactionMassG: number;
  readonly extentMol: number;
  readonly gases: readonly EvolvedGas[];
  readonly heatReleasedKJ: number | null;
  readonly specificHeatKJPerKg: number | null;
  readonly adiabaticRiseK: number | null;
  readonly mtsrC: number | null;
  readonly mtsrFullAccumulationC: number | null;
  readonly td24C: number | null;
  readonly td24Basis: Td24Basis;
  readonly tmrAtMtsrHours: number | null;
  readonly tmrAtFullAccumulationHours: number | null;
  readonly stoesselClass: StoesselClass | null;
  readonly stoesselClassFullAccumulation: StoesselClass | null;
  readonly severity: Severity | null;
  readonly probability: Probability;
  /** True when any library entry used here is unreviewed. */
  readonly usesUnreviewedLibrary: boolean;
  readonly criteriaVersion: string;
  readonly libraryVersion: string;
}

export type ThermalOutcome =
  | ThermalResult
  | { readonly status: 'LOCKED' }
  | {
      readonly status: 'INVALID';
      readonly errors: readonly EngineMessage[];
      readonly warnings: readonly EngineMessage[];
    }
  | DataGap;

function enthalpyFrom(
  conditions: ThermalConditions,
  gate: GateResult,
  library: ScreeningLibrary,
): {
  kJPerMol: number | null;
  estimate: boolean;
  unreviewed: boolean;
  notComputed: EngineMessage | null;
} {
  const choice = conditions.reactionEnthalpy;
  if (!choice)
    return {
      kJPerMol: null,
      estimate: false,
      unreviewed: false,
      notComputed: { code: 'THM_ENTHALPY_SOURCE_MISSING', requirement: 'FR-THM-01' },
    };
  if (choice.source === 'MANUAL')
    return { kJPerMol: choice.kJPerMol, estimate: false, unreviewed: false, notComputed: null };
  if (choice.source === 'REACTION_CLASS') {
    const reactionClass = library.reactionClasses.find(
      (entry) => entry.id === choice.reactionClassId,
    );
    if (!reactionClass) {
      return {
        kJPerMol: null,
        estimate: true,
        unreviewed: false,
        notComputed: {
          code: 'THM_REACTION_CLASS_UNKNOWN',
          requirement: 'FR-THM-03',
          params: { reactionClassId: choice.reactionClassId },
        },
      };
    }
    return {
      kJPerMol: reactionClass.typicalReactionEnthalpyKJPerMol,
      estimate: true,
      unreviewed: !reactionClass.reviewed,
      notComputed: null,
    };
  }
  let sum = 0;
  let unreviewed = false;
  const missing: string[] = [];
  for (const m of gate.materials) {
    if (!isEquationRole(m.input.role) || !m.formula.ok) continue;
    const entry = library.formationEnthalpies[m.formula.hill];
    if (!entry) {
      missing.push(m.input.id);
      continue;
    }
    unreviewed ||= !entry.reviewed;
    sum += (m.input.role === 'Reactant' ? -1 : 1) * (m.input.coefficient ?? 0) * entry.kJPerMol;
  }
  if (missing.length) {
    return {
      kJPerMol: null,
      estimate: false,
      unreviewed,
      notComputed: {
        code: 'THM_HESS_FORMATION_ENTHALPY_MISSING',
        requirement: 'FR-THM-02',
        params: { materialIds: missing },
      },
    };
  }
  return { kJPerMol: sum, estimate: false, unreviewed, notComputed: null };
}

/**
 * Thermochemistry and runaway (FR-THM-01 to 12; BRD §15; BP-01 2.2, 3.1). Locked until the gate passes (FR-GATE-04).
 * Masses in g, Cp in J/(g·K), temperatures in °C.
 */
export function runThermal(
  gate: GateResult,
  conditions: ThermalConditions,
  library: ScreeningLibrary,
  criteria: ScreeningCriteria,
): ThermalOutcome {
  const gap = criteriaGap(criteria);
  if (gap) return gap;
  if (!gate.pass || gate.extentMol === null) return { status: 'LOCKED' };
  const check = validateConditions(conditions, criteria);
  if (check.errors.length)
    return { status: 'INVALID', errors: check.errors, warnings: check.warnings };

  const extentMol = gate.extentMol;
  const reactionMassG = gate.materials
    .filter(
      (m) => ['Reactant', 'Additive', 'Solvent'].includes(m.input.role) && (m.input.massG ?? 0) > 0,
    )
    .reduce((sum, m) => sum + (m.input.massG ?? 0), 0);

  let gasUnreviewed = false;
  const gases: EvolvedGas[] = [];
  for (const m of gate.materials) {
    if (m.input.role !== 'By-product' || !m.formula.ok) continue;
    const gas = library.gases[m.formula.hill];
    if (!gas) continue;
    gasUnreviewed ||= !gas.reviewed;
    const moles = (m.input.coefficient ?? 0) * extentMol;
    gases.push({
      materialId: m.input.id,
      gasId: gas.id,
      moles,
      litresAtStp: moles * MOLAR_VOLUME_STP_L_PER_MOL,
    });
  }

  const enthalpy = enthalpyFrom(conditions, gate, library);
  const base = {
    status: 'OK' as const,
    warnings: check.warnings,
    reactionEnthalpyKJPerMol: enthalpy.kJPerMol,
    reactionEnthalpySource: conditions.reactionEnthalpy?.source ?? null,
    enthalpyIsEstimate: enthalpy.estimate,
    reactionMassG,
    extentMol,
    gases,
    usesUnreviewedLibrary: enthalpy.unreviewed || gasUnreviewed,
    criteriaVersion: criteria.version,
    libraryVersion: library.version,
  };
  const empty = {
    heatReleasedKJ: null,
    specificHeatKJPerKg: null,
    adiabaticRiseK: null,
    mtsrC: null,
    mtsrFullAccumulationC: null,
    td24C: null,
    td24Basis: 'MISSING' as const,
    tmrAtMtsrHours: null,
    tmrAtFullAccumulationHours: null,
    stoesselClass: null,
    stoesselClassFullAccumulation: null,
    severity: null,
    probability: 'UNKNOWN' as const,
  };
  if (enthalpy.kJPerMol === null) return { ...base, ...empty, notComputed: enthalpy.notComputed };
  const cp = conditions.heatCapacityJPerGK;
  const tp = conditions.processTemperatureC;
  const accumulation = conditions.accumulationPercent;
  if (cp === null || !(cp > 0) || tp === null || accumulation === null) {
    return {
      ...base,
      ...empty,
      notComputed: { code: 'THM_CONDITIONS_REQUIRED', requirement: 'FR-THM-04' },
    };
  }
  // A passing gate has at least one charged reactant (FR-GATE-05), so reactionMassG > 0 here.

  const heatReleasedKJ = -enthalpy.kJPerMol * extentMol;
  const specificHeatKJPerKg = heatReleasedKJ / (reactionMassG / 1000);
  const adiabaticRiseK = (-enthalpy.kJPerMol * extentMol * 1000) / (reactionMassG * cp);
  const mtsrC = tp + (accumulation / 100) * adiabaticRiseK;
  const mtsrFullAccumulationC = tp + adiabaticRiseK;

  const kinetics = conditions.decomposition;
  const hasKinetics =
    kinetics !== null &&
    kinetics.activationEnergyKJPerMol > 0 &&
    kinetics.heatReleaseRateWPerKg > 0;
  let td24C: number | null = null;
  let td24Basis: Td24Basis = 'MISSING';
  if (hasKinetics) {
    td24C = td24FromKinetics(cp, kinetics, criteria.td24SearchRangeC);
    td24Basis = td24C === null ? 'OUT_OF_SEARCH_RANGE' : 'KINETICS';
  } else if (conditions.td24EnteredC !== null) {
    td24C = conditions.td24EnteredC;
    td24Basis = 'ENTERED';
  } else if (conditions.dscOnsetC !== null) {
    td24C = conditions.dscOnsetC - criteria.td24ConservativeOnsetOffsetK;
    td24Basis = 'CONSERVATIVE_ONSET';
  }
  const tmrAtMtsrHours = hasKinetics ? timeToMaximumRateHours(cp, kinetics, mtsrC) : null;
  const tmrAtFullAccumulationHours = hasKinetics
    ? timeToMaximumRateHours(cp, kinetics, mtsrFullAccumulationC)
    : null;
  const mtt = conditions.maximumTechnicalTemperatureC;

  const severityLimits = criteria.severityByAdiabaticRiseK;
  const severity: Severity =
    adiabaticRiseK < severityLimits.mediumFromK
      ? 'LOW'
      : adiabaticRiseK <= severityLimits.highAboveK
        ? 'MEDIUM'
        : 'HIGH';
  const probabilityLimits = criteria.probabilityByTmrHours;
  const probability: Probability =
    tmrAtMtsrHours === null
      ? 'UNKNOWN'
      : tmrAtMtsrHours > probabilityLimits.lowAboveHours
        ? 'LOW'
        : tmrAtMtsrHours >= probabilityLimits.highBelowHours
          ? 'MEDIUM'
          : 'HIGH';

  return {
    ...base,
    notComputed: null,
    heatReleasedKJ,
    specificHeatKJPerKg,
    adiabaticRiseK,
    mtsrC,
    mtsrFullAccumulationC,
    td24C,
    td24Basis,
    tmrAtMtsrHours,
    tmrAtFullAccumulationHours,
    stoesselClass: stoesselClass(mtsrC, mtt, td24C),
    stoesselClassFullAccumulation: stoesselClass(mtsrFullAccumulationC, mtt, td24C),
    severity,
    probability,
  };
}
