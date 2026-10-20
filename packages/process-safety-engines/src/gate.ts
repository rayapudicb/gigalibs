import { type ScreeningCriteria, criteriaGap } from './criteria.js';
import { hillFormula, hillOrder, molarMass, parseFormula } from './formula.js';
import type {
  DataGap,
  ElementCounts,
  ElementTable,
  EngineMessage,
  MaterialInput,
  MaterialRole,
} from './types.js';

export type AnalysedFormula =
  | {
      readonly ok: true;
      readonly counts: ElementCounts;
      readonly molarMassGPerMol: number;
      readonly hill: string;
    }
  | { readonly ok: false; readonly error: EngineMessage };

export interface AnalysedMaterial {
  readonly input: MaterialInput;
  readonly formula: AnalysedFormula;
  /** Moles charged, from the mass and the molar mass; null when either is missing. */
  readonly moles: number | null;
}

export interface BalanceRow {
  readonly element: string;
  readonly inAtoms: number;
  readonly outAtoms: number;
  readonly balanced: boolean;
}

export interface GateResult {
  readonly status: 'OK';
  readonly pass: boolean;
  readonly issues: readonly EngineMessage[];
  readonly warnings: readonly EngineMessage[];
  readonly balance: readonly BalanceRow[];
  readonly materials: readonly AnalysedMaterial[];
  /** Reaction extent ξ, mol: the smallest moles ÷ ν over the charged reactants (BRD §15). */
  readonly extentMol: number | null;
  readonly limitingMaterialId: string | null;
  readonly productId: string | null;
  readonly criteriaVersion: string;
  readonly elementsVersion: string;
}

const EQUATION_ROLES: ReadonlySet<MaterialRole> = new Set<MaterialRole>([
  'Reactant',
  'Product',
  'By-product',
]);

export function isEquationRole(role: MaterialRole): boolean {
  return EQUATION_ROLES.has(role);
}

function positive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function analyseMaterial(input: MaterialInput, elements: ElementTable): AnalysedMaterial {
  const parsed = parseFormula(input.formula, elements);
  if (!parsed.ok) return { input, formula: { ok: false, error: parsed.error }, moles: null };
  const molarMassGPerMol = molarMass(parsed.counts, elements);
  return {
    input,
    formula: {
      ok: true,
      counts: parsed.counts,
      molarMassGPerMol,
      hill: hillFormula(parsed.counts),
    },
    moles: positive(input.massG) ? input.massG / molarMassGPerMol : null,
  };
}

/**
 * The mole-balance gate (FR-GATE-01 to 06, BRL-01, BP-01 "Poka-Yoke"). No other engine runs for a step whose gate
 * does not pass (FR-GATE-04).
 */
export function runGate(
  materials: readonly MaterialInput[],
  elements: ElementTable,
  criteria: ScreeningCriteria,
): GateResult | DataGap {
  const gap = criteriaGap(criteria);
  if (gap) return gap;

  const analysed = materials.map((material) => analyseMaterial(material, elements));
  const issues: EngineMessage[] = [];
  const warnings: EngineMessage[] = [];
  const equation = analysed.filter((m) => isEquationRole(m.input.role));

  for (const m of equation) {
    if (!m.formula.ok)
      issues.push({
        ...m.formula.error,
        params: { ...m.formula.error.params, materialId: m.input.id },
      });
    if (!positive(m.input.coefficient)) {
      issues.push({
        code: 'GATE_COEFFICIENT_INVALID',
        requirement: 'FR-INP-05',
        params: { materialId: m.input.id },
      });
    }
  }
  for (const m of analysed) {
    if (!isEquationRole(m.input.role) && !m.formula.ok) {
      warnings.push({
        code: 'GATE_FORMULA_IGNORED',
        requirement: 'FR-GATE-06',
        params: { materialId: m.input.id },
      });
    }
    const mass = m.input.massG;
    if (m.input.role === 'Reactant' && typeof mass === 'number' && !(mass > 0)) {
      issues.push({
        code: 'GATE_CHARGE_MASS_INVALID',
        requirement: 'BRD-15.1',
        params: { materialId: m.input.id },
      });
    }
  }

  const products = equation.filter((m) => m.input.role === 'Product');
  if (products.length !== 1) {
    issues.push({
      code: products.length === 0 ? 'GATE_PRODUCT_MISSING' : 'GATE_PRODUCT_NOT_UNIQUE',
      requirement: 'BRL-01',
    });
  }

  const atomsIn: Record<string, number> = {};
  const atomsOut: Record<string, number> = {};
  for (const m of equation) {
    if (!m.formula.ok || !positive(m.input.coefficient)) continue;
    const target = m.input.role === 'Reactant' ? atomsIn : atomsOut;
    for (const [element, count] of Object.entries(m.formula.counts)) {
      target[element] = (target[element] ?? 0) + count * m.input.coefficient;
    }
  }
  const balance = [...new Set([...Object.keys(atomsIn), ...Object.keys(atomsOut)])]
    .sort(hillOrder)
    .map((element) => {
      const inAtoms = atomsIn[element] ?? 0;
      const outAtoms = atomsOut[element] ?? 0;
      return {
        element,
        inAtoms,
        outAtoms,
        balanced: Math.abs(inAtoms - outAtoms) <= criteria.elementBalanceTolerance,
      };
    });
  const unbalanced = balance.filter((row) => !row.balanced).map((row) => row.element);
  if (unbalanced.length) {
    issues.push({
      code: 'GATE_ELEMENT_BALANCE',
      requirement: 'FR-GATE-02',
      params: { elements: unbalanced },
    });
  }

  let extentMol: number | null = null;
  let limitingMaterialId: string | null = null;
  for (const m of equation) {
    if (m.input.role !== 'Reactant' || m.moles === null || !positive(m.input.coefficient)) continue;
    const extent = m.moles / m.input.coefficient;
    if (extentMol === null || extent < extentMol) {
      extentMol = extent;
      limitingMaterialId = m.input.id;
    }
  }
  if (extentMol === null)
    issues.push({ code: 'GATE_NO_CHARGED_REACTANT', requirement: 'FR-GATE-05' });

  return {
    status: 'OK',
    pass: issues.length === 0,
    issues,
    warnings,
    balance,
    materials: analysed,
    extentMol,
    limitingMaterialId,
    productId: products.length === 1 ? (products[0] as AnalysedMaterial).input.id : null,
    criteriaVersion: criteria.version,
    elementsVersion: elements.version,
  };
}
