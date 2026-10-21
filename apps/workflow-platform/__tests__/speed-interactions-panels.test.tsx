import type {
  SpeedLibrarySetV1,
  SpeedResultV1,
  SpeedRouteDetailV1,
  SpeedStepV1,
} from '@gigalibs/contracts';
import {
  InteractionMatrixView,
  LibraryEntriesView,
  RouteSummaryView,
} from '@gigalibs/process-safety-screening-web';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { speedText } from '../../../modules/process-safety-screening/web/src/messages/index';
import { engineLibrary } from '../../../modules/process-safety-screening/web/src/screens-model';
import { screenInteractions } from '../../../packages/process-safety-engines/src/index';
import { PROTOTYPE_LIBRARY } from '../../../packages/process-safety-engines/test/fixtures/library';
import { REFERENCE_ROUTE } from '../../../packages/process-safety-engines/test/fixtures/reference-route';

// WI-OI-120bz (SPEED S6; screen spec §2.4 panel speed.interaction-matrix, §3.1 panel speed.library-entries): the
// interaction screen in the catalogue's words. TEST FIXTURE: step 4 of the reference route and the prototype library,
// with display texts that say they are fixtures; the stored screen is the engine's own output.

const t = speedText('en-US');
const FIXTURE = 'TEST FIXTURE: the design prototype library';
const fixture = REFERENCE_ROUTE[3];
if (!fixture) throw new Error('fixture');

const library: SpeedLibrarySetV1 = {
  id: 'l1',
  versionLabel: 'prototype-0.1',
  source: FIXTURE,
  library: {
    materials: PROTOTYPE_LIBRARY.materials.map((entry) => ({
      id: entry.id,
      classes: [...entry.classes],
      ...(entry.noteKey ? { note: `TEST FIXTURE note for ${entry.id}` } : {}),
      citation: entry.citation,
      reviewed: false,
    })),
    rules: PROTOTYPE_LIBRARY.rules.map((rule) => ({
      id: rule.id,
      classA: rule.classA,
      classB: rule.classB,
      severity: rule.severity,
      finding: `TEST FIXTURE finding ${rule.id}`,
      ...(rule.severity === 'High' ? { control: `TEST FIXTURE control ${rule.id}` } : {}),
      ...(rule.recommendedTest ? { recommendedTest: rule.recommendedTest } : {}),
      citation: rule.citation,
      reviewed: false,
    })),
    reactionClasses: PROTOTYPE_LIBRARY.reactionClasses.map((entry) => ({
      ...entry,
      reviewed: false,
    })),
    formationEnthalpies: {},
    gases: {},
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

// The screen as the server computes it: with the engines' view of the stored set (note keys are entry ids).
const screen = screenInteractions(fixture.materials, engineLibrary(library));

const result: SpeedResultV1 = {
  id: 'r4',
  routeId: 'route',
  stepId: fixture.id,
  status: 'OK',
  gatePass: true,
  engineVersion: 'process-safety-engines 0.2.0',
  elementsVersion: 'iupac-2021-abridged-1',
  criteriaSetId: 'c1',
  criteriaVersion: 'brd-0.1',
  criteriaReviewed: false,
  librarySetId: 'l1',
  libraryVersion: 'prototype-0.1',
  libraryReviewed: false,
  inputsHash: '0'.repeat(64),
  outputs: { gate: { status: 'OK', pass: true }, interactions: screen },
  computedBy: 'chemist',
  computedAt: '2026-10-21T10:00:00.000Z',
};

const high = screen.findings.find((finding) => finding.severity === 'High');
if (!high) throw new Error('TC-11 expects a High finding');

function step(controls: SpeedStepV1['controls'] = []): SpeedStepV1 {
  return {
    id: fixture?.id as string,
    routeId: 'route',
    position: 1,
    name: 'Amide formation',
    notes: null,
    version: 1,
    materials: (fixture?.materials ?? []).map((m, index) => ({
      id: m.id,
      stepId: 's4',
      position: index + 1,
      substanceId: `s-${m.id}`,
      substanceName: m.formula,
      formula: m.formula,
      molarMassGPerMol: 1,
      role: m.role,
      coefficient: m.coefficient ?? null,
      massG: m.massG ?? null,
      energeticGroups: [],
      version: 1,
    })),
    conditions: null,
    thermalData: [],
    mitigation: null,
    controls,
    latestResult: result,
  };
}

const route = (steps: SpeedStepV1[]): SpeedRouteDetailV1 => ({
  id: 'route',
  projectId: 'project',
  name: 'Reference route',
  routeVersion: 1,
  status: 'DRAFT',
  authorSubject: 'chemist',
  stepCount: steps.length,
  stepsPassingGate: steps.length,
  version: 1,
  createdBy: 'chemist',
  createdAt: '2026-10-21T09:00:00.000Z',
  updatedAt: '2026-10-21T10:00:00.000Z',
  archivedBy: null,
  archivedAt: null,
  steps,
  rollup: null,
});

const noop = () => undefined;
const matrix = (detail: SpeedRouteDetailV1) =>
  renderToStaticMarkup(
    <InteractionMatrixView
      route={detail}
      selectedStepId={null}
      onSelect={noop}
      library={library}
      editable
      canLink
      busy={false}
      reasons={['Data entry']}
      reason="Data entry"
      onReason={noop}
      notice={null}
      handlers={{ documentControl: noop, linkSubstance: noop }}
      t={t}
    />,
  );

describe('SPEED interactions (speed.interaction-matrix)', () => {
  it('TC-11: NaOH × DMSO is a High cell and finding, with the rule, its text, citation and library version', () => {
    const html = matrix(route([step()]));
    expect(html).toContain('Step 1 · 1 High');
    expect(html).toContain('aria-label="NaOH × C2H6OS: High"');
    expect(html).toContain('TEST FIXTURE finding R-01');
    expect(html).toContain('Library prototype-0.1 (unreviewed)');
    expect(html).toContain('Control not yet documented.');
    expect(html).toContain('TEST FIXTURE control R-01');
    expect(html).toContain('H High · M Medium · L Low.');
  });

  it('always says that the absence of a finding does not prove safety, and shows the library notes', () => {
    const html = matrix(route([step()]));
    expect(html).toContain('Absence of a finding does not prove safety.');
    expect(html).toContain('TEST FIXTURE note for L09');
  });

  it('shows a documented control in green with its author', () => {
    const html = matrix(
      route([
        step([
          {
            materialAId: high.materialAId,
            materialBId: high.materialBId,
            ruleId: high.ruleId,
            text: 'Dose slowly.',
            version: 1,
            documentedBy: 'chemist',
            documentedAt: '2026-10-21T11:00:00.000Z',
          },
        ]),
      ]),
    );
    expect(html).toContain('Control documented');
    expect(html).toContain('Dose slowly. (chemist,');
  });

  it('counts High findings and documented controls in the route summary', () => {
    const undocumented = renderToStaticMarkup(
      <RouteSummaryView route={route([step()])} compact={false} t={t} />,
    );
    expect(undocumented).toMatch(/text-ui-tag-red-text">0\/1</);
  });
});

describe('SPEED library entries (speed.library-entries)', () => {
  it('lists the rules with their classes, severity, texts, recommended test and status', () => {
    const html = renderToStaticMarkup(<LibraryEntriesView set={library} kind="RULES" t={t} />);
    expect(html).toContain('base × dmso');
    expect(html).toContain('DSC of the mixture');
    expect(html).toContain('Unreviewed');
    expect(html).toContain(
      'Change control: the safety reviewer proposes, QA approves, the administrator applies.',
    );
  });

  it('flags every reaction class as an estimate (BRL-05)', () => {
    const html = renderToStaticMarkup(
      <LibraryEntriesView set={library} kind="REACTION_CLASSES" t={t} />,
    );
    expect(html.match(/>Estimate</g)).toHaveLength(PROTOTYPE_LIBRARY.reactionClasses.length);
  });
});
