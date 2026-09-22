import { describe, it, expect } from 'vitest';
import { Readable, PassThrough } from 'stream';
import ExcelJS from 'exceljs';
import {
  XlsxMultiSheetReader,
  listSheetNamesFromBuffer,
} from '../xlsx-multisheet-reader.js';
import XLSX from 'xlsx';

// ─── Helper: build a multi-sheet XLSX buffer ──────────────────────────────────

async function buildMultiSheetBuffer(
  sheets: Array<{ name: string; rows: Record<string, unknown>[] }>,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const passthrough = new PassThrough();
  const done = new Promise<Buffer>((resolve, reject) => {
    passthrough.on('data', (c: Buffer) => chunks.push(c));
    passthrough.on('end', () => resolve(Buffer.concat(chunks)));
    passthrough.on('error', reject);
  });

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: passthrough });
  for (const { name, rows } of sheets) {
    const ws = workbook.addWorksheet(name);
    if (rows.length > 0) {
      ws.columns = Object.keys(rows[0]).map((key) => ({ header: key, key }));
      for (const row of rows) ws.addRow(row).commit();
    }
    await ws.commit();
  }
  await workbook.commit();
  return done;
}

function toStream(buf: Buffer): Readable {
  return Readable.from([buf]);
}

// ─── listSheetNamesFromBuffer ─────────────────────────────────────────────────

describe('listSheetNamesFromBuffer', () => {
  it('returns sheet names in order', async () => {
    const buf = await buildMultiSheetBuffer([
      { name: 'Engineering', rows: [{ id: '1', name: 'Alice' }] },
      { name: 'Finance', rows: [{ id: '2', name: 'Bob' }] },
      { name: 'HR', rows: [] },
    ]);
    const names = listSheetNamesFromBuffer(buf);
    expect(names).toEqual(['Engineering', 'Finance', 'HR']);
  });

  it('returns empty array for a workbook with no sheets', async () => {
    // Build minimal xlsx with no sheets using raw XLSX
    const wb = XLSX.utils.book_new();
    const rawBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    expect(listSheetNamesFromBuffer(rawBuf)).toEqual([]);
  });
});

// ─── XlsxMultiSheetReader ────────────────────────────────────────────────────

describe('XlsxMultiSheetReader', () => {
  it('listSheetNames returns all sheet names', async () => {
    const buf = await buildMultiSheetBuffer([
      { name: 'Alpha', rows: [{ x: '1' }] },
      { name: 'Beta', rows: [{ x: '2' }] },
    ]);
    const reader = new XlsxMultiSheetReader(toStream(buf));
    const names = await reader.listSheetNames();
    expect(names).toEqual(['Alpha', 'Beta']);
  });

  it('listSheetNames can be called multiple times (memoized)', async () => {
    const buf = await buildMultiSheetBuffer([
      { name: 'Only', rows: [{ a: '1' }] },
    ]);
    const reader = new XlsxMultiSheetReader(toStream(buf));
    const first = await reader.listSheetNames();
    const second = await reader.listSheetNames();
    expect(first).toEqual(second);
  });

  it('sheets() yields one SheetHandle per sheet', async () => {
    const buf = await buildMultiSheetBuffer([
      { name: 'Dept1', rows: [{ id: '1', name: 'Alice' }] },
      { name: 'Dept2', rows: [{ id: '2', name: 'Bob' }] },
    ]);
    const reader = new XlsxMultiSheetReader(toStream(buf));
    const handles: string[] = [];
    for await (const sheet of reader.sheets()) {
      handles.push(sheet.name);
    }
    expect(handles).toEqual(['Dept1', 'Dept2']);
  });

  it('SheetHandle.rows() yields the correct number of data rows (excluding header)', async () => {
    const buf = await buildMultiSheetBuffer([
      {
        name: 'Team',
        rows: [
          { id: '1', name: 'Alice' },
          { id: '2', name: 'Bob' },
          { id: '3', name: 'Carol' },
        ],
      },
    ]);
    const reader = new XlsxMultiSheetReader(toStream(buf));
    const counts: number[] = [];
    for await (const sheet of reader.sheets()) {
      let count = 0;
      for await (const _row of sheet.rows()) count++;
      counts.push(count);
    }
    expect(counts).toEqual([3]);
  });

  it('handles an empty sheet gracefully (no data rows)', async () => {
    const buf = await buildMultiSheetBuffer([
      { name: 'Empty', rows: [] },
    ]);
    const reader = new XlsxMultiSheetReader(toStream(buf));
    const counts: number[] = [];
    for await (const sheet of reader.sheets()) {
      let count = 0;
      for await (const _row of sheet.rows()) count++;
      counts.push(count);
    }
    expect(counts).toEqual([0]);
  });

  it('row data contains expected keys', async () => {
    const buf = await buildMultiSheetBuffer([
      { name: 'Main', rows: [{ employee_id: 'E001', full_name: 'Alice', department: 'IT' }] },
    ]);
    const reader = new XlsxMultiSheetReader(toStream(buf));
    const allRows: Record<string, unknown>[] = [];
    for await (const sheet of reader.sheets()) {
      for await (const row of sheet.rows()) allRows.push(row.data);
    }
    expect(allRows[0]).toMatchObject({ employee_id: 'E001', full_name: 'Alice', department: 'IT' });
  });
});
