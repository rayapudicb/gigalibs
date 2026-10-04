import type {
  ParsedStatementLineInputV1,
  StatementFormat,
} from '@gigalibs/contracts';

/**
 * Converts decimal amount string (e.g. "125.50" or "-50.00") or integer string to minor units.
 */
export function toMinorUnits(val: string): { amountMinor: string; type: 'CREDIT' | 'DEBIT' } {
  const clean = val.trim();
  const isNegative = clean.startsWith('-') || clean.endsWith('-');
  const numeric = clean.replace(/[-+$,]/g, '').trim();

  let minor: bigint;
  if (numeric.includes('.')) {
    const [intPart = '0', decPart = '00'] = numeric.split('.');
    const paddedDec = (decPart + '00').slice(0, 2);
    minor = BigInt(intPart) * 100n + BigInt(paddedDec);
  } else {
    // If already in minor units or whole dollars
    minor = BigInt(numeric) * 100n;
  }

  if (isNegative) {
    return { amountMinor: (-minor).toString(), type: 'DEBIT' };
  }
  return { amountMinor: minor.toString(), type: 'CREDIT' };
}

/**
 * Standardizes dates from YYYYMMDD, YYYY-MM-DD, or DD/MM/YYYY into YYYY-MM-DD.
 */
export function normalizeDate(dateStr: string): string {
  const str = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{8}/.test(str)) {
    return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/');
    return `${y}-${m}-${d}`;
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Parses Standard CSV Statement.
 */
export function parseCsvStatement(rawContent: string): ParsedStatementLineInputV1[] {
  const lines = rawContent.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const headerLine = lines[0]!.toLowerCase();
  const headers = headerLine.split(',').map((h) => h.replace(/["']/g, '').trim());

  const dateIdx = headers.findIndex((h) => h.includes('date'));
  const amountIdx = headers.findIndex((h) => h.includes('amount') || h.includes('amt'));
  const refIdx = headers.findIndex((h) => h.includes('ref') || h.includes('id') || h.includes('check'));
  const descIdx = headers.findIndex((h) => h.includes('desc') || h.includes('memo') || h.includes('narrative') || h.includes('name'));

  const parsed: ParsedStatementLineInputV1[] = [];
  let seq = 1;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',').map((c) => c.replace(/^["']|["']$/g, '').trim());
    if (cols.length < 2) continue;

    const rawDate = dateIdx >= 0 ? cols[dateIdx] || '' : cols[0] || '';
    const rawAmt = amountIdx >= 0 ? cols[amountIdx] || '0' : cols[1] || '0';
    const ref = refIdx >= 0 ? cols[refIdx] || null : null;
    const desc = descIdx >= 0 ? cols[descIdx] || null : cols.slice(2).join(' ') || null;

    const normalizedDate = normalizeDate(rawDate);
    const { amountMinor, type } = toMinorUnits(rawAmt);

    parsed.push({
      lineNumber: seq++,
      transactionDate: normalizedDate,
      valueDate: normalizedDate,
      amountMinor,
      transactionType: type,
      reference: ref,
      checkNumber: null,
      counterpartyName: null,
      counterpartyAccount: null,
      description: desc,
    });
  }

  return parsed;
}

/**
 * Parses Open Financial Exchange (OFX 1.x / 2.x) Statement.
 */
export function parseOfxStatement(rawContent: string): ParsedStatementLineInputV1[] {
  const parsed: ParsedStatementLineInputV1[] = [];
  const stmtTrnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;
  let seq = 1;

  while ((match = stmtTrnRegex.exec(rawContent)) !== null) {
    const block = match[1]!;

    const getTag = (tag: string): string | null => {
      const tagRegex = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
      const tagMatch = tagRegex.exec(block);
      return tagMatch && tagMatch[1] ? tagMatch[1].trim() : null;
    };

    const trnType = getTag('TRNTYPE') || 'OTHER';
    const dtPosted = getTag('DTPOSTED') || new Date().toISOString().slice(0, 10);
    const trnAmt = getTag('TRNAMT') || '0';
    const fitId = getTag('FITID');
    const checkNum = getTag('CHECKNUM');
    const name = getTag('NAME');
    const memo = getTag('MEMO');

    const normalizedDate = normalizeDate(dtPosted);
    const { amountMinor } = toMinorUnits(trnAmt);
    const isCredit = !amountMinor.startsWith('-') && trnType.toUpperCase() !== 'DEBIT';

    parsed.push({
      lineNumber: seq++,
      transactionDate: normalizedDate,
      valueDate: normalizedDate,
      amountMinor,
      transactionType: isCredit ? 'CREDIT' : 'DEBIT',
      reference: fitId,
      checkNumber: checkNum,
      counterpartyName: name,
      counterpartyAccount: null,
      description: memo || name || `OFX ${trnType}`,
    });
  }

  return parsed;
}

/**
 * Parses SWIFT MT940 Customer Statement Message.
 */
export function parseMt940Statement(rawContent: string): ParsedStatementLineInputV1[] {
  const parsed: ParsedStatementLineInputV1[] = [];
  const lines = rawContent.split(/\r?\n/);
  let currentLine: Partial<ParsedStatementLineInputV1> | null = null;
  let seq = 1;

  for (const line of lines) {
    if (line.startsWith(':61:')) {
      if (currentLine && currentLine.transactionDate && currentLine.amountMinor) {
        parsed.push(currentLine as ParsedStatementLineInputV1);
      }

      // Format :61:YYMMDD[MMDD]C|D[R]AmountNTypeReference
      const body = line.substring(4);
      const datePart = body.slice(0, 6); // YYMMDD
      const fullDate = `20${datePart.slice(0, 2)}-${datePart.slice(2, 4)}-${datePart.slice(4, 6)}`;

      let idx = 6;
      // Optional value date 4 digits
      if (/^\d{4}/.test(body.slice(idx, idx + 4))) {
        idx += 4;
      }

      const cdInd = body.slice(idx, idx + 1); // C or D
      idx += 1;
      const isReversal = body.slice(idx, idx + 1) === 'R';
      if (isReversal) idx += 1;

      // Extract amount up to 'N' or non-decimal
      const rest = body.slice(idx);
      const amtMatch = /^([0-9]+[.,][0-9]{2})/.exec(rest);
      const rawAmt = amtMatch ? amtMatch[1]!.replace(',', '.') : '0';
      const isCredit = cdInd === 'C';
      const { amountMinor } = toMinorUnits(isCredit ? rawAmt : `-${rawAmt}`);

      // Extract reference after // if present
      const refMatch = /\/\/([A-Za-z0-9_-]+)/.exec(rest);
      const reference = refMatch ? refMatch[1]! : null;

      currentLine = {
        lineNumber: seq++,
        transactionDate: fullDate,
        valueDate: fullDate,
        amountMinor,
        transactionType: isCredit ? 'CREDIT' : 'DEBIT',
        reference,
        checkNumber: null,
        counterpartyName: null,
        counterpartyAccount: null,
        description: null,
      };
    } else if (line.startsWith(':86:') && currentLine) {
      currentLine.description = line.substring(4).trim();
    }
  }

  if (currentLine && currentLine.transactionDate && currentLine.amountMinor) {
    parsed.push(currentLine as ParsedStatementLineInputV1);
  }

  return parsed;
}

/**
 * Parses ISO 20022 CAMT.053 XML Statement.
 */
export function parseCamt053Statement(rawContent: string): ParsedStatementLineInputV1[] {
  const parsed: ParsedStatementLineInputV1[] = [];
  const ntryRegex = /<Ntry>([\s\S]*?)<\/Ntry>/gi;
  let match: RegExpExecArray | null;
  let seq = 1;

  while ((match = ntryRegex.exec(rawContent)) !== null) {
    const block = match[1]!;

    const getTag = (tag: string): string | null => {
      const tagRegex = new RegExp(`<${tag}[^>]*>([^<\\r\\n]+)<\/${tag}>`, 'i');
      const tagMatch = tagRegex.exec(block);
      return tagMatch && tagMatch[1] ? tagMatch[1].trim() : null;
    };

    const amt = getTag('Amt') || '0';
    const cdtDbtInd = getTag('CdtDbtInd') || 'CRDT';
    const bookgDt = getTag('Dt') || new Date().toISOString().slice(0, 10);
    const endToEndId = getTag('EndToEndId');
    const ustrd = getTag('Ustrd');
    const nm = getTag('Nm');

    const normalizedDate = normalizeDate(bookgDt);
    const isCredit = cdtDbtInd.toUpperCase() === 'CRDT';
    const { amountMinor } = toMinorUnits(isCredit ? amt : `-${amt}`);

    parsed.push({
      lineNumber: seq++,
      transactionDate: normalizedDate,
      valueDate: normalizedDate,
      amountMinor,
      transactionType: isCredit ? 'CREDIT' : 'DEBIT',
      reference: endToEndId,
      checkNumber: null,
      counterpartyName: nm,
      counterpartyAccount: null,
      description: ustrd || nm || 'CAMT.053 Entry',
    });
  }

  return parsed;
}

/**
 * Universal Statement Parser Dispatcher.
 */
export function parseBankStatement(
  format: StatementFormat,
  rawContent: string,
): ParsedStatementLineInputV1[] {
  switch (format) {
    case 'CSV':
      return parseCsvStatement(rawContent);
    case 'OFX':
      return parseOfxStatement(rawContent);
    case 'MT940':
      return parseMt940Statement(rawContent);
    case 'CAMT053':
      return parseCamt053Statement(rawContent);
    default:
      throw new Error(`UNSUPPORTED_STATEMENT_FORMAT: ${format}`);
  }
}
