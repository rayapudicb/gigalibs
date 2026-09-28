import { describe, it, expect } from 'vitest';
import { redactSensitiveData } from './data-redaction.js';

describe('data-redaction (Schema-Aware Sensitive Data Masking)', () => {
  it('returns primitives and null/undefined unchanged', () => {
    expect(redactSensitiveData(null).sanitized).toBeNull();
    expect(redactSensitiveData(undefined).sanitized).toBeUndefined();
    expect(redactSensitiveData(42).sanitized).toBe(42);
    expect(redactSensitiveData('safe string').sanitized).toBe('safe string');
    expect(redactSensitiveData(true).sanitized).toBe(true);
  });

  it('leaves benign payload objects untouched', () => {
    const safeData = {
      contract_id: 'dc-100',
      domain: 'FINANCE',
      version: '1.0.0',
      active: true,
      counts: [1, 2, 3],
    };

    const { sanitized, redactedFields } = redactSensitiveData(safeData);
    expect(sanitized).toEqual(safeData);
    expect(redactedFields).toHaveLength(0);
  });

  it('redacts sensitive keys including passwords, tokens, secrets, and financial identifiers', () => {
    const sensitiveData = {
      username: 'analyst_01',
      password: 'super-secret-password',
      api_token: 'tok_abc123456',
      client_secret: 'sec_xyz789',
      authorization: 'Bearer jwt.token.here',
      credit_card: '4111222233334444',
      cvv: '123',
      iban: 'GB82WEST12345698765432',
      ssn: '000-12-3456',
    };

    const { sanitized, redactedFields } = redactSensitiveData(sensitiveData);

    expect(sanitized.username).toBe('analyst_01');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.api_token).toBe('[REDACTED]');
    expect(sanitized.client_secret).toBe('[REDACTED]');
    expect(sanitized.authorization).toBe('[REDACTED]');
    expect(sanitized.credit_card).toBe('[REDACTED]');
    expect(sanitized.cvv).toBe('[REDACTED]');
    expect(sanitized.iban).toBe('[REDACTED]');
    expect(sanitized.ssn).toBe('[REDACTED]');

    expect(redactedFields).toEqual(
      expect.arrayContaining([
        'password',
        'api_token',
        'client_secret',
        'authorization',
        'credit_card',
        'cvv',
        'iban',
        'ssn',
      ]),
    );
  });

  it('recursively scrubs nested objects and arrays while preserving path tracking', () => {
    const complexData = {
      tenant_id: 'tenant-01',
      config: {
        endpoint: 'https://api.internal.net',
        apiKey: 'key_live_99999',
      },
      audit_records: [
        {
          id: 1,
          meta: {
            auth_token: 'nested-token',
          },
        },
        {
          id: 2,
          notes: 'clear text note',
        },
      ],
    };

    const { sanitized, redactedFields } = redactSensitiveData(complexData);

    expect(sanitized.tenant_id).toBe('tenant-01');
    expect(sanitized.config.endpoint).toBe('https://api.internal.net');
    expect(sanitized.config.apiKey).toBe('[REDACTED]');
    expect(sanitized.audit_records[0].meta.auth_token).toBe('[REDACTED]');
    expect(sanitized.audit_records[1].notes).toBe('clear text note');

    expect(redactedFields).toContain('config.apiKey');
    expect(redactedFields).toContain('audit_records[0].meta.auth_token');
  });
});
