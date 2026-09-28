import { describe, it, expect } from 'vitest';
import {
  generateEntityCsvTemplate,
  validateMasterDataImport,
} from './templates.js';

describe('Master Data Templates and Ingestion Validator', () => {
  it('generates standard RFC 4180 CSV template for customers', () => {
    const csv = generateEntityCsvTemplate('customers');
    expect(csv).toContain('# Template for Customer Directory Master');
    expect(csv).toContain('Customer_Code,Company_Name,Billing_Email');
    expect(csv).toContain('CUST-1001,Apex Global Logistics Inc');
  });

  it('generates standard CSV template for chart of accounts', () => {
    const csv = generateEntityCsvTemplate('accounts');
    expect(csv).toContain('Account_Code,Account_Title,Account_Class,Normal_Balance,Status');
    expect(csv).toContain('1010,Operating Cash Account,ASSET,DEBIT,ACTIVE');
  });

  it('throws for unsupported entityKey template generation', () => {
    expect(() => generateEntityCsvTemplate('non_existent')).toThrow(
      'Unsupported master data entityKey: non_existent',
    );
  });

  it('validates clean import rows successfully', () => {
    const rows = [
      {
        Customer_Code: 'CUST-3001',
        Company_Name: 'Starlight Energy Corp',
        Billing_Email: 'finance@starlight.io',
        Currency: 'USD',
      },
      {
        Customer_Code: 'CUST-3002',
        Company_Name: 'Nordic Robotics AB',
        Billing_Email: 'ar@nordicrobotics.se',
        Currency: 'EUR',
      },
    ];

    const result = validateMasterDataImport('customers', rows);
    expect(result.validCount).toBe(2);
    expect(result.errorCount).toBe(0);
    expect(result.failures.length).toBe(0);
    expect(result.validRecords[0]?.code).toBe('CUST-3001');
    expect(result.validRecords[1]?.code).toBe('CUST-3002');
  });

  it('catches missing required fields, invalid emails, and bad currencies', () => {
    const rows = [
      {
        Customer_Code: 'CUST-4001',
        Company_Name: '', // Missing required
        Billing_Email: 'invalid-email', // Invalid email
        Currency: 'INVALID', // Not 3 letters
      },
      {
        Customer_Code: '', // Missing required
        Company_Name: 'Valid Name',
        Billing_Email: 'valid@example.com',
        Currency: 'USD',
      },
    ];

    const result = validateMasterDataImport('customers', rows);
    expect(result.validCount).toBe(0);
    expect(result.errorCount).toBe(2);
    expect(result.failures[0]?.errors).toContain("Missing required field 'Company_Name'");
    expect(result.failures[0]?.errors).toContain("Invalid email format in 'Billing_Email': invalid-email");
    expect(result.failures[0]?.errors).toContain("Invalid ISO 4217 3-letter currency in 'Currency': INVALID");
    expect(result.failures[1]?.errors).toContain("Missing required field 'Customer_Code'");
  });

  it('flags duplicate codes within the same batch upload', () => {
    const rows = [
      {
        Customer_Code: 'CUST-DUPE',
        Company_Name: 'First Instance',
        Billing_Email: 'first@dupe.com',
        Currency: 'USD',
      },
      {
        Customer_Code: 'CUST-DUPE',
        Company_Name: 'Second Instance',
        Billing_Email: 'second@dupe.com',
        Currency: 'USD',
      },
    ];

    const result = validateMasterDataImport('customers', rows);
    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(result.failures[0]?.errors).toContain('Duplicate code in upload: CUST-DUPE');
  });
});
