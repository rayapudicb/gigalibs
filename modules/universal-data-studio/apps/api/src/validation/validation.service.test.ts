import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ValidationService } from './validation.service.js';
import type { DatabaseService } from '../database/database.service.js';

describe('ValidationService (DS-02 Validation & Assertion Semantics)', () => {
  let validationService: ValidationService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };
    validationService = new ValidationService(mockDb as unknown as DatabaseService);
  });

  const mockContract = {
    id: 'dc-invoice',
    contract_code: 'CONTRACT-AR-INVOICE',
    name: 'AR Invoice Ingestion',
    active_version: '1.0.0',
  };

  const mockVersion = {
    json_schema: {
      type: 'object',
      required: ['invoice_number', 'amount_minor', 'currency', 'customer.id'],
      properties: {
        invoice_number: { type: 'string', pattern: '^INV-[0-9]{4}-[0-9]{4}$' },
        amount_minor: { type: 'integer' },
        tax_rate: { type: 'number' },
        currency: { type: 'string' },
        'customer.id': { type: 'string' },
      },
    },
  };

  const mockQualityAssertions = [
    {
      rule_name: 'CURRENCY_ISO_CHECK',
      field_path: 'currency',
      assertion_type: 'VALID_ISO_CURRENCY',
      parameters: { allowedCurrencies: ['USD', 'EUR', 'GBP'] },
      severity: 'ERROR',
    },
    {
      rule_name: 'AMOUNT_POSITIVE_BOUNDS',
      field_path: 'amount_minor',
      assertion_type: 'RANGE_BOUNDS',
      parameters: { min: 1, max: 100_000_000 },
      severity: 'ERROR',
    },
  ];

  it('validates compliant payload successfully', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [mockContract] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [mockVersion] })
      .mockResolvedValueOnce({ rowCount: 2, rows: mockQualityAssertions });

    const payload = {
      invoice_number: 'INV-2026-0001',
      amount_minor: 50000,
      tax_rate: 0.19,
      currency: 'EUR',
      customer: { id: 'CUST-881' },
    };

    const result = await validationService.validatePayload(
      'tenant-corp-01',
      'CONTRACT-AR-INVOICE',
      payload,
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.assertions_evaluated).toBe(2);
  });

  it('rejects missing mandatory and nested properties', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [mockContract] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [mockVersion] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // insert drift

    const payload = {
      amount_minor: 50000,
      currency: 'USD',
      // invoice_number is missing!
      // customer.id is missing!
    };

    const result = await validationService.validatePayload(
      'tenant-corp-01',
      'CONTRACT-AR-INVOICE',
      payload,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing mandatory property 'invoice_number' defined in contract");
    expect(result.errors).toContain("Missing mandatory property 'customer.id' defined in contract");

    // Verify drift log was written
    const driftCall = mockDb.query.mock.calls.find((c: any[]) =>
      c[0].includes('INSERT INTO gigalibs_data_studio.schema_drift_logs'),
    );
    expect(driftCall).toBeDefined();
  });

  it('rejects NaN and non-finite numbers from evading range bounds checks', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [mockContract] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [mockVersion] })
      .mockResolvedValueOnce({ rowCount: 2, rows: mockQualityAssertions })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // insert drift

    const payload = {
      invoice_number: 'INV-2026-0001',
      amount_minor: NaN, // Invalid NaN!
      currency: 'USD',
      customer: { id: 'CUST-1' },
    };

    const result = await validationService.validatePayload(
      'tenant-corp-01',
      'CONTRACT-AR-INVOICE',
      payload,
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('integer minor unit') || e.includes('not a valid finite number'))).toBe(true);
  });

  it('rejects unapproved currency in VALID_ISO_CURRENCY assertion', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [mockContract] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [mockVersion] })
      .mockResolvedValueOnce({ rowCount: 2, rows: mockQualityAssertions })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const payload = {
      invoice_number: 'INV-2026-0001',
      amount_minor: 50000,
      currency: 'XYZ_FAKE_CURRENCY',
      customer: { id: 'CUST-1' },
    };

    const result = await validationService.validatePayload(
      'tenant-corp-01',
      'CONTRACT-AR-INVOICE',
      payload,
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not an authorized ISO-4217 currency'))).toBe(true);
  });

  it('rejects unsupported assertion types explicitly instead of silently passing', async () => {
    const customAssertions = [
      {
        rule_name: 'UNKNOWN_RULE',
        field_path: 'amount_minor',
        assertion_type: 'NON_EXISTENT_ASSERTION_TYPE',
        parameters: {},
        severity: 'ERROR',
      },
    ];

    mockDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [mockContract] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [mockVersion] })
      .mockResolvedValueOnce({ rowCount: 1, rows: customAssertions })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const payload = {
      invoice_number: 'INV-2026-0001',
      amount_minor: 50000,
      currency: 'USD',
      customer: { id: 'CUST-1' },
    };

    const result = await validationService.validatePayload(
      'tenant-corp-01',
      'CONTRACT-AR-INVOICE',
      payload,
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Unsupported assertion type 'NON_EXISTENT_ASSERTION_TYPE'"))).toBe(true);
  });
});
