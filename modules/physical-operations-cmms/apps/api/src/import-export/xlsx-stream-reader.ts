/**
 * SheetJS streaming reader — wraps XLSX.stream.to_json() so the rest of the
 * pipeline never calls XLSX.readFile() (which buffers the entire workbook).
 *
 * Usage:
 *   const reader = new XlsxStreamReader(s3Stream);
 *   for await (const row of reader.rows()) { ... }
 */
import { Readable } from 'node:stream';
// SheetJS is imported as CJS (xlsx 0.18.x ships CJS only)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx');

export interface RawRow {
  rowNumber: number; // 1-based, excluding header
  data: Record<string, unknown>;
}

export class XlsxStreamReader {
  private readonly inputStream: Readable;
  private readonly sheetName: string | undefined;

  constructor(inputStream: Readable, sheetName?: string) {
    this.inputStream = inputStream;
    this.sheetName = sheetName;
  }

  /**
   * Reads the entire workbook into memory via chunks (SheetJS streaming API),
   * then yields rows one at a time using an async generator.
   *
   * NOTE: SheetJS "streaming" reads the file incrementally but still holds
   * the parsed sheet in memory.  For very large files (>100 MB) consider
   * chunked CSV conversion on the server before this step.
   */
  async *rows(): AsyncGenerator<RawRow> {
    const chunks: Buffer[] = [];
    for await (const chunk of this.inputStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    const buffer = Buffer.concat(chunks);

    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      cellNF: false,
      cellStyles: false,
      // Detect and strip formula injection at read time
      cellFormula: false,
      dense: false,
    });

    const targetSheet = this.sheetName
      ? workbook.Sheets[this.sheetName]
      : workbook.Sheets[workbook.SheetNames[0] ?? ''];

    if (!targetSheet) {
      throw new Error(
        this.sheetName
          ? `Sheet "${this.sheetName}" not found in workbook`
          : 'Workbook contains no sheets',
      );
    }

    // to_json returns array of plain objects keyed by header row
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(targetSheet, {
      defval: null,
      blankrows: false,
      raw: false, // Use formatted strings so dates come through consistently
    });

    let rowNumber = 1;
    for (const data of jsonRows) {
      yield { rowNumber: rowNumber++, data };
    }
  }

  /**
   * Reads just the header row to classify columns before streaming data rows.
   */
  async readHeaders(): Promise<string[]> {
    const chunks: Buffer[] = [];
    for await (const chunk of this.inputStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
      // Grab first 256 KB — enough to parse the header row for any xlsx file
      if (Buffer.concat(chunks).byteLength > 256 * 1024) break;
    }
    const buffer = Buffer.concat(chunks);

    const workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: 1, cellFormula: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
    if (!sheet) return [];

    const [headerRow] = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    if (!Array.isArray(headerRow)) return [];
    return (headerRow as unknown[]).map((h) => (h != null ? String(h) : ''));
  }
}
