import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MappingsService } from './mappings.service.js';
import type { DatabaseService } from '../database/database.service.js';

describe('MappingsService (DS-03 Transforms & FX Normalization)', () => {
  let mappingsService: MappingsService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };
    mappingsService = new MappingsService(mockDb as unknown as DatabaseService);
  });

  it('transforms payload fields declaratively using configured transform rules', async () => {
    const mockMapping = {
      id: 'map-sap-01',
      mapping_name: 'SAP Invoice to AR Contract',
      source_system: 'SAP_S4HANA',
      contract_code: 'CONTRACT-AR-INVOICE',
      currency_normalization: false,
      target_currency: 'USD',
      mapping_rules: [
        { source: 'BELNR', target: 'invoice_number', transform: 'PREFIX:INV-' },
        { source: 'WRBTR', target: 'amount_minor', transform: 'DECIMAL_TO_MINOR' },
        { source: 'WAERS', target: 'currency', transform: 'UPPERCASE' },
        { source: 'KUNNR', target: 'customer_id', transform: 'TRIM' },
        { source: 'BLDAT', target: 'issued_date', transform: 'DATE_ISO8601' },
      ],
    };

    mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [mockMapping] });

    const rawData = {
      BELNR: '90001234',
      WRBTR: '1250.75', // 1250.75 EUR => 125075 minor
      WAERS: 'eur',
      KUNNR: '  CUST-0099  ',
      BLDAT: '2026-09-01T00:00:00Z',
    };

    const result = await mappingsService.transformPayload('tenant-corp-01', {
      mapping_id: 'map-sap-01',
      raw_data: rawData,
    });

    expect(result.mapping_id).toBe('map-sap-01');
    expect(result.transformed_output.invoice_number).toBe('INV-90001234');
    expect(result.transformed_output.amount_minor).toBe(125075);
    expect(result.transformed_output.currency).toBe('EUR');
    expect(result.transformed_output.customer_id).toBe('CUST-0099');
    expect(result.transformed_output.issued_date).toBe('2026-09-01T00:00:00.000Z');
    expect(result.currency_normalized).toBe(false);
  });

  it('performs mathematical currency normalization with exact proof retention', async () => {
    const mockMapping = {
      id: 'map-eur-usd',
      mapping_name: 'EUR to USD Spend Normalizer',
      source_system: 'COUPA_PROCUREMENT',
      contract_code: 'CONTRACT-SPEND-NORMALIZED',
      currency_normalization: true,
      target_currency: 'USD',
      exchange_rate_micros: '1085000', // 1 EUR = 1.085000 USD
      rate_timestamp: '2026-09-16T12:00:00Z',
      mapping_rules: [
        { source: 'amount', target: 'amount_minor', transform: 'DIRECT' },
        { source: 'currency', target: 'currency', transform: 'UPPERCASE' },
      ],
    };

    mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [mockMapping] });

    // 100.00 EUR (10,000 minor) * 1.085000 = 108.50 USD (10,850 minor)
    const rawData = {
      amount: 10000,
      currency: 'EUR',
    };

    const result = await mappingsService.transformPayload('tenant-corp-01', {
      mapping_id: 'map-eur-usd',
      raw_data: rawData,
    });

    expect(result.currency_normalized).toBe(true);
    expect(result.target_currency).toBe('USD');
    expect(result.transformed_output.amount_minor).toBe(10850);
    expect(result.transformed_output.currency).toBe('USD');
    expect(result.transformed_output.amount_minor_original).toBe(10000);
    expect(result.transformed_output.currency_original).toBe('EUR');

    // Proof verification
    expect(result.conversion_proof).toBeDefined();
    expect(result.conversion_proof.source_currency).toBe('EUR');
    expect(result.conversion_proof.source_amount_minor).toBe(10000);
    expect(result.conversion_proof.target_currency).toBe('USD');
    expect(result.conversion_proof.target_amount_minor).toBe(10850);
    expect(result.conversion_proof.exchange_rate_micros).toBe(1085000);
    expect(result.conversion_proof.identity_conversion).toBe(false);
  });

  it('recognizes identity conversion when source currency matches target currency', async () => {
    const mockMapping = {
      id: 'map-usd-usd',
      mapping_name: 'USD Native Ingest',
      source_system: 'STRIPE',
      contract_code: 'CONTRACT-AR-INVOICE',
      currency_normalization: true,
      target_currency: 'USD',
      mapping_rules: [
        { source: 'amount', target: 'amount_minor', transform: 'DIRECT' },
        { source: 'currency', target: 'currency', transform: 'UPPERCASE' },
      ],
    };

    mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [mockMapping] });

    const result = await mappingsService.transformPayload('tenant-corp-01', {
      mapping_id: 'map-usd-usd',
      raw_data: { amount: 5000, currency: 'USD' },
    });

    expect(result.currency_normalized).toBe(true);
    expect(result.conversion_proof.identity_conversion).toBe(true);
    expect(result.transformed_output.amount_minor).toBe(5000);
  });

  it('fails currency normalization safely when exchange rate is unavailable', async () => {
    const mockMapping = {
      id: 'map-exotic',
      mapping_name: 'Exotic Currency Pipeline',
      source_system: 'CUSTOM_FEED',
      contract_code: 'CONTRACT-FEED',
      currency_normalization: true,
      target_currency: 'USD',
      exchange_rate_micros: null, // No rate configured!
      mapping_rules: [
        { source: 'amount', target: 'amount_minor', transform: 'DIRECT' },
        { source: 'currency', target: 'currency', transform: 'UPPERCASE' },
      ],
    };

    mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [mockMapping] });

    const result = await mappingsService.transformPayload('tenant-corp-01', {
      mapping_id: 'map-exotic',
      raw_data: { amount: 5000, currency: 'KZT' }, // Kazakhstani Tenge without rate
    });

    expect(result.currency_normalized).toBe(false);
    expect(result.conversion_error).toContain('Exchange rate unavailable');
  });
});
