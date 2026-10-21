import type {
  SpeedCriteriaSetV1,
  SpeedLibrarySetV1,
  SpeedResultV1,
  SpeedRouteDetailV1,
  SpeedStepV1,
} from '@gigalibs/contracts';
import {
  CriteriaValuesView,
  GreenScorecardView,
  ObChartView,
  RouteSummaryView,
  ThermalView,
} from '@gigalibs/process-safety-screening-web';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { conditionsFrom } from '../../../modules/process-safety-screening/web/src/ThermalPanel';
import { speedText } from '../../../modules/process-safety-screening/web/src/messages/index';
import { labelPositions } from '../../../modules/process-safety-screening/web/src/screens-model';
import {
  type GateResult,
  IUPAC_2021_ABRIDGED,
  greenMetrics,
  missingCriteria,
  oxygenBalance,
  routeRollup,
  runGate,
  runThermal,
} from '../../../packages/process-safety-engines/src/index';
import { BRD_CRITERIA } from '../../../packages/process-safety-engines/test/fixtures/criteria';
import { PROTOTYPE_LIBRARY } from '../../../packages/process-safety-engines/test/fixtures/library';
import { REFERENCE_ROUTE } from '../../../packages/process-safety-engines/test/fixtures/reference-route';

// WI-OI-120by (SPEED S5; screen spec §2.4, §3.2): the oxygen-balance, thermal and green panels draw the engines' outputs
// in the catalogue's words. TEST FIXTURE: the reference route's illustrative charges, the BRD criteria and the prototype
// library; the stored outputs are the engines' own for those inputs.

const t = speedText('en-US');
const { version: _version, ...values } = BRD_CRITERIA;
const FIXTURE = 'TEST FIXTURE: SPEED-BRD-FRD-001 v0.1';

const criteria: SpeedCriteriaSetV1 = {
  id: 'c1',
  versionLabel: 'brd-0.1',
  source: FIXTURE,
  criteria: values,
  citations: Object.fromEntries(
    missingCriteria({})
      .filter((path) => path !== 'version')
      .map((path) => [path, `${FIXTURE} §15`]),
  ),
  reviewStatus: 'UNREVIEWED',
  inForce: true,
  version: 2,
  importedBy: 'admin',
  importedAt: '2026-10-21T09:00:00.000Z',
  inForceBy: 'admin',
  inForceSince: '2026-10-21T09:05:00.000Z',
};

const library: SpeedLibrarySetV1 = {
  id: 'l1',
  versionLabel: 'prototype-0.1',
  source: FIXTURE,
  library: {
    materials: [],
    rules: [],
    reactionClasses: PROTOTYPE_LIBRARY.reactionClasses.map((entry) => ({
      ...entry,
      reviewed: false,
    })),
    formationEnthalpies: {},
    gases: Object.fromEntries(
      Object.entries(PROTOTYPE_LIBRARY.gases).map(([hill, entry]) => [
        hill,
        { ...entry, reviewed: false },
      ]),
    ),
    energeticGroups: [{ id: 'peroxide', citation: FIXTURE, reviewed: false }],
  },
  reviewStatus: 'UNREVIEWED',
  inForce: true,
  version: 2,
  importedBy: 'admin',
  importedAt: '2026-10-21T09:00:00.000Z',
  inForceBy: 'admin',
  inForceSince: '2026-10-21T09:05:00.000Z',
};

/** A stored step: the fixture's materials and conditions and the engines' outputs for them. */
function stored(position: number): SpeedStepV1 {
  const fixture = REFERENCE_ROUTE[position - 1];
  if (!fixture) throw new Error('fixture');
  // Acetic acid carries an energetic-group tag, as a chemist would set it; the outputs are computed with it.
  const materials = fixture.materials.map((m) =>
    m.id === 'm14' ? { ...m, energeticGroups: ['peroxide'] } : m,
  );
  const gate = runGate(materials, IUPAC_2021_ABRIDGED, BRD_CRITERIA) as GateResult;
  const outputs = {
    gate,
    oxygenBalance: gate.materials
      .filter((m) => m.formula.ok)
      .map((m) => ({
        materialId: m.input.id,
        result: oxygenBalance(m, IUPAC_2021_ABRIDGED, BRD_CRITERIA),
      })),
    thermal: runThermal(gate, fixture.conditions, PROTOTYPE_LIBRARY, BRD_CRITERIA),
    green: greenMetrics(gate),
  };
  const result: SpeedResultV1 = {
    id: `r${position}`,
    routeId: 'route',
    stepId: fixture.id,
    status: 'OK',
    gatePass: gate.pass,
    engineVersion: 'process-safety-engines 0.2.0',
    elementsVersion: IUPAC_2021_ABRIDGED.version,
    criteriaSetId: 'c1',
    criteriaVersion: 'brd-0.1',
    criteriaReviewed: false,
    librarySetId: 'l1',
    libraryVersion: 'prototype-0.1',
    libraryReviewed: false,
    inputsHash: '0'.repeat(64),
    outputs,
    computedBy: 'chemist',
    computedAt: '2026-10-21T10:00:00.000Z',
  };
  const c = fixture.conditions;
  return {
    id: fixture.id,
    routeId: 'route',
    position,
    name: `Step ${fixture.id}`,
    notes: null,
    version: 1,
    materials: fixture.materials.map((m, index) => ({
      id: m.id,
      stepId: fixture.id,
      position: index + 1,
      substanceId: `s-${m.id}`,
      substanceName: m.formula,
      formula: m.formula,
      molarMassGPerMol: gate.materials[index]?.formula.ok
        ? (gate.materials[index]?.formula as { molarMassGPerMol: number }).molarMassGPerMol
        : 0,
      role: m.role,
      coefficient: m.coefficient ?? null,
      massG: m.massG ?? null,
      energeticGroups: m.id === 'm14' ? ['peroxide'] : [],
      version: 1,
    })),
    conditions: {
      processTemperatureC: c.processTemperatureC,
      maximumTechnicalTemperatureC: c.maximumTechnicalTemperatureC,
      heatCapacityJPerGK: c.heatCapacityJPerGK,
      accumulationPercent: c.accumulationPercent,
      reactionEnthalpySource: c.reactionEnthalpy?.source ?? null,
      reactionClassId:
        c.reactionEnthalpy?.source === 'REACTION_CLASS' ? c.reactionEnthalpy.reactionClassId : null,
      version: 1,
      updatedBy: 'chemist',
      updatedAt: '2026-10-21T10:00:00.000Z',
    },
    thermalData: c.decomposition
      ? [
          {
            id: `k${position}`,
            stepId: fixture.id,
            kind: 'DECOMPOSITION_KINETICS',
            kJPerMol: null,
            onsetC: null,
            td24C: null,
            ...c.decomposition,
            basis: 'LITERATURE',
            citation: FIXTURE,
            notes: null,
            status: 'ACTIVE',
            createdBy: 'chemist',
            createdAt: '2026-10-21T10:00:00.000Z',
            supersededAt: null,
          },
        ]
      : [],
    mitigation: null,
    controls: [],
    latestResult: result,
  };
}

const steps = [1, 2, 3, 4, 5].map(stored);
const rollup = routeRollup(
  steps.map((step) => ({
    gate: step.latestResult?.outputs['gate'] as GateResult,
    green: step.latestResult?.outputs['green'] as never,
  })),
);
const route: SpeedRouteDetailV1 = {
  id: 'route',
  projectId: 'project',
  name: 'Reference route',
  routeVersion: 1,
  status: 'DRAFT',
  authorSubject: 'chemist',
  stepCount: 5,
  stepsPassingGate: 5,
  version: 1,
  createdBy: 'chemist',
  createdAt: '2026-10-21T09:00:00.000Z',
  updatedAt: '2026-10-21T10:00:00.000Z',
  archivedBy: null,
  archivedAt: null,
  steps,
  rollup: { ...rollup },
};

const noop = () => undefined;
const thermal = (stepId: string, extra: Partial<React.ComponentProps<typeof ThermalView>> = {}) =>
  renderToStaticMarkup(
    <ThermalView
      route={route}
      selectedStepId={stepId}
      onSelect={noop}
      criteria={criteria}
      library={library}
      editable
      canAddData
      busy={false}
      reasons={['Data entry']}
      reason="Data entry"
      onReason={noop}
      notice={null}
      handlers={{ saveInputs: noop, addThermalData: noop, saveMitigation: noop }}
      t={t}
      {...extra}
    />,
  );

describe('SPEED oxygen balance (speed.ob-chart)', () => {
  const html = renderToStaticMarkup(
    <ObChartView
      route={route}
      criteria={criteria}
      groups={['peroxide']}
      axisMinPercent={-350}
      axisMaxPercent={100}
      tickPercent={50}
      showTable
      editable
      busy={false}
      onTags={noop}
      t={t}
    />,
  );
  it('shades the alert band of the criteria in force and cites its source', () => {
    expect(html).toContain('Alert band -160 % to +80 %');
    expect(html).toContain(`Band source: ${FIXTURE} §15.`);
    expect(html).toContain('aria-label="Oxygen balance of every material, with the alert band"');
  });
  it('classifies each material in words as well as colour: High for the tagged acid in the band, n/a for a metal salt', () => {
    expect(html).toContain('High: band + energetic group → DSC and ARC mandatory');
    expect(html).toMatch(/C2H4O2<\/td>.*peroxide.*>High</s);
    expect(html).toContain('n/a: classify by reactivity');
  });
});

describe('SPEED thermal and runaway (speed.thermal-panel)', () => {
  it('TC-07 and TC-08: step 3 shows ΔTad 56.5 K, MTSR 36.3 °C, TD24 91.8 °C from kinetics, class 1 and class 3 at 100 %', () => {
    const html = thermal('s3');
    expect(html).toContain('56.5 K');
    expect(html).toContain('36.3 °C');
    expect(html).toContain('At 100 % accumulation: 81.5 °C');
    expect(html).toContain('91.8 °C');
    expect(html).toContain('Decomposition kinetics');
    expect(html).toContain('Class 1, assigned');
    expect(html).toContain('Class 3, assigned');
    expect(html).toContain('Boiling is the barrier.');
    expect(html).toContain('aria-label="Temperature ladder for the cooling-failure scenario"');
  });

  it('TC-10: step 5 lists the isobutane it releases and the vent check', () => {
    const html = thermal('s5');
    expect(html).toContain('isobutane');
    expect(html).toContain('1.68');
    expect(html).toContain('Compare with vessel headspace and vent capacity.');
  });

  it('asks for a mitigation where a step reaches class 4 or 5', () => {
    const html = thermal('s4');
    expect(html).toMatch(/Mitigation required \(class [45]\)/);
    expect(html).toContain('Record mitigation');
  });

  it("builds the engines' conditions from the inputs and the step's active thermal data, as the server does", () => {
    const step3 = steps[2] as SpeedStepV1;
    const conditions = conditionsFrom(step3, {
      processTemperatureC: '25',
      maximumTechnicalTemperatureC: '56',
      heatCapacityJPerGK: '2.2',
      accumulationPercent: '20',
      reactionEnthalpySource: 'REACTION_CLASS',
      reactionClassId: 'RC-03',
    });
    expect(conditions).toEqual(REFERENCE_ROUTE[2]?.conditions);
  });

  it('keeps the ladder labels at least 16 px apart', () => {
    const ys = labelPositions([25, 36.3, 56, 81.5, 91.8], 180, 16).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i += 1)
      expect((ys[i] as number) - (ys[i - 1] as number)).toBeGreaterThanOrEqual(16 - 1e-9);
  });
});

describe('SPEED green metrics (speed.green-scorecard) and the route summary', () => {
  it('shows the route roll-up, every step and the PMI by stream with a text legend', () => {
    const html = renderToStaticMarkup(<GreenScorecardView route={route} showStreams t={t} />);
    if (rollup.status !== 'OK') throw new Error('roll-up');
    expect(html).toContain(
      rollup.processMassIntensity.toLocaleString(undefined, { maximumFractionDigits: 2 }),
    );
    expect(html).toContain('aria-label="Process mass intensity by stream for each step"');
    expect(html).toContain('Solvents');
    expect(html).toContain('Intermediates carried forward are excluded from the route totals');
  });

  it("fills the summary's worst criticality, route PMI and atom economy from the results", () => {
    const html = renderToStaticMarkup(<RouteSummaryView route={route} compact={false} t={t} />);
    expect(html).toMatch(/Class [45]/);
    expect(html.match(/Not computed yet/g)).toHaveLength(2);
  });
});

describe('SPEED screening criteria (speed.criteria-values)', () => {
  it('lists every value with its citation by the engine keys', () => {
    const html = renderToStaticMarkup(<CriteriaValuesView set={criteria} t={t} />);
    expect(html).toContain('oxygenBalanceAlertBandPercent.lowerExclusive');
    expect(html).toContain('-160');
    expect(html.match(/TEST FIXTURE: SPEED-BRD-FRD-001 v0.1 §15/g)?.length).toBe(
      missingCriteria({}).length - 1,
    );
  });
});
