import { MAX_SPATIAL_IMPORT_ROWS } from '@gigalibs/contracts';

/** Parses RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF, BOM. */
export function parseCsv(text: string): { cells: string[]; line: number }[] {
  const records: { cells: string[]; line: number }[] = [];
  let cells: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const endRecord = () => {
    cells.push(field);
    if (cells.some((cell) => cell.trim() !== '')) records.push({ cells, line: recordLine });
    cells = [];
    field = '';
  };
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === '\n') line += 1;
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ',') {
      cells.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      endRecord();
      line += 1;
      recordLine = line;
    } else {
      field += char;
    }
  }
  if (field !== '' || cells.length > 0) endRecord();
  return records;
}

const COLUMNS = {
  code: ['code', 'place_code'],
  displayName: ['name', 'display_name', 'displayname', 'place_name'],
  nodeTypeCode: ['type', 'type_code', 'place_type', 'node_type', 'nodetypecode'],
  parentPath: ['parent_path', 'parent', 'parentpath'],
  countryCode: ['country', 'country_code', 'countrycode'],
  subdivisionCode: ['subdivision', 'subdivision_code', 'state', 'region_code', 'subdivisioncode'],
  timeZone: ['time_zone', 'timezone', 'tz'],
  latitude: ['latitude', 'lat'],
  longitude: ['longitude', 'lng', 'lon'],
} as const;
type Column = keyof typeof COLUMNS;
const REQUIRED: readonly Column[] = ['code', 'displayName', 'nodeTypeCode'];
const NUMERIC: ReadonlySet<Column> = new Set(['latitude', 'longitude']);

export interface PlaceImportFile {
  rows: Record<string, unknown>[];
  /** Spreadsheet line of each row, so server errors (1-based row) point at the right line. */
  lines: number[];
  problems: string[];
}

/** Maps a CSV file to import rows. Server-side validation reports field problems per row. */
export function placeRowsFromCsv(text: string): PlaceImportFile {
  const [header, ...records] = parseCsv(text);
  if (!header) return { rows: [], lines: [], problems: ['The file is empty.'] };
  const normalise = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const columnAt = new Map<number, Column>();
  const unknown: string[] = [];
  header.cells.forEach((name, index) => {
    const column = (Object.keys(COLUMNS) as Column[]).find((key) =>
      (COLUMNS[key] as readonly string[]).includes(normalise(name)),
    );
    if (column) columnAt.set(index, column);
    else if (name.trim()) unknown.push(name.trim());
  });
  const problems: string[] = [];
  const missing = REQUIRED.filter((column) => ![...columnAt.values()].includes(column));
  if (missing.length > 0) {
    problems.push(`Add the required column${missing.length > 1 ? 's' : ''}: ${missing.map((column) => COLUMNS[column][0]).join(', ')}.`);
  }
  if (unknown.length > 0) problems.push(`Ignored unknown column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}.`);
  if (records.length === 0) problems.push('The file has a header but no places.');
  if (records.length > MAX_SPATIAL_IMPORT_ROWS) {
    problems.push(`A file can hold at most ${MAX_SPATIAL_IMPORT_ROWS} places; split it, for example by region.`);
  }
  const rows = records.map(({ cells }) => {
    const row: Record<string, unknown> = {};
    columnAt.forEach((column, index) => {
      const value = (cells[index] ?? '').trim();
      if (value === '') return;
      row[column] = NUMERIC.has(column) && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
    });
    return row;
  });
  return { rows, lines: records.map((record) => record.line), problems };
}

export const PLACE_IMPORT_TEMPLATE = [
  'code,name,type,parent_path,country,subdivision,time_zone,latitude,longitude',
  'APAC,Asia Pacific,REGION,,,,,,',
  'BLR_01,Bengaluru warehouse,SITE,APAC,IN,IN-KA,Asia/Kolkata,12.9716,77.5946',
  'BLR_01_DOCK,Loading dock,ZONE,APAC.BLR_01,IN,IN-KA,Asia/Kolkata,,',
].join('\n');
