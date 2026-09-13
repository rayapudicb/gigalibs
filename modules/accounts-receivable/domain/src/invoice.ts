import { createHash } from 'node:crypto';

const MAX_LINES = 500;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_QUANTITY_INTEGER_DIGITS = 12;
const MAX_QUANTITY_SCALE = 6;
const MAX_SEQUENCE = 999_999_999_999;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const PREFIX_PATTERN = /^[A-Z0-9-]{0,20}$/;
const BASIS_POINTS_DIVISOR = 10_000n;

export interface InvoiceDraftLineInput {
  description: string;
  quantity: string;
  unitAmountMinor: number;
  discountMinor?: number | undefined;
}

export interface CalculatedInvoiceLine extends InvoiceDraftLineInput {
  position: number;
  grossAmountMinor: number;
  discountMinor: number;
  amountMinor: number;
}

export interface CalculatedInvoiceDraft {
  currency: string;
  lines: CalculatedInvoiceLine[];
  subtotalMinor: number;
  taxMinor: 0;
  totalMinor: number;
}

export interface TaxRateDefinition {
  id: string;
  name: string;
  rateBasisPoints: number; // 1 bp = 0.01%, e.g., 725 = 7.25%
  isCompound?: boolean | undefined;
}

export interface AppliedTaxBreakdown {
  id: string;
  name: string;
  rateBasisPoints: number;
  isCompound: boolean;
  taxableBasisMinor: number;
  amountMinor: number;
}

export interface InstallmentMilestoneInput {
  position: number;
  dueDate: string;
  percentageBasisPoints: number; // e.g. 5000 = 50.00%
}

export interface CalculatedInstallmentMilestone extends InstallmentMilestoneInput {
  amountMinor: number;
}

export interface LedgerSeal {
  hash: string;
  previousHash: string;
  sequenceNumber: number;
  sealedAt: string;
  algorithm: 'SHA-256';
}

export interface InvoiceLedgerOptions {
  currency: string;
  lines: readonly InvoiceDraftLineInput[];
  taxes?: readonly TaxRateDefinition[] | undefined;
  headerDiscountMinor?: number | undefined;
  installments?: readonly InstallmentMilestoneInput[] | undefined;
  previousSealHash?: string | undefined;
  tenantId?: string | undefined;
  invoiceNumber?: string | undefined;
  sequenceNumber?: number | undefined;
  issuedAt?: string | undefined;
}

export interface CalculatedInvoiceLedger {
  currency: string;
  lines: CalculatedInvoiceLine[];
  subtotalGrossMinor: number;
  lineDiscountsMinor: number;
  subtotalNetMinor: number;
  headerDiscountMinor: number;
  discountTotalMinor: number;
  taxes: AppliedTaxBreakdown[];
  taxMinor: number;
  totalMinor: number;
  installments: CalculatedInstallmentMilestone[];
  seal?: LedgerSeal | undefined;
}


export type ArDomainErrorCode =
  | 'INVALID_CURRENCY'
  | 'INVALID_DATE'
  | 'INVALID_DESCRIPTION'
  | 'INVALID_LINE_COUNT'
  | 'INVALID_QUANTITY'
  | 'INVALID_UNIT_AMOUNT'
  | 'INVALID_DISCOUNT'
  | 'INVALID_TAX_RATE'
  | 'INVALID_INSTALLMENT'
  | 'INVALID_SEAL'
  | 'AMOUNT_OVERFLOW'
  | 'INVALID_NUMBER_SERIES';

export class ArDomainError extends Error {
  constructor(
    readonly code: ArDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ArDomainError';
  }
}


export function calculateInvoiceLedger(options: InvoiceLedgerOptions): CalculatedInvoiceLedger {
  const {
    currency,
    lines: inputLines,
    taxes = [],
    headerDiscountMinor = 0,
    installments = [],
  } = options;

  if (!CURRENCY_PATTERN.test(currency)) {
    throw new ArDomainError('INVALID_CURRENCY', 'Currency must be an uppercase ISO 4217 code.');
  }
  if (inputLines.length < 1 || inputLines.length > MAX_LINES) {
    throw new ArDomainError(
      'INVALID_LINE_COUNT',
      `An invoice must contain between 1 and ${MAX_LINES} lines.`,
    );
  }
  if (!Number.isSafeInteger(headerDiscountMinor) || headerDiscountMinor < 0) {
    throw new ArDomainError(
      'INVALID_DISCOUNT',
      'Header discount must be a non-negative safe integer.',
    );
  }

  let subtotalGross = 0n;
  let totalLineDiscounts = 0n;

  const lines = inputLines.map((input, index): CalculatedInvoiceLine => {
    const description = input.description.trim();
    if (description.length < 1 || description.length > MAX_DESCRIPTION_LENGTH) {
      throw new ArDomainError(
        'INVALID_DESCRIPTION',
        `Line ${index + 1} description must contain 1–${MAX_DESCRIPTION_LENGTH} characters.`,
      );
    }
    if (!Number.isSafeInteger(input.unitAmountMinor) || input.unitAmountMinor < 0) {
      throw new ArDomainError(
        'INVALID_UNIT_AMOUNT',
        `Line ${index + 1} unit amount must be a non-negative safe integer.`,
      );
    }

    const discountMinor = input.discountMinor ?? 0;
    if (!Number.isSafeInteger(discountMinor) || discountMinor < 0) {
      throw new ArDomainError(
        'INVALID_DISCOUNT',
        `Line ${index + 1} discount must be a non-negative safe integer.`,
      );
    }

    const { numerator, denominator, canonical } = parseQuantity(input.quantity, index + 1);
    const rawAmount = BigInt(input.unitAmountMinor) * numerator;
    const quotient = rawAmount / denominator;
    const remainder = rawAmount % denominator;
    const roundedGross = remainder * 2n >= denominator ? quotient + 1n : quotient;
    assertSafeMinorUnits(roundedGross, `Line ${index + 1} gross amount`);

    const discountBig = BigInt(discountMinor);
    if (discountBig > roundedGross) {
      throw new ArDomainError(
        'INVALID_DISCOUNT',
        `Line ${index + 1} discount cannot exceed the line gross amount.`,
      );
    }

    const netAmount = roundedGross - discountBig;
    subtotalGross += roundedGross;
    totalLineDiscounts += discountBig;
    assertSafeMinorUnits(subtotalGross, 'Invoice subtotal gross');

    return {
      description,
      quantity: canonical,
      unitAmountMinor: input.unitAmountMinor,
      position: index + 1,
      grossAmountMinor: Number(roundedGross),
      discountMinor,
      amountMinor: Number(netAmount),
    };
  });

  const subtotalNet = subtotalGross - totalLineDiscounts;
  const headerDiscountBig = BigInt(headerDiscountMinor);
  if (headerDiscountBig > subtotalNet) {
    throw new ArDomainError(
      'INVALID_DISCOUNT',
      'Header discount cannot exceed net subtotal after line discounts.',
    );
  }

  const baseTaxableAmount = subtotalNet - headerDiscountBig;
  let runningTaxableBasis = baseTaxableAmount;
  let totalTax = 0n;

  const appliedTaxes: AppliedTaxBreakdown[] = taxes.map((tax) => {
    if (
      !Number.isSafeInteger(tax.rateBasisPoints) ||
      tax.rateBasisPoints < 0 ||
      tax.rateBasisPoints > 100_000
    ) {
      throw new ArDomainError(
        'INVALID_TAX_RATE',
        `Tax rate ${tax.name} must be between 0 and 100,000 basis points.`,
      );
    }

    const isCompound = Boolean(tax.isCompound);
    const taxableBasis = isCompound ? runningTaxableBasis : baseTaxableAmount;
    const rawTax = taxableBasis * BigInt(tax.rateBasisPoints);
    const quotient = rawTax / BASIS_POINTS_DIVISOR;
    const remainder = rawTax % BASIS_POINTS_DIVISOR;
    const taxAmount = remainder * 2n >= BASIS_POINTS_DIVISOR ? quotient + 1n : quotient;

    assertSafeMinorUnits(taxAmount, `Tax ${tax.name} amount`);
    totalTax += taxAmount;
    runningTaxableBasis += taxAmount;


    return {
      id: tax.id,
      name: tax.name,
      rateBasisPoints: tax.rateBasisPoints,
      isCompound,
      taxableBasisMinor: Number(taxableBasis),
      amountMinor: Number(taxAmount),
    };
  });

  const total = subtotalNet - headerDiscountBig + totalTax;
  assertSafeMinorUnits(total, 'Invoice grand total');

  let calculatedInstallments: CalculatedInstallmentMilestone[] = [];
  if (installments.length > 0) {
    let totalBps = 0;
    for (const inst of installments) {
      if (!Number.isSafeInteger(inst.percentageBasisPoints) || inst.percentageBasisPoints <= 0) {
        throw new ArDomainError('INVALID_INSTALLMENT', 'Installment percentage must be positive.');
      }
      parseIsoDate(inst.dueDate);
      totalBps += inst.percentageBasisPoints;
    }
    if (totalBps !== 10_000) {
      throw new ArDomainError(
        'INVALID_INSTALLMENT',
        `Installment percentages must sum to exactly 10,000 basis points (100%), got ${totalBps}.`,
      );
    }

    let allocatedMinor = 0n;
    calculatedInstallments = installments.map((inst, idx) => {
      let instAmount: bigint;
      if (idx === installments.length - 1) {
        instAmount = total - allocatedMinor;
      } else {
        const rawInst = total * BigInt(inst.percentageBasisPoints);
        const quotient = rawInst / BASIS_POINTS_DIVISOR;
        const remainder = rawInst % BASIS_POINTS_DIVISOR;
        instAmount = remainder * 2n >= BASIS_POINTS_DIVISOR ? quotient + 1n : quotient;
        allocatedMinor += instAmount;
      }

      return {
        position: inst.position || idx + 1,
        dueDate: inst.dueDate,
        percentageBasisPoints: inst.percentageBasisPoints,
        amountMinor: Number(instAmount),
      };
    });
  }

  let seal: LedgerSeal | undefined;
  if (options.tenantId && options.invoiceNumber && options.sequenceNumber !== undefined) {
    seal = createLedgerSeal({
      tenantId: options.tenantId,
      invoiceNumber: options.invoiceNumber,
      sequenceNumber: options.sequenceNumber,
      previousSealHash: options.previousSealHash || '0'.repeat(64),
      totalMinor: Number(total),
      currency,
      issuedAt: options.issuedAt || new Date().toISOString(),
      lines,
    });
  }

  return {
    currency,
    lines,
    subtotalGrossMinor: Number(subtotalGross),
    lineDiscountsMinor: Number(totalLineDiscounts),
    subtotalNetMinor: Number(subtotalNet),
    headerDiscountMinor,
    discountTotalMinor: Number(totalLineDiscounts) + headerDiscountMinor,
    taxes: appliedTaxes,
    taxMinor: Number(totalTax),
    totalMinor: Number(total),
    installments: calculatedInstallments,
    seal,
  };
}

export function calculateInvoiceDraft(
  currency: string,
  inputLines: readonly InvoiceDraftLineInput[],
): CalculatedInvoiceDraft {
  const ledger = calculateInvoiceLedger({
    currency,
    lines: inputLines,
  });

  return {
    currency: ledger.currency,
    lines: ledger.lines,
    subtotalMinor: ledger.subtotalNetMinor,
    taxMinor: 0,
    totalMinor: ledger.totalMinor,
  };
}

export function createLedgerSeal(params: {
  tenantId: string;
  invoiceNumber: string;
  sequenceNumber: number;
  previousSealHash: string;
  totalMinor: number;
  currency: string;
  issuedAt: string;
  lines: readonly CalculatedInvoiceLine[];
}): LedgerSeal {
  const linesHash = createHash('sha256')
    .update(
      JSON.stringify(
        params.lines.map((l) => ({
          p: l.position,
          d: l.description,
          q: l.quantity,
          u: l.unitAmountMinor,
          a: l.amountMinor,
        })),
      ),
    )
    .digest('hex');

  const payload = [
    params.previousSealHash,
    params.tenantId,
    params.invoiceNumber,
    String(params.sequenceNumber),
    String(params.totalMinor),
    params.currency,
    params.issuedAt,
    linesHash,
  ].join(':');

  const hash = createHash('sha256').update(payload, 'utf8').digest('hex');

  return {
    hash,
    previousHash: params.previousSealHash,
    sequenceNumber: params.sequenceNumber,
    sealedAt: params.issuedAt,
    algorithm: 'SHA-256',
  };
}

export function verifyLedgerSealChain(
  invoices: readonly {
    tenantId: string;
    invoiceNumber: string;
    sequenceNumber: number;
    totalMinor: number;
    currency: string;
    issuedAt: string;
    lines: readonly CalculatedInvoiceLine[];
    seal: LedgerSeal;
  }[],
): { valid: boolean; brokenAtSequence?: number; reason?: string } {
  let expectedPrevHash = '0'.repeat(64);

  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i]!;
    if (inv.seal.previousHash !== expectedPrevHash && i !== 0) {
      return {
        valid: false,
        brokenAtSequence: inv.sequenceNumber,
        reason: `Previous hash mismatch at sequence ${inv.sequenceNumber}: expected ${expectedPrevHash}, found ${inv.seal.previousHash}`,
      };
    }

    const recomputed = createLedgerSeal({
      tenantId: inv.tenantId,
      invoiceNumber: inv.invoiceNumber,
      sequenceNumber: inv.sequenceNumber,
      previousSealHash: inv.seal.previousHash,
      totalMinor: inv.totalMinor,
      currency: inv.currency,
      issuedAt: inv.issuedAt,
      lines: inv.lines,
    });

    if (recomputed.hash !== inv.seal.hash) {
      return {
        valid: false,
        brokenAtSequence: inv.sequenceNumber,
        reason: `Seal hash tampered at sequence ${inv.sequenceNumber}: computed ${recomputed.hash}, stored ${inv.seal.hash}`,
      };
    }

    expectedPrevHash = inv.seal.hash;
  }

  return { valid: true };
}


export function formatInvoiceNumber(prefix: string, nextValue: number, padding: number): string {
  if (
    !PREFIX_PATTERN.test(prefix) ||
    !Number.isSafeInteger(nextValue) ||
    nextValue < 1 ||
    nextValue > MAX_SEQUENCE ||
    !Number.isSafeInteger(padding) ||
    padding < 1 ||
    padding > 12
  ) {
    throw new ArDomainError(
      'INVALID_NUMBER_SERIES',
      'Invoice prefix, sequence value, or padding is outside the supported range.',
    );
  }
  const sequence = String(nextValue);
  if (sequence.length > padding) {
    throw new ArDomainError(
      'INVALID_NUMBER_SERIES',
      'Invoice sequence exceeds the configured number padding.',
    );
  }
  return `${prefix}${sequence.padStart(padding, '0')}`;
}

export function validateIssueDates(issueDate: string, dueDate: string): void {
  const issue = parseIsoDate(issueDate);
  const due = parseIsoDate(dueDate);
  if (due < issue) {
    throw new ArDomainError('INVALID_DATE', 'Due date cannot be earlier than issue date.');
  }
}

function parseQuantity(
  value: string,
  lineNumber: number,
): { numerator: bigint; denominator: bigint; canonical: string } {
  const quantityPattern = new RegExp(
    `^(0|[1-9]\\d{0,${MAX_QUANTITY_INTEGER_DIGITS - 1}})(?:\\.(\\d{1,${MAX_QUANTITY_SCALE}}))?$`,
  );
  const match = quantityPattern.exec(value);
  if (!match) {
    throw new ArDomainError(
      'INVALID_QUANTITY',
      `Line ${lineNumber} quantity must be a positive decimal with at most ${MAX_QUANTITY_SCALE} fractional digits.`,
    );
  }
  const integerPart = match[1] ?? '0';
  const fractionalPart = match[2] ?? '';
  const numerator = BigInt(`${integerPart}${fractionalPart}`);
  if (numerator <= 0n) {
    throw new ArDomainError(
      'INVALID_QUANTITY',
      `Line ${lineNumber} quantity must be greater than zero.`,
    );
  }
  const denominator = 10n ** BigInt(fractionalPart.length);
  const canonicalFraction = fractionalPart.replace(/0+$/, '');
  const canonical = canonicalFraction ? `${integerPart}.${canonicalFraction}` : integerPart;
  return { numerator, denominator, canonical };
}

function parseIsoDate(value: string): number {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new ArDomainError('INVALID_DATE', 'Dates must use YYYY-MM-DD format.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ArDomainError('INVALID_DATE', 'Date is not a valid calendar date.');
  }
  return timestamp;
}

function assertSafeMinorUnits(value: bigint, label: string): void {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ArDomainError(
      'AMOUNT_OVERFLOW',
      `${label} exceeds the supported safe-integer range.`,
    );
  }
}
