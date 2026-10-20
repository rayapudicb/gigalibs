import { describe, expect, it } from 'vitest';
import {
  type DecompositionKinetics,
  type ElementCounts,
  IUPAC_2021_ABRIDGED,
  type MaterialInput,
  type ScreeningCriteria,
  analyseMaterial,
  greenMetrics,
  hillFormula,
  missingCriteria,
  oxygenBalance,
  runGate,
  runThermal,
  timeToMaximumRateHours,
} from '../src/index.js';
import { BRD_CRITERIA } from './fixtures/criteria.js';
import { PROTOTYPE_LIBRARY } from './fixtures/library.js';
import { REFERENCE_ROUTE } from './fixtures/reference-route.js';

const elements = IUPAC_2021_ABRIDGED;

/** mulberry32: a small seeded generator, so every run of the property tests is reproducible. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RUNS = 300;
const between = (random: () => number, min: number, max: number) => min + random() * (max - min);
const integer = (random: () => number, min: number, max: number) =>
  Math.floor(between(random, min, max + 1));

function randomCounts(random: () => number): ElementCounts {
  const counts: Record<string, number> = { C: integer(random, 1, 20), H: integer(random, 1, 40) };
  for (const symbol of ['N', 'O', 'S', 'Cl'])
    if (random() < 0.5) counts[symbol] = integer(random, 1, 6);
  return counts;
}

function sum(a: ElementCounts, b: ElementCounts): ElementCounts {
  const total: Record<string, number> = { ...a };
  for (const [symbol, count] of Object.entries(b)) total[symbol] = (total[symbol] ?? 0) + count;
  return total;
}

function gateOf(materials: readonly MaterialInput[], criteria: ScreeningCriteria = BRD_CRITERIA) {
  const result = runGate(materials, elements, criteria);
  if (result.status !== 'OK') throw new Error('unexpected data gap');
  return result;
}

describe('engine properties (WI-OI-120br)', () => {
  it('FR-GATE-02: a combination A + B → AB always balances, and removing one atom always breaks it', () => {
    const random = generator(20261020);
    for (let run = 0; run < RUNS; run += 1) {
      const a = randomCounts(random);
      const b = randomCounts(random);
      const product = sum(a, b);
      const materials: MaterialInput[] = [
        {
          id: 'a',
          role: 'Reactant',
          formula: hillFormula(a),
          coefficient: 1,
          massG: between(random, 1, 500),
        },
        {
          id: 'b',
          role: 'Reactant',
          formula: hillFormula(b),
          coefficient: 1,
          massG: between(random, 1, 500),
        },
        { id: 'p', role: 'Product', formula: hillFormula(product), coefficient: 1 },
      ];
      expect(gateOf(materials).pass).toBe(true);
      const broken = { ...product, H: (product.H ?? 0) - 1 };
      const unbalanced = gateOf([
        materials[0] as MaterialInput,
        materials[1] as MaterialInput,
        { id: 'p', role: 'Product', formula: hillFormula(broken), coefficient: 1 },
      ]);
      expect(unbalanced.pass).toBe(false);
      expect(
        unbalanced.issues.find((i) => i.code === 'GATE_ELEMENT_BALANCE')?.params?.elements,
      ).toEqual(['H']);
    }
  });

  it('FR-GRN-03: PMI equals E-factor + 1 for any charges', () => {
    const random = generator(42);
    for (let run = 0; run < RUNS; run += 1) {
      const gate = gateOf([
        {
          id: 'a',
          role: 'Reactant',
          formula: 'C7H5FO',
          coefficient: 1,
          massG: between(random, 10, 1000),
        },
        {
          id: 'b',
          role: 'Reactant',
          formula: 'C7H12O3',
          coefficient: 1,
          massG: between(random, 10, 1000),
        },
        { id: 's', role: 'Solvent', formula: 'C3H8O', massG: between(random, 0, 5000) },
        { id: 'w', role: 'Work-up', formula: 'H2O', massG: between(random, 0, 5000) },
        {
          id: 'p',
          role: 'Product',
          formula: 'C14H15FO3',
          coefficient: 1,
          massG: between(random, 1, 500),
        },
        { id: 'x', role: 'By-product', formula: 'H2O', coefficient: 1 },
      ]);
      const green = greenMetrics(gate);
      if (green.status !== 'OK') throw new Error(green.status);
      expect(green.processMassIntensity - green.eFactor).toBeCloseTo(1, 12);
    }
  });

  it('FR-THM-07: TMRad falls strictly as the temperature rises', () => {
    const random = generator(7);
    for (let run = 0; run < RUNS; run += 1) {
      const kinetics: DecompositionKinetics = {
        activationEnergyKJPerMol: between(random, 20, 400),
        heatReleaseRateWPerKg: between(random, 0.1, 100),
        referenceTemperatureC: between(random, 50, 250),
      };
      const cp = between(random, 0.5, 5);
      let previous = Number.POSITIVE_INFINITY;
      for (let temperatureC = -50; temperatureC <= 400; temperatureC += 25) {
        const tmr = timeToMaximumRateHours(cp, kinetics, temperatureC);
        expect(tmr).toBeLessThan(previous);
        previous = tmr;
      }
    }
  });

  it('FR-GATE-03: the reaction extent scales linearly with the charges', () => {
    const random = generator(99);
    const step3 = REFERENCE_ROUTE.find((s) => s.id === 's3');
    if (!step3) throw new Error('missing step');
    const base = gateOf(step3.materials).extentMol ?? Number.NaN;
    for (let run = 0; run < RUNS; run += 1) {
      const factor = between(random, 0.01, 100);
      const scaled = step3.materials.map((m) =>
        typeof m.massG === 'number' ? { ...m, massG: m.massG * factor } : m,
      );
      expect(gateOf(scaled).extentMol).toBeCloseTo(base * factor, 9);
    }
  });

  it('no default: removing any criterion makes every engine return DATA_GAP naming it, never a number', () => {
    const required = missingCriteria({});
    expect(required.length).toBeGreaterThan(20);
    const step3 = REFERENCE_ROUTE.find((s) => s.id === 's3');
    if (!step3) throw new Error('missing step');
    const gate = gateOf(step3.materials);
    for (const path of required) {
      const criteria = structuredClone(BRD_CRITERIA) as unknown as Record<string, unknown>;
      const keys = path.split('.');
      let holder = criteria;
      for (const key of keys.slice(0, -1)) holder = holder[key] as Record<string, unknown>;
      delete holder[keys[keys.length - 1] as string];
      const incomplete = criteria as unknown as ScreeningCriteria;
      const outcomes = [
        runGate(step3.materials, elements, incomplete),
        oxygenBalance(
          analyseMaterial({ id: 'x', role: 'Reactant', formula: 'C7H8' }, elements),
          elements,
          incomplete,
        ),
        runThermal(gate, step3.conditions, PROTOTYPE_LIBRARY, incomplete),
      ];
      for (const outcome of outcomes) {
        expect(outcome).toEqual({ status: 'DATA_GAP', missing: [path] });
      }
    }
  });
});
