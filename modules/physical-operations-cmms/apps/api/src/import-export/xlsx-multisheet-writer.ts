/**
 * ExcelJS multi-sheet writer — one worksheet per department for workforce_resources exports.
 *
 * Usage:
 *   const writer = new XlsxMultiSheetWriter('workforce_resources', allowedCols, actorRoles);
 *   await writer.open(passthrough);
 *   await writer.startSheet('Engineering');
 *   for await (const row of deptRows) { await writer.writeRow(row); }
 *   await writer.startSheet('Operations');
 *   ...
 *   await writer.close();
 */
import { Writable } from 'node:stream';
import ExcelJS from 'exceljs';
import type { ImportableEntityType } from './types.js';
import { getColumnDefs } from './column-registry.js';

type WorksheetWithDataValidations = ExcelJS.Worksheet & {
  dataValidations: {
    add(range: string, validation: ExcelJS.DataValidation): void;
  };
};

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E3A5F' }, // GigaLibs brand navy
};
const HEADER_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };

/** Maximum characters in an Excel sheet tab name. */
const MAX_SHEET_NAME_LEN = 31;

export class XlsxMultiSheetWriter {
  private readonly entityType: ImportableEntityType;
  private readonly allowedColumns: string[];
  private readonly actorRoles: string[];
  private workbook!: ExcelJS.stream.xlsx.WorkbookWriter;
  private currentSheet: ExcelJS.Worksheet | null = null;
  private currentColumns: ExcelJS.Column[] = [];

  constructor(entityType: ImportableEntityType, allowedColumns: string[], actorRoles: string[]) {
    this.entityType = entityType;
    this.allowedColumns = allowedColumns;
    this.actorRoles = actorRoles;
  }

  async open(outputStream: Writable): Promise<void> {
    this.workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: outputStream,
      useStyles: true,
      useSharedStrings: true,
    });
  }

  /**
   * Commits the previous sheet (if any) and opens a new one.
   * @param sheetLabel Department name or any grouping label.
   */
  async startSheet(sheetLabel: string): Promise<void> {
    if (this.currentSheet) {
      await this.currentSheet.commit();
    }
    const safeName = sanitizeSheetName(sheetLabel);
    this.currentSheet = this.workbook.addWorksheet(safeName);
    this.currentColumns = this.buildColumns();
    this.currentSheet.columns = this.currentColumns;
    this.writeHeaderRow(this.currentSheet, this.currentColumns);
  }

  async writeRow(row: Record<string, unknown>): Promise<void> {
    if (!this.currentSheet) {
      throw new Error('Call startSheet() before writeRow()');
    }
    const values: unknown[] = [null]; // ExcelJS rows are 1-indexed
    for (const col of this.currentColumns) {
      values.push(row[col.key as string] ?? null);
    }
    const wsRow = this.currentSheet.addRow(values);
    wsRow.commit();
  }

  async close(): Promise<void> {
    if (this.currentSheet) {
      await this.currentSheet.commit();
      this.currentSheet = null;
    }
    await this.workbook.commit();
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private buildColumns(): ExcelJS.Column[] {
    const defs = getColumnDefs(this.entityType);
    return defs
      .filter((d) => {
        if (this.allowedColumns.length > 0 && !this.allowedColumns.includes(d.key)) return false;
        if (d.exportRoles && d.exportRoles.length > 0) {
          return d.exportRoles.some((r) => this.actorRoles.includes(r));
        }
        return true;
      })
      .map((d) => ({
        key: d.key,
        header: toHeaderLabel(d.key),
        width: d.templateWidth ?? 20,
      })) as ExcelJS.Column[];
  }

  private writeHeaderRow(ws: ExcelJS.Worksheet, columns: ExcelJS.Column[]): void {
    const headerRow = ws.getRow(1);
    columns.forEach((col, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = col.header as ExcelJS.CellValue;
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
    });
    headerRow.commit();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Sanitize a department name for use as an Excel sheet tab name. */
export function sanitizeSheetName(name: string): string {
  // Excel forbids: / \ ? * [ ] : and names cannot exceed 31 characters
  return name
    .replace(/[/\\?*[\]:]/g, '_')
    .slice(0, MAX_SHEET_NAME_LEN)
    .trim() || 'Sheet';
}

function toHeaderLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Template generator for multi-sheet workbooks ────────────────────────────

/**
 * Generates a workforce_resources template xlsx with a separate sheet for each
 * department. Each sheet has identical headers. `departmentNames` is the list
 * to create sheets for; if empty, one sheet labelled "Workforce" is created.
 */
export async function generateWorkforceTemplate(
  entityType: ImportableEntityType,
  departmentNames: string[],
): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheetLabels = departmentNames.length > 0 ? departmentNames : ['Workforce'];
  const defs = getColumnDefs(entityType).filter((d) => !d.exportOnly);

  for (const label of sheetLabels) {
    const ws = workbook.addWorksheet(sanitizeSheetName(label));
    ws.columns = defs.map((d) => ({
      key: d.key,
      header: toHeaderLabel(d.key),
      width: d.templateWidth ?? 20,
    })) as ExcelJS.Column[];

    const headerRow = ws.getRow(1);
    defs.forEach((_, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
    });
    headerRow.commit();

    defs.forEach((def, colIdx) => {
      if (!def.enumValues || def.enumValues.length === 0) return;
      const colLetter = columnIndexToLetter(colIdx + 1);
      (ws as WorksheetWithDataValidations).dataValidations.add(`${colLetter}2:${colLetter}1048576`, {
        type: 'list',
        allowBlank: true,
        formulae: [`"${def.enumValues.join(',')}"`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid value',
        error: `Allowed: ${def.enumValues.join(', ')}`,
      });
    });
  }

  return workbook.xlsx.writeBuffer() as unknown as Buffer;
}

function columnIndexToLetter(idx: number): string {
  let letter = '';
  while (idx > 0) {
    const rem = (idx - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    idx = Math.floor((idx - 1) / 26);
  }
  return letter;
}
