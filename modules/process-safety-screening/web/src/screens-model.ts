import type {
  SpeedCriteriaSetV1,
  SpeedLibrarySetV1,
  SpeedResultV1,
  SpeedRouteDetailV1,
  SpeedStepV1,
} from '@gigalibs/contracts';
import type {
  GreenOutcome,
  ScreeningCriteria,
  ScreeningLibrary,
  ThermalOutcome,
  ThermalResult,
} from '@gigalibs/process-safety-engines';

// WI-OI-120by (SPEED S5): what the oxygen-balance, thermal and green panels show, read from the stored results. The
// browser preview converts the sets in force to the engines' inputs, exactly as the server does.

export interface ObResultView {
  readonly status: string;
  readonly percent?: number;
  readonly inAlertBand?: boolean;
  readonly energetic?: boolean;
  readonly recommendation?: 'HIGH' | 'REVIEW' | 'LOW';
}

export interface ObRowView {
  readonly step: SpeedStepV1;
  readonly materialId: string;
  readonly name: string;
  readonly formula: string;
  readonly molarMass: number;
  readonly energeticGroups: readonly string[];
  readonly materialVersion: number;
  readonly result: ObResultView;
}

function outputs(result: SpeedResultV1 | null): Record<string, unknown> {
  return result?.outputs ?? {};
}

/** Every material's oxygen balance, step by step, from the steps that pass the gate. */
export function obRows(route: SpeedRouteDetailV1): ObRowView[] {
  return route.steps.flatMap((step) => {
    const entries =
      (outputs(step.latestResult)['oxygenBalance'] as
        | { materialId: string; result: ObResultView }[]
        | undefined) ?? [];
    return entries.flatMap((entry) => {
      const material = step.materials.find((m) => m.id === entry.materialId);
      return material
        ? [
            {
              step,
              materialId: material.id,
              name: material.substanceName,
              formula: material.formula,
              molarMass: material.molarMassGPerMol,
              energeticGroups: material.energeticGroups,
              materialVersion: material.version,
              result: entry.result,
            },
          ]
        : [];
    });
  });
}

/** One chart point per distinct formula; the worst recommendation of its materials. */
export function obPoints(rows: readonly ObRowView[]): {
  formula: string;
  names: string;
  percent: number;
  recommendation: 'HIGH' | 'REVIEW' | 'LOW';
}[] {
  const rank = { LOW: 0, REVIEW: 1, HIGH: 2 } as const;
  const byFormula = new Map<
    string,
    {
      formula: string;
      names: Set<string>;
      percent: number;
      recommendation: 'HIGH' | 'REVIEW' | 'LOW';
    }
  >();
  for (const row of rows) {
    if (
      row.result.status !== 'OK' ||
      typeof row.result.percent !== 'number' ||
      !row.result.recommendation
    )
      continue;
    const found = byFormula.get(row.formula);
    if (!found)
      byFormula.set(row.formula, {
        formula: row.formula,
        names: new Set([row.name]),
        percent: row.result.percent,
        recommendation: row.result.recommendation,
      });
    else {
      found.names.add(row.name);
      if (rank[row.result.recommendation] > rank[found.recommendation])
        found.recommendation = row.result.recommendation;
    }
  }
  return [...byFormula.values()].map((point) => ({ ...point, names: [...point.names].join(', ') }));
}

export function thermalOf(step: SpeedStepV1): ThermalOutcome | null {
  const thermal = outputs(step.latestResult)['thermal'];
  return thermal && typeof thermal === 'object' ? (thermal as ThermalOutcome) : null;
}

export function greenOf(step: SpeedStepV1): GreenOutcome | null {
  const green = outputs(step.latestResult)['green'];
  return green && typeof green === 'object' ? (green as GreenOutcome) : null;
}

/** The higher of the actual and the full-accumulation class (the route summary's "worst criticality"). */
export function worstClass(thermal: ThermalResult): number | null {
  const classes = [thermal.stoesselClass, thermal.stoesselClassFullAccumulation].filter(
    (value): value is NonNullable<typeof value> => value !== null,
  );
  return classes.length > 0 ? Math.max(...classes) : null;
}

/** The route's worst class over its steps, or null when no step has one. */
export function routeWorstClass(route: SpeedRouteDetailV1): number | null {
  const classes = route.steps.flatMap((step) => {
    const thermal = thermalOf(step);
    const worst = thermal?.status === 'OK' ? worstClass(thermal) : null;
    return worst === null ? [] : [worst];
  });
  return classes.length > 0 ? Math.max(...classes) : null;
}

export interface LadderMarker {
  readonly key: 'tp' | 'mtsr' | 'mtsrFull' | 'mtt' | 'td24';
  readonly valueC: number;
}

/** The temperature ladder's markers, lowest first; a marker without a value is left out. */
export function ladderMarkers(
  thermal: ThermalResult,
  processTemperatureC: number | null,
  maximumTechnicalTemperatureC: number | null,
): LadderMarker[] {
  const markers: { key: LadderMarker['key']; valueC: number | null }[] = [
    { key: 'tp', valueC: processTemperatureC },
    { key: 'mtsr', valueC: thermal.mtsrC },
    { key: 'mtsrFull', valueC: thermal.mtsrFullAccumulationC },
    { key: 'mtt', valueC: maximumTechnicalTemperatureC },
    { key: 'td24', valueC: thermal.td24C },
  ];
  return markers
    .filter((marker): marker is LadderMarker => typeof marker.valueC === 'number')
    .sort((a, b) => a.valueC - b.valueC);
}

/**
 * Label positions on a vertical axis `height` px tall, lowest value at the bottom, at least `gap` px apart (screen spec:
 * labels never overlap). Returns the y of each marker's label, in the order given.
 */
export function labelPositions(values: readonly number[], height: number, gap: number): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const ys = values.map((value) => height - ((value - min) / span) * height);
  // From the bottom up, push each label up until it is `gap` above the one below it.
  const order = ys.map((y, index) => ({ y, index })).sort((a, b) => b.y - a.y);
  for (let i = 1; i < order.length; i += 1) {
    const below = order[i - 1] as { y: number };
    const current = order[i] as { y: number };
    if (below.y - current.y < gap) current.y = below.y - gap;
  }
  const placed = new Array<number>(values.length);
  for (const entry of order) placed[entry.index] = entry.y;
  return placed;
}

/** The sets in force as the engines read them (shared with the server through the domain package). */
export { engineCriteria, engineLibrary } from '@gigalibs/process-safety-screening-domain';

/** A number for display, or null when there is none. */
export function shown(value: number | null | undefined, digits: number): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: digits })
    : null;
}

/** High interaction findings over the route's steps, and how many have a documented control (BRL-04). */
export function highInteractions(route: SpeedRouteDetailV1): {
  total: number;
  controlled: number;
  screened: boolean;
} {
  let total = 0;
  let controlled = 0;
  let screened = false;
  for (const step of route.steps) {
    const screen = outputs(step.latestResult)['interactions'] as
      | {
          status?: string;
          findings?: readonly { materialAId: string; materialBId: string; severity: string }[];
        }
      | undefined;
    if (screen?.status !== 'OK') continue;
    screened = true;
    for (const finding of screen.findings ?? []) {
      if (finding.severity !== 'High') continue;
      total += 1;
      if (
        step.controls.some(
          (control) =>
            control.materialAId === finding.materialAId &&
            control.materialBId === finding.materialBId,
        )
      )
        controlled += 1;
    }
  }
  return { total, controlled, screened };
}
