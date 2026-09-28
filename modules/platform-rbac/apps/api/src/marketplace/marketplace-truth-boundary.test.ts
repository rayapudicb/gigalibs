import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MarketplaceService } from './marketplace.service.js';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('MarketplaceService Truth-Boundary & Enterprise Ledger (MKT-01 to MKT-04)', () => {
  let dbMock: any;
  let clientMock: any;
  let clientQueries: Array<{ sql: string; params?: any[] }>;
  let service: MarketplaceService;

  beforeEach(() => {
    clientQueries = [];
    clientMock = {
      query: vi.fn(async (sql: string, params?: any[]) => {
        clientQueries.push({ sql, params });
        if (sql.startsWith('INSERT INTO gigalibs_platform.billing_invoices')) {
          return { rows: [{ id: params?.[0] }], rowCount: 1 };
        }
        if (sql.startsWith('INSERT INTO gigalibs_platform.module_purchases')) {
          return { rows: [{ id: params?.[0] }], rowCount: 1 };
        }
        if (sql.startsWith('INSERT INTO gigalibs_platform.ledger_transactions')) {
          return { rows: [{ id: params?.[0] }], rowCount: 1 };
        }
        if (sql.startsWith('CREATE SCHEMA IF NOT EXISTS')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.startsWith('UPDATE gigalibs_platform.platform_tenants')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.startsWith('INSERT INTO gigalibs_platform.platform_audit_events')) {
          return { rows: [{ id: params?.[0] }], rowCount: 1 };
        }
        if (sql.startsWith('UPDATE gigalibs_platform.tenant_credit_wallets')) {
          return {
            rows: [
              {
                id: 'cw-1',
                balance: 150000,
                status: 'ACTIVE',
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };

    dbMock = {
      query: vi.fn(),
      getClient: vi.fn(async () => clientMock),
    };

    service = new MarketplaceService(dbMock);
  });

  it('getCatalog: maps catalog, entitlement status, and consumption metrics', async () => {
    dbMock.query.mockImplementation(async (sql: string) => {
      if (sql.includes('platform_tenants')) {
        return {
          rows: [
            {
              id: 'tenant-123',
              slug: 'novafintech',
              entitled_modules: ['AP', 'SPEND_MANAGEMENT'],
            },
          ],
        };
      }
      if (sql.includes('module_catalog')) {
        return {
          rows: [
            {
              code: 'AP',
              name: 'Accounts Payable',
              category: 'Finance',
              monthly_price_usd: '499.00',
              description: 'AP automation',
              icon: 'credit-card',
              badge: 'CORE',
              capabilities: ['invoices'],
              is_core: true,
            },
            {
              code: 'GEOSPATIAL',
              name: 'Geospatial Studio',
              category: 'Location',
              monthly_price_usd: '299.00',
              description: 'GPS and Geofences',
              icon: 'map-pin',
              badge: null,
              capabilities: ['maps'],
              is_core: false,
            },
          ],
        };
      }
      if (sql.includes('metering_dimensions')) {
        return {
          rows: [
            {
              module_code: 'AP',
              dimension_code: 'ap_inv_scans',
              dimension_name: 'Invoice Scans',
              unit_name: 'scans',
              included_monthly_units: '1000',
              overage_unit_price_usd: '0.10',
              metering_type: 'USAGE',
            },
          ],
        };
      }
      if (sql.includes('tenant_usage_records')) {
        return {
          rows: [
            {
              module_code: 'AP',
              dimension_code: 'ap_inv_scans',
              units_consumed: '450',
              included_units: '1000',
              overage_units: '0',
              overage_cost_usd: '0',
            },
          ],
        };
      }
      return { rows: [] };
    });

    const catalog = await service.getCatalog('novafintech');
    expect(catalog).toHaveLength(2);

    const apMod = catalog.find((m: any) => m.code === 'AP');
    expect(apMod?.isInstalled).toBe(true);
    expect(apMod?.currentUsage?.percentConsumed).toBe(45);
    expect(apMod?.monthlyPriceUsd).toBe(499);

    const geoMod = catalog.find((m: any) => m.code === 'GEOSPATIAL');
    expect(geoMod?.isInstalled).toBe(false);
    expect(geoMod?.monthlyPriceUsd).toBe(299);
  });

  it('purchaseModule: denies purchase if module is already entitled', async () => {
    dbMock.query.mockImplementation(async (sql: string) => {
      if (sql.includes('platform_tenants')) {
        return {
          rows: [
            {
              id: 'tenant-123',
              slug: 'novafintech',
              name: 'Nova FinTech',
              entitled_modules: ['AP'],
              allocated_schemas: ['tenant_novafintech_ap'],
              primary_contact_email: 'cfo@novafintech.com',
            },
          ],
        };
      }
      return { rows: [] };
    });

    await expect(
      service.purchaseModule({
        tenantSlugOrId: 'novafintech',
        moduleCode: 'AP',
        purchasedBy: 'cfo@novafintech.com',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('purchaseModule: creates invoice, purchase, double-entry ledger, and hydrates schema in single transaction', async () => {
    dbMock.query.mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('platform_tenants')) {
        return {
          rows: [
            {
              id: 'tenant-123',
              slug: 'novafintech',
              name: 'Nova FinTech',
              entitled_modules: ['AP'],
              allocated_schemas: ['tenant_novafintech_ap'],
              primary_contact_email: 'cfo@novafintech.com',
            },
          ],
        };
      }
      if (sql.includes('module_catalog')) {
        return {
          rows: [
            {
              code: 'SPEND',
              name: 'Spend Management',
              monthly_price_usd: '750.00',
              category: 'Finance',
            },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await service.purchaseModule({
      tenantSlugOrId: 'novafintech',
      moduleCode: 'SPEND',
      purchasedBy: 'cfo@novafintech.com',
      billingCycle: 'MONTHLY',
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('SETTLED');
    expect(result.moduleCode).toBe('SPEND');
    expect(result.monthlyPriceUsd).toBe(750);
    expect(result.hydratedSchema).toBe('tenant_novafintech_spend');

    const ops = clientQueries.map((q) => q.sql);
    expect(ops[0]).toBe('BEGIN');
    expect(ops.some((q) => q.includes('INSERT INTO gigalibs_platform.billing_invoices'))).toBe(true);
    expect(ops.some((q) => q.includes('INSERT INTO gigalibs_platform.module_purchases'))).toBe(true);
    expect(ops.some((q) => q.includes('INSERT INTO gigalibs_platform.ledger_transactions'))).toBe(true);
    expect(ops.some((q) => q.includes('CREATE SCHEMA IF NOT EXISTS tenant_novafintech_spend'))).toBe(true);
    expect(ops.some((q) => q.includes('UPDATE gigalibs_platform.platform_tenants'))).toBe(true);
    expect(ops.some((q) => q.includes('INSERT INTO gigalibs_platform.platform_audit_events'))).toBe(true);
    expect(ops[ops.length - 1]).toBe('COMMIT');
    expect(clientMock.release).toHaveBeenCalled();
  });

  it('rechargeWallet: creates invoice, ledger transaction, updates wallet balance, and logs audit', async () => {
    dbMock.query.mockImplementation(async (sql: string) => {
      if (sql.includes('platform_tenants')) {
        return {
          rows: [
            {
              id: 'tenant-123',
              slug: 'novafintech',
              name: 'Nova FinTech',
              primary_contact_email: 'cfo@novafintech.com',
            },
          ],
        };
      }
      if (sql.includes('recharge_packs')) {
        return {
          rows: [
            {
              id: 'pack-growth',
              capability_code: 'AI_OCR_CREDITS',
              pack_name: 'Growth Pack (100k)',
              credit_units: 100000,
              price_usd: 750,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await service.rechargeWallet({
      tenantSlugOrId: 'novafintech',
      packId: 'pack-growth',
      rechargedBy: 'treasury@novafintech.com',
    });

    expect(result.success).toBe(true);
    expect(result.creditUnitsAdded).toBe(100000);
    expect(result.newBalance).toBe(150000);
    expect(result.capabilityCode).toBe('AI_OCR_CREDITS');

    const ops = clientQueries.map((q) => q.sql);
    expect(ops[0]).toBe('BEGIN');
    expect(ops.some((q) => q.includes('billing_invoices'))).toBe(true);
    expect(ops.some((q) => q.includes('ledger_transactions'))).toBe(true);
    expect(ops.some((q) => q.includes('tenant_credit_wallets'))).toBe(true);
    expect(ops.some((q) => q.includes('platform_audit_events'))).toBe(true);
    expect(ops[ops.length - 1]).toBe('COMMIT');
    expect(clientMock.release).toHaveBeenCalled();
  });
});
