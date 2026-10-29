import type { SpeedRouteDetailV1, SpeedStepMaterialV1, SpeedStepV1 } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { dossierModel, routeCsv } from './dossier.js';

// WI-OI-120ca (SPEED S7; FR-RPT-01 to 04): the dossier model's shape, its texts from the catalogue and the CSV export.
// TEST FIXTURE data only.

const material = (
  id: string,
  position: number,
  extra: Partial<SpeedStepMaterialV1>,
): SpeedStepMaterialV1 => ({
  id,
  stepId: 'step-1',
  position,
  substanceId: `substance-${id}`,
  substanceName: `Fixture ${id}`,
  formula: 'C2H6O',
  molarMassGPerMol: 46.07,
  role: 'Reactant',
  coefficient: 1,
  massG: 10,
  energeticGroups: [],
  version: 1,
  ...extra,
});

const step: SpeedStepV1 = {
  id: 'step-1',
  routeId: 'route-1',
  position: 1,
  name: 'Esterification, 40 °C',
  notes: null,
  version: 1,
  materials: [
    material('a', 1, { substanceName: 'Ethanol, absolute' }),
    material('b', 2, {
      substanceName: '=HYPERLINK("x")',
      role: 'Product',
      coefficient: null,
      massG: null,
    }),
  ],
  conditions: null,
  thermalData: [],
  mitigation: null,
  controls: [],
  latestResult: null,
};

const route: SpeedRouteDetailV1 = {
  id: 'route-1',
  projectId: 'project-1',
  name: 'Fixture route',
  routeVersion: 2,
  status: 'DRAFT',
  authorSubject: 'chemist',
  stepCount: 1,
  stepsPassingGate: 0,
  version: 3,
  createdBy: 'chemist',
  createdAt: '2026-10-21T08:00:00.000Z',
  updatedAt: '2026-10-21T08:00:00.000Z',
  archivedBy: null,
  archivedAt: null,
  steps: [step],
  rollup: null,
} as SpeedRouteDetailV1;

/** Every string in the model, to prove none is an unresolved catalogue key. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('SPEED dossier model (WI-OI-120ca)', () => {
  const model = dossierModel({
    route,
    criteria: null,
    library: null,
    generatedAt: '2026-10-21T09:30:12.345Z',
  });

  it('has the eight sections of the screen spec, in order, with the route in the subtitle', () => {
    expect(model.sections.map((section) => section.key)).toEqual([
      'summary',
      'route',
      'thermal',
      'interactions',
      'actions',
      'stage2',
      'basis',
      'signatures',
    ]);
    expect(model.sections[0]?.title).toBe('1. Summary');
    expect(model.subtitle).toBe('Route Fixture route, version 2');
    expect(model.generated).toBe('Generated 2026-10-21 09:30:12 (UTC)');
  });

  it('is watermarked until the route is approved (R2)', () => {
    expect(model.watermark).toBe('DRAFT — NOT APPROVED');
    expect(
      dossierModel({
        route,
        criteria: null,
        library: null,
        generatedAt: '2026-10-21T09:30:12Z',
        approved: true,
      }).watermark,
    ).toBeNull();
  });

  it('lists the missing criteria and library as data gaps, in the catalogue’s words', () => {
    const actions = model.sections.find((section) => section.key === 'actions')?.blocks[0];
    expect(actions).toMatchObject({ kind: 'table', levels: ['DATA_GAP', 'DATA_GAP'] });
    const rows = actions && actions.kind === 'table' ? actions.rows : [];
    expect(rows.map((row) => row[3])).toEqual(['BRD-15', 'BRD-16.2']);
    expect(rows.every((row) => row[2] && !/^SPEED_/.test(row[2]))).toBe(true);
  });

  it('resolves every text from the catalogue: no key is left in the model', () => {
    const unresolved = strings(model).filter(
      (text) =>
        /^(speed|stage2|td24)\.[\w.]+$/.test(text) ||
        /^(ACTION|STAGE2|SPEED)_[A-Z0-9_]+(\.\w+)?$/.test(text),
    );
    expect(unresolved).toEqual([]);
  });

  it('shows the gate as not computed for a step without a result, and the signatures as not yet signed', () => {
    const routeTable = model.sections[1]?.blocks[0];
    expect(routeTable && routeTable.kind === 'table' ? routeTable.rows[0]?.[2] : null).toBe(
      'C2H6O → C2H6O',
    );
    const signatures = model.sections[7];
    expect(signatures?.blocks).toContainEqual({ kind: 'paragraph', text: 'Not yet signed.' });
  });

  it('exports the materials as RFC 4180 CSV, keeping a formula-like name as text', () => {
    const csv = routeCsv(route);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe('');
    expect(lines[1]).toContain('"Esterification, 40 °C"');
    expect(lines[1]).toContain('"Ethanol, absolute"');
    expect(lines[2]).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
