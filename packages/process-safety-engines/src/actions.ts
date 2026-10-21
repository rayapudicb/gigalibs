import type { ScreeningCriteria } from './criteria.js';
import type { GateResult } from './gate.js';
import type { InteractionFinding, InteractionResult } from './interactions.js';
import type { ScreeningLibrary } from './library.js';
import type { OxygenBalanceResult } from './oxygen-balance.js';
import type { ThermalOutcome, ThermalResult } from './thermal.js';
import type { DataGap, EngineMessage } from './types.js';

/** Everything the engines produced for one step, in route order (WI-OI-120bv; screen spec §2.4 Dossier). */
export interface StepScreening {
  readonly stepId: string;
  readonly gate: GateResult;
  readonly oxygenBalance: readonly {
    readonly materialId: string;
    readonly result: OxygenBalanceResult | DataGap;
  }[];
  readonly thermal: ThermalOutcome;
  readonly interactions: InteractionResult;
}

/** What people recorded about the results: these are records, not engine results, so they come in as data. */
export interface ScreeningDecisions {
  /** Keys from `interactionFindingKey` of High findings whose control is documented (BRL-04). */
  readonly documentedControls: ReadonlySet<string>;
  /** Step ids whose class 4–5 mitigation the safety reviewer accepted (BRL-03). */
  readonly acceptedMitigations: ReadonlySet<string>;
}

export type ActionLevel = 'CRITICAL' | 'REVIEW' | 'DATA_GAP';

/** One "action before kilo-lab". `stepId` is null for a route-level action; the UI and dossier translate `code`. */
export interface ScreeningAction extends EngineMessage {
  readonly level: ActionLevel;
  readonly stepId: string | null;
}

/** The stable key of an interaction finding within a route. */
export function interactionFindingKey(
  stepId: string,
  finding: Pick<InteractionFinding, 'materialAId' | 'materialBId'>,
): string {
  return `${stepId}:${finding.materialAId}:${finding.materialBId}`;
}

function worstClass(thermal: ThermalResult): number {
  return Math.max(thermal.stoesselClass ?? 0, thermal.stoesselClassFullAccumulation ?? 0);
}

function action(
  level: ActionLevel,
  stepId: string | null,
  code: string,
  requirement: string,
  params?: EngineMessage['params'],
): ScreeningAction {
  return params
    ? { level, stepId, code, requirement, params }
    : { level, stepId, code, requirement };
}

/**
 * The actions before kilo-lab (FR-RPT-01; the mock's `buildActions`), in route order. A step whose gate fails yields
 * only "the gate is failing" (FR-GATE-04). Route-level: an unreviewed library (BRD 16.2).
 */
export function actionList(
  steps: readonly StepScreening[],
  decisions: ScreeningDecisions,
  library: ScreeningLibrary,
  criteria: ScreeningCriteria,
): ScreeningAction[] {
  const actions: ScreeningAction[] = [];
  let usesUnreviewed = false;
  for (const step of steps) {
    const id = step.stepId;
    if (!step.gate.pass) {
      actions.push(action('CRITICAL', id, 'ACTION_GATE_FAILING', 'FR-GATE-04'));
      continue;
    }
    for (const { materialId, result } of step.oxygenBalance) {
      if (result.status !== 'OK') continue;
      if (result.recommendation === 'HIGH')
        actions.push(action('CRITICAL', id, 'ACTION_OB_HIGH', 'BRL-02', { materialId }));
      else if (result.recommendation === 'REVIEW') {
        actions.push(
          action('REVIEW', id, 'ACTION_OB_REVIEW', 'FR-OB-05', {
            materialId,
            percent: result.percent,
            basis: result.inAlertBand ? 'ALERT_BAND' : 'ENERGETIC_GROUP',
          }),
        );
      }
    }
    const thermal = step.thermal;
    if (thermal.status === 'OK') {
      usesUnreviewed ||= thermal.usesUnreviewedLibrary;
      const worst = worstClass(thermal);
      if (worst >= 4) {
        actions.push(
          action('CRITICAL', id, 'ACTION_STOESSEL_CRITICAL', 'FR-THM-09', {
            stoesselClass: worst,
            mitigationAccepted: decisions.acceptedMitigations.has(id) ? 'yes' : 'no',
          }),
        );
      } else if (worst === 3) {
        actions.push(action('REVIEW', id, 'ACTION_STOESSEL_3', 'FR-THM-09'));
      }
    }
    usesUnreviewed ||= step.interactions.usesUnreviewedLibrary;
    for (const finding of step.interactions.findings) {
      if (finding.severity === 'High') {
        actions.push(
          action('CRITICAL', id, 'ACTION_INTERACTION_HIGH', 'BRL-04', {
            ruleId: finding.ruleId,
            materialAId: finding.materialAId,
            materialBId: finding.materialBId,
            controlDocumented: decisions.documentedControls.has(interactionFindingKey(id, finding))
              ? 'yes'
              : 'no',
          }),
        );
      } else if (finding.severity === 'Medium') {
        actions.push(
          action('REVIEW', id, 'ACTION_INTERACTION_MEDIUM', 'FR-HAZ-02', {
            ruleId: finding.ruleId,
            materialAId: finding.materialAId,
            materialBId: finding.materialBId,
          }),
        );
      }
    }
    if (thermal.status === 'DATA_GAP') {
      actions.push(
        action('DATA_GAP', id, 'ACTION_CRITERIA_MISSING', 'FR-THM-01', {
          missing: thermal.missing,
        }),
      );
    } else if (thermal.status === 'OK') {
      if (thermal.enthalpyIsEstimate)
        actions.push(action('DATA_GAP', id, 'ACTION_DH_ESTIMATE', 'BRL-05'));
      if (thermal.td24Basis === 'CONSERVATIVE_ONSET') {
        actions.push(
          action('DATA_GAP', id, 'ACTION_TD24_CONSERVATIVE', 'BRL-06', {
            offsetK: criteria.td24ConservativeOnsetOffsetK,
          }),
        );
      }
      if (thermal.td24Basis === 'MISSING' && thermal.adiabaticRiseK !== null) {
        actions.push(action('DATA_GAP', id, 'ACTION_NO_DECOMPOSITION_DATA', 'FR-THM-07'));
      }
      if (thermal.td24Basis === 'OUT_OF_SEARCH_RANGE')
        actions.push(action('DATA_GAP', id, 'ACTION_TD24_OUT_OF_RANGE', 'FR-THM-07'));
      if (thermal.notComputed) {
        actions.push(
          action('DATA_GAP', id, 'ACTION_THERMAL_NOT_COMPUTED', 'FR-THM-01', {
            reasonCode: thermal.notComputed.code,
          }),
        );
      }
      for (const gas of thermal.gases) {
        actions.push(
          action('REVIEW', id, 'ACTION_GAS_EVOLUTION', 'FR-THM-11', {
            materialId: gas.materialId,
            gasId: gas.gasId,
            moles: gas.moles,
            litresAtStp: gas.litresAtStp,
          }),
        );
      }
    }
  }
  if (usesUnreviewed)
    actions.push(
      action('DATA_GAP', null, 'ACTION_LIBRARY_UNREVIEWED', 'BRD-16.2', {
        libraryVersion: library.version,
      }),
    );
  return actions;
}

export type Stage2Target =
  | { readonly kind: 'MATERIAL'; readonly materialId: string }
  | { readonly kind: 'REACTION_MIXTURE' }
  | { readonly kind: 'REACTION_AT_DOSING' }
  | { readonly kind: 'MATERIAL_PAIR'; readonly materialAId: string; readonly materialBId: string };

/** One recommended Stage 2 test. `test` is a test code (DSC, ARC, RC1 … or the library rule's own). */
export interface Stage2Test {
  readonly stepId: string;
  readonly target: Stage2Target;
  readonly test: string;
  readonly reason: EngineMessage;
}

function targetKey(target: Stage2Target): string {
  switch (target.kind) {
    case 'MATERIAL':
      return `material:${target.materialId}`;
    case 'MATERIAL_PAIR':
      return `pair:${target.materialAId}:${target.materialBId}`;
    default:
      return target.kind;
  }
}

/**
 * The Stage 2 test plan (the mock's `stage2Plan`): OB for review (DSC, or DSC and ARC when high), an
 * estimated ΔHr (RC1), a missing, conservative or out-of-range TD24 (DSC or ARC), class 3 or worse (RC1 with
 * accumulation), evolved gas (gas measurement), and every interaction whose library rule names a test. Steps whose gate
 * fails are left out; each step, target and test appears once.
 */
export function stage2Plan(steps: readonly StepScreening[]): Stage2Test[] {
  const plan: Stage2Test[] = [];
  const seen = new Set<string>();
  const add = (entry: Stage2Test) => {
    const key = `${entry.stepId}|${targetKey(entry.target)}|${entry.test}`;
    if (seen.has(key)) return;
    seen.add(key);
    plan.push(entry);
  };
  for (const step of steps) {
    if (!step.gate.pass) continue;
    const stepId = step.stepId;
    for (const { materialId, result } of step.oxygenBalance) {
      if (result.status !== 'OK') continue;
      if (result.recommendation === 'HIGH') {
        add({
          stepId,
          target: { kind: 'MATERIAL', materialId },
          test: 'DSC_ARC',
          reason: { code: 'STAGE2_OB_HIGH', requirement: 'BRL-02' },
        });
      } else if (result.recommendation === 'REVIEW') {
        add({
          stepId,
          target: { kind: 'MATERIAL', materialId },
          test: 'DSC',
          reason: { code: 'STAGE2_OB_REVIEW', requirement: 'FR-OB-05' },
        });
      }
    }
    const thermal = step.thermal;
    if (thermal.status === 'OK') {
      const mixture: Stage2Target = { kind: 'REACTION_MIXTURE' };
      if (thermal.enthalpyIsEstimate)
        add({
          stepId,
          target: mixture,
          test: 'RC1',
          reason: { code: 'STAGE2_DH_ESTIMATE', requirement: 'BRL-05' },
        });
      if (thermal.td24Basis === 'MISSING')
        add({
          stepId,
          target: mixture,
          test: 'DSC',
          reason: { code: 'STAGE2_NO_DECOMPOSITION_DATA', requirement: 'FR-THM-07' },
        });
      if (thermal.td24Basis === 'CONSERVATIVE_ONSET')
        add({
          stepId,
          target: mixture,
          test: 'ARC',
          reason: { code: 'STAGE2_TD24_CONSERVATIVE', requirement: 'BRL-06' },
        });
      if (thermal.td24Basis === 'OUT_OF_SEARCH_RANGE')
        add({
          stepId,
          target: mixture,
          test: 'ARC',
          reason: { code: 'STAGE2_TD24_OUT_OF_RANGE', requirement: 'FR-THM-07' },
        });
      const worst = worstClass(thermal);
      if (worst >= 3) {
        add({
          stepId,
          target: { kind: 'REACTION_AT_DOSING' },
          test: 'RC1_ACCUMULATION',
          reason: {
            code: 'STAGE2_STOESSEL_CLASS',
            requirement: 'FR-THM-09',
            params: { stoesselClass: worst },
          },
        });
      }
      for (const gas of thermal.gases) {
        add({
          stepId,
          target: { kind: 'MATERIAL', materialId: gas.materialId },
          test: 'GAS_MEASUREMENT',
          reason: {
            code: 'STAGE2_GAS_RELEASED',
            requirement: 'FR-THM-11',
            params: { moles: gas.moles },
          },
        });
      }
    }
    for (const finding of step.interactions.findings) {
      if (!finding.recommendedTest) continue;
      add({
        stepId,
        target: {
          kind: 'MATERIAL_PAIR',
          materialAId: finding.materialAId,
          materialBId: finding.materialBId,
        },
        test: finding.recommendedTest,
        reason: {
          code: 'STAGE2_INTERACTION_RULE',
          requirement: 'FR-HAZ-02',
          params: { ruleId: finding.ruleId },
        },
      });
    }
  }
  return plan;
}
