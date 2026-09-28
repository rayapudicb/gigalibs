import { createHash } from 'node:crypto';

/**
 * Canonical payroll export `PAYROLL_CSV_V1` and its reconciliation (WI-OI-071). Pure: amounts stay integer minor
 * units until formatted with the currency's exponent, and parsing the file back yields the same integers.
 */

export const PAYROLL_CSV_V1_COLUMNS = [
  'line_no',
  'run_id',
  'period_start',
  'person_reference',
  'person_name',
  'work_date',
  'category',
  'minutes',
  'hours',
  'multiplier',
  'hourly_rate',
  'amount',
  'currency',
  'pack',
  'rule_trace',
] as const;

export interface ExportLine {
  readonly lineNo: number;
  readonly personReference: string;
  readonly personName: string;
  readonly workDate: string;
  readonly category: string;
  readonly minutes: number;
  readonly multiplierBp: number;
  readonly hourlyRateMinor: number;
  readonly amountMinor: number;
  readonly currency: string;
  readonly packCode: string;
  readonly packVersion: number;
  readonly ruleTrace: string;
}

export interface ControlTotals {
  readonly lineCount: number;
  readonly totals: readonly { readonly currency: string; readonly amountMinor: number }[];
}

/** Minor-unit exponent of an ISO 4217 currency (2 for USD and INR, 0 for JPY). */
export function currencyExponent(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function formatMinor(amountMinor: number, currency: string): string {
  const exponent = currencyExponent(currency);
  const digits = BigInt(amountMinor).toString().padStart(exponent + 1, '0');
  return exponent === 0 ? digits : `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

export function parseMinor(value: string, currency: string): number {
  const exponent = currencyExponent(currency);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match || (match[2]?.length ?? 0) !== exponent) throw new Error(`Amount ${value} does not have ${exponent} decimals for ${currency}.`);
  return Number(BigInt(`${match[1]}${match[2] ?? ''}`));
}

/** RFC 4180 field; cells that a spreadsheet would read as a formula are prefixed with an apostrophe. */
export function csvField(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildPayrollCsv(run: { readonly id: string; readonly periodStart: string }, lines: readonly ExportLine[]): { content: string; sha256: string } & ControlTotals {
  const rows = [PAYROLL_CSV_V1_COLUMNS.join(',')];
  for (const line of [...lines].sort((left, right) => left.lineNo - right.lineNo)) {
    rows.push([
      line.lineNo,
      run.id,
      run.periodStart,
      line.personReference,
      line.personName,
      line.workDate,
      line.category,
      line.minutes,
      (line.minutes / 60).toFixed(2),
      (line.multiplierBp / 10_000).toFixed(4),
      formatMinor(line.hourlyRateMinor, line.currency),
      formatMinor(line.amountMinor, line.currency),
      line.currency,
      `${line.packCode}@${line.packVersion}`,
      line.ruleTrace,
    ].map(csvField).join(','));
  }
  const content = `${rows.join('\r\n')}\r\n`;
  return { content, sha256: sha256(content), ...controlTotals(lines) };
}

export function controlTotals(lines: readonly { readonly currency: string; readonly amountMinor: number }[]): ControlTotals {
  const sums = new Map<string, bigint>();
  for (const line of lines) sums.set(line.currency, (sums.get(line.currency) ?? 0n) + BigInt(line.amountMinor));
  return {
    lineCount: lines.length,
    totals: [...sums.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, amount]) => ({ currency, amountMinor: Number(amount) })),
  };
}

/** Parses RFC 4180 text into rows of fields (quoted fields may hold commas, quotes and line breaks). */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]!;
    if (quoted) {
      if (char === '"' && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Re-reads an export file and compares it with the run's lines and totals. */
export function reconcile(content: string, expected: readonly ExportLine[]): { linesMatch: boolean; lineCountMatches: boolean; totalsMatch: boolean } & ControlTotals {
  const [header, ...records] = parseCsv(content);
  if (header?.join(',') !== PAYROLL_CSV_V1_COLUMNS.join(',')) {
    return { linesMatch: false, lineCountMatches: false, totalsMatch: false, lineCount: records.length, totals: [] };
  }
  const column = (name: (typeof PAYROLL_CSV_V1_COLUMNS)[number]) => PAYROLL_CSV_V1_COLUMNS.indexOf(name);
  const parsed = records.map((record) => {
    const currency = record[column('currency')] ?? '';
    return {
      lineNo: Number(record[column('line_no')]),
      minutes: Number(record[column('minutes')]),
      currency,
      amountMinor: parseMinor(record[column('amount')] ?? '', currency),
      category: record[column('category')] ?? '',
      workDate: record[column('work_date')] ?? '',
    };
  });
  const byLine = new Map(expected.map((line) => [line.lineNo, line]));
  const linesMatch =
    parsed.length === expected.length &&
    parsed.every((line) => {
      const source = byLine.get(line.lineNo);
      return source !== undefined && source.amountMinor === line.amountMinor && source.currency === line.currency
        && source.minutes === line.minutes && source.category === line.category && source.workDate === line.workDate;
    });
  const fileTotals = controlTotals(parsed);
  const expectedTotals = controlTotals(expected);
  return {
    ...fileTotals,
    linesMatch,
    lineCountMatches: fileTotals.lineCount === expectedTotals.lineCount,
    totalsMatch: JSON.stringify(fileTotals.totals) === JSON.stringify(expectedTotals.totals),
  };
}

export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
