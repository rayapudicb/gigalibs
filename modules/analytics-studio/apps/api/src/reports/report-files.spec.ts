import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import type { AnalyticsQueryResultV1 } from '@gigalibs/contracts';
import {
  buildPdf,
  buildXlsx,
  chartSvg,
  csvSafeText,
  pdfText,
  type ReportMeta,
  type ReportSection,
} from './report-files.js';

describe('Report files generation (WI-OI-106)', () => {
  const meta: ReportMeta = {
    reportName: 'Quarterly Yield Report',
    sourceName: 'Crop Analytics Dashboard',
    generatedAt: new Date('2026-10-01T12:00:00Z'),
  };

  const sampleResult: AnalyticsQueryResultV1 = {
    semanticModelId: '00000000-0000-4000-8000-000000000001',
    datasetVersionId: '00000000-0000-4000-8000-000000000002',
    definitionVersion: 1,
    measureVersions: { total_yield: '00000000-0000-4000-8000-000000000003' },
    asOf: '2026-10-01T00:00:00.000Z',
    freshness: 'FRESH',
    watermark: '2026-10-01T00:00:00Z',
    truncated: false,
    columns: [
      { name: 'date', label: 'Date (day)', role: 'time', type: 'date' },
      { name: 'crop', label: 'Crop Name', role: 'dimension', type: 'string' },
      { name: 'formula_test', label: 'Notes', role: 'dimension', type: 'string' },
      { name: 'yield', label: 'Yield (kg)', role: 'measure', type: 'number' },
    ],
    rows: [
      ['2026-09-01T00:00:00Z', 'Wheat', '=SUM(1+1)', 1500],
      ['2026-09-02T00:00:00Z', 'Corn', '+100', 2500],
      ['2026-09-03T00:00:00Z', 'Soy', '@admin', 1800],
    ],
  };

  const sections: ReportSection[] = [
    {
      title: 'Yield by Crop',
      result: sampleResult,
      note: null,
      chartType: 'bar',
      filters: ['crop in (Wheat, Corn, Soy)'],
    },
    {
      title: 'Empty Section',
      result: null,
      note: 'Chart configuration was invalid.',
      chartType: 'table',
      filters: [],
    },
  ];

  describe('csvSafeText', () => {
    it('prefixes formula-injection trigger characters with an apostrophe', () => {
      expect(csvSafeText('=1+1')).toBe("'=1+1");
      expect(csvSafeText('+cmd|...')).toBe("'+cmd|...");
      expect(csvSafeText('-10')).toBe("'-10");
      expect(csvSafeText('@SUM')).toBe("'@SUM");
      expect(csvSafeText('\tcmd')).toBe("'\tcmd");
      expect(csvSafeText('\rcmd')).toBe("'\rcmd");
      expect(csvSafeText('Normal text')).toBe('Normal text');
      expect(csvSafeText('12345')).toBe('12345');
    });
  });

  describe('buildXlsx', () => {
    it('builds an Excel workbook with About sheet, frozen headers, and typed cells', async () => {
      const buffer = await buildXlsx(meta, sections);
      expect(buffer).toBeInstanceOf(Buffer);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      // 1. About sheet assertions
      const about = workbook.getWorksheet('About');
      expect(about).toBeDefined();
      const reportRow = about!.findRow(1);
      expect(reportRow?.getCell(1).value).toBe('Report');
      expect(reportRow?.getCell(2).value).toBe('Quarterly Yield Report');

      // 2. Data sheet assertions
      const dataSheet = workbook.getWorksheet('Yield by Crop');
      expect(dataSheet).toBeDefined();

      // Frozen header row
      expect(dataSheet!.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });

      // Headers
      const headerRow = dataSheet!.getRow(1);
      expect(headerRow.getCell(1).value).toBe('Date (day)');
      expect(headerRow.getCell(2).value).toBe('Crop Name');
      expect(headerRow.getCell(3).value).toBe('Notes');
      expect(headerRow.getCell(4).value).toBe('Yield (kg)');
      expect(headerRow.font?.bold).toBe(true);

      // Data rows & typed values
      const row2 = dataSheet!.getRow(2);
      expect(row2.getCell(1).value).toBeInstanceOf(Date);
      expect(row2.getCell(2).value).toBe('Wheat');
      // Formula-injection protection
      expect(row2.getCell(3).value).toBe("'=SUM(1+1)");
      expect(row2.getCell(4).value).toBe(1500);

      const row3 = dataSheet!.getRow(3);
      expect(row3.getCell(3).value).toBe("'+100");

      const row4 = dataSheet!.getRow(4);
      expect(row4.getCell(3).value).toBe("'@admin");

      // Verify no Excel formula property is set on any cell
      dataSheet!.eachRow((row) => {
        row.eachCell((cell) => {
          expect(cell.formula).toBeUndefined();
        });
      });
    });
  });

  describe('pdfText', () => {
    it('preserves WinAnsi characters and replaces non-WinAnsi with ?', () => {
      const safe = pdfText('Hello, World! €100');
      expect(safe.text).toBe('Hello, World! €100');
      expect(safe.replaced).toBe(0);

      const nonWinAnsi = pdfText('Unicode 🌾 Crop Data 测');
      expect(nonWinAnsi.text).toBe('Unicode ? Crop Data ?');
      expect(nonWinAnsi.replaced).toBe(2);
    });
  });

  describe('chartSvg', () => {
    it('renders server-side SVG for supported ECharts chart types', () => {
      const svg = chartSvg(sections[0]!);
      expect(svg).toBeDefined();
      expect(svg).toMatch(/^<svg/);
      expect(svg).toContain('</svg>');
    });

    it('returns null for table and kpi types', () => {
      expect(chartSvg({ ...sections[0]!, chartType: 'table' })).toBeNull();
      expect(chartSvg({ ...sections[0]!, chartType: 'kpi' })).toBeNull();
    });
  });

  describe('buildPdf', () => {
    it('generates a valid PDF buffer with metadata and layout', async () => {
      const buffer = await buildPdf(meta, sections, { compress: false });
      expect(buffer).toBeInstanceOf(Buffer);
      // PDF header magic bytes
      expect(buffer.slice(0, 5).toString('utf8')).toBe('%PDF-');

      const pdfString = buffer.toString('latin1');
      // Producer and metadata
      expect(pdfString).toContain('GigaLibs Analytics');
      expect(pdfString).toContain('Quarterly Yield Report');
    });

    it('handles long tables with truncation note when exceeding PDF_TABLE_ROWS', async () => {
      const manyRows = Array.from({ length: 250 }, (_, i) => [
        '2026-09-01T00:00:00Z',
        `Crop ${i}`,
        'Note',
        i * 10,
      ]);
      const largeResult = { ...sampleResult, rows: manyRows };
      const largeSection: ReportSection = {
        title: 'Large Section',
        result: largeResult,
        note: null,
        chartType: 'table',
        filters: [],
      };

      const buffer = await buildPdf(meta, [largeSection], { compress: false });
      expect(buffer).toBeInstanceOf(Buffer);
      // PDFKit outputs kerned text in hex brackets: [<54686520666972737420323030206f6620323530...>]
      const hexEncoded = Buffer.from('The first 200 of 250', 'utf8').toString('hex');
      expect(buffer.toString('latin1')).toContain(hexEncoded);
    });
  });
});
