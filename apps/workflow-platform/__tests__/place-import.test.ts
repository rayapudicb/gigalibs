import { MAX_SPATIAL_IMPORT_ROWS } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { PLACE_IMPORT_TEMPLATE, parseCsv, placeRowsFromCsv } from '../lib/place-import';

// WI-OI-063c: the browser turns a spreadsheet into import rows; the Geospatial API validates them.
describe('place import CSV', () => {
  it('parses quoted fields, doubled quotes, embedded line breaks, CRLF and a BOM', () => {
    const records = parseCsv('﻿code,name\r\nA,"Hall ""B"", east"\r\nC,"two\nlines"\r\n\r\nD,plain');
    expect(records).toEqual([
      { cells: ['code', 'name'], line: 1 },
      { cells: ['A', 'Hall "B", east'], line: 2 },
      { cells: ['C', 'two\nlines'], line: 3 },
      { cells: ['D', 'plain'], line: 6 },
    ]);
  });

  it('maps common column names, numbers and blanks, and keeps source lines', () => {
    const file = placeRowsFromCsv('Code,Display Name,Place Type,Parent,Lat,Lng,Notes\nBLR_01,Bengaluru,site,APAC,12.97,77.59,x\n\nPNQ,Pune,SITE,,,,');
    expect(file.rows).toEqual([
      { code: 'BLR_01', displayName: 'Bengaluru', nodeTypeCode: 'site', parentPath: 'APAC', latitude: 12.97, longitude: 77.59 },
      { code: 'PNQ', displayName: 'Pune', nodeTypeCode: 'SITE' },
    ]);
    expect(file.lines).toEqual([2, 4]);
    expect(file.problems).toEqual(['Ignored unknown column: Notes.']);
  });

  it('leaves a non-numeric coordinate for the server to reject on that row', () => {
    expect(placeRowsFromCsv('code,name,type,latitude,longitude\nA,A,SITE,north,1').rows[0]).toMatchObject({ latitude: 'north', longitude: 1 });
  });

  it('reports missing required columns, empty files and oversized files', () => {
    expect(placeRowsFromCsv('').problems).toEqual(['The file is empty.']);
    expect(placeRowsFromCsv('code,name\nA,B').problems).toEqual(['Add the required column: type.']);
    expect(placeRowsFromCsv('code,name,type').problems).toEqual(['The file has a header but no places.']);
    const big = ['code,name,type', ...Array.from({ length: MAX_SPATIAL_IMPORT_ROWS + 1 }, (_, index) => `P${index},P,SITE`)].join('\n');
    expect(placeRowsFromCsv(big).problems[0]).toContain(`at most ${MAX_SPATIAL_IMPORT_ROWS} places`);
  });

  it('ships a template that maps cleanly', () => {
    const file = placeRowsFromCsv(PLACE_IMPORT_TEMPLATE);
    expect(file.problems).toEqual([]);
    expect(file.rows.map((row) => row.parentPath ?? null)).toEqual([null, 'APAC', 'APAC.BLR_01']);
  });
});
