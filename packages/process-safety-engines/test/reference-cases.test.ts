import { describe, expect, it } from 'vitest';
import {
  type GateResult,
  type GreenOutcome,
  IUPAC_2021_ABRIDGED,
  type MaterialInput,
  analyseMaterial,
  greenMetrics,
  oxygenBalance,
  routeRollup,
  runGate,
  runThermal,
  screenInteractions,
  stoesselClass,
} from '../src/index.js';
import { BRD_CRITERIA } from './fixtures/criteria.js';
import { PROTOTYPE_LIBRARY } from './fixtures/library.js';
import { type FixtureStep, REFERENCE_ROUTE } from './fixtures/reference-route.js';

const elements = IUPAC_2021_ABRIDGED;
const round = (value: number, digits: number) => Number(value.toFixed(digits));

function gateOf(materials: readonly MaterialInput[]): GateResult {
  const result = runGate(materials, elements, BRD_CRITERIA);
  if (result.status !== 'OK') throw new Error('unexpected data gap');
  return result;
}

function step(id: string): FixtureStep {
  const found = REFERENCE_ROUTE.find((s) => s.id === id);
  if (!found) throw new Error(`no step ${id}`);
  return found;
}

function obPercent(formula: string): number {
  const result = oxygenBalance(
    analyseMaterial({ id: 'x', role: 'Reactant', formula }, elements),
    elements,
    BRD_CRITERIA,
  );
  if (result.status !== 'OK') throw new Error(`OB not computed: ${result.status}`);
  return result.percent;
}

describe('SPEED-BRD-FRD-001 §17 reference validation cases', () => {
  it('TC-01 (FR-OB-01): TNT C7H5N3O6 has OB −74.0 %', () => {
    expect(round(obPercent('C7H5N3O6'), 1)).toBe(-74.0);
  });

  it('TC-02 (FR-OB-01): nitroglycerin C3H5N3O9 has OB +3.5 %', () => {
    expect(round(obPercent('C3H5N3O9'), 1)).toBe(3.5);
  });

  it('TC-03 (FR-OB-01): toluene C7H8 has OB −312.6 %', () => {
    expect(round(obPercent('C7H8'), 1)).toBe(-312.6);
  });

  it('TC-04 (FR-GATE-02, FR-GRN-01): C7H5FO + C7H12O3 → C14H15FO3 + H2O is balanced with AE 93.3 %', () => {
    const gate = gateOf([
      { id: 'a', role: 'Reactant', formula: 'C7H5FO', coefficient: 1, massG: 100 },
      { id: 'b', role: 'Reactant', formula: 'C7H12O3', coefficient: 1, massG: 127.8 },
      { id: 'p', role: 'Product', formula: 'C14H15FO3', coefficient: 1 },
      { id: 'w', role: 'By-product', formula: 'H2O', coefficient: 1 },
    ]);
    expect(gate.pass).toBe(true);
    const green = greenMetrics(gate);
    expect(green.status).toBe('NO_PRODUCT_MASS');
    if (green.status === 'LOCKED') throw new Error('locked');
    expect(round(green.atomEconomyPercent, 1)).toBe(93.3);
  });

  it('TC-05 (FR-GATE-02): without water the gate fails on H and O', () => {
    const gate = gateOf([
      { id: 'a', role: 'Reactant', formula: 'C7H5FO', coefficient: 1, massG: 100 },
      { id: 'b', role: 'Reactant', formula: 'C7H12O3', coefficient: 1, massG: 127.8 },
      { id: 'p', role: 'Product', formula: 'C14H15FO3', coefficient: 1 },
    ]);
    expect(gate.pass).toBe(false);
    const balanceIssue = gate.issues.find((issue) => issue.code === 'GATE_ELEMENT_BALANCE');
    expect(balanceIssue?.requirement).toBe('FR-GATE-02');
    expect(balanceIssue?.params?.elements).toEqual(['H', 'O']);
  });

  it('TC-06 (FR-GATE-02, FR-GATE-03): route step 3 with 2 KMnO4 is balanced, ξ = 0.548 mol', () => {
    const gate = gateOf(step('s3').materials);
    expect(gate.pass).toBe(true);
    expect(round(gate.extentMol ?? Number.NaN, 3)).toBe(0.548);
    expect(gate.limitingMaterialId).toBe('m31');
  });

  it('TC-07 (FR-THM-04 to 06): step 3, ΔHr −450 kJ/mol, m 1982.5 g, Cp 2.2, Tp 25 °C, Xac 20 % gives ΔTad 56.5 K, MTSR 36.3 °C, 81.5 °C at 100 %', () => {
    const s3 = step('s3');
    const thermal = runThermal(
      gateOf(s3.materials),
      {
        ...s3.conditions,
        reactionEnthalpy: { source: 'MANUAL', kJPerMol: -450 },
        decomposition: null,
      },
      PROTOTYPE_LIBRARY,
      BRD_CRITERIA,
    );
    if (thermal.status !== 'OK') throw new Error(thermal.status);
    expect(thermal.reactionMassG).toBeCloseTo(1982.5, 6);
    expect(round(thermal.adiabaticRiseK ?? Number.NaN, 1)).toBe(56.5);
    expect(round(thermal.mtsrC ?? Number.NaN, 1)).toBe(36.3);
    expect(round(thermal.mtsrFullAccumulationC ?? Number.NaN, 1)).toBe(81.5);
  });

  it('TC-08 (FR-THM-07 to 09): step 3 decomposition Ea 90 kJ/mol, q 10 W/kg at 140 °C gives TD24 91.8 °C, class 1, class 3 at 100 %', () => {
    const s3 = step('s3');
    const thermal = runThermal(
      gateOf(s3.materials),
      s3.conditions,
      PROTOTYPE_LIBRARY,
      BRD_CRITERIA,
    );
    if (thermal.status !== 'OK') throw new Error(thermal.status);
    expect(thermal.td24Basis).toBe('KINETICS');
    expect(round(thermal.td24C ?? Number.NaN, 1)).toBe(91.8);
    expect(thermal.stoesselClass).toBe(1);
    expect(thermal.stoesselClassFullAccumulation).toBe(3);
  });

  it('TC-09 (FR-THM-09): Tp 70, MTSR 91, MTT 189, TD24 80 °C is class 5', () => {
    expect(stoesselClass(91, 189, 80)).toBe(5);
  });

  it('TC-10 (FR-THM-11): step 5 DIBAL-H reduction with 4 C4H10 by-product, ξ 0.419, gives 1.68 mol isobutane', () => {
    const s5 = step('s5');
    const gate = gateOf(s5.materials);
    expect(round(gate.extentMol ?? Number.NaN, 3)).toBe(0.419);
    const thermal = runThermal(gate, s5.conditions, PROTOTYPE_LIBRARY, BRD_CRITERIA);
    if (thermal.status !== 'OK') throw new Error(thermal.status);
    const isobutane = thermal.gases.find((gas) => gas.gasId === 'isobutane');
    expect(round(isobutane?.moles ?? Number.NaN, 2)).toBe(1.68);
  });

  it('TC-11 (FR-HAZ-02): step 4 NaOH with DMSO is a High interaction', () => {
    const result = screenInteractions(step('s4').materials, PROTOTYPE_LIBRARY);
    const naohDmso = result.findings.find(
      (f) =>
        [f.materialAId, f.materialBId].includes('m43') &&
        [f.materialAId, f.materialBId].includes('m44'),
    );
    expect(naohDmso?.severity).toBe('High');
    expect(naohDmso?.ruleId).toBe('R-01');
    expect(result.usesUnreviewedLibrary).toBe(true);
  });

  it('TC-12 (FR-GRN-04): the reference route rolls up to PMI ≈ 104, AE 29.1 %, overall yield 45.8 % (regression baseline)', () => {
    const steps = REFERENCE_ROUTE.map((s) => {
      const gate = gateOf(s.materials);
      const green: GreenOutcome = greenMetrics(gate);
      return { gate, green };
    });
    const rollup = routeRollup(steps);
    if (rollup.status !== 'OK') throw new Error(`blocked at ${rollup.blockedStepIndex}`);
    expect(Math.round(rollup.processMassIntensity)).toBe(104);
    expect(round(rollup.atomEconomyPercent, 1)).toBe(29.1);
    expect(round(rollup.overallYieldPercent, 1)).toBe(45.8);
    expect(rollup.carriedMaterialIds).toEqual(['m21', 'm31', 'm41', 'm51']);
  });
});
