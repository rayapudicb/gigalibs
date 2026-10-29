import type { DataGap } from './types.js';

/** A closed interval; `min` and `max` are inclusive. */
export interface Range {
  readonly min: number;
  readonly max: number;
}

/**
 * Screening criteria: every threshold and range the engines apply. A workspace has exactly one set in force; each value
 * is cited and versioned, and results record the version. Units are part of every field name.
 */
export interface ScreeningCriteria {
  readonly version: string;
  /** Mole-balance tolerance, atoms per formula unit (FR-GATE-02). */
  readonly elementBalanceTolerance: number;
  /** Oxygen-balance alert band, %, exclusive bounds (FR-OB-03, BRL-02). */
  readonly oxygenBalanceAlertBandPercent: {
    readonly lowerExclusive: number;
    readonly upperExclusive: number;
  };
  /** Severity from the adiabatic rise (FR-THM-08): below `mediumFromK` Low, up to `highAboveK` Medium, above it High. */
  readonly severityByAdiabaticRiseK: { readonly mediumFromK: number; readonly highAboveK: number };
  /** Probability from TMRad at MTSR (FR-THM-08): above `lowAboveHours` Low, from `highBelowHours` up Medium, below it High. */
  readonly probabilityByTmrHours: {
    readonly lowAboveHours: number;
    readonly highBelowHours: number;
  };
  /** TD24 search interval for the bisection, °C (BRD §15). */
  readonly td24SearchRangeC: Range;
  /** The conservative TD24 when only a DSC onset is known: onset minus this many kelvin (BRL-06). */
  readonly td24ConservativeOnsetOffsetK: number;
  /** Input ranges (BRD §15.1). Outside `block`, the input is refused; outside `warn`, a warning is shown. */
  readonly inputRanges: {
    readonly temperatureC: Range;
    readonly heatCapacityJPerGK: { readonly block: Range; readonly warn: Range };
    readonly accumulationPercent: Range;
    readonly reactionEnthalpyKJPerMol: { readonly block: Range; readonly warnBelow: number };
    readonly activationEnergyKJPerMol: Range;
  };
}

const REQUIRED_NUMBERS: readonly (readonly string[])[] = [
  ['elementBalanceTolerance'],
  ['oxygenBalanceAlertBandPercent', 'lowerExclusive'],
  ['oxygenBalanceAlertBandPercent', 'upperExclusive'],
  ['severityByAdiabaticRiseK', 'mediumFromK'],
  ['severityByAdiabaticRiseK', 'highAboveK'],
  ['probabilityByTmrHours', 'lowAboveHours'],
  ['probabilityByTmrHours', 'highBelowHours'],
  ['td24SearchRangeC', 'min'],
  ['td24SearchRangeC', 'max'],
  ['td24ConservativeOnsetOffsetK'],
  ['inputRanges', 'temperatureC', 'min'],
  ['inputRanges', 'temperatureC', 'max'],
  ['inputRanges', 'heatCapacityJPerGK', 'block', 'min'],
  ['inputRanges', 'heatCapacityJPerGK', 'block', 'max'],
  ['inputRanges', 'heatCapacityJPerGK', 'warn', 'min'],
  ['inputRanges', 'heatCapacityJPerGK', 'warn', 'max'],
  ['inputRanges', 'accumulationPercent', 'min'],
  ['inputRanges', 'accumulationPercent', 'max'],
  ['inputRanges', 'reactionEnthalpyKJPerMol', 'block', 'min'],
  ['inputRanges', 'reactionEnthalpyKJPerMol', 'block', 'max'],
  ['inputRanges', 'reactionEnthalpyKJPerMol', 'warnBelow'],
  ['inputRanges', 'activationEnergyKJPerMol', 'min'],
  ['inputRanges', 'activationEnergyKJPerMol', 'max'],
];

function valueAt(source: unknown, path: readonly string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * The criteria keys that are missing or not finite numbers. Criteria arrive from storage, so they are checked at run
 * time; the engines return a DATA_GAP naming these keys instead of using any default.
 */
export function missingCriteria(criteria: unknown): readonly string[] {
  const missing = REQUIRED_NUMBERS.filter((path) => {
    const value = valueAt(criteria, path);
    return typeof value !== 'number' || !Number.isFinite(value);
  }).map((path) => path.join('.'));
  const version = valueAt(criteria, ['version']);
  if (typeof version !== 'string' || version.trim() === '') missing.unshift('version');
  return missing;
}

/** A DATA_GAP when the criteria are incomplete, otherwise null. */
export function criteriaGap(criteria: unknown): DataGap | null {
  const missing = missingCriteria(criteria);
  return missing.length ? { status: 'DATA_GAP', missing } : null;
}
