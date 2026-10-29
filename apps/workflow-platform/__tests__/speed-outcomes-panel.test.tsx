import type { SpeedOutcomesV1 } from '@gigalibs/contracts';
import { OutcomesView } from '@gigalibs/process-safety-screening-web';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { speedText } from '../../../modules/process-safety-screening/domain/src/messages/index';

// WI-OI-120cc (SPEED S9b; screen spec §3.4): the business outcomes in the catalogue's words, against the BRD's targets.
// TEST FIXTURE numbers only.

const t = speedText('en-US');
const targets = { screeningHours: 2, screenedPercent: 100 };
const outcomes: SpeedOutcomesV1 = {
  routes: 4,
  hazards: {
    highInteractions: 6,
    mediumInteractions: 6,
    class3OrWorseSteps: 2,
    gasFormingSteps: 1,
  },
  screening: { medianMinutes: 90, routesMeasured: 3 },
  screened: { screened: 3, routes: 4 },
  economy: { withEconomy: 2, withDossier: 3 },
  worstClass: 5,
};
const render = (value: SpeedOutcomesV1) =>
  renderToStaticMarkup(<OutcomesView outcomes={value} targets={targets} t={t} />);

describe('SPEED outcomes page (WI-OI-120cc)', () => {
  it('shows BO-1 to BO-5 with their figures and the portfolio tiles', () => {
    const html = render(outcomes);
    for (const key of ['bo1', 'bo2', 'bo3', 'bo4', 'bo5'])
      expect(html).toContain(t(`speed.outcomes.${key}`));
    expect(html).toContain('>15<');
    expect(html).toContain(
      '6 High and 6 Medium interactions, 2 steps of class 3 or worse, 1 gas-forming steps.',
    );
    expect(html).toContain('1.5 h');
    expect(html).toContain('75 %');
    expect(html).toContain('66.7 %');
    expect(html).toContain('Later stage');
    expect(html).toContain('3/4');
    expect(html).toContain('Class 5');
  });

  it('marks a met target green and a missed one orange', () => {
    const html = render(outcomes);
    expect(html).toMatch(/text-ui-tag-green-text">1\.5 h</);
    expect(html).toMatch(/text-ui-tag-orange-text">75 %</);
  });

  it('lists what the client receives: the dossier’s eight sections', () => {
    const html = render(outcomes);
    expect(html).toContain(t('speed.outcomes.receives'));
    for (const key of [
      'summary',
      'route',
      'thermal',
      'interactions',
      'actions',
      'stage2',
      'basis',
      'signatures',
    ])
      expect(html).toContain(t(`speed.dossier.section.${key}`));
  });

  it('shows a dash, not zero, where nothing is measured yet', () => {
    const html = render({
      routes: 0,
      hazards: {
        highInteractions: 0,
        mediumInteractions: 0,
        class3OrWorseSteps: 0,
        gasFormingSteps: 0,
      },
      screening: { medianMinutes: null, routesMeasured: 0 },
      screened: { screened: 0, routes: 0 },
      economy: { withEconomy: 0, withDossier: 0 },
      worstClass: null,
    });
    expect(html).not.toContain('NaN');
    expect(html).toMatch(/text-ui-fg-base">—</);
  });
});
