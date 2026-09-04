import type { ColumnMapping, ImportPreviewResult, ImportProcessingResult } from './types.js';

export class CsvParser {
  /**
   * Parse raw CSV content string into rows.
   */
  static parseRaw(csvString: string): { headers: string[]; rows: string[][] } {
    const lines = csvString.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = (lines[0]?.split(',') ?? []).map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map((line) =>
      line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')),
    );

    return { headers, rows };
  }

  static preview(csvString: string, sampleSize = 5): ImportPreviewResult {
    const { headers, rows } = this.parseRaw(csvString);
    const sampleRows = rows.slice(0, sampleSize).map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((h, i) => {
        record[h] = row[i] ?? '';
      });
      return record;
    });

    return {
      headers,
      totalRows: rows.length,
      sampleRows,
    };
  }

  static transform<T extends Record<string, any>>(
    csvString: string,
    mappings: ColumnMapping[],
  ): ImportProcessingResult<T> {
    const { headers, rows } = this.parseRaw(csvString);
    const successRows: T[] = [];
    const failedRows: Array<{ rowNumber: number; data: Record<string, string>; error: string }> = [];

    rows.forEach((row, idx) => {
      const rowDict: Record<string, string> = {};
      headers.forEach((h, i) => {
        rowDict[h] = row[i] ?? '';
      });

      const mappedObj: Record<string, any> = {};
      let hasError = false;
      let errorMsg = '';

      for (const m of mappings) {
        const val = rowDict[m.sourceColumn];
        if (m.required && (!val || val.trim() === '')) {
          hasError = true;
          errorMsg = `Missing required field: ${m.targetField} (source column: ${m.sourceColumn})`;
          break;
        }
        mappedObj[m.targetField] = val || m.defaultValue;
      }

      if (hasError) {
        failedRows.push({ rowNumber: idx + 2, data: rowDict, error: errorMsg });
      } else {
        successRows.push(mappedObj as T);
      }
    });

    return { successRows, failedRows };
  }
}
