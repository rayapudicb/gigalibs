import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  assertAllStepsPassed,
  extractPdfText,
  identifyNewRunId,
  normalizeCellValue,
  parseCsvRows,
  parseXlsxWorkbook,
  validateFileMagic,
} from '../../../../../../scripts/verify-analytics-reports-v2-helpers.mjs';

describe('Reports v2 Browser Proof Helpers (WI-OI-106)', () => {
  describe('validateFileMagic', () => {
    it('validates CSV with .csv extension and valid text', () => {
      const csvBuffer = Buffer.from('Col1,Col2\r\nVal1,Val2\r\n', 'utf8');
      const res = validateFileMagic(csvBuffer, 'report.csv', 'CSV');
      expect(res.valid).toBe(true);
      expect(res.format).toBe('CSV');
    });

    it('rejects CSV with null bytes or wrong extension', () => {
      const badBuffer = Buffer.from('Col1\0Col2', 'utf8');
      expect(() => validateFileMagic(badBuffer, 'report.csv', 'CSV')).toThrow(/null bytes/);
      expect(() => validateFileMagic(Buffer.from('ok'), 'report.txt', 'CSV')).toThrow(/extension/);
    });

    it('validates XLSX with PK\\x03\\x04 zip magic bytes', () => {
      const xlsxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
      const res = validateFileMagic(xlsxBuffer, 'report.xlsx', 'XLSX');
      expect(res.valid).toBe(true);
      expect(res.format).toBe('XLSX');
    });

    it('rejects XLSX with invalid magic bytes or wrong extension', () => {
      const badBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(() => validateFileMagic(badBuffer, 'report.xlsx', 'XLSX')).toThrow(/magic bytes/);
      expect(() => validateFileMagic(Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'report.csv', 'XLSX')).toThrow(/extension/);
    });

    it('validates PDF with %PDF- signature', () => {
      const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n');
      const res = validateFileMagic(pdfBuffer, 'report.pdf', 'PDF');
      expect(res.valid).toBe(true);
      expect(res.format).toBe('PDF');
    });

    it('rejects PDF without %PDF- signature', () => {
      const badBuffer = Buffer.from('NOT A PDF');
      expect(() => validateFileMagic(badBuffer, 'report.pdf', 'PDF')).toThrow(/%PDF-/);
    });
  });

  describe('normalizeCellValue', () => {
    it('normalizes numbers, dates, and formula-escaped strings deterministically', () => {
      expect(normalizeCellValue(42.5)).toBe('42.5');
      expect(normalizeCellValue('42.500000')).toBe('42.5');
      expect(normalizeCellValue("'+1234")).toBe('+1234');
      expect(normalizeCellValue("'=SUM(A1:A5)")).toBe('=SUM(A1:A5)');
      expect(normalizeCellValue(new Date('2026-10-01T12:00:00Z'))).toBe('2026-10-01');
      expect(normalizeCellValue('2026-10-01T00:00:00.000Z')).toBe('2026-10-01');
      expect(normalizeCellValue(null)).toBe('');
      expect(normalizeCellValue(undefined)).toBe('');
    });
  });

  describe('parseCsvRows', () => {
    it('correctly parses RFC 4180 CSV with quotes, CRLF, and escaped quotes', () => {
      const csv = 'Name,Title,Quote\r\n"Farm A",Crop,"He said ""Ready"""\r\n';
      const rows = parseCsvRows(csv);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual(['Name', 'Title', 'Quote']);
      expect(rows[1]).toEqual(['Farm A', 'Crop', 'He said "Ready"']);
    });
  });

  describe('parseXlsxWorkbook', () => {
    it('validates a workbook containing an About sheet and frozen header', async () => {
      const wb = new ExcelJS.Workbook();
      wb.addWorksheet('About');
      const dataSheet = wb.addWorksheet('Yield');
      dataSheet.views = [{ state: 'frozen', ySplit: 1 }];
      dataSheet.addRow(['Crop', 'Harvest']);
      dataSheet.addRow(['Wheat', 1000]);

      const buffer = await wb.xlsx.writeBuffer();
      const parsed = await parseXlsxWorkbook(Buffer.from(buffer));
      expect(parsed.sheetNames).toContain('About');
      expect(parsed.dataSheets).toHaveLength(1);
      expect(parsed.dataSheets[0].name).toBe('Yield');
      expect(parsed.dataSheets[0].rows).toHaveLength(2);
    });

    it('rejects workbook missing the About sheet', async () => {
      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet('Data');
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.addRow(['Col1']);
      const buffer = await wb.xlsx.writeBuffer();
      await expect(parseXlsxWorkbook(Buffer.from(buffer))).rejects.toThrow(/missing the mandatory "About" sheet/);
    });

    it('rejects workbook missing frozen header', async () => {
      const wb = new ExcelJS.Workbook();
      wb.addWorksheet('About');
      const sheet = wb.addWorksheet('Data');
      sheet.addRow(['Col1']); // no frozen header view
      const buffer = await wb.xlsx.writeBuffer();
      await expect(parseXlsxWorkbook(Buffer.from(buffer))).rejects.toThrow(/missing a frozen header row/);
    });

    it('detects un-sanitized formula injection', async () => {
      const wb = new ExcelJS.Workbook();
      wb.addWorksheet('About');
      const sheet = wb.addWorksheet('Data');
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.addRow(['=cmd|/c calc']); // dangerous formula string
      const buffer = await wb.xlsx.writeBuffer();
      await expect(parseXlsxWorkbook(Buffer.from(buffer))).rejects.toThrow(/formula-injection risk/);
    });
  });

  describe('identifyNewRunId', () => {
    it('identifies the exact newly created run ID', () => {
      const existing = ['run-old-1', 'run-old-2'];
      const current = [
        { id: 'run-new-1', queuedAt: '2026-10-01T10:00:00Z' },
        { id: 'run-old-1', queuedAt: '2026-10-01T09:00:00Z' },
        { id: 'run-old-2', queuedAt: '2026-10-01T08:00:00Z' },
      ];
      expect(identifyNewRunId(existing, current as any)).toBe('run-new-1');
    });

    it('throws error when no new run is detected', () => {
      const existing = ['run-1', 'run-2'];
      const current = [
        { id: 'run-1', queuedAt: '2026-10-01T09:00:00Z' },
        { id: 'run-2', queuedAt: '2026-10-01T08:00:00Z' },
      ];
      expect(() => identifyNewRunId(existing, current as any)).toThrow(/No new report run ID was identified/);
    });
  });

  describe('assertAllStepsPassed (False-PASS Prevention)', () => {
    it('passes when all required 12 steps are strictly true', () => {
      const fullResult = {
        authenticated: true,
        reportsWorkbenchLoaded: true,
        formatSelectionVerified: true,
        formatEditingVerified: true,
        reportRunTriggered: true,
        reportRunSucceeded: true,
        runHistoryRendered: true,
        threeFormatsPresent: true,
        fileDownloadsVerified: true,
        contentParityVerified: true,
        scheduleExecutionVerified: true,
        scopedIsolationVerified: true,
      };
      expect(assertAllStepsPassed(fullResult)).toBe(true);
    });

    it('strictly throws and lists every missing step when any step is false or missing', () => {
      const incompleteResult = {
        authenticated: true,
        reportsWorkbenchLoaded: true,
        formatSelectionVerified: true,
        formatEditingVerified: false,
        reportRunTriggered: true,
        reportRunSucceeded: false,
        runHistoryRendered: false,
        threeFormatsPresent: true,
        fileDownloadsVerified: false,
        contentParityVerified: false,
        scheduleExecutionVerified: false,
        scopedIsolationVerified: false,
      };
      expect(() => assertAllStepsPassed(incompleteResult)).toThrow(
        /formatEditingVerified, reportRunSucceeded, runHistoryRendered, fileDownloadsVerified, contentParityVerified, scheduleExecutionVerified, scopedIsolationVerified/,
      );
    });
  });

  describe('extractPdfText', () => {
    it('extracts uncompressed and flate-compressed PDF text tokens', () => {
      const rawPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Length 40 >>\nstream\nBT /F1 12 Tf (Yield Summary 2026) Tj ET\nendstream\nendobj\n%%EOF',
      );
      const text = extractPdfText(rawPdf);
      expect(text).toContain('Yield Summary 2026');
    });
  });
});
