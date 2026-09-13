import { describe, expect, it } from 'vitest';
import {
  type ArDomainError,
  calculateInvoiceDraft,
  calculateInvoiceLedger,
  createLedgerSeal,
  formatInvoiceNumber,
  validateIssueDates,
  verifyLedgerSealChain,
} from './invoice.js';

describe('calculateInvoiceDraft', () => {
  it('calculates authoritative minor-unit totals with decimal quantities', () => {
    expect(
      calculateInvoiceDraft('USD', [
        { description: 'Consulting hours', quantity: '1.5', unitAmountMinor: 10_001 },
        { description: 'Support', quantity: '2', unitAmountMinor: 2_500 },
      ]),
    ).toEqual({
      currency: 'USD',
      lines: [
        {
          description: 'Consulting hours',
          quantity: '1.5',
          unitAmountMinor: 10_001,
          position: 1,
          grossAmountMinor: 15_002,
          discountMinor: 0,
          amountMinor: 15_002,
        },
        {
          description: 'Support',
          quantity: '2',
          unitAmountMinor: 2_500,
          position: 2,
          grossAmountMinor: 5_000,
          discountMinor: 0,
          amountMinor: 5_000,
        },
      ],
      subtotalMinor: 20_002,
      taxMinor: 0,
      totalMinor: 20_002,
    });
  });

  it('uses explicit half-up rounding at the minor-unit boundary', () => {
    const result = calculateInvoiceDraft('USD', [
      { description: 'Half unit', quantity: '0.5', unitAmountMinor: 101 },
    ]);
    expect(result.totalMinor).toBe(51);
  });

  it.each([
    ['usd', 'INVALID_CURRENCY'],
    ['US', 'INVALID_CURRENCY'],
  ] as const)('rejects invalid currency %s', (currency, code) => {
    expect(() =>
      calculateInvoiceDraft(currency, [
        { description: 'Service', quantity: '1', unitAmountMinor: 100 },
      ]),
    ).toThrow(expect.objectContaining<Partial<ArDomainError>>({ code }));
  });

  it.each(['0', '-1', '1.0000001', '01', '1e3'])('rejects unsafe quantity %s', (quantity) => {
    expect(() =>
      calculateInvoiceDraft('USD', [{ description: 'Service', quantity, unitAmountMinor: 100 }]),
    ).toThrow(expect.objectContaining<Partial<ArDomainError>>({ code: 'INVALID_QUANTITY' }));
  });

  it('rejects aggregate amounts beyond the JSON safe-integer boundary', () => {
    expect(() =>
      calculateInvoiceDraft('USD', [
        {
          description: 'Overflow',
          quantity: '2',
          unitAmountMinor: Number.MAX_SAFE_INTEGER,
        },
      ]),
    ).toThrow(expect.objectContaining<Partial<ArDomainError>>({ code: 'AMOUNT_OVERFLOW' }));
  });
});

describe('calculateInvoiceLedger', () => {
  it('accurately computes discounts and multi-tier compounding taxes without float drift', () => {
    const result = calculateInvoiceLedger({
      currency: 'USD',
      lines: [
        { description: 'Server Setup', quantity: '1', unitAmountMinor: 10_000, discountMinor: 1_500 }, // 100 - 15 = 85 net
        { description: 'Config', quantity: '2', unitAmountMinor: 1_000, discountMinor: 200 }, // 20 - 2 = 18 net (gross 20)
      ],
      headerDiscountMinor: 300, // $3.00 header discount -> net taxable = 85 + 18 - 3 = 100.00 (10,000 minor)
      taxes: [
        { id: 'tax-state', name: 'State Tax', rateBasisPoints: 500, isCompound: false }, // 5.00% on 10,000 = 500
        { id: 'tax-city', name: 'City Surcharge', rateBasisPoints: 200, isCompound: true }, // 2.00% on (10,000 + 500) = 210
      ],
    });

    expect(result.subtotalGrossMinor).toBe(12_000);
    expect(result.lineDiscountsMinor).toBe(1_700);
    expect(result.subtotalNetMinor).toBe(10_300);
    expect(result.headerDiscountMinor).toBe(300);
    expect(result.taxes).toHaveLength(2);
    expect(result.taxes[0]).toEqual({
      id: 'tax-state',
      name: 'State Tax',
      rateBasisPoints: 500,
      isCompound: false,
      taxableBasisMinor: 10_000,
      amountMinor: 500,
    });
    expect(result.taxes[1]).toEqual({
      id: 'tax-city',
      name: 'City Surcharge',
      rateBasisPoints: 200,
      isCompound: true,
      taxableBasisMinor: 10_500,
      amountMinor: 210,
    });
    expect(result.taxMinor).toBe(710);
    expect(result.totalMinor).toBe(10_710); // 10,000 + 710
  });

  it('balances installment schedules with zero penny drift across irregular splits', () => {
    const result = calculateInvoiceLedger({
      currency: 'EUR',
      lines: [{ description: 'Custom Development', quantity: '1', unitAmountMinor: 10_001 }], // Total 100.01 EUR (10,001 cents)
      installments: [
        { position: 1, dueDate: '2026-10-01', percentageBasisPoints: 3333 }, // 33.33%
        { position: 2, dueDate: '2026-11-01', percentageBasisPoints: 3333 }, // 33.33%
        { position: 3, dueDate: '2026-12-01', percentageBasisPoints: 3334 }, // 33.34%
      ],
    });

    expect(result.installments).toHaveLength(3);
    const sumInstallments = result.installments.reduce((acc, inst) => acc + inst.amountMinor, 0);
    expect(sumInstallments).toBe(result.totalMinor);
    expect(sumInstallments).toBe(10_001);
  });

  it('rejects installment schedules that do not total 100%', () => {
    expect(() =>
      calculateInvoiceLedger({
        currency: 'USD',
        lines: [{ description: 'Dev', quantity: '1', unitAmountMinor: 1_000 }],
        installments: [
          { position: 1, dueDate: '2026-10-01', percentageBasisPoints: 5000 },
          { position: 2, dueDate: '2026-11-01', percentageBasisPoints: 4000 }, // sums to 9000, not 10000
        ],
      }),
    ).toThrow(expect.objectContaining<Partial<ArDomainError>>({ code: 'INVALID_INSTALLMENT' }));
  });
});

describe('Ledger Cryptographic Seals', () => {
  it('generates deterministic SHA-256 seal and verifies uncorrupted chain', () => {
    const inv1 = calculateInvoiceLedger({
      currency: 'USD',
      lines: [{ description: 'Sprint 1', quantity: '1', unitAmountMinor: 50_000 }],
      tenantId: 'tenant-acme',
      invoiceNumber: 'INV-000001',
      sequenceNumber: 1,
      previousSealHash: '0'.repeat(64),
      issuedAt: '2026-09-01T12:00:00.000Z',
    });

    expect(inv1.seal).toBeDefined();
    expect(inv1.seal?.hash).toMatch(/^[a-f0-9]{64}$/);

    const manualSeal = createLedgerSeal({
      tenantId: 'tenant-acme',
      invoiceNumber: 'INV-000001',
      sequenceNumber: 1,
      previousSealHash: '0'.repeat(64),
      totalMinor: inv1.totalMinor,
      currency: inv1.currency,
      issuedAt: '2026-09-01T12:00:00.000Z',
      lines: inv1.lines,
    });
    expect(inv1.seal?.hash).toBe(manualSeal.hash);

    const inv2 = calculateInvoiceLedger({

      currency: 'USD',
      lines: [{ description: 'Sprint 2', quantity: '1', unitAmountMinor: 75_000 }],
      tenantId: 'tenant-acme',
      invoiceNumber: 'INV-000002',
      sequenceNumber: 2,
      previousSealHash: inv1.seal!.hash,
      issuedAt: '2026-09-02T12:00:00.000Z',
    });

    expect(inv2.seal?.previousHash).toBe(inv1.seal?.hash);

    const chain = [
      {
        tenantId: 'tenant-acme',
        invoiceNumber: 'INV-000001',
        sequenceNumber: 1,
        totalMinor: inv1.totalMinor,
        currency: inv1.currency,
        issuedAt: '2026-09-01T12:00:00.000Z',
        lines: inv1.lines,
        seal: inv1.seal!,
      },
      {
        tenantId: 'tenant-acme',
        invoiceNumber: 'INV-000002',
        sequenceNumber: 2,
        totalMinor: inv2.totalMinor,
        currency: inv2.currency,
        issuedAt: '2026-09-02T12:00:00.000Z',
        lines: inv2.lines,
        seal: inv2.seal!,
      },
    ];

    const verification = verifyLedgerSealChain(chain);
    expect(verification.valid).toBe(true);
  });

  it('detects tampering when an invoice line amount is altered after issuance', () => {
    const inv = calculateInvoiceLedger({
      currency: 'USD',
      lines: [{ description: 'Audit Line', quantity: '1', unitAmountMinor: 10_000 }],
      tenantId: 'tenant-acme',
      invoiceNumber: 'INV-000001',
      sequenceNumber: 1,
      previousSealHash: '0'.repeat(64),
      issuedAt: '2026-09-01T12:00:00.000Z',
    });

    // Tampered: someone changed amountMinor in the database line
    const tamperedLines = [
      {
        ...inv.lines[0]!,
        amountMinor: 9_999, // 1 cent altered!
      },
    ];

    const chain = [
      {
        tenantId: 'tenant-acme',
        invoiceNumber: 'INV-000001',
        sequenceNumber: 1,
        totalMinor: inv.totalMinor,
        currency: inv.currency,
        issuedAt: '2026-09-01T12:00:00.000Z',
        lines: tamperedLines,
        seal: inv.seal!,
      },
    ];

    const verification = verifyLedgerSealChain(chain);
    expect(verification.valid).toBe(false);
    expect(verification.brokenAtSequence).toBe(1);
    expect(verification.reason).toContain('Seal hash tampered');
  });
});

describe('formatInvoiceNumber', () => {
  it('formats a bounded series deterministically', () => {
    expect(formatInvoiceNumber('INV-', 42, 6)).toBe('INV-000042');
  });

  it('rejects sequence overflow instead of silently changing the format', () => {
    expect(() => formatInvoiceNumber('INV-', 10_000, 4)).toThrow(
      expect.objectContaining<Partial<ArDomainError>>({ code: 'INVALID_NUMBER_SERIES' }),
    );
  });
});

describe('validateIssueDates', () => {
  it('accepts due date equal to or later than issue date', () => {
    expect(() => validateIssueDates('2026-09-04', '2026-10-04')).not.toThrow();
  });

  it.each([
    ['2026-09-04', '2026-09-03'],
    ['2026-02-30', '2026-03-01'],
  ])('rejects invalid issue/due dates', (issueDate, dueDate) => {
    expect(() => validateIssueDates(issueDate, dueDate)).toThrow(
      expect.objectContaining<Partial<ArDomainError>>({ code: 'INVALID_DATE' }),
    );
  });
});

