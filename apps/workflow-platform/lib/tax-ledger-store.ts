import { randomUUID } from 'node:crypto';
import type {
  TaxJurisdiction,
  TaxRate,
  ExemptionCertificate,
  TaxLedgerEntry,
  NexusMonitorSummary,
} from './tax-api';

class TaxLedgerStore {
  private jurisdictions: TaxJurisdiction[] = [
    {
      id: 'jur-us-ca',
      tenantId: 'TEN-GIGA-INTERNAL',
      countryCode: 'US',
      jurisdictionCode: 'US-CA',
      jurisdictionName: 'California (State Board of Equalization)',
      taxType: 'SALES_TAX',
      standardRateBasisPoints: 725,
      reducedRateBasisPoints: 0,
      hasPhysicalNexus: true,
      hasEconomicNexus: true,
      economicThresholdRevenueMinor: 50000000,
      economicThresholdTransactions: 200,
      currentPeriodRevenueMinor: 14500000,
      currentPeriodTransactions: 42,
      status: 'ACTIVE',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'jur-us-ny',
      tenantId: 'TEN-GIGA-INTERNAL',
      countryCode: 'US',
      jurisdictionCode: 'US-NY',
      jurisdictionName: 'New York (Department of Taxation & Finance)',
      taxType: 'SALES_TAX',
      standardRateBasisPoints: 800,
      reducedRateBasisPoints: 400,
      hasPhysicalNexus: true,
      hasEconomicNexus: true,
      economicThresholdRevenueMinor: 50000000,
      economicThresholdTransactions: 100,
      currentPeriodRevenueMinor: 38200000,
      currentPeriodTransactions: 88,
      status: 'ACTIVE',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'jur-us-tx',
      tenantId: 'TEN-GIGA-INTERNAL',
      countryCode: 'US',
      jurisdictionCode: 'US-TX',
      jurisdictionName: 'Texas (Comptroller of Public Accounts)',
      taxType: 'SALES_TAX',
      standardRateBasisPoints: 625,
      reducedRateBasisPoints: 0,
      hasPhysicalNexus: false,
      hasEconomicNexus: true,
      economicThresholdRevenueMinor: 50000000,
      economicThresholdTransactions: 0,
      currentPeriodRevenueMinor: 41200000,
      currentPeriodTransactions: 64,
      status: 'ACTIVE',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'jur-us-wa',
      tenantId: 'TEN-GIGA-INTERNAL',
      countryCode: 'US',
      jurisdictionCode: 'US-WA',
      jurisdictionName: 'Washington (Department of Revenue)',
      taxType: 'SALES_TAX',
      standardRateBasisPoints: 650,
      reducedRateBasisPoints: 0,
      hasPhysicalNexus: false,
      hasEconomicNexus: true,
      economicThresholdRevenueMinor: 10000000,
      economicThresholdTransactions: 0,
      currentPeriodRevenueMinor: 8800000,
      currentPeriodTransactions: 19,
      status: 'ACTIVE',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'jur-us-va',
      tenantId: 'TEN-GIGA-INTERNAL',
      countryCode: 'US',
      jurisdictionCode: 'US-VA',
      jurisdictionName: 'Virginia (Department of Taxation)',
      taxType: 'SALES_TAX',
      standardRateBasisPoints: 530,
      reducedRateBasisPoints: 250,
      hasPhysicalNexus: true,
      hasEconomicNexus: true,
      economicThresholdRevenueMinor: 10000000,
      economicThresholdTransactions: 200,
      currentPeriodRevenueMinor: 21000000,
      currentPeriodTransactions: 14,
      status: 'ACTIVE',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  ];

  private rates: TaxRate[] = [
    {
      id: 'rate-ca-saas',
      tenantId: 'TEN-GIGA-INTERNAL',
      jurisdictionId: 'jur-us-ca',
      jurisdictionCode: 'US-CA',
      jurisdictionName: 'California',
      productCategory: 'SAAS_PLATFORM',
      rateBasisPoints: 0,
      isExempt: true,
      effectiveFrom: '2026-01-01',
      createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'rate-ca-services',
      tenantId: 'TEN-GIGA-INTERNAL',
      jurisdictionId: 'jur-us-ca',
      jurisdictionCode: 'US-CA',
      jurisdictionName: 'California',
      productCategory: 'PROFESSIONAL_SERVICES',
      rateBasisPoints: 725,
      isExempt: false,
      effectiveFrom: '2026-01-01',
      createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'rate-ny-saas',
      tenantId: 'TEN-GIGA-INTERNAL',
      jurisdictionId: 'jur-us-ny',
      jurisdictionCode: 'US-NY',
      jurisdictionName: 'New York',
      productCategory: 'SAAS_PLATFORM',
      rateBasisPoints: 800,
      isExempt: false,
      effectiveFrom: '2026-01-01',
      createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'rate-tx-saas',
      tenantId: 'TEN-GIGA-INTERNAL',
      jurisdictionId: 'jur-us-tx',
      jurisdictionCode: 'US-TX',
      jurisdictionName: 'Texas',
      productCategory: 'SAAS_PLATFORM',
      rateBasisPoints: 500, // 80% of 6.25% taxable for data processing in TX
      isExempt: false,
      effectiveFrom: '2026-01-01',
      createdAt: '2026-08-01T00:00:00.000Z',
    },
  ];

  private exemptions: ExemptionCertificate[] = [
    {
      id: 'ex-dod-001',
      tenantId: 'TEN-GIGA-INTERNAL',
      customerId: 'CUST-003',
      customerName: 'CyberTrust Defense Labs',
      certificateNumber: 'FAR-52.229-3-DOD',
      jurisdictionCode: 'US-VA',
      exemptionReason: 'Federal Acquisition Regulation FAR 52.229-3 Direct Defense Prime',
      validFrom: '2026-01-01',
      validUntil: '2027-12-31',
      isVerified: true,
      status: 'ACTIVE',
      createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'ex-resale-002',
      tenantId: 'TEN-GIGA-INTERNAL',
      customerId: 'CUST-002',
      customerName: 'BioGen Systems Inc',
      certificateNumber: 'MA-RESALE-88410',
      jurisdictionCode: 'US-MA',
      exemptionReason: 'Massachusetts Manufacturing & R&D Resale Certificate',
      validFrom: '2026-01-01',
      validUntil: '2026-12-31',
      isVerified: true,
      status: 'ACTIVE',
      createdAt: '2026-08-01T00:00:00.000Z',
    },
  ];

  private ledger: TaxLedgerEntry[] = [
    {
      id: 'tx-led-001',
      tenantId: 'TEN-GIGA-INTERNAL',
      sourceModule: 'ACCOUNTS_RECEIVABLE',
      documentId: 'INV-2026-0001',
      documentReference: 'GL-INV-000001',
      jurisdictionCode: 'US-CA',
      productCategory: 'PROFESSIONAL_SERVICES',
      taxableAmountMinor: 14500000,
      exemptAmountMinor: 0,
      calculatedTaxMinor: 1232500,
      appliedRateBasisPoints: 850,
      idempotencyKey: 'idem-tx-001',
      isExempt: false,
      createdAt: '2026-08-15T09:00:00.000Z',
    },
    {
      id: 'tx-led-002',
      tenantId: 'TEN-GIGA-INTERNAL',
      sourceModule: 'ACCOUNTS_RECEIVABLE',
      documentId: 'INV-2026-0002',
      documentReference: 'GL-INV-000002',
      jurisdictionCode: 'US-MA',
      productCategory: 'PLATFORM_RUN',
      taxableAmountMinor: 8840000,
      exemptAmountMinor: 0,
      calculatedTaxMinor: 552500,
      appliedRateBasisPoints: 625,
      idempotencyKey: 'idem-tx-002',
      isExempt: false,
      createdAt: '2026-08-20T11:15:00.000Z',
    },
    {
      id: 'tx-led-003',
      tenantId: 'TEN-GIGA-INTERNAL',
      sourceModule: 'ACCOUNTS_RECEIVABLE',
      documentId: 'INV-2026-0003',
      documentReference: 'GL-INV-000003',
      jurisdictionCode: 'US-VA',
      productCategory: 'GOV_CLOUD_SECURITY',
      taxableAmountMinor: 0,
      exemptAmountMinor: 21000000,
      calculatedTaxMinor: 0,
      appliedRateBasisPoints: 0,
      exemptionCertificateId: 'ex-dod-001',
      idempotencyKey: 'idem-tx-003',
      isExempt: true,
      createdAt: '2026-09-01T14:30:00.000Z',
    },
  ];

  public getJurisdictions(): TaxJurisdiction[] {
    return [...this.jurisdictions];
  }

  public createJurisdiction(payload: Partial<TaxJurisdiction>): TaxJurisdiction {
    const id = payload.id || `jur-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const item: TaxJurisdiction = {
      id,
      tenantId: 'TEN-GIGA-INTERNAL',
      countryCode: payload.countryCode || 'US',
      jurisdictionCode: payload.jurisdictionCode || 'US-CUSTOM',
      jurisdictionName: payload.jurisdictionName || 'Custom Jurisdiction',
      taxType: payload.taxType || 'SALES_TAX',
      standardRateBasisPoints: payload.standardRateBasisPoints || 500,
      reducedRateBasisPoints: payload.reducedRateBasisPoints || 0,
      hasPhysicalNexus: payload.hasPhysicalNexus || false,
      hasEconomicNexus: payload.hasEconomicNexus || false,
      economicThresholdRevenueMinor: payload.economicThresholdRevenueMinor || 10000000,
      economicThresholdTransactions: payload.economicThresholdTransactions || 200,
      currentPeriodRevenueMinor: 0,
      currentPeriodTransactions: 0,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    this.jurisdictions.unshift(item);
    return item;
  }

  public getRates(): TaxRate[] {
    return [...this.rates];
  }

  public createRate(payload: Partial<TaxRate>): TaxRate {
    const id = payload.id || `rate-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const jur = this.jurisdictions.find((j) => j.id === payload.jurisdictionId || j.jurisdictionCode === payload.jurisdictionCode);
    const item: TaxRate = {
      id,
      tenantId: 'TEN-GIGA-INTERNAL',
      jurisdictionId: payload.jurisdictionId || jur?.id || 'jur-us-ca',
      jurisdictionCode: payload.jurisdictionCode || jur?.jurisdictionCode || 'US-CA',
      jurisdictionName: payload.jurisdictionName || jur?.jurisdictionName || 'California',
      productCategory: payload.productCategory || 'SAAS_PLATFORM',
      rateBasisPoints: payload.rateBasisPoints ?? 725,
      isExempt: Boolean(payload.isExempt),
      effectiveFrom: payload.effectiveFrom || now.slice(0, 10),
      createdAt: now,
    };
    this.rates.unshift(item);
    return item;
  }

  public getExemptions(): ExemptionCertificate[] {
    return [...this.exemptions];
  }

  public createExemption(payload: Partial<ExemptionCertificate>): ExemptionCertificate {
    const id = payload.id || `ex-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const item: ExemptionCertificate = {
      id,
      tenantId: 'TEN-GIGA-INTERNAL',
      customerId: payload.customerId || 'CUST-GENERIC',
      customerName: payload.customerName || 'Enterprise Client',
      certificateNumber: payload.certificateNumber || `EX-${Date.now().toString().slice(-6)}`,
      jurisdictionCode: payload.jurisdictionCode || 'US-FED',
      exemptionReason: payload.exemptionReason || 'Standard Exemption',
      validFrom: payload.validFrom || now.slice(0, 10),
      validUntil: payload.validUntil || '2028-12-31',
      isVerified: true,
      status: 'ACTIVE',
      createdAt: now,
    };
    this.exemptions.unshift(item);
    return item;
  }

  public getLedger(): TaxLedgerEntry[] {
    return [...this.ledger];
  }

  public getNexusStatus(): NexusMonitorSummary[] {
    return this.jurisdictions.map((j) => {
      const revPct = j.economicThresholdRevenueMinor > 0
        ? Math.min(100, Math.round((j.currentPeriodRevenueMinor / j.economicThresholdRevenueMinor) * 100))
        : 0;
      const txPct = j.economicThresholdTransactions > 0
        ? Math.min(100, Math.round((j.currentPeriodTransactions / j.economicThresholdTransactions) * 100))
        : 0;
      const hasNexus = j.hasPhysicalNexus || revPct >= 100 || txPct >= 100;
      let status: 'SAFE' | 'WARNING_75_PERCENT' | 'NEXUS_ESTABLISHED' = 'SAFE';
      if (hasNexus) {
        status = 'NEXUS_ESTABLISHED';
      } else if (revPct >= 75 || txPct >= 75) {
        status = 'WARNING_75_PERCENT';
      }

      return {
        jurisdictionCode: j.jurisdictionCode,
        jurisdictionName: j.jurisdictionName,
        countryCode: j.countryCode,
        currentRevenueMinor: j.currentPeriodRevenueMinor,
        thresholdRevenueMinor: j.economicThresholdRevenueMinor,
        revenuePercent: revPct,
        currentTransactions: j.currentPeriodTransactions,
        thresholdTransactions: j.economicThresholdTransactions,
        transactionPercent: txPct,
        hasNexus,
        status,
      };
    });
  }

  public calculateTax(payload: {
    jurisdictionCode: string;
    productCategory: string;
    amountMinor: number;
    customerId?: string;
  }): {
    jurisdictionCode: string;
    taxableAmountMinor: number;
    exemptAmountMinor: number;
    rateBasisPoints: number;
    calculatedTaxMinor: number;
    isExempt: boolean;
    exemptionReason?: string;
  } {
    const isExemptCust = this.exemptions.some(
      (e) => e.customerId === payload.customerId && e.jurisdictionCode === payload.jurisdictionCode && e.status === 'ACTIVE',
    );

    if (isExemptCust) {
      return {
        jurisdictionCode: payload.jurisdictionCode,
        taxableAmountMinor: 0,
        exemptAmountMinor: payload.amountMinor,
        rateBasisPoints: 0,
        calculatedTaxMinor: 0,
        isExempt: true,
        exemptionReason: 'Active Customer Exemption Certificate On File',
      };
    }

    const matchedRate = this.rates.find(
      (r) => r.jurisdictionCode === payload.jurisdictionCode && r.productCategory === payload.productCategory,
    );

    const jur = this.jurisdictions.find((j) => j.jurisdictionCode === payload.jurisdictionCode);
    const bps = matchedRate?.rateBasisPoints ?? jur?.standardRateBasisPoints ?? 700;
    const taxAmount = Math.round((payload.amountMinor * bps) / 10000);

    return {
      jurisdictionCode: payload.jurisdictionCode,
      taxableAmountMinor: payload.amountMinor,
      exemptAmountMinor: 0,
      rateBasisPoints: bps,
      calculatedTaxMinor: taxAmount,
      isExempt: false,
    };
  }
}

export const taxLedgerStore = new TaxLedgerStore();
