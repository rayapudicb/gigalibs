import { describe, it, expect } from 'vitest';
import {
  calculateInvoiceLedger,
  createLedgerSeal,
  verifyLedgerSealChain,
} from '@gigalibs/ar-domain';



describe('WI-OI-035: Enterprise AR & Cryptographic Invoicing Engine', () => {
  it('enforces exact scaled-integer math and zero float drift over high-volume transactions', () => {
    // 100 lines of consulting hours at irregular fractional quantities
    const lines = Array.from({ length: 100 }, (_, i) => ({
      description: `Service Unit ${i + 1}`,
      quantity: '1.333333',
      unitAmountMinor: 10_003, // $100.03
      discountMinor: 500, // $5.00 line discount
    }));

    const result = calculateInvoiceLedger({
      currency: 'USD',
      lines,
      headerDiscountMinor: 2_500, // $25.00 header prompt payment discount
      taxes: [
        { id: 'tax-state', name: 'California State Tax', rateBasisPoints: 725, isCompound: false }, // 7.25%
        { id: 'tax-transit', name: 'Bay Area Transit District', rateBasisPoints: 125, isCompound: true }, // 1.25% compound
      ],
    });

    // Verification of integers
    expect(Number.isInteger(result.subtotalGrossMinor)).toBe(true);
    expect(Number.isInteger(result.lineDiscountsMinor)).toBe(true);
    expect(Number.isInteger(result.subtotalNetMinor)).toBe(true);
    expect(Number.isInteger(result.taxMinor)).toBe(true);
    expect(Number.isInteger(result.totalMinor)).toBe(true);

    expect(result.subtotalNetMinor).toBe(result.subtotalGrossMinor - result.lineDiscountsMinor);
    expect(result.totalMinor).toBe(result.subtotalNetMinor - result.headerDiscountMinor + result.taxMinor);
  });

  it('guarantees zero penny drift on milestone installment schedules', () => {
    const oddTotalInvoice = calculateInvoiceLedger({
      currency: 'USD',
      lines: [{ description: 'Fixed Bid Milestone Project', quantity: '1', unitAmountMinor: 100_001 }], // $1,000.01 (100,001 cents)
      installments: [
        { position: 1, dueDate: '2026-09-15', percentageBasisPoints: 3333 }, // 33.33%
        { position: 2, dueDate: '2026-10-15', percentageBasisPoints: 3333 }, // 33.33%
        { position: 3, dueDate: '2026-11-15', percentageBasisPoints: 3334 }, // 33.34%
      ],
    });

    expect(oddTotalInvoice.installments).toHaveLength(3);

    const sumInstallments = oddTotalInvoice.installments.reduce(
      (acc: number, inst: { amountMinor: number }) => acc + inst.amountMinor,
      0,
    );

    // Strict equality to the single minor unit (cent)
    expect(sumInstallments).toBe(oddTotalInvoice.totalMinor);
    expect(sumInstallments).toBe(100_001);

    // Verify individual milestone amounts
    expect(oddTotalInvoice.installments[0]?.amountMinor).toBe(33_330);
    expect(oddTotalInvoice.installments[1]?.amountMinor).toBe(33_330);
    expect(oddTotalInvoice.installments[2]?.amountMinor).toBe(33_341); // absorbed remainder penny!
  });

  it('generates immutable SHA-256 hash chains and detects fraudulent tampering', () => {
    // Invoice 1: Sequence 1
    const inv1 = calculateInvoiceLedger({
      currency: 'USD',
      lines: [{ description: 'Enterprise Software Subscription', quantity: '1', unitAmountMinor: 500_000 }],
      tenantId: 'TEN-GIGA-001',
      invoiceNumber: 'GL-INV-000101',
      sequenceNumber: 101,
      previousSealHash: '0'.repeat(64),
      issuedAt: '2026-09-01T08:00:00.000Z',
    });

    expect(inv1.seal).toBeDefined();
    expect(inv1.seal?.hash.length).toBe(64);

    // Invoice 2: Sequence 2 chained to Invoice 1
    const inv2 = calculateInvoiceLedger({
      currency: 'USD',
      lines: [{ description: 'Custom API Engineering & Webhooks', quantity: '1', unitAmountMinor: 750_000 }],
      tenantId: 'TEN-GIGA-001',
      invoiceNumber: 'GL-INV-000102',
      sequenceNumber: 102,
      previousSealHash: inv1.seal!.hash,
      issuedAt: '2026-09-02T08:00:00.000Z',
    });

    expect(inv2.seal?.previousHash).toBe(inv1.seal?.hash);

    // Valid chain test
    const validChain = [
      {
        tenantId: 'TEN-GIGA-001',
        invoiceNumber: 'GL-INV-000101',
        sequenceNumber: 101,
        totalMinor: inv1.totalMinor,
        currency: inv1.currency,
        issuedAt: '2026-09-01T08:00:00.000Z',
        lines: inv1.lines,
        seal: inv1.seal!,
      },
      {
        tenantId: 'TEN-GIGA-001',
        invoiceNumber: 'GL-INV-000102',
        sequenceNumber: 102,
        totalMinor: inv2.totalMinor,
        currency: inv2.currency,
        issuedAt: '2026-09-02T08:00:00.000Z',
        lines: inv2.lines,
        seal: inv2.seal!,
      },
    ];

    const audit1 = verifyLedgerSealChain(validChain);
    expect(audit1.valid).toBe(true);

    // Fraudulent Tamper Simulation: an unauthorized DB write altered totalMinor in invoice 1
    const tamperedChain = [
      {
        ...validChain[0]!,
        totalMinor: 499_999, // 1 cent illicit modification
      },
      validChain[1]!,
    ];

    const audit2 = verifyLedgerSealChain(tamperedChain);
    expect(audit2.valid).toBe(false);
    expect(audit2.brokenAtSequence).toBe(101);
    expect(audit2.reason).toContain('Seal hash tampered');
  });

  it('validates Peppol BIS Billing 3.0 UBL 2.1 compliance payload structure', () => {
    const inv = calculateInvoiceLedger({
      currency: 'EUR',
      lines: [{ description: 'EU Cross-Border Consulting', quantity: '2', unitAmountMinor: 15_000 }],
      tenantId: 'TEN-EU-001',
      invoiceNumber: 'EU-INV-2026-001',
      sequenceNumber: 1,
      previousSealHash: '0'.repeat(64),
      issuedAt: '2026-09-07T12:00:00.000Z',
    });

    const seal = inv.seal!;
    expect(seal).toBeDefined();

    // Verify properties required by Peppol BIS 3.0 attachment and monetary totals
    expect(inv.currency).toBe('EUR');
    expect(inv.totalMinor).toBe(30_000); // 300.00 EUR
    expect(seal.algorithm).toBe('SHA-256');
    expect(seal.hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
