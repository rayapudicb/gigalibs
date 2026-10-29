import type { SpeedRouteDetailV1, SpeedSubstanceV1 } from '@gigalibs/contracts';
import { WriteupParserView, confirmedTemperature } from '@gigalibs/process-safety-screening-web';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { speedText } from '../../../modules/process-safety-screening/domain/src/messages/index';
import {
  parseWriteup,
  recogniseReagents,
} from '../../../packages/process-safety-engines/src/index';

// WI-OI-120cc (SPEED S8; screen spec §2.4, panel speed.writeup-parser; D8): the deterministic parser in the catalogue's
// words; nothing applies until a value is confirmed. TEST FIXTURE text and records only.

const t = speedText('en-US');
const TEXT = 'TEST FIXTURE. Sodium hydroxide (1.2 equiv) was added dropwise over 30 min at 0–5 °C.';
const substances = [
  { id: 's1', name: 'Sodium hydroxide', formula: 'NaOH', casNumber: null },
] as unknown as SpeedSubstanceV1[];
const route = {
  id: 'route',
  name: 'Route',
  status: 'DRAFT',
  steps: [
    { id: 'step-1', position: 1, name: 'TEST FIXTURE step', materials: [], conditions: null },
  ],
} as unknown as SpeedRouteDetailV1;
const noop = () => undefined;
const on = {
  step: noop,
  text: noop,
  extract: noop,
  confirmFinding: noop,
  editFinding: noop,
  confirmReagent: noop,
  role: noop,
  useTemperature: noop,
  addMaterials: noop,
};
const extracted = (confirmed: boolean) =>
  parseWriteup(TEXT).map((finding) => ({
    ...finding,
    confirmed: confirmed && finding.type === 'TEMPERATURE',
    edited: finding.value === null ? '' : String(finding.value),
  }));
const reagents = (confirmed: boolean) =>
  recogniseReagents(TEXT, [
    { id: 's1', name: 'Sodium hydroxide', formula: 'NaOH', casNumber: null },
  ]).map((reagent) => ({
    ...reagent,
    confirmed,
    role: 'Reactant' as const,
  }));
const render = (
  findings: ReturnType<typeof extracted> | null,
  recognised: ReturnType<typeof reagents> = [],
) =>
  renderToStaticMarkup(
    <WriteupParserView
      route={route}
      stepId="step-1"
      text={TEXT}
      findings={findings}
      reagents={recognised}
      substances={substances}
      busy={false}
      notice={null}
      t={t}
      on={on}
    />,
  );

describe('SPEED write-up parser panel (WI-OI-120cc)', () => {
  it('explains what Extract reads before anything is extracted, and says no AI and no network call', () => {
    const html = render(null);
    expect(html).toContain(t('speed.writeup.heading'));
    expect(html).toContain(t('speed.writeup.empty'));
    expect(html).toContain('No AI and no network call');
  });

  it('lists each finding with its type, the words found and its value in the parser’s unit', () => {
    const html = render(extracted(false), reagents(false));
    for (const type of ['Equivalents', 'Time', 'Temperature', 'Dosing'])
      expect(html).toContain(`>${type}<`);
    expect(html).toContain('0–5 °C');
    expect(html).toContain('value="5"');
    expect(html).toContain('>°C<');
    expect(html).toContain('>Sodium hydroxide<');
  });

  it('applies nothing until a value is confirmed', () => {
    const unconfirmed = render(extracted(false), reagents(false));
    expect(unconfirmed).toMatch(
      /<button[^>]*disabled=""[^>]*>Use confirmed temperature as Tp<\/button>/,
    );
    expect(unconfirmed).toMatch(
      /<button[^>]*disabled=""[^>]*>Add confirmed materials to the step<\/button>/,
    );
    const confirmed = render(extracted(true), reagents(true));
    expect(confirmed).not.toMatch(
      /<button[^>]*disabled=""[^>]*>Use confirmed temperature as Tp<\/button>/,
    );
    expect(confirmed).not.toMatch(
      /<button[^>]*disabled=""[^>]*>Add confirmed materials to the step<\/button>/,
    );
  });

  it('takes the first confirmed temperature as typed, and nothing when it is not a number', () => {
    const findings = extracted(true);
    expect(confirmedTemperature(findings)).toBe(5);
    expect(
      confirmedTemperature(
        findings.map((finding) =>
          finding.type === 'TEMPERATURE' ? { ...finding, edited: 'warm' } : finding,
        ),
      ),
    ).toBeNull();
    expect(confirmedTemperature(extracted(false))).toBeNull();
  });

  it('says when no reagent is recognised', () => {
    expect(render(extracted(false), [])).toContain(t('speed.writeup.noReagents'));
  });
});
