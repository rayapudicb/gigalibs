import { describe, it, expect } from 'vitest';
import { redactSensitiveData } from './data-redaction.js';

describe('data-redaction (Tax Configuration Sensitive Data Masking)', () => {
  it('returns primitives and null/undefined unchanged', () => {
    expect(redactSensitiveData(null).sanitized).toBeNull();
    expect(redactSensitiveData(undefined).sanitized).toBeUndefined();
    expect(redactSensitiveData(12345).sanitized).toBe(12345);
    expect(redactSensitiveData('clean payload').sanitized).toBe('clean payload');
    expect(redactSensitiveData(false).sanitized).toBe(false);
  });

  it('leaves safe tax calculation records untouched', () => {
    const safeData = {
      sourceModule: 'ACCOUNTS_RECEIVABLE',
      documentId: 'inv-100',
      jurisdictionCode: 'US-CA',
      taxableAmountMinor: 10000,
      calculatedTaxMinor: 725,
      appliedRateBasisPoints: 725,
      isExempt: false,
    };

    const { sanitized, redactedFields } = redactSensitiveData(safeData);
    expect(sanitized).toEqual(safeData);
    expect(redactedFields).toHaveLength(0);
  });

  it('redacts sensitive tax IDs, SSNs, banking, and secret fields', () => {
    const sensitiveData = {
      customer_id: 'cust-100',
      tax_id: '12-3456789',
      ein: '98-7654321',
      ssn: '000-12-3456',
      vat_number: 'GB123456789',
      bank_account: '1234567890',
      routing_number: '021000021',
      iban: 'DE89370400440532013000',
      api_key: 'tax_live_secret_key',
      token: 'jwt.token.here',
      password: 'tax-password',
      credit_card: '4111222233334444',
      cvv: '123',
    };

    const { sanitized, redactedFields } = redactSensitiveData(sensitiveData);

    expect(sanitized.customer_id).toBe('cust-100');
    expect(sanitized.tax_id).toBe('[REDACTED]');
    expect(sanitized.ein).toBe('[REDACTED]');
    expect(sanitized.ssn).toBe('[REDACTED]');
    expect(sanitized.vat_number).toBe('[REDACTED]');
    expect(sanitized.bank_account).toBe('[REDACTED]');
    expect(sanitized.routing_number).toBe('[REDACTED]');
    expect(sanitized.iban).toBe('[REDACTED]');
    expect(sanitized.api_key).toBe('[REDACTED]');
    expect(sanitized.token).toBe('[REDACTED]');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.credit_card).toBe('[REDACTED]');
    expect(sanitized.cvv).toBe('[REDACTED]');

    expect(redactedFields).toEqual(
      expect.arrayContaining([
        'tax_id',
        'ein',
        'ssn',
        'vat_number',
        'bank_account',
        'routing_number',
        'iban',
        'api_key',
        'token',
        'password',
        'credit_card',
        'cvv',
      ]),
    );
  });
});
