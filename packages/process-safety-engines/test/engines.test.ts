import { describe, expect, it } from 'vitest';
import {
  ENGINE_VERSION,
  type GateResult,
  IUPAC_2021_ABRIDGED,
  type MaterialInput,
  type ScreeningLibrary,
  type ThermalConditions,
  analyseMaterial,
  criteriaGap,
  greenMetrics,
  hillFormula,
  missingCriteria,
  molarMass,
  oxygenBalance,
  parseFormula,
  routeRollup,
  runGate,
  runThermal,
  screenInteractions,
  stoesselClass,
  td24FromKinetics,
  validateConditions,
} from '../src/index.js';
import { BRD_CRITERIA } from './fixtures/criteria.js';
import { PROTOTYPE_LIBRARY } from './fixtures/library.js';
import { REFERENCE_ROUTE } from './fixtures/reference-route.js';

const elements = IUPAC_2021_ABRIDGED;

function gateOf(materials: readonly MaterialInput[]): GateResult {
  const result = runGate(materials, elements, BRD_CRITERIA);
  if (result.status !== 'OK') throw new Error('unexpected data gap');
  return result;
}

const step = (id: string) => {
  const found = REFERENCE_ROUTE.find((s) => s.id === id);
  if (!found) throw new Error(id);
  return found;
};

const conditions = (overrides: Partial<ThermalConditions>): ThermalConditions => ({
  processTemperatureC: 25,
  maximumTechnicalTemperatureC: 100,
  heatCapacityJPerGK: 2,
  accumulationPercent: 100,
  reactionEnthalpy: { source: 'MANUAL', kJPerMol: -100 },
  decomposition: null,
  td24EnteredC: null,
  dscOnsetC: null,
  ...overrides,
});

describe('formula parser (FR-GATE-01)', () => {
  it('reads brackets, nested brackets and hydrates', () => {
    const alum = parseFormula('Al(OH)3', elements);
    expect(alum.ok && alum.counts).toEqual({ Al: 1, O: 3, H: 3 });
    const vitriol = parseFormula('CuSO4·5H2O', elements);
    expect(vitriol.ok && molarMass(vitriol.counts, elements)).toBeCloseTo(249.68, 1);
    const salt = parseFormula('(C2H6N2S)2·H2SO4', elements);
    expect(salt.ok && salt.counts).toEqual({ C: 4, H: 14, N: 4, S: 3, O: 4 });
    const nested = parseFormula('K4[Fe(CN)6]', elements);
    expect(nested.ok && nested.counts).toEqual({ K: 4, Fe: 1, C: 6, N: 6 });
    expect(parseFormula(' C7 H8 ', elements).ok).toBe(true);
  });

  it('refuses malformed formulas with coded errors', () => {
    const code = (raw: string | null) => {
      const result = parseFormula(raw, elements);
      return result.ok ? 'OK' : result.error.code;
    };
    expect(code('')).toBe('FORMULA_EMPTY');
    expect(code(null)).toBe('FORMULA_EMPTY');
    expect(code('Xx2')).toBe('FORMULA_UNKNOWN_ELEMENT');
    expect(code('C7H8!')).toBe('FORMULA_UNEXPECTED_CHARACTER');
    expect(code('CH3)2')).toBe('FORMULA_UNMATCHED_BRACKET');
    expect(code('(CH3')).toBe('FORMULA_UNCLOSED_BRACKET');
    expect(code('CuSO4··H2O')).toBe('FORMULA_EMPTY_HYDRATE_PART');
  });

  it('writes Hill formulas and refuses unknown elements in molar mass', () => {
    expect(hillFormula({ O: 2, C: 1 })).toBe('CO2');
    expect(hillFormula({ Cl: 1, H: 1 })).toBe('HCl');
    expect(hillFormula({ H: 10, C: 4, X: 0 })).toBe('C4H10');
    expect(() => molarMass({ Zz: 1 }, elements)).toThrow('Zz');
  });
});

describe('gate refusals (FR-GATE-01 to 06, BRL-01, BRD §15.1)', () => {
  const base: MaterialInput[] = [
    { id: 'a', role: 'Reactant', formula: 'C7H5FO', coefficient: 1, massG: 100 },
    { id: 'b', role: 'Reactant', formula: 'C7H12O3', coefficient: 1, massG: 122 },
    { id: 'p', role: 'Product', formula: 'C14H15FO3', coefficient: 1 },
    { id: 'w', role: 'By-product', formula: 'H2O', coefficient: 1 },
  ];
  const codes = (materials: MaterialInput[]) => gateOf(materials).issues.map((issue) => issue.code);

  it('requires exactly one product', () => {
    expect(codes(base.filter((m) => m.role !== 'Product'))).toContain('GATE_PRODUCT_MISSING');
    expect(
      codes([...base, { id: 'p2', role: 'Product', formula: 'H2O', coefficient: 1 }]),
    ).toContain('GATE_PRODUCT_NOT_UNIQUE');
  });

  it('requires a positive coefficient, a valid formula and a positive reactant charge', () => {
    expect(codes(base.map((m) => (m.id === 'b' ? { ...m, coefficient: 0 } : m)))).toContain(
      'GATE_COEFFICIENT_INVALID',
    );
    expect(codes(base.map((m) => (m.id === 'b' ? { ...m, formula: 'Qq' } : m)))).toContain(
      'FORMULA_UNKNOWN_ELEMENT',
    );
    expect(codes(base.map((m) => (m.id === 'b' ? { ...m, massG: -5 } : m)))).toContain(
      'GATE_CHARGE_MASS_INVALID',
    );
    expect(codes(base.map((m) => (m.role === 'Reactant' ? { ...m, massG: null } : m)))).toContain(
      'GATE_NO_CHARGED_REACTANT',
    );
  });

  it('only warns about a bad formula outside the equation, and ignores it', () => {
    const gate = gateOf([...base, { id: 's', role: 'Solvent', formula: '', massG: 300 }]);
    expect(gate.pass).toBe(true);
    expect(gate.warnings).toEqual([
      { code: 'GATE_FORMULA_IGNORED', requirement: 'FR-GATE-06', params: { materialId: 's' } },
    ]);
    expect(gate.criteriaVersion).toBe(BRD_CRITERIA.version);
    expect(gate.elementsVersion).toBe(elements.version);
  });
});

describe('oxygen balance (FR-OB-01 to 05)', () => {
  const ob = (formula: string, energeticGroups: string[] = []) =>
    oxygenBalance(
      analyseMaterial({ id: 'x', role: 'Reactant', formula, energeticGroups }, elements),
      elements,
      BRD_CRITERIA,
    );

  it('is not applicable to inorganic or metal-containing materials, and refuses bad formulas', () => {
    expect(ob('KMnO4')).toEqual({ status: 'NOT_APPLICABLE', reason: 'NO_CARBON' });
    expect(ob('C8H19Al')).toEqual({ status: 'NOT_APPLICABLE', reason: 'CONTAINS_METAL' });
    expect(ob('Xx')).toEqual({ status: 'INVALID_FORMULA' });
  });

  it('recommends High only with both the band and an energetic group; either alone is Review', () => {
    const tnt = ob('C7H5N3O6', ['nitro']);
    expect(tnt.status === 'OK' && tnt.recommendation).toBe('HIGH');
    const taggedToluene = ob('C7H8', ['nitro']);
    expect(taggedToluene.status === 'OK' && taggedToluene.recommendation).toBe('REVIEW');
    const untaggedTnt = ob('C7H5N3O6');
    expect(untaggedTnt.status === 'OK' && untaggedTnt.recommendation).toBe('REVIEW');
    const toluene = ob('C7H8');
    expect(toluene.status === 'OK' && toluene.recommendation).toBe('LOW');
    const fluorinated = ob('C7H5FO');
    expect(fluorinated.status === 'OK' && fluorinated.percent).toBeCloseTo(
      (-1600 / 124.11) * (14 + (5 - 1) / 2 - 1),
      1,
    );
  });
});

describe('thermal and runaway (FR-THM-01 to 12)', () => {
  const s3 = step('s3');
  const gate = gateOf(s3.materials);
  const thermal = (
    overrides: Partial<ThermalConditions>,
    library: ScreeningLibrary = PROTOTYPE_LIBRARY,
  ) => runThermal(gate, conditions(overrides), library, BRD_CRITERIA);

  it('is locked until the gate passes (FR-GATE-04)', () => {
    const failing = gateOf(s3.materials.filter((m) => m.role !== 'Product'));
    expect(runThermal(failing, conditions({}), PROTOTYPE_LIBRARY, BRD_CRITERIA)).toEqual({
      status: 'LOCKED',
    });
  });

  it('refuses inputs outside the §15.1 ranges and warns about unusual ones', () => {
    const invalid = thermal({
      processTemperatureC: 600,
      accumulationPercent: 120,
      heatCapacityJPerGK: 9,
    });
    expect(invalid.status).toBe('INVALID');
    expect(invalid.status === 'INVALID' && invalid.errors.map((e) => e.params?.field)).toEqual([
      'processTemperatureC',
      'heatCapacityJPerGK',
      'accumulationPercent',
    ]);
    const check = validateConditions(
      conditions({
        heatCapacityJPerGK: 0.7,
        reactionEnthalpy: { source: 'MANUAL', kJPerMol: -1500 },
        decomposition: {
          activationEnergyKJPerMol: 10,
          heatReleaseRateWPerKg: 1,
          referenceTemperatureC: 100,
        },
      }),
      BRD_CRITERIA,
    );
    expect(check.errors.map((e) => e.params?.field)).toEqual(['activationEnergyKJPerMol']);
    expect(check.warnings.map((w) => w.params?.field)).toEqual([
      'heatCapacityJPerGK',
      'reactionEnthalpyKJPerMol',
    ]);
    expect(
      validateConditions(
        conditions({ reactionEnthalpy: { source: 'MANUAL', kJPerMol: -4000 } }),
        BRD_CRITERIA,
      ).errors,
    ).toHaveLength(1);
  });

  it('explains why figures are absent: no source, unknown class, missing ΔHf°, missing conditions', () => {
    const reason = (overrides: Partial<ThermalConditions>) => {
      const result = thermal(overrides);
      return result.status === 'OK' ? result.notComputed?.code : result.status;
    };
    expect(reason({ reactionEnthalpy: null })).toBe('THM_ENTHALPY_SOURCE_MISSING');
    expect(
      reason({ reactionEnthalpy: { source: 'REACTION_CLASS', reactionClassId: 'RC-99' } }),
    ).toBe('THM_REACTION_CLASS_UNKNOWN');
    expect(reason({ reactionEnthalpy: { source: 'HESS' } })).toBe(
      'THM_HESS_FORMATION_ENTHALPY_MISSING',
    );
    expect(reason({ processTemperatureC: null })).toBe('THM_CONDITIONS_REQUIRED');
    expect(reason({ heatCapacityJPerGK: null })).toBe('THM_CONDITIONS_REQUIRED');
  });

  it("applies Hess's law from the library's formation enthalpies (FR-THM-02)", () => {
    const methane = gateOf([
      { id: 'ch4', role: 'Reactant', formula: 'CH4', coefficient: 1, massG: 16.04 },
      { id: 'o2', role: 'Reactant', formula: 'O2', coefficient: 2, massG: 64 },
      { id: 'co2', role: 'Product', formula: 'CO2', coefficient: 1 },
      { id: 'h2o', role: 'By-product', formula: 'H2O', coefficient: 2 },
    ]);
    const result = runThermal(
      methane,
      conditions({ reactionEnthalpy: { source: 'HESS' } }),
      PROTOTYPE_LIBRARY,
      BRD_CRITERIA,
    );
    expect(result.status === 'OK' && result.reactionEnthalpyKJPerMol).toBeCloseTo(
      -393.51 - 2 * 285.83 + 74.87,
      6,
    );
    expect(result.status === 'OK' && result.usesUnreviewedLibrary).toBe(true);
    // CO2 is the product here, not a by-product, so it is not an evolved gas (FR-THM-11 counts by-products only).
    expect(result.status === 'OK' && result.gases).toEqual([]);
  });

  it('takes TD24 from kinetics, an entered value, or the conservative onset rule, and says which (BRL-06)', () => {
    const basis = (overrides: Partial<ThermalConditions>) => {
      const result = thermal(overrides);
      return result.status === 'OK' ? [result.td24Basis, result.td24C] : [result.status, null];
    };
    expect(basis({ td24EnteredC: 150 })).toEqual(['ENTERED', 150]);
    expect(basis({ dscOnsetC: 180 })).toEqual(['CONSERVATIVE_ONSET', 80]);
    expect(basis({})).toEqual(['MISSING', null]);
    expect(
      basis({
        decomposition: {
          activationEnergyKJPerMol: 100,
          heatReleaseRateWPerKg: 1e-12,
          referenceTemperatureC: 25,
        },
      }),
    ).toEqual(['OUT_OF_SEARCH_RANGE', null]);
    expect(
      td24FromKinetics(
        2,
        { activationEnergyKJPerMol: 100, heatReleaseRateWPerKg: 1e9, referenceTemperatureC: 25 },
        BRD_CRITERIA.td24SearchRangeC,
      ),
    ).toBeNull();
  });

  it('grades severity by ΔTad and probability by TMRad using the criteria', () => {
    const grade = (kJPerMol: number, qRef: number | null) => {
      const result = thermal({
        reactionEnthalpy: { source: 'MANUAL', kJPerMol },
        decomposition:
          qRef === null
            ? null
            : {
                activationEnergyKJPerMol: 90,
                heatReleaseRateWPerKg: qRef,
                referenceTemperatureC: 140,
              },
      });
      return result.status === 'OK' ? [result.severity, result.probability] : [result.status];
    };
    expect(grade(-100, null)).toEqual(['LOW', 'UNKNOWN']);
    expect(grade(-450, 10)).toEqual(['MEDIUM', 'LOW']);
    expect(grade(-1500, 10)).toEqual(['HIGH', 'HIGH']);
    // q_ref 30 W/kg at 140 °C puts TMRad at MTSR (about 87 °C) near 10 h: between the 8 h and 24 h limits.
    expect(grade(-450, 30)).toEqual(['MEDIUM', 'MEDIUM']);
  });

  it('marks results that use unreviewed library entries, and not those that do not', () => {
    const reviewed: ScreeningLibrary = {
      ...PROTOTYPE_LIBRARY,
      reactionClasses: [
        {
          id: 'RC-03',
          typicalReactionEnthalpyKJPerMol: -450,
          citation: 'reviewed',
          reviewed: true,
        },
      ],
    };
    const classBased = thermal(
      { reactionEnthalpy: { source: 'REACTION_CLASS', reactionClassId: 'RC-03' } },
      reviewed,
    );
    expect(
      classBased.status === 'OK' && [
        classBased.enthalpyIsEstimate,
        classBased.usesUnreviewedLibrary,
      ],
    ).toEqual([true, false]);
    const unreviewed = thermal({
      reactionEnthalpy: { source: 'REACTION_CLASS', reactionClassId: 'RC-03' },
    });
    expect(unreviewed.status === 'OK' && unreviewed.usesUnreviewedLibrary).toBe(true);
  });

  it('orders MTSR, MTT and TD24 into Stoessel classes 1 to 5', () => {
    expect(stoesselClass(30, 60, 90)).toBe(1);
    expect(stoesselClass(30, 90, 60)).toBe(2);
    expect(stoesselClass(60, 30, 90)).toBe(3);
    expect(stoesselClass(90, 30, 60)).toBe(4);
    expect(stoesselClass(90, 60, 30)).toBe(5);
    expect(stoesselClass(null, 60, 30)).toBeNull();
  });
});

describe('interaction screener (FR-HAZ-01 to 06)', () => {
  it('picks the most severe matching rule, reports notes, and lists unclassified materials', () => {
    const result = screenInteractions(
      [
        { id: 'acid', role: 'Reactant', formula: 'HCl', libraryMaterialId: 'L10' },
        { id: 'base', role: 'Reactant', formula: 'NaOH', libraryMaterialId: 'L17' },
        { id: 'dmso', role: 'Solvent', formula: 'C2H6OS', libraryMaterialId: 'L09' },
        { id: 'unlinked', role: 'Additive', formula: 'C7H8' },
        { id: 'unknown', role: 'Additive', formula: 'C7H8', libraryMaterialId: 'L404' },
      ],
      PROTOTYPE_LIBRARY,
    );
    expect(
      result.findings.map((f) => [f.materialAId, f.materialBId, f.ruleId, f.severity]),
    ).toEqual([
      ['acid', 'base', 'R-11', 'Medium'],
      ['acid', 'dmso', 'R-02', 'Medium'],
      ['base', 'dmso', 'R-01', 'High'],
    ]);
    expect(result.notes.map((n) => n.noteKey)).toEqual(['note.dmso']);
    expect(result.unclassifiedMaterialIds).toEqual(['unlinked', 'unknown']);
    expect(result.libraryVersion).toBe(PROTOTYPE_LIBRARY.version);
  });

  it('reports no unreviewed use when every entry used is reviewed', () => {
    const reviewed: ScreeningLibrary = {
      ...PROTOTYPE_LIBRARY,
      materials: [
        { id: 'A', classes: ['acid'], citation: 'reviewed', reviewed: true },
        { id: 'B', classes: ['amine'], citation: 'reviewed', reviewed: true },
        { id: 'C', classes: ['gas'], citation: 'reviewed', reviewed: true },
      ],
      rules: [
        {
          id: 'R',
          classA: 'amine',
          classB: 'acid',
          severity: 'Low',
          citation: 'reviewed',
          reviewed: true,
        },
      ],
    };
    const result = screenInteractions(
      [
        { id: 'a', role: 'Reactant', formula: 'HCl', libraryMaterialId: 'A' },
        { id: 'b', role: 'Reactant', formula: 'C5H11N', libraryMaterialId: 'B' },
        { id: 'c', role: 'Reactant', formula: 'C4H10', libraryMaterialId: 'C' },
      ],
      reviewed,
    );
    expect(result.findings).toHaveLength(1);
    expect(result.usesUnreviewedLibrary).toBe(false);
  });
});

describe('green metrics and the route roll-up (FR-GRN-01 to 04)', () => {
  it('is locked until the gate passes, and reports AE without a product mass', () => {
    const s1 = step('s1');
    expect(greenMetrics(gateOf(s1.materials.filter((m) => m.role !== 'Product')))).toEqual({
      status: 'LOCKED',
    });
    const noMass = greenMetrics(
      gateOf(s1.materials.map((m) => (m.role === 'Product' ? { ...m, massG: null } : m))),
    );
    expect(noMass.status).toBe('NO_PRODUCT_MASS');
  });

  it('computes yield, RME, PMI, E-factor with and without water, and solvent intensity for one step', () => {
    const green = greenMetrics(gateOf(step('s1').materials));
    if (green.status !== 'OK') throw new Error(green.status);
    expect(green.yieldPercent).toBeCloseTo(85.0, 0);
    expect(green.inputsG).toBeCloseTo(926.7, 6);
    expect(green.waterG).toBeCloseTo(300, 6);
    expect(green.processMassIntensity).toBeCloseTo(926.7 / 171.5, 9);
    expect(green.eFactorExcludingWater).toBeCloseTo((926.7 - 300 - 171.5) / 171.5, 9);
    expect(green.solventIntensity).toBeCloseTo(393 / 171.5, 9);
    expect(green.reactionMassEfficiencyPercent).toBeCloseTo((171.5 / 222) * 100, 9);
  });

  it('blocks the roll-up at the first step without complete metrics', () => {
    const steps = REFERENCE_ROUTE.map((s, index) => {
      const gate = gateOf(
        index === 2 ? s.materials.filter((m) => m.role !== 'Product') : s.materials,
      );
      return { gate, green: greenMetrics(gate) };
    });
    expect(routeRollup(steps)).toEqual({ status: 'BLOCKED', blockedStepIndex: 2 });
    expect(routeRollup([])).toEqual({ status: 'BLOCKED', blockedStepIndex: 0 });
  });
});

describe('criteria and version', () => {
  it('lists every missing criterion, including the version', () => {
    expect(missingCriteria(undefined)[0]).toBe('version');
    expect(criteriaGap(BRD_CRITERIA)).toBeNull();
    expect(criteriaGap({ ...BRD_CRITERIA, version: ' ' })).toEqual({
      status: 'DATA_GAP',
      missing: ['version'],
    });
    expect(ENGINE_VERSION).toMatch(/^process-safety-engines \d+\.\d+\.\d+$/);
  });
});

describe('NFR-03 performance', () => {
  it('runs every engine over a 15-step route in under 1 s', () => {
    const fifteen = [...REFERENCE_ROUTE, ...REFERENCE_ROUTE, ...REFERENCE_ROUTE];
    const started = performance.now();
    const steps = fifteen.map((s) => {
      const gate = gateOf(s.materials);
      runThermal(gate, s.conditions, PROTOTYPE_LIBRARY, BRD_CRITERIA);
      screenInteractions(s.materials, PROTOTYPE_LIBRARY);
      for (const m of gate.materials) oxygenBalance(m, elements, BRD_CRITERIA);
      return { gate, green: greenMetrics(gate) };
    });
    routeRollup(steps);
    const elapsedMs = performance.now() - started;
    expect(steps).toHaveLength(15);
    expect(elapsedMs).toBeLessThan(1000);
  });
});
