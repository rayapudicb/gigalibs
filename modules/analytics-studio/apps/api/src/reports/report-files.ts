/**
 * WI-OI-106 (ADR-0016 F17): the Excel and PDF files of a report run, built from the same answers as the CSV.
 *
 * Excel: an "About" sheet (report, freshness, filters, measure versions) and one sheet per chart, with typed cells and
 * a frozen header row. No formula is ever written, and text that a spreadsheet would run as a formula is prefixed
 * exactly as in the CSV (`csvSafeText`).
 *
 * PDF: each chart drawn on the server by ECharts (SVG, as vectors) from the same option builders the screen uses
 * (@gigalibs/analytics-charts) in the light theme, with its filters, data freshness and a data table. The built-in PDF
 * fonts cover Latin text; any other character is shown as "?" and the page says so (the Excel file keeps it).
 */

import * as crypto from 'crypto';
import type { AnalyticsQueryResultV1, ChartTypeV1, PlaceDirectoryEntryV1 } from '@gigalibs/contracts';
import { REPORT_THEME, formatCell, isEChartsType, placeMap, toEChartsOption } from '@gigalibs/analytics-charts';
import * as echarts from 'echarts';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';

type Cell = string | number | boolean | null;

export interface ReportSection {
  readonly title: string | null;
  readonly result: AnalyticsQueryResultV1 | null;
  /** Why the section has no result (a tile that could not be drawn). */
  readonly note: string | null;
  readonly chartType: ChartTypeV1;
  /** The filters applied, in words ("crop is maize", "Place: Farm B"). */
  readonly filters: readonly string[];
  /** Place maps only: the places to draw (the member's own directory, under the question's place). */
  readonly places?: readonly PlaceDirectoryEntryV1[];
}

export interface ReportMeta {
  readonly reportName: string;
  readonly sourceName: string;
  readonly generatedAt: Date;
}

/** Rows drawn under a chart in the PDF; the Excel file has every row. */
export const PDF_TABLE_ROWS = 200;
const CHART_WIDTH = 760;
const CHART_HEIGHT = 300;

/** The CSV rule (report.service `csvCell`): text a spreadsheet would run as a formula is prefixed with '. */
export function csvSafeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function grainOf(result: AnalyticsQueryResultV1): string | undefined {
  const time = result.columns.find((column) => column.role === 'time');
  return time ? /\((day|week|month|quarter|year)\)$/.exec(time.label)?.[1] : undefined;
}

// ─── Excel ────────────────────────────────────────────────────────────────────

const EXCEL_DATE_FORMATS: Record<string, string> = { day: 'yyyy-mm-dd', week: 'yyyy-mm-dd', month: 'yyyy-mm', quarter: 'yyyy-mm', year: 'yyyy' };

function sheetName(title: string, used: Set<string>): string {
  const base = (title.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Chart').slice(0, 28);
  let name = base;
  for (let index = 2; used.has(name.toLowerCase()); index += 1) name = `${base.slice(0, 24)} (${index})`;
  used.add(name.toLowerCase());
  return name;
}

export async function buildXlsx(meta: ReportMeta, sections: readonly ReportSection[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GigaLibs Analytics';
  workbook.created = meta.generatedAt;
  const used = new Set<string>(['about']);
  const about = workbook.addWorksheet('About');
  about.columns = [{ width: 24 }, { width: 90 }];
  const line = (label: string, value: string) => about.addRow([label, csvSafeText(value)]);
  about.addRow(['Report', csvSafeText(meta.reportName)]).font = { bold: true };
  line('Source', meta.sourceName);
  line('Generated', meta.generatedAt.toISOString());
  for (const [index, section] of sections.entries()) {
    about.addRow([]);
    about.addRow([csvSafeText(section.title ?? meta.sourceName)]).font = { bold: true };
    if (!section.result) {
      line('Not drawn', section.note ?? 'No answer.');
      continue;
    }
    line('Data as of', section.result.asOf);
    line('Freshness', section.result.freshness);
    line('Watermark', section.result.watermark ?? 'none');
    line('Filters', section.filters.length ? section.filters.join('; ') : 'none');
    const versions = Object.entries(section.result.measureVersions ?? {});
    if (versions.length) line('Measure versions', versions.map(([name, id]) => `${name}: ${id}`).join('; '));
    line('Rows', `${section.result.rows.length}${section.result.truncated ? ' (more rows matched; the question limits them)' : ''}`);
    line('Sheet', `Section ${index + 1}`);

    const sheet = workbook.addWorksheet(sheetName(section.title ?? meta.sourceName, used), { views: [{ state: 'frozen', ySplit: 1 }] });
    const grain = grainOf(section.result);
    const columns = section.result.columns;
    sheet.columns = columns.map((column) => ({
      header: csvSafeText(column.label),
      key: column.name,
      width: Math.min(40, Math.max(12, column.label.length + 2)),
    }));
    sheet.getRow(1).font = { bold: true };
    for (const row of section.result.rows) {
      sheet.addRow(
        row.map((value, columnIndex) => {
          const column = columns[columnIndex]!;
          if (value === null) return null;
          if (column.role === 'time' && typeof value === 'string') {
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? csvSafeText(value) : date;
          }
          if (typeof value === 'string') return csvSafeText(value);
          return value;
        }),
      );
    }
    columns.forEach((column, columnIndex) => {
      if (column.role === 'time') sheet.getColumn(columnIndex + 1).numFmt = EXCEL_DATE_FORMATS[grain ?? 'day'] ?? 'yyyy-mm-dd';
    });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ─── Charts on the server ─────────────────────────────────────────────────────

/** The chart as SVG, drawn by ECharts on the server; null for tables, KPIs and empty answers. */
export function chartSvg(section: ReportSection, width = CHART_WIDTH, height = CHART_HEIGHT): string | null {
  const result = section.result;
  if (!result || result.rows.length === 0 || !isEChartsType(section.chartType)) return null;
  let option;
  if (section.chartType === 'place_map') {
    const mapName = `report-places-${crypto.randomUUID()}`;
    const drawn = placeMap(result, section.places ?? [], mapName, REPORT_THEME.scale, REPORT_THEME.text);
    if (!drawn) return null;
    echarts.registerMap(mapName, drawn.geoJson as never);
    option = drawn.option;
  } else {
    option = toEChartsOption(result, section.chartType, REPORT_THEME.palette, REPORT_THEME.text);
  }
  if (!option) return null;
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width, height });
  try {
    chart.setOption({ ...option, animation: false, backgroundColor: 'transparent' });
    return chart.renderToSVGString();
  } finally {
    chart.dispose();
  }
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

// The built-in fonts encode WinAnsi: printable Latin-1 and these extra characters.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/** Text the built-in PDF fonts can print; anything else becomes "?". Returns the text and how many were replaced. */
export function pdfText(value: string): { text: string; replaced: number } {
  let replaced = 0;
  let text = '';
  for (const character of value) {
    const code = character.codePointAt(0)!;
    const printable = code === 9 || code === 10 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255) || WIN_ANSI_EXTRA.has(character);
    if (printable) text += character;
    else {
      text += '?';
      replaced += 1;
    }
  }
  return { text, replaced };
}

/** The same rule for the labels inside a chart's SVG. */
function pdfSvg(svg: string): { svg: string; replaced: number } {
  let replaced = 0;
  const cleaned = svg.replace(/>([^<]+)</g, (_match, content: string) => {
    const safe = pdfText(content);
    replaced += safe.replaced;
    return `>${safe.text}<`;
  });
  return { svg: cleaned, replaced };
}

export async function buildPdf(meta: ReportMeta, sections: readonly ReportSection[], options: { compress?: boolean } = {}): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 36,
    bufferPages: true,
    compress: options.compress ?? true,
    info: { Title: pdfText(meta.reportName).text, Producer: 'GigaLibs Analytics', Creator: 'GigaLibs Analytics' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  let replaced = 0;
  const write = (value: string, opts?: PDFKit.Mixins.TextOptions) => {
    const safe = pdfText(value);
    replaced += safe.replaced;
    doc.text(safe.text, opts);
  };
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 18;

  doc.font('Helvetica-Bold').fontSize(18).fillColor(REPORT_THEME.text.color);
  write(meta.reportName);
  doc.font('Helvetica').fontSize(9).fillColor(REPORT_THEME.text.muted);
  write(`${meta.sourceName} · generated ${meta.generatedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC`);

  sections.forEach((section, index) => {
    if (index > 0) doc.addPage();
    else doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(REPORT_THEME.text.color);
    write(section.title ?? meta.sourceName);
    doc.font('Helvetica').fontSize(8.5).fillColor(REPORT_THEME.text.muted);
    if (!section.result) {
      write(section.note ?? 'This chart could not be drawn.');
      return;
    }
    const result = section.result;
    write(`Data as of ${result.asOf.replace('T', ' ').slice(0, 16)} UTC · ${result.freshness.toLowerCase()} · watermark ${result.watermark ?? 'none'}`);
    write(`Filters: ${section.filters.length ? section.filters.join('; ') : 'none'}`);
    doc.moveDown(0.4);

    if (section.chartType === 'kpi' && result.rows[0]) {
      const row = result.rows[0];
      doc.font('Helvetica-Bold').fontSize(16).fillColor(REPORT_THEME.text.color);
      result.columns.forEach((column, columnIndex) => {
        if (column.role === 'measure') write(`${column.label}: ${formatCell(row[columnIndex] ?? null)}`);
      });
      doc.moveDown(0.6);
    }
    const svg = chartSvg(section, Math.round(width), CHART_HEIGHT);
    if (svg) {
      const safe = pdfSvg(svg);
      replaced += safe.replaced;
      if (doc.y + CHART_HEIGHT > bottom()) doc.addPage();
      SVGtoPDF(doc, safe.svg, left, doc.y, { width, height: CHART_HEIGHT, preserveAspectRatio: 'xMidYMid meet' });
      doc.y += CHART_HEIGHT + 10;
    }
    drawTable(doc, result, width, left, bottom, (value) => {
      const safe = pdfText(value);
      replaced += safe.replaced;
      return safe.text;
    });
  });

  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    doc.switchToPage(page);
    const footer = `Page ${page - range.start + 1} of ${range.count} · ${pdfText(meta.reportName).text}${
      replaced > 0 ? ` · ${replaced} character(s) the PDF fonts cannot show appear as "?"; the Excel file keeps them` : ''
    }`;
    doc.font('Helvetica').fontSize(7.5).fillColor(REPORT_THEME.text.muted);
    // Writing below the bottom margin must not start a new page.
    const margin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.text(footer, left, doc.page.height - 26, { width, lineBreak: false });
    doc.page.margins.bottom = margin;
  }
  doc.end();
  return finished;
}

function drawTable(
  doc: PDFKit.PDFDocument,
  result: AnalyticsQueryResultV1,
  width: number,
  left: number,
  bottom: () => number,
  safe: (value: string) => string,
): void {
  const grain = grainOf(result);
  const columns = result.columns;
  const columnWidth = width / Math.max(1, columns.length);
  const rowHeight = 13;
  const cellText = (value: Cell, columnIndex: number) => formatCell(value, columns[columnIndex]?.role === 'time' ? grain : undefined);
  const fit = (text: string) => {
    let value = safe(text);
    while (value.length > 1 && doc.widthOfString(value) > columnWidth - 6) value = `${value.slice(0, -2)}…`;
    return value;
  };
  const header = () => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(REPORT_THEME.text.color);
    columns.forEach((column, columnIndex) => {
      doc.text(fit(column.label), left + columnIndex * columnWidth + 3, doc.y, { width: columnWidth - 6, lineBreak: false, align: column.role === 'measure' ? 'right' : 'left' });
    });
    doc.y += rowHeight;
    doc.moveTo(left, doc.y - 2).lineTo(left + width, doc.y - 2).lineWidth(0.5).strokeColor(REPORT_THEME.scale.border).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(REPORT_THEME.text.color);
  };
  if (doc.y + rowHeight * 3 > bottom()) doc.addPage();
  header();
  const rows = result.rows.slice(0, PDF_TABLE_ROWS);
  for (const row of rows) {
    if (doc.y + rowHeight > bottom()) {
      doc.addPage();
      header();
    }
    const y = doc.y;
    row.forEach((value, columnIndex) => {
      doc.text(fit(cellText(value as Cell, columnIndex)), left + columnIndex * columnWidth + 3, y, {
        width: columnWidth - 6,
        lineBreak: false,
        align: columns[columnIndex]?.role === 'measure' ? 'right' : 'left',
      });
    });
    doc.y = y + rowHeight;
  }
  if (result.rows.length > rows.length || result.truncated) {
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(REPORT_THEME.text.muted);
    doc.text(`The first ${rows.length} of ${result.rows.length}${result.truncated ? '+' : ''} rows; the Excel and CSV files have all of them.`, left, doc.y + 4, { width });
  }
}
