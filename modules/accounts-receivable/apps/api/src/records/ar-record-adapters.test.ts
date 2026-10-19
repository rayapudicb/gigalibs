import { describe, expect, it } from 'vitest';
import {
  windowValuesToCreateCustomerInput,
  windowValuesToCreateDraftInvoiceInput,
} from './ar-record-adapters.js';

describe('windowValuesToCreateDraftInvoiceInput', () => {
  it('builds a one-line draft invoice from window field keys', () => {
    const input = windowValuesToCreateDraftInvoiceInput({
      'customer-id': '323e4567-e89b-12d3-a456-426614174000',
      currency: 'USD',
      'issue-date': '2026-10-01',
      'due-date': '2026-10-31',
      'line-description': 'Consulting',
      'line-quantity': '2',
      'line-unit-amount-minor': 15000,
    });
    expect(input.customerId).toBe('323e4567-e89b-12d3-a456-426614174000');
    expect(input.lines[0]?.description).toBe('Consulting');
    expect(input.lines[0]?.unitAmountMinor).toBe(15000);
  });
});

describe('windowValuesToCreateCustomerInput', () => {
  it('builds customer create input from window field keys', () => {
    const input = windowValuesToCreateCustomerInput({
      'legal-name': 'Acme Billing Co',
      'billing-email': 'ap@acme.example',
      currency: 'EUR',
      'external-reference': 'ACME-001',
    });
    expect(input.legalName).toBe('Acme Billing Co');
    expect(input.currency).toBe('EUR');
    expect(input.externalReference).toBe('ACME-001');
  });
});
