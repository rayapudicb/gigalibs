// Builds the pharma implementation plan .docx from one markdown file.
// usage: node build_docx.js <input.md> <output.docx>
const fs = require('fs');
const { marked } = require('marked');
const d = require('docx');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType,
  BorderStyle, AlignmentType, PageBreak, TableOfContents, Header, Footer, PageNumber, LevelFormat,
  ExternalHyperlink, TabStopType,
} = d;

const [, , input, output] = process.argv;
const md = fs.readFileSync(input, 'utf8');

const FONT = 'Calibri';
const MONO = 'Consolas';
const ACCENT = '1F4E79';
const BODY_SIZE = 20; // half-points (10 pt)
const CONTENT_WIDTH = 9026; // A4 with 1-inch margins, in DXA

const TITLE = process.env.DOC_TITLE || 'Pharma Specification Suite: Agent Investigation and Spec-Driven Implementation Plan on GigaLibs';
const SUBTITLE = process.env.DOC_SUBTITLE || 'Module-by-module investigation by the GigaLibs agent organisation (pharma practice), with GxP classification, specification sets and implementation plans; and a worked example of SPEED Stage-1 desk screening.';
const VERSION = process.env.DOC_VERSION || '1.0';
const DATE = process.env.DOC_DATE || '19 October 2026';
const CARD = process.env.DOC_CARD || 'WI-OI-120bm';
const HEADER = process.env.DOC_HEADER || 'GigaLibs · Pharma specification suite: implementation plan · v1.0';
const SOURCE = process.env.DOC_SOURCE || "The owner's Pharma Tech Spec Suite v2 (company and product names removed)";
const PREPARED = process.env.DOC_PREPARED || 'GigaLibs agent organisation: pharma and life-sciences practice (see section 3)';
const REVIEW = process.env.DOC_REVIEW || 'Head of QA · Process safety expert · Regulatory CMC lead · Data protection officer · Legal counsel (licensing)';
const BASELINE = process.env.DOC_BASELINE || 'GigaLibs, release 1d8d2634 on UAT (19 October 2026); agent organisation WI-OI-120bl';

function decode(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// Inline tokens -> TextRun / ExternalHyperlink children.
function inline(tokens, style = {}) {
  const out = [];
  for (const t of tokens || []) {
    switch (t.type) {
      case 'strong': out.push(...inline(t.tokens, { ...style, bold: true })); break;
      case 'em': out.push(...inline(t.tokens, { ...style, italics: true })); break;
      case 'del': out.push(...inline(t.tokens, { ...style, strike: true })); break;
      case 'codespan':
        out.push(new TextRun({ text: decode(t.text), font: MONO, size: BODY_SIZE - 2, ...style }));
        break;
      case 'br': out.push(new TextRun({ text: '', break: 1 })); break;
      case 'link':
        out.push(new ExternalHyperlink({
          link: t.href,
          children: [new TextRun({ text: decode(t.text), style: 'Hyperlink', ...style })],
        }));
        break;
      case 'text':
      case 'escape':
        if (t.tokens && t.tokens.length) out.push(...inline(t.tokens, style));
        else out.push(new TextRun({ text: decode(t.text), ...style }));
        break;
      case 'html': break;
      default:
        if (t.tokens) out.push(...inline(t.tokens, style));
        else if (t.text) out.push(new TextRun({ text: decode(t.text), ...style }));
    }
  }
  return out;
}

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

function plainLength(tokens) {
  let n = 0;
  for (const t of tokens || []) n += t.tokens ? plainLength(t.tokens) : String(t.text || '').length;
  return n;
}

function table(tok) {
  const cols = tok.header.length;
  // Column widths in proportion to content, with a floor, summing to CONTENT_WIDTH.
  const weights = new Array(cols).fill(0);
  const rows = [tok.header, ...tok.rows];
  for (const row of rows) row.forEach((c, i) => { weights[i] = Math.max(weights[i], Math.min(plainLength(c.tokens), 220)); });
  const floor = 900;
  const total = weights.reduce((a, b) => a + Math.max(b, 8), 0);
  let widths = weights.map((w) => Math.max(floor, Math.round((Math.max(w, 8) / total) * CONTENT_WIDTH)));
  const scale = CONTENT_WIDTH / widths.reduce((a, b) => a + b, 0);
  widths = widths.map((w) => Math.floor(w * scale));
  widths[widths.length - 1] += CONTENT_WIDTH - widths.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'A6A6A6' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cell = (c, i, header) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    borders,
    shading: header ? { type: ShadingType.CLEAR, color: 'auto', fill: 'DCE6F1' } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: inline(c.tokens, header ? { bold: true, size: BODY_SIZE - 2 } : { size: BODY_SIZE - 2 }),
    })],
  });
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: tok.header.map((c, i) => cell(c, i, true)) }),
      ...tok.rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, i, false)) })),
    ],
  });
}

function list(tok, level, out) {
  for (const item of tok.items) {
    let first = true;
    for (const sub of item.tokens) {
      if (sub.type === 'list') { list(sub, level + 1, out); continue; }
      if (sub.type === 'text' || sub.type === 'paragraph') {
        const runs = inline(sub.tokens || [{ type: 'text', text: sub.text }]);
        out.push(new Paragraph({
          numbering: first ? { reference: tok.ordered ? 'numbers' : 'bullets', level: Math.min(level, 4) } : undefined,
          indent: first ? undefined : { left: 720 * (level + 1) },
          spacing: { after: 40 },
          children: runs,
        }));
        first = false;
      } else {
        block(sub, out, level + 1);
      }
    }
  }
}

function block(t, out, level = 0) {
  switch (t.type) {
    case 'heading':
      out.push(new Paragraph({ heading: HEADINGS[Math.min(t.depth, 6) - 1], children: inline(t.tokens) }));
      break;
    case 'paragraph':
      out.push(new Paragraph({ spacing: { after: 100 }, children: inline(t.tokens) }));
      break;
    case 'list': list(t, 0, out); break;
    case 'table': out.push(table(t)); out.push(new Paragraph({ spacing: { after: 80 }, children: [] })); break;
    case 'code':
      for (const line of t.text.split('\n')) {
        out.push(new Paragraph({
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F2F2' },
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: line.length ? line : ' ', font: MONO, size: 16 })],
        }));
      }
      out.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
      break;
    case 'blockquote':
      for (const sub of t.tokens) {
        out.push(new Paragraph({
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'EAF1FB' },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT, space: 8 } },
          indent: { left: 200 },
          spacing: { after: 80 },
          children: inline(sub.tokens || [{ type: 'text', text: sub.text || '' }]),
        }));
      }
      break;
    case 'hr':
      out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'A6A6A6', space: 1 } }, children: [] }));
      break;
    case 'html':
      if (/pagebreak/.test(t.raw || t.text)) out.push(new Paragraph({ children: [new PageBreak()] }));
      break;
    case 'space': break;
    default:
      if (t.tokens) out.push(new Paragraph({ children: inline(t.tokens) }));
  }
}

const body = [];
for (const t of marked.lexer(md)) block(t, body);

// Cover page and document control.
const cover = [
  new Paragraph({ spacing: { before: 2400, after: 200 }, children: [new TextRun({ text: 'GigaLibs', bold: true, size: 28, color: ACCENT, font: FONT })] }),
  new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: TITLE, bold: true, size: 44, color: '1F1F1F', font: FONT })] }),
  new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: SUBTITLE, size: 24, color: '404040' })] }),
  new Paragraph({ spacing: { before: 600, after: 60 }, children: [new TextRun({ text: `Version ${VERSION}  ·  ${DATE}`, size: 22 })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'Status: Proposal for owner review. Not a validated document.', size: 22, bold: true })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: `Card: ${CARD}`, size: 22 })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'Confidential: internal planning document', size: 22, italics: true })] }),
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Document control')] }),
];
const ctrl = (rows) => {
  const widths = [2600, CONTENT_WIDTH - 2600];
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'A6A6A6' };
  const borders = { top: border, bottom: border, left: border, right: border };
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: widths,
    rows: rows.map(([k, v]) => new TableRow({ children: [
      new TableCell({ width: { size: widths[0], type: WidthType.DXA }, borders, shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'DCE6F1' }, margins: { top: 60, bottom: 60, left: 90, right: 90 }, children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: 19 })] })] }),
      new TableCell({ width: { size: widths[1], type: WidthType.DXA }, borders, margins: { top: 60, bottom: 60, left: 90, right: 90 }, children: [new Paragraph({ children: [new TextRun({ text: v, size: 19 })] })] }),
    ] })),
  });
};
cover.push(ctrl([
  ['Document', TITLE],
  ['Version', `${VERSION} (${DATE})`],
  ['Prepared by', PREPARED],
  ['Source', SOURCE],
  ['Platform baseline', BASELINE],
  ['Review required', REVIEW],
  ['Approval', 'Owner (pending)'],
  ['Change history', `${VERSION}: first issue`],
]));
cover.push(new Paragraph({ children: [new PageBreak()] }));
cover.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Contents')] }));
cover.push(new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }));
cover.push(new Paragraph({ children: [new TextRun({ text: 'If page numbers are missing, right-click the table and choose Update Field.', italics: true, size: 16, color: '808080' })] }));
cover.push(new Paragraph({ children: [new PageBreak()] }));

const doc = new Document({
  creator: 'GigaLibs agent organisation',
  title: TITLE,
  description: 'Pharma specification suite: spec-driven implementation plan',
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: BODY_SIZE } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, color: ACCENT, font: FONT }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, color: ACCENT, font: FONT }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, color: '2E2E2E', font: FONT }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
      { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 20, bold: true, italics: true, color: '404040', font: FONT }, paragraph: { spacing: { before: 160, after: 60 }, outlineLevel: 3 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [0, 1, 2, 3, 4].map((l) => ({ level: l, format: LevelFormat.BULLET, text: ['•', '◦', '▪', '•', '◦'][l], alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360 + 360 * l, hanging: 260 } } } })) },
      { reference: 'numbers', levels: [0, 1, 2, 3, 4].map((l) => ({ level: l, format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN, LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER][l], text: `%${l + 1}.`, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360 + 360 * l, hanging: 300 } } } })) },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'A6A6A6', space: 1 } }, children: [new TextRun({ text: HEADER, size: 16, color: '808080' })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }], children: [
      new TextRun({ text: 'Proposal for owner review. Not a validated document.', size: 16, color: '808080' }),
      new TextRun({ children: ['\tPage ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 16, color: '808080' }),
    ] })] }) },
    children: [...cover, ...body],
  }],
});

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(output, buf); console.log('wrote', output, buf.length, 'bytes'); });
