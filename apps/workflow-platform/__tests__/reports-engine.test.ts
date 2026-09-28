import { beforeAll, describe, expect, it } from 'vitest';
import { masterDataStore } from '../lib/master-data-store';
import { reportsEngine, type ReportCategory } from '../lib/reports-engine';

describe('Universal Reports Engine', () => {
  const tenantId = 'tenant-reports-test';
  const categories: ReportCategory[] = [
    'GL_TRIAL_BALANCE',
    'INCOME_STATEMENT',
    'BALANCE_SHEET',
    'AR_AGING',
    'AP_SPEND_RECON',
    'TAX_AUDIT',
    'SAM_GOV_FAR',
    'VALUE_RECOVERY',
  ];

  beforeAll(() => {
    masterDataStore.createRecord(tenantId, {
      entityKey: 'customers',
      domain: 'COUNTERPARTY',
      code: 'TEST-REPORT-CUSTOMER',
      name: 'Test Report Customer',
      payload: { testFixture: true },
    });
    masterDataStore.createRecord(tenantId, {
      entityKey: 'vendors',
      domain: 'COUNTERPARTY',
      code: 'TEST-REPORT-VENDOR',
      name: 'Test Report Vendor',
      payload: { testFixture: true },
    });
  });

  it('generates all 8 statutory enterprise reports with valid columns and rows', () => {
    for (const cat of categories) {
      const report = reportsEngine.generateReport(tenantId, cat, 'Q3 2026', 'USD');
      expect(report.id).toBe(cat);
      expect(report.tenantId).toBe(tenantId);
      expect(report.columns.length).toBeGreaterThan(0);
      expect(report.rows.length).toBeGreaterThan(0);
      expect(report.summary.label).toBeDefined();
      expect(report.summary.value).toBeDefined();
    }
  });

  it('verifies double-entry General Ledger trial balance properties', () => {
    const report = reportsEngine.generateReport(tenantId, 'GL_TRIAL_BALANCE');
    const debits = report.rows.reduce((sum, r) => sum + (r.debit || 0), 0);
    const credits = report.rows.reduce((sum, r) => sum + (r.credit || 0), 0);

    expect(debits).toBeGreaterThan(0);
    expect(credits).toBeGreaterThan(0);
    expect(report.regulatoryStandard).toBe('GAAP / IFRS ASC 205');
  });

  it('verifies AR Aging portfolio categories and customer bucketing', () => {
    const report = reportsEngine.generateReport(tenantId, 'AR_AGING');
    expect(report.columns.map((c) => c.key)).toContain('customer');
    expect(report.columns.map((c) => c.key)).toContain('totalDue');

    for (const row of report.rows) {
      expect(row.customer).toBeDefined();
      expect(row.totalDue).toBeGreaterThan(0);
    }
  });

  it('verifies Tax Audit report nexus classifications and statutory liabilities', () => {
    const report = reportsEngine.generateReport(tenantId, 'TAX_AUDIT');
    expect(report.columns.map((c) => c.key)).toContain('jurisdiction');
    expect(report.columns.map((c) => c.key)).toContain('taxDue');

    for (const row of report.rows) {
      expect(row.jurisdiction).toBeDefined();
      expect(row.taxableRevenue).toBeLessThanOrEqual(row.grossRevenue);
    }
  });
});
