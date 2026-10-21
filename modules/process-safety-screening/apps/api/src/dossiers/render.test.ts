import { inflateSync } from 'node:zlib';
import type { DossierModelV1 } from '@gigalibs/process-safety-screening-domain';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { renderDocx, renderPdf } from './render.js';

// WI-OI-120ca (SPEED S7; FR-RPT-01 to 03): the files carry the model's sections and, until approval, the watermark on
// every page. TEST FIXTURE data only.

const WATERMARK = 'DRAFT — NOT APPROVED';
const model = (watermark: string | null): DossierModelV1 => ({
  modelVersion: 1,
  title: 'Process safety screening dossier',
  subtitle: 'Route Fixture, version 1',
  generated: 'Generated 2026-10-21 09:30:12 (UTC)',
  watermark,
  sections: [
    {
      key: 'summary',
      title: '1. Summary',
      blocks: [
        {
          kind: 'tiles',
          items: [
            { label: 'Steps', value: '4/5' },
            { label: 'Worst class', value: '3' },
          ],
        },
        { kind: 'paragraph', text: 'Actions: 1 critical, 2 for review, 0 data gaps.' },
      ],
    },
    {
      key: 'thermal',
      title: '3. Thermal and runaway',
      blocks: [
        {
          kind: 'table',
          columns: ['Step', 'Name', 'ΔTad (K)'],
          // Long enough to run over several pages.
          rows: Array.from({ length: 140 }, (_, index) => [
            String(index + 1),
            `Step ${index + 1} → MTSR`,
            '12.5',
          ]),
        },
      ],
    },
    {
      key: 'interactions',
      title: '4. Interactions',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Absence of a finding does not prove safety.',
          emphasis: 'statement',
        },
      ],
    },
  ],
});

/** The PDF's pages and its content streams, inflated. */
function pdfParts(pdf: Buffer): { pages: number; streams: string[] } {
  const text = pdf.toString('latin1');
  const streams = [...text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((match) => {
    try {
      return inflateSync(Buffer.from(match[1] as string, 'latin1')).toString('latin1');
    } catch {
      return '';
    }
  });
  return { pages: (text.match(/\/Type \/Page\b(?!s)/g) ?? []).length, streams };
}

// The watermark across the page: the text drawn rotated by -35°.
const ROTATED = /0\.819152 -0\.573576 0\.573576 0\.819152 [-\d.]+ [-\d.]+ cm/;

describe('SPEED dossier files (WI-OI-120ca)', () => {
  it('renders a DOCX whose every page header carries the watermark', async () => {
    const zip = await JSZip.loadAsync(await renderDocx(model(WATERMARK)));
    const document = (await zip.file('word/document.xml')?.async('string')) ?? '';
    for (const title of [
      '1. Summary',
      '3. Thermal and runaway',
      '4. Interactions',
      'Step 140 → MTSR',
    ])
      expect(document).toContain(title);
    const references = [...document.matchAll(/<w:headerReference w:type="(\w+)" r:id="(\w+)"\/>/g)];
    expect(references.map((match) => match[1]).sort()).toEqual(['default', 'even', 'first']);
    const relations = (await zip.file('word/_rels/document.xml.rels')?.async('string')) ?? '';
    for (const [, , id] of references) {
      const target = new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`).exec(relations)?.[1];
      expect(await zip.file(`word/${target}`)?.async('string')).toContain(WATERMARK);
    }
  });

  it('renders a DOCX without a header once approved', async () => {
    const zip = await JSZip.loadAsync(await renderDocx(model(null)));
    expect(await zip.file('word/document.xml')?.async('string')).not.toContain('w:headerReference');
  });

  it('renders a PDF of several pages with the watermark drawn on every page', async () => {
    const pdf = await renderPdf(model(WATERMARK));
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.subarray(-6).toString('latin1')).toContain('%%EOF');
    const { pages, streams } = pdfParts(pdf);
    expect(pages).toBeGreaterThan(2);
    expect(streams.filter((stream) => ROTATED.test(stream))).toHaveLength(pages);
  });

  it('renders a PDF without the watermark once approved', async () => {
    const { pages, streams } = pdfParts(await renderPdf(model(null)));
    expect(pages).toBeGreaterThan(2);
    expect(streams.some((stream) => ROTATED.test(stream))).toBe(false);
  });
});
