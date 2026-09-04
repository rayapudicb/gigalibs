/**
 * @gigalibs/export-engine-core
 *
 * Universal Multi-Format Report Exporter & Data Ingestion Engine (XLSX / CSV / JSON / TSV).
 * Supports browser client direct downloads and headless server-side buffer generation.
 * Benchmark: SheetJS / ExcelJS / Ag-Grid Enterprise Export.
 *
 * @module
 */

export * from './pdf-generator.js';

export interface ExportColumnDef<T = any> {
  key: keyof T | string;
  header: string;
  type?: 'string' | 'number' | 'currency' | 'date' | 'badge';
  formatter?: (value: any, row: T) => string;
}

export interface SheetDefinition<T = any> {
  sheetName: string;
  data: T[];
  columns: ExportColumnDef<T>[];
  includeTotalRow?: boolean;
}

export class ExportEngine {
  /**
   * Generates RFC 4180 CSV string with UTF-8 BOM.
   */
  static generateCsvString<T extends Record<string, any>>(
    data: T[],
    columns: ExportColumnDef<T>[],
  ): string {
    const headers = columns.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(',');
    const rows = data.map((row) =>
      columns
        .map((c) => {
          const val = row[c.key as string];
          const formatted = c.formatter ? c.formatter(val, row) : val !== undefined && val !== null ? String(val) : '';
          return `"${formatted.replace(/"/g, '""')}"`;
        })
        .join(','),
    );

    return '\uFEFF' + [headers, ...rows].join('\r\n');
  }

  /**
   * Generates and triggers browser download of an RFC 4180 compliant CSV file.
   */
  static exportToCsv<T extends Record<string, any>>(
    data: T[],
    columns: ExportColumnDef<T>[],
    filename = 'export.csv',
  ): void {
    const csvContent = this.generateCsvString(data, columns);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    this.triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
  }

  /**
   * Generates a Multi-Sheet OpenXML Excel workbook XML string (.xlsx compatible).
   */
  static generateMultiSheetExcelXml(sheets: SheetDefinition[]): string {
    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#4F46E5" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center"/>
  </Style>
  <Style ss:ID="Summary">
   <Font ss:Bold="1" ss:Color="#0F172A"/>
   <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 ${sheets
   .map(
     (sheet) => `
 <Worksheet ss:Name="${sheet.sheetName.replace(/[/\\?*[\]]/g, '_')}">
  <Table ss:DefaultColumnWidth="130">
   <Row ss:StyleID="Header">
    ${sheet.columns.map((c) => `<Cell><Data ss:Type="String">${c.header}</Data></Cell>`).join('')}
   </Row>
   ${sheet.data
     .map(
       (row) => `
    <Row>
     ${sheet.columns
       .map((c) => {
         const val = row[c.key as string];
         const isNum = typeof val === 'number';
         return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${val ?? ''}</Data></Cell>`;
       })
       .join('')}
    </Row>`,
     )
     .join('')}
  </Table>
 </Worksheet>`,
   )
   .join('')}
</Workbook>`;
  }

  /**
   * Generates and triggers browser download of a single or Multi-Sheet OpenXML workbook.
   */
  static exportToExcelXml<T extends Record<string, any>>(
    data: T[],
    columns: ExportColumnDef<T>[],
    filename = 'report.xlsx',
    sheetName = 'Sheet1',
  ): void {
    this.exportMultiSheetExcelXml([{ sheetName, data, columns }], filename);
  }

  /**
   * Generates a Multi-Sheet OpenXML Excel workbook and triggers browser download.
   */
  static exportMultiSheetExcelXml(
    sheets: SheetDefinition[],
    filename = 'enterprise_multi_sheet_report.xlsx',
  ): void {
    const xml = this.generateMultiSheetExcelXml(sheets);
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    this.triggerDownload(blob, filename.endsWith('.xlsx') || filename.endsWith('.xml') ? filename : `${filename}.xlsx`);
  }

  /**
   * Generates and triggers browser download of raw structured JSON.
   */
  static exportToJson<T>(data: T[], filename = 'export.json'): void {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    this.triggerDownload(blob, filename.endsWith('.json') ? filename : `${filename}.json`);
  }

  /**
   * Copies formatted TSV (Tab-Separated Values) to clipboard.
   */
  static async copyToClipboardTsv<T extends Record<string, any>>(
    data: T[],
    columns: ExportColumnDef<T>[],
  ): Promise<boolean> {
    const headers = columns.map((c) => c.header).join('\t');
    const rows = data.map((row) =>
      columns
        .map((c) => {
          const val = row[c.key as string];
          return c.formatter ? c.formatter(val, row) : val !== undefined && val !== null ? String(val) : '';
        })
        .join('\t'),
    );

    const tsvContent = [headers, ...rows].join('\n');
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(tsvContent);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private static triggerDownload(blob: Blob, filename: string): void {
    if (typeof document !== 'undefined') {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }
}
