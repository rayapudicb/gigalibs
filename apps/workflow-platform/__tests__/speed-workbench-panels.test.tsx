import type { SpeedResultV1, SpeedRouteDetailV1, SpeedStepV1 } from '@gigalibs/contracts';
import { GateWorkbenchView, RouteSummaryView } from '@gigalibs/process-safety-screening-web';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { speedText } from '../../../modules/process-safety-screening/web/src/messages/index';
import {
  changeReasons,
  equation,
  materialRows,
  parseNumber,
} from '../../../modules/process-safety-screening/web/src/workbench-model';

// WI-OI-120bx (SPEED S4; screen spec §2.4): the route summary and the gate workbench draw the stored result in the
// catalogue's words (§4.1). TEST FIXTURE: the BRD's TC-04 and TC-05 step.

const t = speedText('en-US');

const result = (
  gate: Record<string, unknown>,
  overrides: Partial<SpeedResultV1> = {},
): SpeedResultV1 => ({
  id: 'r1',
  routeId: 'route-1',
  stepId: 'step-1',
  status: 'OK',
  gatePass: true,
  engineVersion: 'process-safety-engines 0.2.0',
  elementsVersion: 'iupac-2021-abridged-1',
  criteriaSetId: 'c1',
  criteriaVersion: 'brd-0.1',
  criteriaReviewed: false,
  inputsHash: '0'.repeat(64),
  outputs: { gate },
  computedBy: 'chemist',
  computedAt: '2026-10-21T10:00:00.000Z',
  ...overrides,
});

const material = (
  id: string,
  role: string,
  substanceName: string,
  formula: string,
  coefficient: number | null,
  massG: number | null,
  molarMass: number,
) => ({
  id,
  stepId: 'step-1',
  position: 1,
  substanceId: `s-${id}`,
  substanceName,
  formula,
  molarMassGPerMol: molarMass,
  role: role as SpeedStepV1['materials'][number]['role'],
  coefficient,
  massG,
  version: 1,
});

const balanced: SpeedStepV1 = {
  id: 'step-1',
  routeId: 'route-1',
  position: 1,
  name: 'Knoevenagel condensation',
  notes: null,
  version: 3,
  materials: [
    material('a', 'Reactant', '4-Fluorobenzaldehyde', 'C7H5FO', 1, 100, 124.11),
    material('b', 'Reactant', 'Ethyl isobutyrylacetate', 'C7H12O3', 1, 127.8, 144.17),
    material('p', 'Product', 'Knoevenagel adduct', 'C14H15FO3', 1, null, 250.27),
    material('w', 'By-product', 'Water', 'H2O', 1, null, 18.015),
  ],
  conditions: null,
  latestResult: result({
    status: 'OK',
    pass: true,
    issues: [],
    warnings: [],
    balance: [
      { element: 'C', inAtoms: 14, outAtoms: 14, balanced: true },
      { element: 'H', inAtoms: 17, outAtoms: 17, balanced: true },
    ],
    materials: [
      { input: { id: 'a' }, moles: 0.8057 },
      { input: { id: 'b' }, moles: 0.8865 },
    ],
    extentMol: 0.8057,
    limitingMaterialId: 'a',
  }),
};

const blocked: SpeedStepV1 = {
  ...balanced,
  id: 'step-2',
  position: 2,
  name: 'Without water',
  materials: balanced.materials.slice(0, 3),
  latestResult: result(
    {
      status: 'OK',
      pass: false,
      issues: [
        {
          code: 'GATE_ELEMENT_BALANCE',
          requirement: 'FR-GATE-02',
          params: { elements: ['H', 'O'] },
        },
      ],
      warnings: [],
      balance: [{ element: 'H', inAtoms: 17, outAtoms: 15, balanced: false }],
    },
    { gatePass: false },
  ),
};

const route = (
  steps: SpeedStepV1[],
  status: 'DRAFT' | 'ARCHIVED' = 'DRAFT',
): SpeedRouteDetailV1 => ({
  id: 'route-1',
  projectId: 'project-1',
  name: 'Route A',
  routeVersion: 1,
  status,
  authorSubject: 'chemist',
  stepCount: steps.length,
  stepsPassingGate: steps.filter((s) => s.latestResult?.gatePass).length,
  version: 1,
  createdBy: 'chemist',
  createdAt: '2026-10-21T09:00:00.000Z',
  updatedAt: '2026-10-21T10:00:00.000Z',
  archivedBy: null,
  archivedAt: null,
  steps,
});

const noop = () => undefined;
const handlers = {
  addStep: noop,
  renameStep: noop,
  moveStep: noop,
  removeStep: noop,
  addMaterial: noop,
  updateMaterial: noop,
  removeMaterial: noop,
  saveConditions: noop,
  searchSubstances: async () => [],
};

function workbench(
  detail: SpeedRouteDetailV1,
  extra: Partial<React.ComponentProps<typeof GateWorkbenchView>> = {},
) {
  return renderToStaticMarkup(
    <GateWorkbenchView
      route={detail}
      selectedStepId={null}
      onSelect={noop}
      editable={detail.status === 'DRAFT'}
      busy={false}
      reasons={changeReasons('Data entry|Correction|Measured value')}
      reason="Data entry"
      onReason={noop}
      notice={null}
      warnings={[]}
      handlers={handlers}
      t={t}
      {...extra}
    />,
  );
}

describe('SPEED route summary (speed.route-summary)', () => {
  it('shows the gate tile from the stored results and leaves later engines as not computed yet', () => {
    const html = renderToStaticMarkup(
      <RouteSummaryView route={route([balanced, blocked])} compact={false} t={t} />,
    );
    expect(html).toContain('Steps mole-balanced');
    expect(html).toContain('1/2');
    expect(html).toContain('text-ui-tag-red-text');
    expect(html.match(/Not computed yet/g)).toHaveLength(5);
  });
});

describe('SPEED gate workbench (speed.gate-workbench)', () => {
  it('TC-04: draws the balanced step, its written equation, the balance and the versions of its result', () => {
    const html = workbench(route([balanced]));
    expect(html).toContain('Gate passed');
    expect(html).toContain('C7H5FO + C7H12O3 → C14H15FO3 + H2O');
    expect(html).toContain('limited by 4-Fluorobenzaldehyde');
    expect(html).toContain('criteria brd-0.1 (unreviewed)');
    expect(html).toContain('Add step');
    expect(html).toContain('<option value="Correction">Correction</option>');
  });

  it("TC-05: explains a blocked gate in the catalogue's words", () => {
    const html = workbench(route([blocked]));
    expect(html).toContain('Gate blocked');
    expect(html).toContain('The element balance does not close for H, O.');
  });

  it('says why nothing was computed when no criteria are in force', () => {
    const gap = {
      ...balanced,
      latestResult: result(
        {
          status: 'DATA_GAP',
          missing: [],
          reason: { code: 'SPEED_NO_CRITERIA_IN_FORCE', requirement: 'BRD-15' },
        },
        { status: 'DATA_GAP', gatePass: null },
      ),
    };
    const html = workbench(route([gap]));
    expect(html).toContain('Not computed');
    expect(html).toContain('No screening criteria are in force in this workspace.');
  });

  it('offers no change on a route that is not a draft', () => {
    const html = workbench(route([balanced], 'ARCHIVED'));
    expect(html).toContain('This route is not a draft; it can no longer change.');
    expect(html).not.toContain('Add step');
    expect(html).not.toContain('Reason for each change');
  });

  it("shows a refusal in the catalogue's words, with the issues the server named", () => {
    const html = workbench(route([balanced]), {
      notice: {
        code: 'SPEED_MATERIAL_INVALID',
        issues: [{ code: 'SPEED_COEFFICIENT_NOT_FOR_ROLE', requirement: 'FR-INP-02' }],
        fallback: 'x',
      },
    });
    expect(html).toContain('The material does not fit its role.');
  });
});

describe('SPEED workbench model', () => {
  it('counts moles from the stored result and equivalents against the first charged reactant', () => {
    const rows = materialRows(balanced);
    expect(rows[0]?.equivalents).toBe(1);
    expect(rows[1]?.equivalents).toBeCloseTo(0.8865 / 0.8057, 6);
    expect(rows[2]?.equivalents).toBeNull();
  });

  it('writes the equation, splits the configured reasons and reads typed numbers', () => {
    expect(equation({ ...balanced, materials: [] })).toBeNull();
    expect(changeReasons(' Data entry | Correction |')).toEqual(['Data entry', 'Correction']);
    expect(parseNumber('127,8')).toBe(127.8);
    expect(parseNumber('')).toBeNull();
    expect(Number.isNaN(parseNumber('abc'))).toBe(true);
  });
});
