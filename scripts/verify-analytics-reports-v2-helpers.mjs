import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '../modules/analytics-studio/apps/api/package.json'));
const ExcelJS = require('exceljs');

/**
 * Validates file magic bytes and extensions for CSV, XLSX, and PDF.
 */
export function validateFileMagic(buffer, filename, expectedFormat) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error(`Invalid file buffer for ${filename}: empty or not a buffer.`);
  }

  const normalizedFormat = expectedFormat.toUpperCase();
  const ext = filename.split('.').pop()?.toLowerCase();

  if (normalizedFormat === 'CSV') {
    if (ext !== 'csv') {
      throw new Error(`Expected .csv extension for CSV format, got: ${filename}`);
    }
    // CSV must be valid text, not binary
    const text = buffer.toString('utf8');
    if (text.includes('\0')) {
      throw new Error(`CSV file ${filename} contains null bytes.`);
    }
    return { valid: true, format: 'CSV', byteSize: buffer.length };
  }

  if (normalizedFormat === 'XLSX') {
    if (ext !== 'xlsx') {
      throw new Error(`Expected .xlsx extension for XLSX format, got: ${filename}`);
    }
    // PK\x03\x04 zip header
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
      throw new Error(`File ${filename} lacks standard ZIP/XLSX magic bytes (PK\\x03\\x04).`);
    }
    return { valid: true, format: 'XLSX', byteSize: buffer.length };
  }

  if (normalizedFormat === 'PDF') {
    if (ext !== 'pdf') {
      throw new Error(`Expected .pdf extension for PDF format, got: ${filename}`);
    }
    const signature = buffer.subarray(0, 5).toString('ascii');
    if (signature !== '%PDF-') {
      throw new Error(`File ${filename} lacks standard %PDF- header signature.`);
    }
    return { valid: true, format: 'PDF', byteSize: buffer.length };
  }

  throw new Error(`Unsupported format validation: ${expectedFormat}`);
}

/**
 * Deterministically extracts text strings from PDF content streams.
 */
export function extractPdfText(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('extractPdfText expects a Buffer.');
  }

  const textChunks = [];
  let pos = 0;

  while (pos < buffer.length) {
    const streamMarker = buffer.indexOf(Buffer.from('stream'), pos);
    if (streamMarker === -1) break;

    const dictStart = buffer.lastIndexOf(Buffer.from('<<'), streamMarker);
    const dict = dictStart !== -1 ? buffer.subarray(dictStart, streamMarker).toString('latin1') : '';

    let dataStart = streamMarker + 6;
    if (buffer[dataStart] === 0x0d && buffer[dataStart + 1] === 0x0a) dataStart += 2;
    else if (buffer[dataStart] === 0x0a) dataStart += 1;
    else if (buffer[dataStart] === 0x0d) dataStart += 1;

    const endMarker = buffer.indexOf(Buffer.from('endstream'), dataStart);
    if (endMarker === -1) break;

    let dataEnd = endMarker;
    if (buffer[dataEnd - 1] === 0x0a) dataEnd--;
    if (buffer[dataEnd - 1] === 0x0d) dataEnd--;

    const streamData = buffer.subarray(dataStart, dataEnd);
    let decompressed;

    if (dict.includes('FlateDecode')) {
      try {
        decompressed = zlib.inflateSync(streamData).toString('latin1');
      } catch {
        try {
          decompressed = zlib.inflateRawSync(streamData).toString('latin1');
        } catch {
          decompressed = streamData.toString('latin1');
        }
      }
    } else {
      decompressed = streamData.toString('latin1');
    }

    // Extract text from (text) Tj or [(text)] TJ
    const re = /\((?:[^()\\]|\\.)*\)\s*(?:Tj|'|")|\[(.*?)\]\s*TJ/g;
    let match;
    while ((match = re.exec(decompressed)) !== null) {
      if (match[1]) {
        const innerRe = /\((((?:[^()\\]|\\.)*))\)/g;
        let innerMatch;
        while ((innerMatch = innerRe.exec(match[1])) !== null) {
          textChunks.push(innerMatch[1].replace(/\\([()\\])/g, '$1'));
        }
      } else {
        const full = match[0];
        const s = full.slice(1, full.lastIndexOf(')'));
        textChunks.push(s.replace(/\\([()\\])/g, '$1'));
      }
    }

    pos = endMarker + 9;
  }

  return textChunks.join(' ');
}

/**
 * Deterministically normalizes cell values for cross-format comparison.
 */
export function normalizeCellValue(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (typeof value === 'number') {
    return Number(value.toFixed(6)).toString();
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  let str = String(value).trim();
  // Strip formula safe escape prefix
  if (str.startsWith("'")) {
    str = str.slice(1);
  }

  // If numeric string, normalize representation
  const num = Number(str.replace(/,/g, ''));
  if (!Number.isNaN(num) && /^-?\d+(\.\d+)?$/.test(str.replace(/,/g, ''))) {
    return Number(num.toFixed(6)).toString();
  }

  // If ISO date string, normalize date part
  if (/^\d{4}-\d{2}-\d{2}(T|\b)/.test(str)) {
    return str.slice(0, 10);
  }

  return str;
}

/**
 * Parses RFC 4180 CSV into matrix of cell strings.
 */
export function parseCsvRows(csvString) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let current = '';

  for (let i = 0; i < csvString.length; i++) {
    const char = csvString[i];
    const next = csvString[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(current);
        current = '';
      } else if (char === '\r' && next === '\n') {
        row.push(current);
        lines.push(row);
        row = [];
        current = '';
        i++;
      } else if (char === '\n' || char === '\r') {
        row.push(current);
        lines.push(row);
        row = [];
        current = '';
      } else {
        current += char;
      }
    }
  }

  if (current || row.length > 0) {
    row.push(current);
    lines.push(row);
  }

  return lines;
}

/**
 * Inspects XLSX buffer using ExcelJS to verify structure, frozen headers, and cell values.
 */
export async function parseXlsxWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheetNames = workbook.worksheets.map((ws) => ws.name);
  if (!sheetNames.includes('About')) {
    throw new Error('XLSX workbook is missing the mandatory "About" sheet.');
  }

  const aboutSheet = workbook.getWorksheet('About');
  const dataSheets = [];

  for (const sheet of workbook.worksheets) {
    if (sheet.name === 'About') continue;

    // Verify frozen header (ySplit: 1)
    const isFrozen = sheet.views?.some((v) => v.ySplit === 1 && (v.state === 'frozen' || !v.state));
    if (!isFrozen) {
      throw new Error(`Data sheet "${sheet.name}" is missing a frozen header row.`);
    }

    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      // Verify no formula injection
      for (const val of values) {
        if (typeof val === 'string' && /^[=+\-@\t\r]/.test(val)) {
          throw new Error(`Detected formula-injection risk in cell value: "${val}" on sheet "${sheet.name}"`);
        }
      }
      rows.push({ rowNumber, values });
    });

    dataSheets.push({ name: sheet.name, rows });
  }

  return { sheetNames, aboutSheet, dataSheets };
}

/**
 * Given a set of pre-existing run IDs and a new list of runs, deterministically identifies the new run.
 */
export function identifyNewRunId(existingRunIds, currentRuns) {
  const existingSet = new Set(existingRunIds);
  const newRuns = currentRuns.filter((r) => !existingSet.has(r.id));

  if (newRuns.length === 0) {
    throw new Error('No new report run ID was identified among current runs.');
  }

  // Sort newest first by queuedAt
  newRuns.sort((a, b) => new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime());
  return newRuns[0].id;
}

/**
 * Strict fail-closed verification that every required step was executed and passed.
 */
export function assertAllStepsPassed(result) {
  const requiredSteps = [
    'authenticated',
    'reportsWorkbenchLoaded',
    'formatSelectionVerified',
    'formatEditingVerified',
    'reportRunTriggered',
    'reportRunSucceeded',
    'runHistoryRendered',
    'threeFormatsPresent',
    'fileDownloadsVerified',
    'contentParityVerified',
    'scheduleExecutionVerified',
    'scopedIsolationVerified',
  ];

  const failedSteps = [];
  for (const step of requiredSteps) {
    if (result[step] !== true) {
      failedSteps.push(step);
    }
  }

  if (failedSteps.length > 0) {
    throw new Error(`Browser verification incomplete or failed: steps not passed: ${failedSteps.join(', ')}`);
  }

  return true;
}
