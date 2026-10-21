import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { DossierBlock, DossierModelV1 } from '@gigalibs/process-safety-screening-domain';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Header,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import PDFDocument from 'pdfkit';

// WI-OI-120ca (SPEED S7; FR-RPT-01 to 04): the dossier model rendered as DOCX (docx, MIT) and PDF (pdfkit, MIT), with
// the same sections, texts and numbers as the preview. While the route is not approved, every page carries the
// watermark: in the DOCX page header, and across every PDF page. The PDF embeds DejaVu Sans (Bitstream Vera licence) so
// Greek letters, arrows and units print as entered.

const require = createRequire(import.meta.url);
const FONT_DIR = join(dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');
const FONT = join(FONT_DIR, 'DejaVuSans.ttf');
const FONT_BOLD = join(FONT_DIR, 'DejaVuSans-Bold.ttf');

// A4 in DXA (twentieths of a point) with 2 cm margins: the table width is the text width.
const TEXT_WIDTH_DXA = 11906 - 2 * 1134;

/**
 * Column widths that sum to `total`: every column is at least as wide as its longest word, so no word is split; the
 * rest of the width goes to the columns with the longest texts. `measure` gives a text's width in the same unit.
 */
export function columnWidths(
  header: readonly string[],
  rows: readonly (readonly string[])[],
  total: number,
  measure: (text: string, bold: boolean) => number,
  padding: number,
): number[] {
  const columns = header.map((title, index) => ({
    title,
    cells: rows.map((row) => row[index] ?? ''),
  }));
  const words = (text: string) => text.split(/\s+/).filter(Boolean);
  const least = columns.map(
    ({ title, cells }) =>
      Math.max(
        ...words(title).map((word) => measure(word, true)),
        ...cells.flatMap(words).map((word) => measure(word, false)),
        0,
      ) + padding,
  );
  const wanted = columns.map(({ title, cells }, index) =>
    Math.max(
      least[index] ?? 0,
      Math.min(
        total / 2,
        Math.max(measure(title, true), ...cells.map((cell) => measure(cell, false))) + padding,
      ),
    ),
  );
  const minimum = least.reduce((sum, width) => sum + width, 0);
  if (minimum >= total) return least.map((width) => (width / minimum) * total);
  const growth = wanted.map((width, index) => width - (least[index] ?? 0));
  const grows = growth.reduce((sum, width) => sum + width, 0);
  return least.map((width, index) =>
    grows > 0
      ? width + ((growth[index] ?? 0) / grows) * (total - minimum)
      : width + (total - minimum) / least.length,
  );
}

// The DOCX has no layout engine at hand: a 9 pt DejaVu Sans character is taken as 110 DXA wide (a little above average).
const docxMeasure = (text: string) => text.length * 110;

function docxBlock(block: DossierBlock): (Paragraph | Table)[] {
  if (block.kind === 'paragraph') {
    return [
      new Paragraph({
        children: [new TextRun({ text: block.text, bold: block.emphasis === 'statement' })],
        spacing: { after: 120 },
      }),
    ];
  }
  const header = block.kind === 'tiles' ? block.items.map((item) => item.label) : block.columns;
  const rows = block.kind === 'tiles' ? [block.items.map((item) => item.value)] : block.rows;
  const widths = columnWidths(header, rows, TEXT_WIDTH_DXA, docxMeasure, 220).map(Math.floor);
  const cell = (text: string, bold: boolean, index: number) =>
    new TableCell({
      width: { size: widths[index] ?? 0, type: WidthType.DXA },
      ...(bold ? { shading: { type: ShadingType.CLEAR, fill: 'EEEEEE', color: 'auto' } } : {}),
      children: [new Paragraph({ children: [new TextRun({ text, bold, size: 18 })] })],
    });
  return [
    new Table({
      width: { size: widths.reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
      columnWidths: widths,
      rows: [
        new TableRow({
          tableHeader: true,
          children: header.map((text, index) => cell(text, true, index)),
        }),
        ...rows.map(
          (row) => new TableRow({ children: row.map((text, index) => cell(text, false, index)) }),
        ),
      ],
    }),
    new Paragraph({ text: '', spacing: { after: 120 } }),
  ];
}

export async function renderDocx(model: DossierModelV1): Promise<Buffer> {
  const header = model.watermark
    ? new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C00000', space: 4 } },
            children: [
              new TextRun({ text: model.watermark, bold: true, color: 'C00000', size: 24 }),
            ],
          }),
        ],
      })
    : undefined;
  const document = new Document({
    creator: 'GigaLibs SPEED',
    title: model.title,
    styles: { default: { document: { run: { font: 'DejaVu Sans', size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
          },
        },
        ...(header ? { headers: { default: header, first: header, even: header } } : {}),
        children: [
          new Paragraph({ text: model.title, heading: HeadingLevel.TITLE }),
          new Paragraph({ text: model.subtitle }),
          new Paragraph({ text: model.generated, spacing: { after: 240 } }),
          ...model.sections.flatMap((section) => [
            new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }),
            ...section.blocks.flatMap(docxBlock),
          ]),
        ],
      },
    ],
  });
  return Packer.toBuffer(document);
}

export async function renderPdf(model: DossierModelV1): Promise<Buffer> {
  const margin = 57;
  const doc = new PDFDocument({
    size: 'A4',
    margin,
    info: { Title: model.title, Creator: 'GigaLibs SPEED' },
  });
  doc.registerFont('body', FONT);
  doc.registerFont('bold', FONT_BOLD);
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  // The font in use, so the watermark drawn on a new page (also one pdfkit adds inside a long paragraph) gives it back.
  let current: { name: 'body' | 'bold'; size: number } = { name: 'body', size: 10 };
  const use = (name: 'body' | 'bold', size: number) => {
    current = { name, size };
    doc.font(name).fontSize(size).fillColor('#000000');
  };
  const watermark = () => {
    if (!model.watermark) return;
    const { x, y } = doc;
    doc.save();
    doc.font('bold').fontSize(40).fillColor('#C00000').opacity(0.18);
    doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc.text(model.watermark, 0, doc.page.height / 2 - 20, {
      width: doc.page.width,
      align: 'center',
      lineBreak: false,
    });
    doc.restore();
    doc.save();
    doc.font('bold').fontSize(9).fillColor('#C00000');
    doc.text(model.watermark, margin, 25, {
      width: doc.page.width - 2 * margin,
      align: 'center',
      lineBreak: false,
    });
    doc.restore();
    use(current.name, current.size);
    doc.x = x;
    doc.y = y;
  };
  doc.on('pageAdded', watermark);
  watermark();
  const width = doc.page.width - 2 * margin;
  const bottom = () => doc.page.height - margin;

  const table = (columns: readonly string[], rows: readonly (readonly string[])[]) => {
    const widths = columnWidths(
      columns,
      rows,
      width,
      (text, bold) => {
        use(bold ? 'bold' : 'body', 8);
        return doc.widthOfString(text);
      },
      6,
    );
    const lefts = widths.map(
      (_, index) => margin + widths.slice(0, index).reduce((sum, w) => sum + w, 0),
    );
    const heightOf = (cells: readonly string[], bold: boolean) => {
      use(bold ? 'bold' : 'body', 8);
      return (
        Math.max(
          10,
          ...cells.map((text, index) =>
            doc.heightOfString(text || ' ', { width: (widths[index] ?? 0) - 4 }),
          ),
        ) + 4
      );
    };
    const drawRow = (cells: readonly string[], bold: boolean) => {
      const height = heightOf(cells, bold);
      const top = doc.y;
      cells.forEach((text, index) =>
        doc.text(text || ' ', (lefts[index] ?? margin) + 2, top + 2, {
          width: (widths[index] ?? 0) - 4,
        }),
      );
      doc
        .moveTo(margin, top + height)
        .lineTo(margin + width, top + height)
        .lineWidth(0.3)
        .strokeColor('#999999')
        .stroke();
      doc.x = margin;
      doc.y = top + height;
    };
    // The header row starts on the page of the first row, and is repeated on every page the table continues on.
    if (doc.y + heightOf(columns, true) + (rows[0] ? heightOf(rows[0], false) : 0) > bottom())
      doc.addPage();
    drawRow(columns, true);
    for (const row of rows) {
      if (doc.y + heightOf(row, false) > bottom()) {
        doc.addPage();
        drawRow(columns, true);
      }
      drawRow(row, false);
    }
    doc.moveDown(0.5);
  };

  use('bold', 18);
  doc.text(model.title);
  use('body', 10);
  doc.text(model.subtitle).text(model.generated).moveDown();
  for (const section of model.sections) {
    if (doc.y > bottom() - 80) doc.addPage();
    use('bold', 13);
    doc.text(section.title, margin, doc.y).moveDown(0.3);
    for (const block of section.blocks) {
      if (block.kind === 'paragraph') {
        use(block.emphasis === 'statement' ? 'bold' : 'body', 9);
        doc.text(block.text, margin, doc.y, { width }).moveDown(0.5);
      } else if (block.kind === 'tiles')
        table(
          block.items.map((item) => item.label),
          [block.items.map((item) => item.value)],
        );
      else table(block.columns, block.rows);
    }
  }
  doc.end();
  return finished;
}
