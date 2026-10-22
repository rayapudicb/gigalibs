import { missingCriteria } from '@gigalibs/process-safety-engines';
import type { Translate } from './messages/index.js';
import { type PackKind, parsePack } from './packs.js';
import type { SpeedPackBody } from './speed-api.js';

// WI-OI-120ce: a pack as an Excel workbook, one sheet per part, so a process safety specialist can prepare or review a
// pack in a spreadsheet. A workbook is read back into the same import format as a JSON file and checked against the
// same contract before anything is sent; the server checks it again. ExcelJS is loaded only when a workbook is made or
// read (MIT; already used by the CMMS and Analytics APIs).

/** The sheets of each kind of pack and their columns, in order (the first row of each sheet). */
export const PACK_SHEETS = {
  criteria: { Criteria: ['Criterion', 'Key', 'Value', 'Citation'] },
  library: {
    Materials: ['ID', 'Name', 'CAS number', 'Formula', 'Reactivity classes', 'Note', 'Citation'],
    'Interaction rules': [
      'ID',
      'Class A',
      'Class B',
      'Severity',
      'Finding',
      'Control',
      'Recommended test',
      'Citation',
    ],
    'Reaction classes': ['ID', 'Name', 'Typical ΔHr (kJ/mol)', 'Citation'],
    'Energetic groups': ['ID', 'Name', 'Citation'],
    Gases: ['Formula (Hill)', 'ID', 'Name', 'Citation'],
    'Formation enthalpies': ['Formula (Hill)', 'ΔHf (kJ/mol)', 'Phase', 'Citation'],
  },
} as const;
const PACK_SHEET = 'Pack';
const sheetsOf = (kind: PackKind) =>
  Object.entries(PACK_SHEETS[kind]) as [string, readonly string[]][];

type Row = readonly (string | number | null)[];
type Body = Record<string, unknown>;

async function excel() {
  const module = await import('exceljs');
  return (module as unknown as { default?: typeof module }).default ?? module;
}

function criteriaLeaves(value: unknown, path: string[] = []): [string, number][] {
  if (typeof value === 'number') return [[path.join('.'), value]];
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([key, child]) => criteriaLeaves(child, [...path, key]));
  return [];
}

function rowsOf(kind: PackKind, body: SpeedPackBody | null, t?: Translate): Record<string, Row[]> {
  if (kind === 'criteria') {
    const criteria = body && 'criteria' in body ? body.criteria : null;
    const citations = body && 'citations' in body ? body.citations : {};
    const keys = criteria
      ? criteriaLeaves(criteria)
      : missingCriteria({})
          .filter((key: string) => key !== 'version')
          .map((key: string): [string, number | null] => [key, null]);
    return {
      Criteria: keys.map(([key, value]) => [
        t ? t(`speed.criteria.path.${key}`) : key,
        key,
        value,
        (citations as Record<string, string>)[key] ?? null,
      ]),
    };
  }
  const library = body && 'library' in body ? body.library : null;
  return {
    Materials: (library?.materials ?? []).map((m) => [
      m.id,
      m.name ?? null,
      m.casNumber ?? null,
      m.formula ?? null,
      m.classes.join(', '),
      m.note ?? null,
      m.citation,
    ]),
    'Interaction rules': (library?.rules ?? []).map((r) => [
      r.id,
      r.classA,
      r.classB,
      r.severity,
      r.finding ?? null,
      r.control ?? null,
      r.recommendedTest ?? null,
      r.citation,
    ]),
    'Reaction classes': (library?.reactionClasses ?? []).map((c) => [
      c.id,
      c.name ?? null,
      c.typicalReactionEnthalpyKJPerMol,
      c.citation,
    ]),
    'Energetic groups': (library?.energeticGroups ?? []).map((g) => [
      g.id,
      g.name ?? null,
      g.citation,
    ]),
    Gases: Object.entries(library?.gases ?? {}).map(([hill, g]) => [
      hill,
      g.id,
      g.name ?? null,
      g.citation,
    ]),
    'Formation enthalpies': Object.entries(library?.formationEnthalpies ?? {}).map(([hill, f]) => [
      hill,
      f.kJPerMol,
      f.phase,
      f.citation,
    ]),
  };
}

/** A pack (or, with no body, a blank template of the kind) as an .xlsx workbook. */
export async function packToWorkbook(
  kind: PackKind,
  body: SpeedPackBody | null,
  t?: Translate,
): Promise<ArrayBuffer> {
  const ExcelJS = await excel();
  const workbook = new ExcelJS.Workbook();
  const pack = workbook.addWorksheet(PACK_SHEET);
  pack.addRow(['Version label', body?.versionLabel ?? '']);
  pack.addRow(['Source', body?.source ?? '']);
  pack.getColumn(1).width = 18;
  pack.getColumn(2).width = 90;
  const rows = rowsOf(kind, body, t);
  for (const [name, columns] of sheetsOf(kind)) {
    const sheet = workbook.addWorksheet(name);
    sheet.addRow([...columns]).font = { bold: true };
    for (const row of rows[name] ?? []) sheet.addRow([...row]);
    for (const column of sheet.columns) column.width = 22;
  }
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

/** A cell's value as text (plain, rich text, hyperlink or formula result); blank as ''. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const v = value as { richText?: { text: string }[]; text?: unknown; result?: unknown };
    if (v.richText)
      return v.richText
        .map((part) => part.text)
        .join('')
        .trim();
    if (v.text !== undefined) return cellText(v.text);
    if (v.result !== undefined) return cellText(v.result);
    if (value instanceof Date) return value.toISOString();
  }
  return String(value).trim();
}

const optional = (text: string) => (text === '' ? undefined : text);
const numberOf = (text: string) => (text === '' ? Number.NaN : Number(text.replace(',', '.')));
function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** A workbook read back into the import format and checked against the import contract. */
export async function workbookToPack(
  kind: PackKind,
  data: ArrayBuffer,
): Promise<{ ok: true; body: SpeedPackBody } | { ok: false; detail: string }> {
  const ExcelJS = await excel();
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(data);
  } catch {
    return { ok: false, detail: 'not an Excel workbook (.xlsx)' };
  }
  const sheetRows = (name: string): string[][] | null => {
    const sheet = workbook.getWorksheet(name);
    if (!sheet) return null;
    const rows: string[][] = [];
    sheet.eachRow((row) => {
      const values = (row.values as unknown[]).slice(1).map(cellText);
      if (values.some((value) => value !== '')) rows.push(values);
    });
    return rows;
  };
  const packRows = sheetRows(PACK_SHEET);
  if (!packRows) return { ok: false, detail: `the sheet "${PACK_SHEET}" is missing` };
  const header = (label: string) =>
    packRows.find((row) => row[0]?.toLowerCase() === label)?.[1] ?? '';
  const body: Body = { versionLabel: header('version label'), source: header('source') };
  const tables: Record<string, Record<string, string>[]> = {};
  for (const [name, columns] of sheetsOf(kind)) {
    const rows = sheetRows(name);
    if (!rows) return { ok: false, detail: `the sheet "${name}" is missing` };
    const [first = [], ...data] = rows;
    const index = columns.map((column) =>
      first.findIndex((cell) => cell.toLowerCase() === column.toLowerCase()),
    );
    const absent = columns.filter((_, i) => index[i] === -1);
    if (absent.length > 0)
      return { ok: false, detail: `the sheet "${name}" has no column ${absent.join(', ')}` };
    tables[name] = data.map((row) =>
      Object.fromEntries(columns.map((column, i) => [column, row[index[i] as number] ?? ''])),
    );
  }
  if (kind === 'criteria') {
    const criteria: Body = {};
    const citations: Record<string, string> = {};
    for (const row of tables.Criteria ?? []) {
      const key = row.Key ?? '';
      if (!key) continue;
      const path = key.split('.');
      let node = criteria;
      for (const part of path.slice(0, -1)) {
        if (!node[part]) node[part] = {};
        node = node[part] as Body;
      }
      node[path[path.length - 1] as string] = numberOf(row.Value ?? '');
      if (row.Citation) citations[key] = row.Citation;
    }
    return parsePack(kind, { ...body, criteria, citations });
  }
  const library = {
    materials: (tables.Materials ?? []).map((row) =>
      withoutUndefined({
        id: row.ID ?? '',
        classes: (row['Reactivity classes'] ?? '')
          .split(/[,;]/)
          .map((value) => value.trim())
          .filter(Boolean),
        name: optional(row.Name ?? ''),
        casNumber: optional(row['CAS number'] ?? ''),
        formula: optional(row.Formula ?? ''),
        note: optional(row.Note ?? ''),
        citation: row.Citation ?? '',
      }),
    ),
    rules: (tables['Interaction rules'] ?? []).map((row) =>
      withoutUndefined({
        id: row.ID ?? '',
        classA: row['Class A'] ?? '',
        classB: row['Class B'] ?? '',
        severity: row.Severity ?? '',
        finding: optional(row.Finding ?? ''),
        control: optional(row.Control ?? ''),
        recommendedTest: optional(row['Recommended test'] ?? ''),
        citation: row.Citation ?? '',
      }),
    ),
    reactionClasses: (tables['Reaction classes'] ?? []).map((row) =>
      withoutUndefined({
        id: row.ID ?? '',
        name: optional(row.Name ?? ''),
        typicalReactionEnthalpyKJPerMol: numberOf(row['Typical ΔHr (kJ/mol)'] ?? ''),
        citation: row.Citation ?? '',
      }),
    ),
    energeticGroups: (tables['Energetic groups'] ?? []).map((row) =>
      withoutUndefined({
        id: row.ID ?? '',
        name: optional(row.Name ?? ''),
        citation: row.Citation ?? '',
      }),
    ),
    gases: Object.fromEntries(
      (tables.Gases ?? []).map((row) => [
        row['Formula (Hill)'] ?? '',
        withoutUndefined({
          id: row.ID ?? '',
          name: optional(row.Name ?? ''),
          citation: row.Citation ?? '',
        }),
      ]),
    ),
    formationEnthalpies: Object.fromEntries(
      (tables['Formation enthalpies'] ?? []).map((row) => [
        row['Formula (Hill)'] ?? '',
        {
          kJPerMol: numberOf(row['ΔHf (kJ/mol)'] ?? ''),
          phase: row.Phase ?? '',
          citation: row.Citation ?? '',
        },
      ]),
    ),
  };
  return parsePack(kind, { ...body, library });
}
