/** WI-OI-071 — canonical payroll export and reconciliation. */
import { describe, expect, it } from 'vitest';
import { type ExportLine, buildPayrollCsv, csvField, formatMinor, parseCsv, parseMinor, reconcile } from './pay-export.rules.js';

const line = (lineNo: number, overrides: Partial<ExportLine> = {}): ExportLine => ({
  lineNo,
  personReference: 'EMP-1',
  personName: 'Asha Rao',
  workDate: '2026-10-05',
  category: 'REGULAR',
  minutes: 480,
  multiplierBp: 10_000,
  hourlyRateMinor: 2_000,
  amountMinor: 16_000,
  currency: 'USD',
  packCode: 'US-CA-OT',
  packVersion: 1,
  ruleTrace: 'US-CA-OT@1 regular',
  ...overrides,
});

describe('money formatting', () => {
  it('formats and parses minor units with the currency exponent', () => {
    expect(formatMinor(104_000, 'USD')).toBe('1040.00');
    expect(formatMinor(5, 'USD')).toBe('0.05');
    expect(formatMinor(1_200_000, 'INR')).toBe('12000.00');
    expect(formatMinor(1500, 'JPY')).toBe('1500');
    expect(parseMinor('1040.00', 'USD')).toBe(104_000);
    expect(parseMinor('1500', 'JPY')).toBe(1500);
    expect(() => parseMinor('1040.0', 'USD')).toThrow();
  });
});

describe('PAYROLL_CSV_V1', () => {
  it('quotes separators and neutralises formula cells', () => {
    expect(csvField('Rao, Asha')).toBe('"Rao, Asha"');
    expect(csvField('Say "hi"')).toBe('"Say ""hi"""');
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField('+1')).toBe("'+1");
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('round-trips a hostile name and reconciles every line and total', () => {
    const lines = [
      line(1),
      line(2, { category: 'DAILY_OVERTIME', minutes: 120, multiplierBp: 15_000, amountMinor: 6_000, personName: '=cmd|" /C calc"!A0, "Ops"' }),
      line(3, { personReference: 'EMP-2', personName: 'Ravi\nKumar', currency: 'INR', hourlyRateMinor: 20_000, amountMinor: 180_000, minutes: 540 }),
    ];
    const file = buildPayrollCsv({ id: 'run-1', periodStart: '2026-10-05' }, lines);
    expect(file.lineCount).toBe(3);
    expect(file.totals).toEqual([{ currency: 'INR', amountMinor: 180_000 }, { currency: 'USD', amountMinor: 22_000 }]);
    const rows = parseCsv(file.content);
    expect(rows).toHaveLength(4);
    expect(rows[2]![4]).toBe(`'=cmd|" /C calc"!A0, "Ops"`);
    expect(rows[3]![4]).toBe('Ravi\nKumar');
    expect(reconcile(file.content, lines)).toMatchObject({ linesMatch: true, lineCountMatches: true, totalsMatch: true, lineCount: 3 });
  });

  it('detects a changed amount, a dropped line and a foreign header', () => {
    const lines = [line(1), line(2, { amountMinor: 6_000, category: 'DAILY_OVERTIME', minutes: 120 })];
    const file = buildPayrollCsv({ id: 'run-1', periodStart: '2026-10-05' }, lines);
    const altered = file.content.replace('60.00', '61.00');
    expect(reconcile(altered, lines)).toMatchObject({ linesMatch: false, totalsMatch: false, lineCountMatches: true });
    const dropped = file.content.split('\r\n').filter((_, index) => index !== 2).join('\r\n');
    expect(reconcile(dropped, lines)).toMatchObject({ linesMatch: false, lineCountMatches: false });
    expect(reconcile(`a,b\r\n${file.content}`, lines).linesMatch).toBe(false);
  });

  it('is byte-identical for the same lines in any order', () => {
    const lines = [line(1), line(2, { amountMinor: 1 })];
    expect(buildPayrollCsv({ id: 'r', periodStart: '2026-10-05' }, [...lines].reverse()).sha256).toBe(buildPayrollCsv({ id: 'r', periodStart: '2026-10-05' }, lines).sha256);
  });
});
