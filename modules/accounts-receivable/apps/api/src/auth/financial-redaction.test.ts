import { describe, expect, it } from 'vitest';
import { redactFinancialFields } from './financial-redaction.js';

describe('financial-redaction', () => {
  it('redacts sensitive payment and credential keys at root and nested levels', () => {
    const input = {
      tenantId: '00000000-0000-0000-0000-000000000001',
      invoiceId: '11111111-1111-4111-8111-111111111111',
      amountMinor: 50000,
      currency: 'USD',
      customer: {
        legalName: 'Acme Corp',
        billingEmail: 'billing@acme.com',
      },
      paymentDetails: {
        credit_card: '4111111111111111',
        cvv: '123',
        cvc: '456',
        card_number: '4242424242424242',
        routing_number: '123456789',
        bank_account: '987654321',
        iban: 'GB29NWBK60161331926819',
        swift: 'NWBKGB2L',
      },
      auth: {
        api_key: 'sk_live_1234567890',
        token: 'eyJh...token',
        secret: 'supersecret',
        password: 'pass',
        authorization: 'Bearer 12345',
      },
    };

    const { sanitized, redactedFields } = redactFinancialFields(input);

    // Assert that sensitive fields are replaced with [REDACTED]
    expect(sanitized.paymentDetails.credit_card).toBe('[REDACTED]');
    expect(sanitized.paymentDetails.cvv).toBe('[REDACTED]');
    expect(sanitized.paymentDetails.cvc).toBe('[REDACTED]');
    expect(sanitized.paymentDetails.card_number).toBe('[REDACTED]');
    expect(sanitized.paymentDetails.routing_number).toBe('[REDACTED]');
    expect(sanitized.paymentDetails.bank_account).toBe('[REDACTED]');
    expect(sanitized.paymentDetails.iban).toBe('[REDACTED]');
    expect(sanitized.paymentDetails.swift).toBe('[REDACTED]');

    expect(sanitized.auth.api_key).toBe('[REDACTED]');
    expect(sanitized.auth.token).toBe('[REDACTED]');
    expect(sanitized.auth.secret).toBe('[REDACTED]');
    expect(sanitized.auth.password).toBe('[REDACTED]');
    expect(sanitized.auth.authorization).toBe('[REDACTED]');

    // Assert that business fields remain untampered
    expect(sanitized.tenantId).toBe(input.tenantId);
    expect(sanitized.invoiceId).toBe(input.invoiceId);
    expect(sanitized.amountMinor).toBe(50000);
    expect(sanitized.currency).toBe('USD');
    expect(sanitized.customer.legalName).toBe('Acme Corp');

    // Assert redacted paths tracked
    expect(redactedFields).toContain('paymentDetails.credit_card');
    expect(redactedFields).toContain('paymentDetails.cvv');
    expect(redactedFields).toContain('auth.api_key');
    expect(redactedFields).toContain('auth.token');
  });

  it('redacts sensitive fields in arrays of objects', () => {
    const input = [
      { id: 1, token: 'secret-token-1', label: 'Item 1' },
      { id: 2, token: 'secret-token-2', label: 'Item 2' },
    ];

    const { sanitized, redactedFields } = redactFinancialFields(input);

    expect(sanitized[0].token).toBe('[REDACTED]');
    expect(sanitized[0].label).toBe('Item 1');
    expect(sanitized[1].token).toBe('[REDACTED]');
    expect(sanitized[1].label).toBe('Item 2');

    expect(redactedFields).toEqual(['[0].token', '[1].token']);
  });

  it('handles null, undefined, and non-object inputs safely', () => {
    expect(redactFinancialFields(null)).toEqual({ sanitized: null, redactedFields: [] });
    expect(redactFinancialFields(undefined)).toEqual({ sanitized: undefined, redactedFields: [] });
    expect(redactFinancialFields('plain-text')).toEqual({ sanitized: 'plain-text', redactedFields: [] });
    expect(redactFinancialFields(12345)).toEqual({ sanitized: 12345, redactedFields: [] });
  });
});
