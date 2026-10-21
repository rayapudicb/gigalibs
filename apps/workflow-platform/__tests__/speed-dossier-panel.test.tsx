import type { SpeedDossierV1, SpeedRouteDetailV1 } from '@gigalibs/contracts';
import { DossierPreviewView } from '@gigalibs/process-safety-screening-web';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { dossierModel } from '../../../modules/process-safety-screening/domain/src/dossier';
import { speedText } from '../../../modules/process-safety-screening/domain/src/messages/index';

// WI-OI-120ca (SPEED S7; screen spec §2.4, panel speed.dossier-preview): the dossier preview, its files with their
// hashes, the exports and the draft banner, in the catalogue's words. TEST FIXTURE data only.

const t = speedText('en-US');
const route = {
  id: 'route-1',
  projectId: 'project-1',
  name: 'TEST FIXTURE route',
  routeVersion: 1,
  status: 'DRAFT',
  authorSubject: 'chemist',
  stepCount: 0,
  stepsPassingGate: 0,
  version: 1,
  createdBy: 'chemist',
  createdAt: '2026-10-21T08:00:00.000Z',
  updatedAt: '2026-10-21T08:00:00.000Z',
  archivedBy: null,
  archivedAt: null,
  steps: [],
  rollup: null,
} as SpeedRouteDetailV1;
const model = dossierModel({
  route,
  criteria: null,
  library: null,
  generatedAt: '2026-10-21T09:00:00Z',
});
const HASH = 'a'.repeat(64);
const done: SpeedDossierV1 = {
  id: 'dossier-done',
  routeId: 'route-1',
  routeVersion: 1,
  status: 'DONE',
  watermarked: true,
  files: [
    { format: 'docx', sha256: HASH, bytes: 1000 },
    { format: 'pdf', sha256: 'b'.repeat(64), bytes: 2000 },
  ],
  errorCode: null,
  requestedBy: 'chemist',
  requestedAt: '2026-10-21T09:00:00.000Z',
  completedAt: '2026-10-21T09:00:05.000Z',
};
const failed: SpeedDossierV1 = {
  ...done,
  id: 'dossier-failed',
  status: 'FAILED',
  files: [],
  errorCode: 'SPEED_DOSSIER_RENDER_FAILED',
  completedAt: '2026-10-21T08:59:00.000Z',
};

const render = (props: Partial<React.ComponentProps<typeof DossierPreviewView>> = {}) =>
  renderToStaticMarkup(
    <DossierPreviewView
      routeId="route-1"
      model={model}
      previewCode={null}
      dossiers={[done, failed]}
      historyCount={5}
      busy={false}
      notice={null}
      onGenerate={() => undefined}
      t={t}
      {...props}
    />,
  );

describe('SPEED dossier preview panel (WI-OI-120ca)', () => {
  it('shows the draft banner and the eight sections of the model', () => {
    const html = render();
    expect(html).toContain(t('speed.dossier.banner'));
    for (const section of model.sections) expect(html).toContain(section.title);
    expect(html).toContain('Not yet signed.');
  });

  it('lists each file with its download link and SHA-256, and a failed dossier with its reason', () => {
    const html = render();
    expect(html).toContain('href="/api/speed/v1/dossiers/dossier-done/files/pdf"');
    expect(html).toContain('href="/api/speed/v1/dossiers/dossier-done/files/docx"');
    expect(html).toContain(`SHA-256 ${HASH}`);
    expect(html).toContain('Download PDF');
    expect(html).toContain('Failed');
    expect(html).toContain(t('SPEED_DOSSIER_RENDER_FAILED'));
  });

  it('offers the JSON and CSV exports of the route', () => {
    const html = render();
    expect(html).toContain('href="/api/speed/v1/routes/route-1/export/json"');
    expect(html).toContain('href="/api/speed/v1/routes/route-1/export/csv"');
  });

  it('colours each action by its level, with the level in words', () => {
    const html = render();
    expect(html).toMatch(/class="pr-3 text-ui-tag-blue-text">Data gap</);
  });

  it('lists only as many dossiers as the dictionary asks', () => {
    const html = render({ historyCount: 1 });
    expect(html).toContain('dossier-done');
    expect(html).not.toContain(t('SPEED_DOSSIER_RENDER_FAILED'));
  });

  it('explains a route whose steps were screened with different sets, instead of a preview', () => {
    const html = render({ model: null, previewCode: 'SPEED_DOSSIER_STALE', dossiers: [] });
    expect(html).toContain(t('SPEED_DOSSIER_STALE'));
    expect(html).toContain(t('speed.dossier.noFiles'));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Generate dossier<\/button>/);
  });
});
