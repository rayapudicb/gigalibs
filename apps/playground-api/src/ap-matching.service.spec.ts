import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApMatchingService } from './ap-matching.service.js';
import type { ApPolicyService } from './ap-policy.service.js';

const dec = (val: string | number) =>
  ({
    toFixed: (digits: number) => Number(val).toFixed(digits),
    toString: () => String(val),
  }) as any;

describe('ApMatchingService — 3-Way Match Deterministic Logic', () => {
  let service: ApMatchingService;
  let mockPolicyService: ApPolicyService;

  const samplePolicy = {
    amountToleranceMinor: '100', // $1.00 tolerance
    quantityToleranceBps: 100,   // 1% tolerance
    requireReceipt: true,
    blockCurrencyMismatch: true,
  };

  const sampleActionPolicy = {
    actionType: 'AP_APPROVE_FOR_PAYMENT',
    risk: 'LOW',
    maxAmountMinor: '5000000', // $50,000.00
    requiredApprovals: 1,
    approverRoles: ['TENANT_ADMIN'],
    prohibitSelfApproval: true,
  };

  beforeEach(() => {
    mockPolicyService = {
      getActiveRule: vi.fn().mockImplementation((_tenantId, ruleCode) => {
        if (ruleCode === 'AP_THREE_WAY_MATCH') {
          return Promise.resolve({
            version: { id: 'ver-match-1', definition: samplePolicy, checksum: 'sha256-match' },
          });
        }
        return Promise.resolve({
          version: { id: 'ver-action-1', definition: sampleActionPolicy, checksum: 'sha256-action' },
        });
      }),
    } as unknown as ApPolicyService;

    service = new ApMatchingService(mockPolicyService);
  });

  it('evaluates a clean 3-way match as MATCHED with zero blocking findings', () => {
    const invoice: any = {
      id: 'inv-1',
      supplier: { id: 'sup-1', externalId: 'SUP-001', name: 'Acme Supplies' },
      currency: 'USD',
      subtotalMinor: 10000n, // $100.00
      taxMinor: 1000n,       // $10.00
      totalMinor: 11000n,     // $110.00
      purchaseOrderExternalId: 'PO-001',
      lines: [
        {
          id: 'inv-line-1',
          lineNumber: 1,
          purchaseOrderLineNumber: 1,
          description: 'Widget A',
          quantity: dec(10),
          unitPriceMinor: 1000n, // $10.00 each
          totalMinor: 10000n,
        },
      ],
      purchaseOrder: {
        id: 'po-1',
        currency: 'USD',
        supplier: { id: 'sup-1', externalId: 'SUP-001' },
        lines: [
          {
            id: 'po-line-1',
            lineNumber: 1,
            description: 'Widget A',
            quantity: dec(10),
            unitPriceMinor: 1000n,
            receiptLines: [
              {
                id: 'rcpt-1',
                quantityReceived: dec(10),
                goodsReceipt: { id: 'gr-1', sourceEvent: { eventId: 'evt-gr-1', payloadHash: 'hash' } },
              },
            ],
          },
        ],
      },
    };

    const findings = (service as any).evaluateFindings(invoice, samplePolicy);
    expect(findings).toHaveLength(0);
    const outcome = findings.some((f: any) => f.incomplete)
      ? 'INCOMPLETE'
      : findings.some((f: any) => f.severity === 'BLOCKING')
        ? 'MISMATCH'
        : 'MATCHED';
    expect(outcome).toBe('MATCHED');
  });

  it('detects UNIT_PRICE_MISMATCH when price exceeds amount tolerance', () => {
    const invoice: any = {
      id: 'inv-2',
      supplier: { id: 'sup-1', externalId: 'SUP-001' },
      currency: 'USD',
      subtotalMinor: 15000n, // $150.00 ($15/unit instead of $10)
      taxMinor: 1500n,
      totalMinor: 16500n,
      purchaseOrderExternalId: 'PO-001',
      lines: [
        {
          id: 'inv-line-1',
          lineNumber: 1,
          purchaseOrderLineNumber: 1,
          quantity: dec(10),
          unitPriceMinor: 1500n, // $15.00
          totalMinor: 15000n,
        },
      ],
      purchaseOrder: {
        id: 'po-1',
        currency: 'USD',
        supplier: { id: 'sup-1', externalId: 'SUP-001' },
        lines: [
          {
            id: 'po-line-1',
            lineNumber: 1,
            quantity: dec(10),
            unitPriceMinor: 1000n, // $10.00
            receiptLines: [{ id: 'rcpt-1', quantityReceived: dec(10), goodsReceipt: { id: 'gr-1', sourceEvent: {} } }],
          },
        ],
      },
    };

    const findings = (service as any).evaluateFindings(invoice, samplePolicy);
    expect(findings.some((f: any) => f.code === 'UNIT_PRICE_MISMATCH')).toBe(true);
    const blocking = findings.filter((f: any) => f.severity === 'BLOCKING');
    expect(blocking.length).toBeGreaterThan(0);
  });

  it('detects ORDERED_QUANTITY_EXCEEDED when invoiced quantity exceeds PO quantity by more than tolerance', () => {
    const invoice: any = {
      id: 'inv-3',
      supplier: { id: 'sup-1', externalId: 'SUP-001' },
      currency: 'USD',
      subtotalMinor: 20000n,
      taxMinor: 2000n,
      totalMinor: 22000n,
      purchaseOrderExternalId: 'PO-001',
      lines: [
        {
          id: 'inv-line-1',
          lineNumber: 1,
          purchaseOrderLineNumber: 1,
          quantity: dec(20), // ordered 10
          unitPriceMinor: 1000n,
          totalMinor: 20000n,
        },
      ],
      purchaseOrder: {
        id: 'po-1',
        currency: 'USD',
        supplier: { id: 'sup-1', externalId: 'SUP-001' },
        lines: [
          {
            id: 'po-line-1',
            lineNumber: 1,
            quantity: dec(10),
            unitPriceMinor: 1000n,
            receiptLines: [{ id: 'rcpt-1', quantityReceived: dec(20), goodsReceipt: { id: 'gr-1', sourceEvent: {} } }],
          },
        ],
      },
    };

    const findings = (service as any).evaluateFindings(invoice, samplePolicy);
    expect(findings.some((f: any) => f.code === 'ORDERED_QUANTITY_EXCEEDED')).toBe(true);
  });

  it('detects GOODS_RECEIPT_NOT_AVAILABLE and marks evaluation INCOMPLETE when receipt is missing and policy requires it', () => {
    const invoice: any = {
      id: 'inv-4',
      supplier: { id: 'sup-1', externalId: 'SUP-001' },
      currency: 'USD',
      subtotalMinor: 10000n,
      taxMinor: 1000n,
      totalMinor: 11000n,
      purchaseOrderExternalId: 'PO-001',
      lines: [
        {
          id: 'inv-line-1',
          lineNumber: 1,
          purchaseOrderLineNumber: 1,
          quantity: dec(10),
          unitPriceMinor: 1000n,
          totalMinor: 10000n,
        },
      ],
      purchaseOrder: {
        id: 'po-1',
        currency: 'USD',
        supplier: { id: 'sup-1', externalId: 'SUP-001' },
        lines: [
          {
            id: 'po-line-1',
            lineNumber: 1,
            quantity: dec(10),
            unitPriceMinor: 1000n,
            receiptLines: [], // No receipts
          },
        ],
      },
    };

    const findings = (service as any).evaluateFindings(invoice, samplePolicy);
    expect(findings.some((f: any) => f.code === 'GOODS_RECEIPT_NOT_AVAILABLE' && f.incomplete)).toBe(true);
  });

  it('detects CURRENCY_MISMATCH when invoice currency diverges from purchase order', () => {
    const invoice: any = {
      id: 'inv-5',
      supplier: { id: 'sup-1', externalId: 'SUP-001' },
      currency: 'EUR', // PO is in USD
      subtotalMinor: 10000n,
      taxMinor: 1000n,
      totalMinor: 11000n,
      purchaseOrderExternalId: 'PO-001',
      lines: [
        {
          id: 'inv-line-1',
          lineNumber: 1,
          purchaseOrderLineNumber: 1,
          quantity: dec(10),
          unitPriceMinor: 1000n,
          totalMinor: 10000n,
        },
      ],
      purchaseOrder: {
        id: 'po-1',
        currency: 'USD',
        supplier: { id: 'sup-1', externalId: 'SUP-001' },
        lines: [
          {
            id: 'po-line-1',
            lineNumber: 1,
            quantity: dec(10),
            unitPriceMinor: 1000n,
            receiptLines: [{ id: 'rcpt-1', quantityReceived: dec(10), goodsReceipt: { id: 'gr-1', sourceEvent: {} } }],
          },
        ],
      },
    };

    const findings = (service as any).evaluateFindings(invoice, samplePolicy);
    expect(findings.some((f: any) => f.code === 'CURRENCY_MISMATCH' && f.severity === 'BLOCKING')).toBe(true);
  });

  it('detects INVOICE_TOTAL_MISMATCH when subtotal plus tax does not equal totalMinor', () => {
    const invoice: any = {
      id: 'inv-6',
      supplier: { id: 'sup-1', externalId: 'SUP-001' },
      currency: 'USD',
      subtotalMinor: 10000n,
      taxMinor: 1000n,
      totalMinor: 15000n, // Expected 11000n, discrepancy = 4000n
      purchaseOrderExternalId: 'PO-001',
      lines: [
        {
          id: 'inv-line-1',
          lineNumber: 1,
          purchaseOrderLineNumber: 1,
          quantity: dec(10),
          unitPriceMinor: 1000n,
          totalMinor: 10000n,
        },
      ],
      purchaseOrder: {
        id: 'po-1',
        currency: 'USD',
        supplier: { id: 'sup-1', externalId: 'SUP-001' },
        lines: [
          {
            id: 'po-line-1',
            lineNumber: 1,
            quantity: dec(10),
            unitPriceMinor: 1000n,
            receiptLines: [{ id: 'rcpt-1', quantityReceived: dec(10), goodsReceipt: { id: 'gr-1', sourceEvent: {} } }],
          },
        ],
      },
    };

    const findings = (service as any).evaluateFindings(invoice, samplePolicy);
    expect(findings.some((f: any) => f.code === 'INVOICE_TOTAL_MISMATCH')).toBe(true);
  });
});
