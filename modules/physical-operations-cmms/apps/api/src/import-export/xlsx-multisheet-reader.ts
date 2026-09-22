/**
 * SheetJS multi-sheet reader — iterates every worksheet in an xlsx workbook,
 * yielding each sheet's name and its rows as an async generator.
 *
 * Usage:
 *   const reader = new XlsxMultiSheetReader(s3Stream);
 *   for await (const sheet of reader.sheets()) {
 *     console.log(sheet.name);
 *     for await (const row of sheet.rows()) { ... }
 *   }
 */
import { Readable } from 'node:stream';
// SheetJS is CJS-only in 0.18.x
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx');

export interface RawRow {
  rowNumber: number;
  data: Record<string, unknown>;
}

export interface SheetHandle {
  /** Worksheet name (sanitised department label or sheet tab). */
  name: string;
  /** Yields all data rows for this sheet (excludes header). */
  rows(): AsyncGenerator<RawRow>;
}

/**
 * Reads the full workbook buffer once and exposes each sheet lazily.
 * Buffer is kept in memory for the lifetime of this reader instance.
 */
export class XlsxMultiSheetReader {
  private bufferPromise: Promise<Buffer> | null = null;
  private readonly inputStream: Readable;

  constructor(inputStream: Readable) {
    this.inputStream = inputStream;
  }

  private async getBuffer(): Promise<Buffer> {
    if (!this.bufferPromise) {
      this.bufferPromise = (async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of this.inputStream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
        }
        return Buffer.concat(chunks);
      })();
    }
    return this.bufferPromise;
  }

  /**
   * Returns the list of sheet (tab) names without reading all row data.
   */
  async listSheetNames(): Promise<string[]> {
    const buffer = await this.getBuffer();
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      bookSheets: true,   // only parse the sheet list, not the data
      cellFormula: false,
    });
    return workbook.SheetNames;
  }

  /**
   * Yields each sheet as a `SheetHandle` in workbook tab order.
   * Callers control whether they iterate all sheets or just a subset.
   */
  async *sheets(): AsyncGenerator<SheetHandle> {
    const buffer = await this.getBuffer();
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      cellNF: false,
      cellStyles: false,
      cellFormula: false,
      dense: false,
    });

    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;

      // Capture `sheet` in closure for the generator
      const capturedSheet = sheet;
      const capturedName = name;

      yield {
        name: capturedName,
        rows: async function* (): AsyncGenerator<RawRow> {
          const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(capturedSheet, {
            defval: null,
            blankrows: false,
            raw: false,
          });
          let rowNumber = 1;
          for (const data of jsonRows) {
            yield { rowNumber: rowNumber++, data };
          }
        },
      };
    }
  }
}

/**
 * Convenience function: return sheet names from a buffer already in memory.
 * Used by the controller endpoint that peeks at an uploaded file's sheets.
 */
export function listSheetNamesFromBuffer(buffer: Buffer): string[] {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    bookSheets: true,
    cellFormula: false,
  });
  return workbook.SheetNames;
}
