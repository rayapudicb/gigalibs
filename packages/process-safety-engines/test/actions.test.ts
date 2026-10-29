import { describe, expect, it } from 'vitest';
import {
  type GateResult,
  IUPAC_2021_ABRIDGED,
  type MaterialInput,
  type ScreeningDecisions,
  type ScreeningLibrary,
  type StepScreening,
  type ThermalConditions,
  actionList,
  interactionFindingKey,
  oxygenBalance,
  runGate,
  runThermal,
  screenInteractions,
  stage2Plan,
} from '../src/index.js';
import { BRD_CRITERIA } from './fixtures/criteria.js';
import { PROTOTYPE_LIBRARY } from './fixtures/library.js';
import { type FixtureStep, REFERENCE_ROUTE } from './fixtures/reference-route.js';

// WI-OI-120bv (SPEED S7a): the dossier's actions before kilo-lab and its Stage 2 test plan, on the reference route.
const elements = IUPAC_2021_ABRIDGED;
const NONE: ScreeningDecisions = { documentedControls: new Set(), acceptedMitigations: new Set() };

function gateOf(materials: readonly MaterialInput[]): GateResult {
  const gate = runGate(materials, elements, BRD_CRITERIA);
  if (gate.status !== 'OK') throw new Error('data gap');
  return gate;
}

function screen(
  step: FixtureStep,
  overrides: {
    materials?: readonly MaterialInput[];
    conditions?: Partial<ThermalConditions>;
    library?: ScreeningLibrary;
    criteria?: unknown;
  } = {},
): StepScreening {
  const materials = overrides.materials ?? step.materials;
  const library = overrides.library ?? PROTOTYPE_LIBRARY;
  const criteria = (overrides.criteria ?? BRD_CRITERIA) as typeof BRD_CRITERIA;
  const gate = gateOf(materials);
  return {
    stepId: step.id,
    gate,
    oxygenBalance: gate.materials.map((m) => ({
      materialId: m.input.id,
      result: oxygenBalance(m, elements, BRD_CRITERIA),
    })),
    thermal: runThermal(gate, { ...step.conditions, ...overrides.conditions }, library, criteria),
    interactions: screenInteractions(materials, library),
  };
}

const step = (id: string) => {
  const found = REFERENCE_ROUTE.find((s) => s.id === id);
  if (!found) throw new Error(id);
  return found;
};
const route = () => REFERENCE_ROUTE.map((s) => screen(s));
const codesFor = (actions: ReturnType<typeof actionList>, stepId: string | null) =>
  actions.filter((a) => a.stepId === stepId).map((a) => a.code);

describe('actions before kilo-lab (WI-OI-120bv)', () => {
  it('reduces a step whose gate fails to the gate action, and leaves it out of the Stage 2 plan (FR-GATE-04)', () => {
    const s1 = step('s1');
    const failing = screen(s1, { materials: s1.materials.filter((m) => m.role !== 'By-product') });
    expect(actionList([failing], NONE, PROTOTYPE_LIBRARY, BRD_CRITERIA)).toEqual([
      { level: 'CRITICAL', stepId: 's1', code: 'ACTION_GATE_FAILING', requirement: 'FR-GATE-04' },
    ]);
    expect(stage2Plan([failing])).toEqual([]);
  });

  it('raises OB in the band as Review, and as Critical with DSC and ARC once an energetic group is tagged (BRL-02)', () => {
    const s1 = step('s1');
    const plain = actionList([screen(s1)], NONE, PROTOTYPE_LIBRARY, BRD_CRITERIA);
    expect(plain.find((a) => a.code === 'ACTION_OB_REVIEW')?.params?.materialId).toBe('m14');
    const tagged = screen(s1, {
      materials: s1.materials.map((m) =>
        m.id === 'm14' ? { ...m, energeticGroups: ['peroxide'] } : m,
      ),
    });
    const actions = actionList([tagged], NONE, PROTOTYPE_LIBRARY, BRD_CRITERIA);
    expect(actions.find((a) => a.code === 'ACTION_OB_HIGH')).toMatchObject({
      level: 'CRITICAL',
      requirement: 'BRL-02',
      params: { materialId: 'm14' },
    });
    expect(stage2Plan([tagged])).toContainEqual({
      stepId: 's1',
      target: { kind: 'MATERIAL', materialId: 'm14' },
      test: 'DSC_ARC',
      reason: { code: 'STAGE2_OB_HIGH', requirement: 'BRL-02' },
    });
    expect(plain.find((a) => a.code === 'ACTION_OB_REVIEW')?.params?.basis).toBe('ALERT_BAND');
    expect(
      stage2Plan([screen(s1)]).find(
        (t) => t.target.kind === 'MATERIAL' && t.target.materialId === 'm14',
      )?.test,
    ).toBe('DSC');
  });

  it('asks for DSC when an energetic group is tagged outside the OB band (FR-OB-05)', () => {
    const s1 = step('s1');
    const outside = s1.materials.find((m) => m.id !== 'm14' && m.role === 'Reactant');
    if (!outside) throw new Error('no reactant');
    const tagged = screen(s1, {
      materials: s1.materials.map((m) =>
        m.id === outside.id ? { ...m, energeticGroups: ['azide'] } : m,
      ),
    });
    const review = actionList([tagged], NONE, PROTOTYPE_LIBRARY, BRD_CRITERIA).find(
      (a) => a.code === 'ACTION_OB_REVIEW' && a.params?.materialId === outside.id,
    );
    expect(review?.params?.basis).toBe('ENERGETIC_GROUP');
    expect(stage2Plan([tagged])).toContainEqual({
      stepId: 's1',
      target: { kind: 'MATERIAL', materialId: outside.id },
      test: 'DSC',
      reason: { code: 'STAGE2_OB_REVIEW', requirement: 'FR-OB-05' },
    });
  });

  it('grades the worst Stoessel class: class 3 is Review with RC1 at the dosing; class 5 is Critical, showing whether the mitigation is accepted', () => {
    const steps = route();
    const actions = actionList(steps, NONE, PROTOTYPE_LIBRARY, BRD_CRITERIA);
    expect(codesFor(actions, 's3')).toContain('ACTION_STOESSEL_3');
    expect(stage2Plan(steps)).toContainEqual({
      stepId: 's3',
      target: { kind: 'REACTION_AT_DOSING' },
      test: 'RC1_ACCUMULATION',
      reason: {
        code: 'STAGE2_STOESSEL_CLASS',
        requirement: 'FR-THM-09',
        params: { stoesselClass: 3 },
      },
    });
    expect(
      actions.find((a) => a.stepId === 's4' && a.code === 'ACTION_STOESSEL_CRITICAL')?.params,
    ).toEqual({ stoesselClass: 5, mitigationAccepted: 'no' });
    const accepted = actionList(
      steps,
      { ...NONE, acceptedMitigations: new Set(['s4']) },
      PROTOTYPE_LIBRARY,
      BRD_CRITERIA,
    );
    expect(
      accepted.find((a) => a.stepId === 's4' && a.code === 'ACTION_STOESSEL_CRITICAL')?.params
        ?.mitigationAccepted,
    ).toBe('yes');
  });

  it('makes a High interaction Critical, showing whether its control is documented; a Medium one is Review (BRL-04, FR-HAZ-02)', () => {
    const s4 = screen(step('s4'));
    const high = (decisions: ScreeningDecisions) =>
      actionList([s4], decisions, PROTOTYPE_LIBRARY, BRD_CRITERIA).find(
        (a) =>
          a.code === 'ACTION_INTERACTION_HIGH' &&
          a.params?.materialAId === 'm43' &&
          a.params?.materialBId === 'm44',
      );
    expect(high(NONE)?.params).toMatchObject({ ruleId: 'R-01', controlDocumented: 'no' });
    const finding = s4.interactions.findings.find((f) => f.ruleId === 'R-01');
    if (!finding) throw new Error('no R-01 finding');
    expect(
      high({ ...NONE, documentedControls: new Set([interactionFindingKey('s4', finding)]) })?.params
        ?.controlDocumented,
    ).toBe('yes');
    const s2 = actionList([screen(step('s2'))], NONE, PROTOTYPE_LIBRARY, BRD_CRITERIA);
    expect(
      s2.find((a) => a.code === 'ACTION_INTERACTION_MEDIUM' && a.params?.ruleId === 'R-02'),
    ).toMatchObject({ level: 'REVIEW' });
  });

  it("takes an interaction's Stage 2 test from the library rule, not from code", () => {
    const plan = stage2Plan(route());
    expect(plan).toContainEqual({
      stepId: 's4',
      target: { kind: 'MATERIAL_PAIR', materialAId: 'm43', materialBId: 'm44' },
      test: 'DSC_MIXTURE',
      reason: {
        code: 'STAGE2_INTERACTION_RULE',
        requirement: 'FR-HAZ-02',
        params: { ruleId: 'R-01' },
      },
    });
    const withoutTests: ScreeningLibrary = {
      ...PROTOTYPE_LIBRARY,
      rules: PROTOTYPE_LIBRARY.rules.map(({ recommendedTest: _dropped, ...rule }) => rule),
    };
    const plain = stage2Plan(REFERENCE_ROUTE.map((s) => screen(s, { library: withoutTests })));
    expect(plain.some((t) => t.target.kind === 'MATERIAL_PAIR')).toBe(false);
  });

  it('lists evolved gas for review and measurement (FR-THM-11)', () => {
    const s5 = screen(step('s5'));
    const gas = actionList([s5], NONE, PROTOTYPE_LIBRARY, BRD_CRITERIA).find(
      (a) => a.code === 'ACTION_GAS_EVOLUTION',
    );
    expect(gas?.params?.materialId).toBe('m5a');
    expect(Number(gas?.params?.moles)).toBeCloseTo(1.678, 2);
    expect(stage2Plan([s5]).find((t) => t.test === 'GAS_MEASUREMENT')?.target).toEqual({
      kind: 'MATERIAL',
      materialId: 'm5a',
    });
  });

  it('records data gaps: estimated ΔHr, conservative, missing and out-of-range TD24, uncomputed results and missing criteria', () => {
    const actions = actionList(route(), NONE, PROTOTYPE_LIBRARY, BRD_CRITERIA);
    for (const id of ['s1', 's2', 's3', 's4', 's5'])
      expect(codesFor(actions, id)).toContain('ACTION_DH_ESTIMATE');
    for (const id of ['s1', 's2', 's4', 's5']) {
      expect(
        actions.find((a) => a.stepId === id && a.code === 'ACTION_TD24_CONSERVATIVE')?.params,
      ).toEqual({ offsetK: 100 });
    }
    expect(codesFor(actions, 's3')).not.toContain('ACTION_TD24_CONSERVATIVE');

    const s1 = step('s1');
    const missing = screen(s1, { conditions: { dscOnsetC: null } });
    expect(codesFor(actionList([missing], NONE, PROTOTYPE_LIBRARY, BRD_CRITERIA), 's1')).toContain(
      'ACTION_NO_DECOMPOSITION_DATA',
    );
    expect(
      stage2Plan([missing]).find((t) => t.reason.code === 'STAGE2_NO_DECOMPOSITION_DATA')?.test,
    ).toBe('DSC');

    const entered = screen(s1, { conditions: { dscOnsetC: null, td24EnteredC: 150 } });
    expect(
      codesFor(actionList([entered], NONE, PROTOTYPE_LIBRARY, BRD_CRITERIA), 's1').filter(
        (c) => c.startsWith('ACTION_TD24') || c === 'ACTION_NO_DECOMPOSITION_DATA',
      ),
    ).toEqual([]);
    expect(
      stage2Plan([entered]).some(
        (t) =>
          t.reason.code.startsWith('STAGE2_TD24') ||
          t.reason.code === 'STAGE2_NO_DECOMPOSITION_DATA',
      ),
    ).toBe(false);

    const outOfRange = screen(s1, {
      conditions: {
        decomposition: {
          activationEnergyKJPerMol: 100,
          heatReleaseRateWPerKg: 1e-12,
          referenceTemperatureC: 25,
        },
      },
    });
    expect(
      codesFor(actionList([outOfRange], NONE, PROTOTYPE_LIBRARY, BRD_CRITERIA), 's1'),
    ).toContain('ACTION_TD24_OUT_OF_RANGE');
    expect(
      stage2Plan([outOfRange]).find((t) => t.reason.code === 'STAGE2_TD24_OUT_OF_RANGE')?.test,
    ).toBe('ARC');

    const notComputed = screen(s1, { conditions: { reactionEnthalpy: null } });
    expect(
      actionList([notComputed], NONE, PROTOTYPE_LIBRARY, BRD_CRITERIA).find(
        (a) => a.code === 'ACTION_THERMAL_NOT_COMPUTED',
      )?.params,
    ).toEqual({
      reasonCode: 'THM_ENTHALPY_SOURCE_MISSING',
    });

    const gap = screen(s1, {
      criteria: { ...BRD_CRITERIA, td24ConservativeOnsetOffsetK: undefined },
    });
    expect(
      actionList([gap], NONE, PROTOTYPE_LIBRARY, BRD_CRITERIA).find(
        (a) => a.code === 'ACTION_CRITERIA_MISSING',
      )?.params,
    ).toEqual({
      missing: ['td24ConservativeOnsetOffsetK'],
    });
  });

  it('adds one route-level action when an unreviewed library entry was used, and none when every entry is reviewed', () => {
    const actions = actionList(route(), NONE, PROTOTYPE_LIBRARY, BRD_CRITERIA);
    expect(actions.filter((a) => a.code === 'ACTION_LIBRARY_UNREVIEWED')).toEqual([
      {
        level: 'DATA_GAP',
        stepId: null,
        code: 'ACTION_LIBRARY_UNREVIEWED',
        requirement: 'BRD-16.2',
        params: { libraryVersion: PROTOTYPE_LIBRARY.version },
      },
    ]);
    const reviewed: ScreeningLibrary = {
      ...PROTOTYPE_LIBRARY,
      materials: PROTOTYPE_LIBRARY.materials.map((m) => ({ ...m, reviewed: true })),
      rules: PROTOTYPE_LIBRARY.rules.map((r) => ({ ...r, reviewed: true })),
      reactionClasses: PROTOTYPE_LIBRARY.reactionClasses.map((r) => ({ ...r, reviewed: true })),
      gases: Object.fromEntries(
        Object.entries(PROTOTYPE_LIBRARY.gases).map(([k, g]) => [k, { ...g, reviewed: true }]),
      ),
    };
    const steps = REFERENCE_ROUTE.map((s) => screen(s, { library: reviewed }));
    expect(
      actionList(steps, NONE, reviewed, BRD_CRITERIA).some(
        (a) => a.code === 'ACTION_LIBRARY_UNREVIEWED',
      ),
    ).toBe(false);
  });

  it('lists each step, target and test once in the Stage 2 plan', () => {
    const s5 = screen(step('s5'));
    const twice = stage2Plan([s5, s5]);
    expect(twice).toEqual(stage2Plan([s5]));
    const keys = stage2Plan(route()).map(
      (t) => `${t.stepId}|${JSON.stringify(t.target)}|${t.test}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
