import type { SpeedCriteriaSetV1, SpeedLibrarySetV1 } from '@gigalibs/contracts';
import {
  InForceView,
  PackImportView,
  STARTER_PACKS,
  packCounts,
  parsePackFile,
} from '@gigalibs/process-safety-screening-web';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { speedText } from '../../../modules/process-safety-screening/domain/src/messages/index';

// WI-OI-120ce: the Library and Criteria pages show the set in force first, as the prototype does, and let a SPEED
// administrator import a pack (a starter pack shipped with SPEED, or a file); every import is unreviewed.

const t = speedText('en-US');
const noop = () => undefined;
const starter = (kind: 'criteria' | 'library') => {
  const pack = STARTER_PACKS.find((candidate) => candidate.kind === kind);
  if (!pack) throw new Error(`no ${kind} starter pack`);
  return pack;
};

describe('SPEED starter packs (WI-OI-120ce)', () => {
  it('ships the BRD criteria, every value cited, and the prototype starter library with its own words', () => {
    const criteria = starter('criteria');
    expect(packCounts('criteria', criteria.body)).toEqual({ values: 23 });
    expect(criteria.body.source).toContain('SPEED-BRD-FRD-001 v0.1');
    const library = starter('library');
    expect(packCounts('library', library.body)).toEqual({
      materials: 26,
      rules: 12,
      classes: 5,
      groups: 12,
      gases: 11,
    });
    const body = library.body as unknown as { library: SpeedLibrarySetV1['library'] };
    // Real wording from the prototype, never a placeholder.
    expect(body.library.rules.find((rule) => rule.id === 'R-01')?.finding).toContain('DMSO');
    expect(JSON.stringify(body)).not.toContain('TEST FIXTURE');
  });

  it('accepts a pack file only in the import format of its kind', () => {
    expect(parsePackFile('criteria', JSON.stringify(starter('criteria').body)).ok).toBe(true);
    expect(parsePackFile('library', JSON.stringify(starter('criteria').body))).toMatchObject({
      ok: false,
    });
    expect(parsePackFile('library', '{not json')).toEqual({ ok: false, detail: 'not JSON' });
    const extra = { ...starter('criteria').body, approvedBy: 'someone' };
    expect(parsePackFile('criteria', JSON.stringify(extra)).ok).toBe(false);
  });
});

describe('SPEED Library and Criteria pages (WI-OI-120ce)', () => {
  it('shows the library in force with its entries, and says when none is in force', () => {
    const library = starter('library').body as unknown as {
      versionLabel: string;
      source: string;
      library: SpeedLibrarySetV1['library'];
    };
    const set = {
      id: 'l1',
      ...library,
      reviewStatus: 'UNREVIEWED',
      inForce: true,
      version: 1,
    } as unknown as SpeedLibrarySetV1;
    const html = renderToStaticMarkup(
      <InForceView kind="library" set={set} libraryKind="RULES" onLibraryKind={noop} t={t} />,
    );
    expect(html).toContain('Library in force');
    expect(html).toContain('Unreviewed');
    expect(html).toContain('Starter 0.1 (unreviewed)');
    expect(html).toContain('Interaction rules');
    expect(html).toContain('R-01');
    const none = renderToStaticMarkup(
      <InForceView kind="criteria" set={null} libraryKind="MATERIALS" onLibraryKind={noop} t={t} />,
    );
    expect(none).toContain('No criteria set is in force yet');
  });

  it('shows the criteria in force with each value and its citation', () => {
    const criteria = starter('criteria').body as unknown as Omit<SpeedCriteriaSetV1, 'id'>;
    const set = {
      id: 'c1',
      ...criteria,
      reviewStatus: 'UNREVIEWED',
      inForce: true,
      version: 1,
    } as SpeedCriteriaSetV1;
    const html = renderToStaticMarkup(
      <InForceView kind="criteria" set={set} libraryKind="MATERIALS" onLibraryKind={noop} t={t} />,
    );
    expect(html).toContain('Criteria in force');
    expect(html).toContain('SPEED-BRD-FRD-001 v0.1 §15');
    // Each value by name, as the prototype's settings show it, with the engine's key beside it.
    expect(html).toContain('Oxygen-balance alert band, lower limit (%)');
    expect(html).toContain('oxygenBalanceAlertBandPercent.lowerExclusive');
  });

  it('offers the starter packs and a file, and reports an import in the catalogue’s words', () => {
    const html = renderToStaticMarkup(
      <PackImportView
        kind="library"
        starters={[starter('library')]}
        file={null}
        busy={false}
        notice={{
          tone: 'ok',
          text: t('speed.packs.imported', { version: 'Starter 0.1 (unreviewed)' }),
        }}
        t={t}
        on={{ importPack: noop, chooseFile: noop }}
      />,
    );
    expect(html).toContain('Import a pack');
    expect(html).toContain('Starter packs shipped with SPEED');
    expect(html).toContain(
      '26 materials, 12 interaction rules, 5 reaction classes, 12 energetic groups, 11 gases',
    );
    expect(html).toContain('type="file"');
    expect(html).toContain('Open it in the list below and choose Put in force.');
  });
});
