import type {
  SpeedMessageV1,
  SpeedResultV1,
  SpeedRouteDetailV1,
  SpeedStepMaterialV1,
  SpeedStepV1,
} from '@gigalibs/contracts';

// WI-OI-120bx (SPEED S4; screen spec §2.4): what the gate workbench and the route summary show, derived from the route
// and its stored results only. Numbers come from the server's result (the engines' output); nothing is recomputed here.

export type GateState = 'passed' | 'blocked' | 'notComputed';

export interface BalanceRowView {
  readonly element: string;
  readonly inAtoms: number;
  readonly outAtoms: number;
  readonly balanced: boolean;
}

export interface GateView {
  readonly state: GateState;
  readonly issues: readonly SpeedMessageV1[];
  readonly warnings: readonly SpeedMessageV1[];
  readonly balance: readonly BalanceRowView[];
  readonly extentMol: number | null;
  readonly limitingMaterialId: string | null;
  /** Why nothing was computed (no criteria in force, a data gap). */
  readonly gap: SpeedMessageV1 | null;
}

interface GateOutput {
  readonly status?: string;
  readonly pass?: boolean;
  readonly issues?: readonly SpeedMessageV1[];
  readonly warnings?: readonly SpeedMessageV1[];
  readonly balance?: readonly BalanceRowView[];
  readonly materials?: readonly {
    readonly input: { readonly id: string };
    readonly moles: number | null;
  }[];
  readonly extentMol?: number | null;
  readonly limitingMaterialId?: string | null;
  readonly missing?: readonly string[];
  readonly reason?: SpeedMessageV1;
}

function gateOutput(result: SpeedResultV1 | null): GateOutput | null {
  const gate = result?.outputs['gate'];
  return gate && typeof gate === 'object' ? (gate as GateOutput) : null;
}

export function gateView(result: SpeedResultV1 | null): GateView {
  const gate = gateOutput(result);
  if (!gate || gate.status !== 'OK') {
    const gap =
      gate?.reason ??
      (gate?.missing
        ? { code: 'DATA_GAP', requirement: 'BRD-15', params: { missing: gate.missing } }
        : null);
    return {
      state: 'notComputed',
      issues: [],
      warnings: [],
      balance: [],
      extentMol: null,
      limitingMaterialId: null,
      gap,
    };
  }
  return {
    state: gate.pass ? 'passed' : 'blocked',
    issues: gate.issues ?? [],
    warnings: gate.warnings ?? [],
    balance: gate.balance ?? [],
    extentMol: gate.extentMol ?? null,
    limitingMaterialId: gate.limitingMaterialId ?? null,
    gap: null,
  };
}

export interface MaterialRowView {
  readonly material: SpeedStepMaterialV1;
  /** mol charged, from the server's result. */
  readonly moles: number | null;
  /** Equivalents relative to the first charged reactant (reactants only). */
  readonly equivalents: number | null;
}

export function materialRows(step: SpeedStepV1): MaterialRowView[] {
  const moles = new Map(
    (gateOutput(step.latestResult)?.materials ?? []).map((m) => [m.input.id, m.moles]),
  );
  const molesOf = (material: SpeedStepMaterialV1) => moles.get(material.id) ?? null;
  const reference = step.materials.find(
    (m) => m.role === 'Reactant' && typeof molesOf(m) === 'number',
  );
  const base = reference ? molesOf(reference) : null;
  return step.materials.map((material) => {
    const own = molesOf(material);
    return {
      material,
      moles: own,
      equivalents:
        material.role === 'Reactant' &&
        typeof own === 'number' &&
        typeof base === 'number' &&
        base > 0
          ? own / base
          : null,
    };
  });
}

/** The written equation: reactants → product + by-products, with coefficients other than 1. */
export function equation(step: SpeedStepV1): { left: string; right: string } | null {
  const term = (m: SpeedStepMaterialV1) =>
    `${m.coefficient !== null && m.coefficient !== 1 ? `${m.coefficient} ` : ''}${m.formula}`;
  const left = step.materials.filter((m) => m.role === 'Reactant').map(term);
  const right = step.materials
    .filter((m) => m.role === 'Product' || m.role === 'By-product')
    .map(term);
  if (left.length === 0 && right.length === 0) return null;
  return { left: left.join(' + '), right: right.join(' + ') };
}

export interface SummaryView {
  readonly passing: number;
  readonly steps: number;
  readonly allPass: boolean;
}

export function summaryView(route: SpeedRouteDetailV1): SummaryView {
  return {
    passing: route.stepsPassingGate,
    steps: route.stepCount,
    allPass: route.stepCount > 0 && route.stepsPassingGate === route.stepCount,
  };
}

/** Splits the workspace's configured change reasons ("Data entry|Correction|…"). */
export function changeReasons(prop: unknown): string[] {
  return typeof prop === 'string'
    ? prop
        .split('|')
        .map((reason) => reason.trim())
        .filter(Boolean)
    : [];
}

/** A number typed into a cell, or null when the cell is cleared; NaN when it is not a number. */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  return Number(trimmed);
}
