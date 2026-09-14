import { describe, expect, it } from 'vitest';
import { masterDataStore } from '../lib/master-data-store';

describe('Enterprise Master Data Governance Engine (3-Tier Hierarchy)', () => {
  it('exposes PLATFORM_GLOBAL reference data (currencies, payment terms, GAAP accounts) to all tenants', () => {
    const records = masterDataStore.listRecords('test-tenant-alpha');
    const currencies = records.filter((r) => r.entityKey === 'currencies');
    const paymentTerms = records.filter((r) => r.entityKey === 'payment-terms');
    const accounts = records.filter((r) => r.entityKey === 'accounts');

    expect(currencies.length).toBeGreaterThan(0);
    expect(currencies.some((c) => c.code === 'USD' && c.scope === 'PLATFORM_GLOBAL')).toBe(true);

    expect(paymentTerms.length).toBeGreaterThan(0);
    expect(paymentTerms.some((pt) => pt.code === 'NET_30' && pt.scope === 'PLATFORM_GLOBAL')).toBe(true);

    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts.some((a) => a.code === '1010' && a.scope === 'PLATFORM_GLOBAL')).toBe(true);
  });

  it('isolates TENANT_LOCAL entities between distinct tenants', () => {
    const tenantA = 'tenant-defense-01';
    const tenantB = 'tenant-healthcare-02';

    const customCust = masterDataStore.createRecord(tenantA, {
      entityKey: 'customers',
      domain: 'COUNTERPARTY',
      code: 'CUST-DEF-99',
      name: 'Department of Advanced Defense Projects',
      payload: { industry: 'Defense', securityClearance: 'TOP_SECRET' },
    });

    expect(customCust.scope).toBe('TENANT_LOCAL');
    expect(customCust.tenantId).toBe(tenantA);

    // Tenant A can see their customer
    const tenantARecords = masterDataStore.listRecords(tenantA, { entityKey: 'customers' });
    expect(tenantARecords.some((r) => r.code === 'CUST-DEF-99')).toBe(true);

    // Tenant B cannot see Tenant A's customer
    const tenantBRecords = masterDataStore.listRecords(tenantB, { entityKey: 'customers' });
    expect(tenantBRecords.some((r) => r.code === 'CUST-DEF-99')).toBe(false);
  });

  it('allows tenant-local records to cleanly shadow/override platform defaults for that tenant only', () => {
    const tenantId = 'tenant-overrider';

    // Tenant creates a custom definition of NET_30
    masterDataStore.createRecord(tenantId, {
      entityKey: 'payment-terms',
      domain: 'REFERENCE',
      code: 'NET_30',
      name: 'Net 30 Days From End of Fiscal Quarter',
      payload: { days: 30, fromEOM: true },
    });

    const tenantRecords = masterDataStore.listRecords(tenantId, { entityKey: 'payment-terms' });
    const net30 = tenantRecords.find((r) => r.code === 'NET_30');
    expect(net30).toBeDefined();
    expect(net30?.scope).toBe('TENANT_LOCAL');
    expect(net30?.name).toBe('Net 30 Days From End of Fiscal Quarter');

    // Other tenants still see standard platform global NET_30
    const otherRecords = masterDataStore.listRecords('tenant-standard', { entityKey: 'payment-terms' });
    const standardNet30 = otherRecords.find((r) => r.code === 'NET_30');
    expect(standardNet30).toBeDefined();
    expect(standardNet30?.scope).toBe('PLATFORM_GLOBAL');
    expect(standardNet30?.name).toBe('Net 30 Days (Standard Enterprise)');
  });
});
