import { randomUUID } from 'node:crypto';
import {
  MASTER_CUSTOMERS,
  MASTER_VENDORS,
  MASTER_ACCOUNTS,
  MASTER_COST_CENTERS,
  MASTER_SIGNERS,
  MASTER_COUNTRIES,
  MASTER_TAX_JURISDICTIONS,
  MASTER_DATA_CLASSIFICATIONS,
  type MasterCustomer,
  type MasterVendor,
  type MasterAccount,
  type MasterCostCenter,
  type MasterSigner,
  type MasterCountry,
  type MasterTaxJurisdiction,
  type MasterDataClassification,
} from './master-data-catalog';

export type MasterDataScope = 'PLATFORM_GLOBAL' | 'PLATFORM_TEMPLATE' | 'TENANT_LOCAL';
export type MasterDataDomain = 'COUNTERPARTY' | 'FINANCE' | 'ASSETS' | 'GOVERNANCE' | 'REFERENCE';

export interface BaseMasterRecord {
  id: string;
  scope: MasterDataScope;
  domain: MasterDataDomain;
  entityKey:
    | 'customers'
    | 'vendors'
    | 'accounts'
    | 'cost-centers'
    | 'signers'
    | 'currencies'
    | 'payment-terms'
    | 'countries'
    | 'jurisdictions'
    | 'classifications';
  tenantId?: string | null;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface MasterRecordWithPayload<T = Record<string, any>> extends BaseMasterRecord {
  payload: T;
}

class MasterDataStore {
  // Global reference data available to all tenants
  private globalRecords: Map<string, MasterRecordWithPayload> = new Map();
  // Tenant-scoped private records: tenantId -> Map<recordId, MasterRecordWithPayload>
  private tenantRecords: Map<string, Map<string, MasterRecordWithPayload>> = new Map();

  constructor() {
    this.seedPlatformGlobal();
    this.seedDefaultTenantLocal('default');
  }

  private seedPlatformGlobal() {
    // 1. Currencies
    const currencies = [
      { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
      { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
      { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
      { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', decimals: 2 },
      { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0 },
      { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2 },
    ];
    for (const c of currencies) {
      const id = `glob-curr-${c.code.toLowerCase()}`;
      this.globalRecords.set(id, {
        id,
        scope: 'PLATFORM_GLOBAL',
        domain: 'REFERENCE',
        entityKey: 'currencies',
        tenantId: null,
        code: c.code,
        name: c.name,
        status: 'ACTIVE',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        version: 1,
        payload: c,
      });
    }

    // 2. Standard Payment Terms
    const paymentTerms = [
      { code: 'DUE_ON_RECEIPT', name: 'Due Upon Receipt', days: 0 },
      { code: 'NET_15', name: 'Net 15 Days', days: 15 },
      { code: 'NET_30', name: 'Net 30 Days (Standard Enterprise)', days: 30 },
      { code: 'NET_45', name: 'Net 45 Days', days: 45 },
      { code: 'NET_60', name: 'Net 60 Days', days: 60 },
      { code: 'NET_90', name: 'Net 90 Days (Government Defense)', days: 90 },
    ];
    for (const pt of paymentTerms) {
      const id = `glob-pt-${pt.code.toLowerCase()}`;
      this.globalRecords.set(id, {
        id,
        scope: 'PLATFORM_GLOBAL',
        domain: 'REFERENCE',
        entityKey: 'payment-terms',
        tenantId: null,
        code: pt.code,
        name: pt.name,
        status: 'ACTIVE',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        version: 1,
        payload: pt,
      });
    }

    // 3. Standard GAAP Accounts
    for (const acc of MASTER_ACCOUNTS) {
      const id = `glob-acc-${acc.code}`;
      this.globalRecords.set(id, {
        id,
        scope: 'PLATFORM_GLOBAL',
        domain: 'FINANCE',
        entityKey: 'accounts',
        tenantId: null,
        code: acc.code,
        name: acc.title,
        status: 'ACTIVE',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        version: 1,
        payload: acc,
      });
    }

    // 4. Sovereign Nations & Territories (ISO 3166-1)
    for (const c of MASTER_COUNTRIES) {
      const id = `glob-country-${c.code.toLowerCase()}`;
      this.globalRecords.set(id, {
        id,
        scope: 'PLATFORM_GLOBAL',
        domain: 'REFERENCE',
        entityKey: 'countries',
        tenantId: null,
        code: c.code,
        name: c.name,
        status: 'ACTIVE',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        version: 1,
        payload: c,
      });
    }

    // 5. Statutory Tax Jurisdictions & Authorities
    for (const jur of MASTER_TAX_JURISDICTIONS) {
      const id = `glob-jur-${jur.jurisdictionCode.toLowerCase()}`;
      this.globalRecords.set(id, {
        id,
        scope: 'PLATFORM_GLOBAL',
        domain: 'GOVERNANCE',
        entityKey: 'jurisdictions',
        tenantId: null,
        code: jur.jurisdictionCode,
        name: jur.name,
        status: 'ACTIVE',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        version: 1,
        payload: jur,
      });
    }

    // 6. Enterprise Data Classification Policies
    for (const cls of MASTER_DATA_CLASSIFICATIONS) {
      const id = `glob-class-${cls.tier.toLowerCase()}`;
      this.globalRecords.set(id, {
        id,
        scope: 'PLATFORM_GLOBAL',
        domain: 'GOVERNANCE',
        entityKey: 'classifications',
        tenantId: null,
        code: cls.tier,
        name: cls.name,
        status: 'ACTIVE',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        version: 1,
        payload: cls,
      });
    }
  }

  private seedDefaultTenantLocal(tenantId: string) {
    const map = new Map<string, MasterRecordWithPayload>();
    const now = '2026-09-10T00:00:00.000Z';

    // Seed initial tenant-scoped customers
    for (const cust of MASTER_CUSTOMERS) {
      map.set(cust.id, {
        id: cust.id,
        scope: 'TENANT_LOCAL',
        domain: 'COUNTERPARTY',
        entityKey: 'customers',
        tenantId,
        code: cust.code,
        name: cust.name,
        status: cust.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        createdAt: now,
        updatedAt: now,
        version: 1,
        payload: cust,
      });
    }

    // Seed initial tenant-scoped vendors
    for (const vend of MASTER_VENDORS) {
      map.set(vend.id, {
        id: vend.id,
        scope: 'TENANT_LOCAL',
        domain: 'COUNTERPARTY',
        entityKey: 'vendors',
        tenantId,
        code: vend.code,
        name: vend.name,
        status: vend.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        createdAt: now,
        updatedAt: now,
        version: 1,
        payload: vend,
      });
    }

    // Seed initial cost centers
    for (const cc of MASTER_COST_CENTERS) {
      map.set(cc.id, {
        id: cc.id,
        scope: 'TENANT_LOCAL',
        domain: 'FINANCE',
        entityKey: 'cost-centers',
        tenantId,
        code: cc.code,
        name: cc.name,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        version: 1,
        payload: cc,
      });
    }

    // Seed initial signers
    for (const sgn of MASTER_SIGNERS) {
      map.set(sgn.id, {
        id: sgn.id,
        scope: 'TENANT_LOCAL',
        domain: 'GOVERNANCE',
        entityKey: 'signers',
        tenantId,
        code: `SIGN-${sgn.department.toUpperCase()}`,
        name: sgn.name,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        version: 1,
        payload: sgn,
      });
    }

    this.tenantRecords.set(tenantId, map);
  }

  private ensureTenant(tenantId: string): Map<string, MasterRecordWithPayload> {
    if (!this.tenantRecords.has(tenantId)) {
      this.seedDefaultTenantLocal(tenantId);
    }
    return this.tenantRecords.get(tenantId)!;
  }

  /**
   * List records for a tenant.
   * Merges PLATFORM_GLOBAL records with TENANT_LOCAL records.
   * If a tenant creates a local record with the same code as a global record, the tenant's record shadows/overrides it.
   */
  public listRecords(
    tenantId: string,
    filters?: {
      entityKey?: string;
      domain?: MasterDataDomain;
      scope?: MasterDataScope;
    },
  ): MasterRecordWithPayload[] {
    const tenantMap = this.ensureTenant(tenantId);
    const results: MasterRecordWithPayload[] = [];
    const seenCodes = new Set<string>();

    // 1. Tenant-local records take precedence
    for (const record of tenantMap.values()) {
      if (filters?.entityKey && record.entityKey !== filters.entityKey) continue;
      if (filters?.domain && record.domain !== filters.domain) continue;
      if (filters?.scope && record.scope !== filters.scope) continue;
      seenCodes.add(`${record.entityKey}:${record.code}`);
      results.push(record);
    }

    // 2. Platform-global records fill in standard reference data if not overridden
    if (!filters?.scope || filters.scope === 'PLATFORM_GLOBAL') {
      for (const record of this.globalRecords.values()) {
        if (filters?.entityKey && record.entityKey !== filters.entityKey) continue;
        if (filters?.domain && record.domain !== filters.domain) continue;
        const key = `${record.entityKey}:${record.code}`;
        if (!seenCodes.has(key)) {
          results.push(record);
        }
      }
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  public getRecord(tenantId: string, id: string): MasterRecordWithPayload | null {
    const tenantMap = this.ensureTenant(tenantId);
    if (tenantMap.has(id)) return tenantMap.get(id)!;
    if (this.globalRecords.has(id)) return this.globalRecords.get(id)!;
    return null;
  }

  public createRecord(
    tenantId: string,
    input: {
      entityKey: 'customers' | 'vendors' | 'accounts' | 'cost-centers' | 'signers' | 'currencies' | 'payment-terms';
      domain: MasterDataDomain;
      code: string;
      name: string;
      scope?: MasterDataScope;
      payload: Record<string, any>;
    },
    isPlatformAdmin: boolean = false,
  ): MasterRecordWithPayload {
    const scope: MasterDataScope = (input.scope === 'PLATFORM_GLOBAL' && isPlatformAdmin)
      ? 'PLATFORM_GLOBAL'
      : 'TENANT_LOCAL';

    const id = `mdm-${scope === 'PLATFORM_GLOBAL' ? 'glob' : 'ten'}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const record: MasterRecordWithPayload = {
      id,
      scope,
      domain: input.domain,
      entityKey: input.entityKey,
      tenantId: scope === 'PLATFORM_GLOBAL' ? null : tenantId,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      version: 1,
      payload: { ...input.payload, id },
    };

    if (scope === 'PLATFORM_GLOBAL') {
      this.globalRecords.set(id, record);
    } else {
      const tenantMap = this.ensureTenant(tenantId);
      tenantMap.set(id, record);
    }

    return record;
  }

  public updateRecord(
    tenantId: string,
    id: string,
    updates: {
      name?: string;
      status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
      payload?: Record<string, any>;
    },
    isPlatformAdmin: boolean = false,
  ): MasterRecordWithPayload {
    const tenantMap = this.ensureTenant(tenantId);
    let target = tenantMap.get(id);

    if (!target && this.globalRecords.has(id)) {
      if (!isPlatformAdmin) {
        throw new Error('Tenant users cannot directly edit PLATFORM_GLOBAL master data. Use clone/override.');
      }
      target = this.globalRecords.get(id);
    }

    if (!target) {
      throw new Error(`Master data record ${id} not found.`);
    }

    const updated: MasterRecordWithPayload = {
      ...target,
      name: updates.name ?? target.name,
      status: updates.status ?? target.status,
      payload: updates.payload ? { ...target.payload, ...updates.payload } : target.payload,
      updatedAt: new Date().toISOString(),
      version: target.version + 1,
    };

    if (target.scope === 'PLATFORM_GLOBAL') {
      this.globalRecords.set(id, updated);
    } else {
      tenantMap.set(id, updated);
    }

    return updated;
  }
}

export const masterDataStore = new MasterDataStore();
