/**
 * ExcelJS streaming writer — pipes rows to S3 multipart upload without
 * buffering the full workbook in memory.
 *
 * Usage:
 *   const writer = new XlsxStreamWriter(entityType, columnKeys, roles);
 *   await writer.open(uploadStream);
 *   for await (const row of dbCursor) { await writer.writeRow(row); }
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

export class XlsxStreamWriter {
  private readonly entityType: ImportableEntityType;
  private readonly allowedColumns: string[];
  private readonly actorRoles: string[];
  private workbook!: ExcelJS.stream.xlsx.WorkbookWriter;
  private worksheet!: ExcelJS.Worksheet;

  constructor(entityType: ImportableEntityType, allowedColumns: string[], actorRoles: string[]) {
    this.entityType = entityType;
    this.allowedColumns = allowedColumns;
    this.actorRoles = actorRoles;
  }

  /**
   * Attaches the workbook to an output stream (e.g. S3 multipart upload passthrough).
   */
  async open(outputStream: Writable): Promise<void> {
    this.workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: outputStream,
      useStyles: true,
      useSharedStrings: true,
    });

    this.worksheet = this.workbook.addWorksheet(toSheetName(this.entityType));
    const columns = this.buildColumns();
    this.worksheet.columns = columns;
    this.writeHeaderRow(columns);
    await Promise.resolve(); // ensure async open completes
  }

  /**
   * Appends a single data row. Call after open(), before close().
   */
  async writeRow(row: Record<string, unknown>): Promise<void> {
    const values: unknown[] = [null]; // ExcelJS row values are 1-indexed
    for (const col of this.buildColumns()) {
      const key = col.key as string;
      values.push(row[key] ?? null);
    }
    const wsRow = this.worksheet.addRow(values);
    wsRow.commit();
  }

  /**
   * Finalises the workbook and flushes all buffered data to the output stream.
   */
  async close(): Promise<void> {
    await this.worksheet.commit();
    await this.workbook.commit();
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

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

  private writeHeaderRow(columns: ExcelJS.Column[]): void {
    const headerRow = this.worksheet.getRow(1);
    columns.forEach((col, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = col.header as ExcelJS.CellValue;
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
    });
    headerRow.commit();
  }
}

function toSheetName(entityType: ImportableEntityType): string {
  return entityType.charAt(0).toUpperCase() + entityType.slice(1);
}

function toHeaderLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Template generator ──────────────────────────────────────────────────────

/**
 * Generates an import template xlsx as a Buffer (for download endpoint).
 * Includes column headers + validation dropdowns for enum columns.
 */
export async function generateImportTemplate(entityType: ImportableEntityType): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(toSheetName(entityType));
  const defs = getColumnDefs(entityType).filter((d) => !d.exportOnly);

  ws.columns = defs.map((d) => ({
    key: d.key,
    header: toHeaderLabel(d.key),
    width: d.templateWidth ?? 20,
  })) as ExcelJS.Column[];

  // Style header row
  const headerRow = ws.getRow(1);
  defs.forEach((_, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });
  headerRow.commit();

  // Add enum dropdowns
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

  // Required column indicator row (row 2 = example placeholder)
  const requiredDefs = defs.filter((d) => d.required);
  if (requiredDefs.length > 0) {
    const noteRow = ws.getRow(2);
    defs.forEach((def, idx) => {
      if (def.required) {
        const cell = noteRow.getCell(idx + 1);
        cell.note = `REQUIRED: ${def.description}`;
      }
    });
    noteRow.commit();
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
