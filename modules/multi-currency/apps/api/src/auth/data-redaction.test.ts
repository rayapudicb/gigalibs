import { describe, it, expect } from 'vitest';
import { redactSensitiveData } from './data-redaction.js';

describe('data-redaction (Multi-Currency Sensitive Data Masking)', () => {
  it('returns primitives and null/undefined unchanged', () => {
    expect(redactSensitiveData(null).sanitized).toBeNull();
    expect(redactSensitiveData(undefined).sanitized).toBeUndefined();
    expect(redactSensitiveData(12345).sanitized).toBe(12345);
    expect(redactSensitiveData('clean payload').sanitized).toBe('clean payload');
    expect(redactSensitiveData(false).sanitized).toBe(false);
  });

  it('leaves safe conversion records untouched', () => {
    const safeData = {
      from: 'EUR',
      to: 'USD',
      source: 10000,
      converted: 10850,
      rate: 1.085,
    };

    const { sanitized, redactedFields } = redactSensitiveData(safeData);
    expect(sanitized).toEqual(safeData);
    expect(redactedFields).toHaveLength(0);
  });

  it('redacts sensitive banking, auth, and credential fields', () => {
    const sensitiveData = {
      account_name: 'Corp Treasury',
      bank_account: '1234567890',
      routing_number: '021000021',
      iban: 'DE89370400440532013000',
      swift: 'DEUTDEDDFXX',
      api_key: 'fx_live_secret_key',
      token: 'jwt.token.here',
      password: 'treasury-password',
      credit_card: '4111222233334444',
      cvv: '123',
    };

    const { sanitized, redactedFields } = redactSensitiveData(sensitiveData);

    expect(sanitized.account_name).toBe('Corp Treasury');
    expect(sanitized.bank_account).toBe('[REDACTED]');
    expect(sanitized.routing_number).toBe('[REDACTED]');
    expect(sanitized.iban).toBe('[REDACTED]');
    expect(sanitized.swift).toBe('[REDACTED]');
    expect(sanitized.api_key).toBe('[REDACTED]');
    expect(sanitized.token).toBe('[REDACTED]');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.credit_card).toBe('[REDACTED]');
    expect(sanitized.cvv).toBe('[REDACTED]');

    expect(redactedFields).toEqual(
      expect.arrayContaining([
        'bank_account',
        'routing_number',
        'iban',
        'swift',
        'api_key',
        'token',
        'password',
        'credit_card',
        'cvv',
      ]),
    );
  });
});
