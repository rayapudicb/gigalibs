'use client';

import React, { useState, useCallback } from 'react';
import {
  Scale,
  BookOpen,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Building,
  DollarSign,
  Lock,
  RotateCcw,
  ShieldCheck,
  Check,
  X,
  ExternalLink,
  Layers,
  Send,
  FileText,
  BarChart3,
  TrendingUp,
  Landmark,
  Calculator,
  Globe,
  Package,
  PieChart,
} from 'lucide-react';
import type {
  AccountingBookV1,
  AccountV1,
  FiscalPeriodV1,
  JournalV1,
  TrialBalanceReportV1,
  BalanceSheetReportV1,
  IncomeStatementReportV1,
  CompiledDictionaryManifestV1,
  BankAccountV1,
  BankStatementV1,
  BankReconciliationSessionV1,
  FixedAssetV1,
  AssetDepreciationScheduleV1,
  ConsolidationGroupV1,
  ConsolidationEntityV1,
  ConsolidationRunV1,
  ConsolidationEliminationV1,
  CostProfileV1,
  InventoryCostLayerV1,
  LandedCostV1,
  BudgetStructureV1,
  BudgetRevisionV1,
  BudgetLineV1,
  BudgetCommitmentV1,
  BudgetVarianceReportV1,
  PeriodSubledgerLockV1,
  PeriodCloseChecklistV1,
  AccrualAmortizationScheduleV1,
  FinancialForecastLineV1,
  FinancialHealthRatiosV1,
} from '@gigalibs/contracts';
import {
  DictionaryRenderer,
  validateDictionaryRules,
} from '@gigalibs/configuration-react';

type WorkspaceTab =
  | 'overview'
  | 'books'
  | 'coa'
  | 'periods'
  | 'journals'
  | 'treasury'
  | 'reconciliation'
  | 'fixed-assets'
  | 'depreciation'
  | 'consolidation'
  | 'costing'
  | 'budgeting'
  | 'close'
  | 'reports'
  | 'extensions';

const DEFAULT_FINANCE_DICTIONARY_MANIFEST: CompiledDictionaryManifestV1 = {
  manifestVersion: 1,
  packageKey: 'pkg-financial-operations',
  checksum: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  compiledAt: '2026-10-04T00:00:00.000Z',
  entities: [
    {
      entityKey: 'gl-journals',
      moduleKey: 'financial-operations',
      label: 'General Ledger Journals',
      description: 'Immutable double-entry general ledger voucher entries.',
      ownership: 'MODULE_CORE',
      primaryKeyField: 'id',
      isVersioned: true,
      isAuditLogged: true,
      isSoftDeletable: false,
    },
  ],
  fields: [
    {
      fieldKey: 'cost_center_code',
      entityKey: 'gl-journals',
      label: 'Cost Center Dimension',
      description: 'Cost center allocation code for multi-dimensional segment reporting.',
      type: 'TEXT',
      required: false,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      helpText: 'e.g. CC-ENG-101 or CC-FIN-202',
      maskOnDisplay: false,
    },
    {
      fieldKey: 'statutory_reporting_tag',
      entityKey: 'gl-journals',
      label: 'Statutory Tax Reporting Tag',
      description: 'Jurisdictional tax classification tag for fiscal reporting.',
      type: 'TEXT',
      required: false,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      helpText: 'e.g. SEC-10K-OPEX or IFRS-OPEX',
      maskOnDisplay: false,
    },
  ],
  references: [],
  validationRules: [
    {
      ruleKey: 'rule-cost-center-format',
      label: 'Cost Center Code Format',
      errorMessage: 'Cost center code must be configured.',
      severity: 'WARNING',
      condition: {
        operator: 'IS_NOT_NULL',
        field: 'cost_center_code',
      },
    },
  ],
  relationships: [],
  views: [],
  navigation: [],
  actions: [],
  messages: [],
};

function formatMinor(minor: string, currency: string = 'USD'): string {
  const isNeg = minor.startsWith('-');
  const abs = isNeg ? minor.slice(1) : minor;
  const pad = abs.padStart(3, '0');
  const whole = pad.slice(0, -2) || '0';
  const frac = pad.slice(-2);
  const formatted = `${Number(whole).toLocaleString('en-US')}.${frac}`;
  return `${isNeg ? '-' : ''}${currency} ${formatted}`;
}

/** `permissions` are the signed-in user's, for the dictionary renderer (WI-OI-120e). */
export function FinancialOperationsWorkspace({ permissions = [] }: { readonly permissions?: readonly string[] } = {}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');

  // Sample data states for visual inspection
  const [books] = useState<AccountingBookV1[]>([
    {
      id: 'a1000000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      bookCode: 'CORP-US-GAAP',
      bookName: 'Primary US GAAP Commercial Ledger',
      legalEntityPartyId: 'b1000000-0000-4000-a000-000000000001',
      currencyCode: 'USD',
      costingMethod: 'STANDARD',
      isPrimary: true,
      status: 'ACTIVE',
      version: 1,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
  ]);

  const [accounts] = useState<AccountV1[]>([
    {
      id: 'c1000000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      accountCode: '1000',
      accountName: 'Operating Cash & Bank',
      accountClass: 'ASSET',
      accountSubtype: 'BANK',
      normalBalance: 'DEBIT',
      isReconcilable: true,
      isSubledgerControl: false,
      isSystemReserved: true,
      active: true,
      version: 1,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
    {
      id: 'c1000000-0000-4000-a000-000000000002',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      accountCode: '1200',
      accountName: 'Accounts Receivable Control',
      accountClass: 'ASSET',
      accountSubtype: 'ACCOUNTS_RECEIVABLE',
      normalBalance: 'DEBIT',
      isReconcilable: true,
      isSubledgerControl: true,
      isSystemReserved: true,
      active: true,
      version: 1,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
    {
      id: 'c1000000-0000-4000-a000-000000000003',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      accountCode: '2000',
      accountName: 'Accounts Payable Control',
      accountClass: 'LIABILITY',
      accountSubtype: 'ACCOUNTS_PAYABLE',
      normalBalance: 'CREDIT',
      isReconcilable: true,
      isSubledgerControl: true,
      isSystemReserved: true,
      active: true,
      version: 1,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
    {
      id: 'c1000000-0000-4000-a000-000000000004',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      accountCode: '4000',
      accountName: 'Product Commercial Revenue',
      accountClass: 'REVENUE',
      accountSubtype: 'OPERATING_REVENUE',
      normalBalance: 'CREDIT',
      isReconcilable: false,
      isSubledgerControl: false,
      isSystemReserved: false,
      active: true,
      version: 1,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
    {
      id: 'c1000000-0000-4000-a000-000000000005',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      accountCode: '6100',
      accountName: 'Bank Charges & Fees',
      accountClass: 'EXPENSE',
      accountSubtype: 'OPERATING_EXPENSE',
      normalBalance: 'DEBIT',
      isReconcilable: false,
      isSubledgerControl: false,
      isSystemReserved: false,
      active: true,
      version: 1,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
  ]);

  const [periods] = useState<FiscalPeriodV1[]>([
    {
      id: 'p1000000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      fiscalYearId: 'y1000000-0000-4000-a000-000000000001',
      periodNumber: 10,
      periodName: '2026-10 October',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      status: 'OPEN',
      version: 1,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
  ]);

  const [journals] = useState<JournalV1[]>([
    {
      id: 'j1000000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      fiscalPeriodId: 'p1000000-0000-4000-a000-000000000001',
      journalNumber: 'JRN-2026-000001',
      entryType: 'SUBLEDGER_AR',
      postingDate: '2026-10-04',
      description: 'AR Invoice #INV-2026-1001 Commercial Fulfillment Posting',
      sourceDocumentType: 'AR_INVOICE',
      sourceDocumentId: 'inv-1001',
      status: 'POSTED',
      totalDebitMinor: '150000',
      totalCreditMinor: '150000',
      lines: [
        {
          id: 'l1000000-0000-4000-a000-000000000001',
          tenantId: 'tenant-primary',
          journalId: 'j1000000-0000-4000-a000-000000000001',
          lineNumber: 1,
          accountId: 'c1000000-0000-4000-a000-000000000002',
          accountCode: '1200',
          accountName: 'Accounts Receivable Control',
          debitAmountMinor: '150000',
          creditAmountMinor: '0',
          currencyCode: 'USD',
          exchangeRate: '1.000000',
          baseDebitAmountMinor: '150000',
          baseCreditAmountMinor: '0',
          memo: 'AR Customer Receivable',
          createdAt: '2026-10-04T00:00:00Z',
        },
        {
          id: 'l1000000-0000-4000-a000-000000000002',
          tenantId: 'tenant-primary',
          journalId: 'j1000000-0000-4000-a000-000000000001',
          lineNumber: 2,
          accountId: 'c1000000-0000-4000-a000-000000000004',
          accountCode: '4000',
          accountName: 'Product Commercial Revenue',
          debitAmountMinor: '0',
          creditAmountMinor: '150000',
          currencyCode: 'USD',
          exchangeRate: '1.000000',
          baseDebitAmountMinor: '0',
          baseCreditAmountMinor: '150000',
          memo: 'Commercial Revenue Recognized',
          createdAt: '2026-10-04T00:00:00Z',
        },
      ],
      version: 1,
      postedAt: '2026-10-04T00:00:00Z',
      postedBy: 'system-subledger',
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
  ]);

  // Treasury & Banking State (Phase 9 WI-OI-095)
  const [bankAccounts] = useState<BankAccountV1[]>([
    {
      id: 'b1000000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      accountName: 'JPMorgan Commercial Treasury Operating',
      accountNumber: '****9921',
      routingCode: '021000021',
      iban: 'US33JPMC02100002100009921',
      swiftBic: 'CHASUS33',
      currencyCode: 'USD',
      glCashAccountId: 'c1000000-0000-4000-a000-000000000001',
      currentClearedBalanceMinor: '15000000',
      status: 'ACTIVE',
      version: 1,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
    {
      id: 'b1000000-0000-4000-a000-000000000002',
      tenantId: 'tenant-primary',
      accountName: 'Deutsche Bank EUR Clearing Account',
      accountNumber: '****4410',
      iban: 'DE89370400440532013000',
      swiftBic: 'DEUTDEDD',
      currencyCode: 'EUR',
      glCashAccountId: 'c1000000-0000-4000-a000-000000000001',
      currentClearedBalanceMinor: '8500000',
      status: 'ACTIVE',
      version: 1,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
  ]);

  const [statements] = useState<BankStatementV1[]>([
    {
      id: 's1000000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      bankAccountId: 'b1000000-0000-4000-a000-000000000001',
      statementNumber: 'STMT-2026-10-001',
      statementDate: '2026-10-04',
      openingBalanceMinor: '10000000',
      closingBalanceMinor: '15000000',
      format: 'CAMT053',
      sourceChecksum: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
      status: 'IMPORTED',
      lineCount: 4,
      version: 1,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
  ]);

  const [reconciliationSession] = useState<BankReconciliationSessionV1>({
    id: 'r1000000-0000-4000-a000-000000000001',
    tenantId: 'tenant-primary',
    bankAccountId: 'b1000000-0000-4000-a000-000000000001',
    statementId: 's1000000-0000-4000-a000-000000000001',
    reconciliationDate: '2026-10-04',
    statementEndingBalanceMinor: '15000000',
    clearedBookBalanceMinor: '15000000',
    unreconciledDifferenceMinor: '0',
    status: 'SEALED',
    sealHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    sealedAt: '2026-10-04T00:00:00Z',
    sealedBy: 'chief-accountant',
    version: 1,
    createdAt: '2026-10-04T00:00:00Z',
    updatedAt: '2026-10-04T00:00:00Z',
  });

  const [fixedAssets] = useState<FixedAssetV1[]>([
    {
      id: 'fa100000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      assetCode: 'ASSET-CNC-001',
      assetName: '5-Axis CNC Milling Center',
      description: 'Precision machining center connected to EAM Operations Console',
      assetClassId: 'fc100000-0000-4000-a000-000000000001',
      status: 'CAPITALIZED',
      acquisitionDate: '2026-01-15',
      capitalizationDate: '2026-01-15',
      currencyCode: 'USD',
      acquisitionCostMinor: '12000000',
      salvageValueMinor: '1200000',
      usefulLifeMonths: 60,
      depreciationMethod: 'STRAIGHT_LINE',
      convention: 'FULL_MONTH',
      currentBookValueMinor: '10560000',
      accumulatedDepreciationMinor: '1440000',
      physicalAssetRef: 'pa100000-0000-4000-a000-000000000001',
      assetTag: 'TAG-CNC-001',
      serialNumber: 'SN-HAAS-9921',
      orgUnitId: 'PLANT-NORTH',
      placeId: 'FACILITY-MAIN',
      custodianPartyId: null,
      version: 1,
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
      createdBy: 'controller',
      updatedBy: null,
    },
    {
      id: 'fa100000-0000-4000-a000-000000000002',
      tenantId: 'tenant-primary',
      assetCode: 'ASSET-BLD-001',
      assetName: 'Headquarters Facility',
      description: 'Corporate headquarters and central engineering laboratory',
      assetClassId: 'fc100000-0000-4000-a000-000000000002',
      status: 'DEPRECIATING',
      acquisitionDate: '2025-01-01',
      capitalizationDate: '2025-01-01',
      currencyCode: 'USD',
      acquisitionCostMinor: '150000000',
      salvageValueMinor: '30000000',
      usefulLifeMonths: 360,
      depreciationMethod: 'STRAIGHT_LINE',
      convention: 'FULL_MONTH',
      currentBookValueMinor: '143000000',
      accumulatedDepreciationMinor: '7000000',
      physicalAssetRef: null,
      assetTag: 'TAG-HQ-01',
      serialNumber: null,
      orgUnitId: 'CORP-HQ',
      placeId: 'HQ-CAMPUS',
      custodianPartyId: null,
      version: 2,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
      createdBy: 'controller',
      updatedBy: null,
    },
  ]);

  const [depreciationSchedules] = useState<AssetDepreciationScheduleV1[]>([
    {
      id: 'ds100000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      assetId: 'fa100000-0000-4000-a000-000000000001',
      fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
      periodNumber: 10,
      scheduleDate: '2026-10-31',
      depreciationAmountMinor: '180000',
      accumulatedDepreciationMinor: '1620000',
      bookValueMinor: '10380000',
      status: 'PROJECTED',
      journalEntryId: null,
      version: 1,
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
    {
      id: 'ds100000-0000-4000-a000-000000000002',
      tenantId: 'tenant-primary',
      assetId: 'fa100000-0000-4000-a000-000000000002',
      fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
      periodNumber: 22,
      scheduleDate: '2026-10-31',
      depreciationAmountMinor: '333333',
      accumulatedDepreciationMinor: '7333333',
      bookValueMinor: '142666667',
      status: 'PROJECTED',
      journalEntryId: null,
      version: 1,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
  ]);

  const [consolidationGroups] = useState<ConsolidationGroupV1[]>([
    {
      id: 'cg100000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      code: 'GRP-GLOBAL',
      name: 'Global Consolidated Holding Group',
      description: 'Multi-entity corporate consolidation group under IFRS 10 / ASC 810',
      reportingCurrency: 'USD',
      parentEntityId: 'b1000000-0000-4000-a000-000000000001',
      ctaGlAccountId: 'a1000000-0000-4000-a000-000000000005',
      nciGlAccountId: null,
      isActive: true,
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
      createdBy: 'group-controller',
      updatedBy: null,
    },
  ]);

  const [consolidationEntities] = useState<ConsolidationEntityV1[]>([
    {
      id: 'ce100000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      consolidationGroupId: 'cg100000-0000-4000-a000-000000000001',
      bookId: 'b1000000-0000-4000-a000-000000000001',
      ownershipPercentage: 100,
      consolidationMethod: 'FULL',
      isParent: true,
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
    {
      id: 'ce100000-0000-4000-a000-000000000002',
      tenantId: 'tenant-primary',
      consolidationGroupId: 'cg100000-0000-4000-a000-000000000001',
      bookId: 'b2000000-0000-4000-a000-000000000002',
      ownershipPercentage: 100,
      consolidationMethod: 'FULL',
      isParent: false,
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
  ]);

  const [consolidationRuns] = useState<ConsolidationRunV1[]>([
    {
      id: 'cr100000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      consolidationGroupId: 'cg100000-0000-4000-a000-000000000001',
      runNumber: 'CRUN-2026-M10-001',
      fiscalYearId: 'fy100000-0000-4000-a000-000000000001',
      fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
      status: 'ELIMINATED',
      totalSubsidiaryDebitMinor: '185000000',
      totalSubsidiaryCreditMinor: '185000000',
      totalEliminationDebitMinor: '15000000',
      totalEliminationCreditMinor: '15000000',
      totalCtaMinor: '250000',
      totalConsolidatedDebitMinor: '170000000',
      totalConsolidatedCreditMinor: '170000000',
      executedBy: 'group-controller',
      executedAt: '2026-10-04T12:00:00Z',
      sealedAt: null,
      version: 1,
      createdAt: '2026-10-04T12:00:00Z',
      updatedAt: '2026-10-04T12:00:00Z',
    },
  ]);

  const [consolidationEliminations] = useState<ConsolidationEliminationV1[]>([
    {
      id: 'el100000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      consolidationRunId: 'cr100000-0000-4000-a000-000000000001',
      intercompanyPairId: 'ip100000-0000-4000-a000-000000000001',
      glJournalId: 'j1000000-0000-4000-a000-000000000001',
      debitGlAccountId: 'a4000000-0000-4000-a000-000000000004',
      creditGlAccountId: 'a2000000-0000-4000-a000-000000000002',
      eliminationAmountMinor: '15000000',
      currencyCode: 'USD',
      discrepancyAmountMinor: '0',
      description: 'Bilateral elimination for intercompany trade accounts between US Parent and UK Subsidiary',
      createdAt: '2026-10-04T12:00:00Z',
    },
  ]);

  const [costProfiles] = useState<CostProfileV1[]>([
    {
      id: 'cp100000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      code: 'FIFO-STANDARD',
      name: 'Perpetual FIFO Costing Profile',
      description: 'First-in first-out perpetual inventory valuation model',
      costingMethod: 'FIFO',
      inventoryGlAccountId: 'a1000000-0000-4000-a000-000000000001',
      grniGlAccountId: 'a2000000-0000-4000-a000-000000000001',
      cogsGlAccountId: 'a5000000-0000-4000-a000-000000000001',
      landedCostClearingGlAccountId: 'a2000000-0000-4000-a000-000000000002',
      purchasePriceVarianceGlAccountId: 'a5000000-0000-4000-a000-000000000002',
      scrapGlAccountId: 'a6000000-0000-4000-a000-000000000001',
      valuationLossGlAccountId: 'a6000000-0000-4000-a000-000000000002',
      standardUnitCostScaled: null,
      isDefault: true,
      isActive: true,
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
  ]);

  const [costLayers] = useState<InventoryCostLayerV1[]>([
    {
      id: 'cl100000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      costProfileId: 'cp100000-0000-4000-a000-000000000001',
      productId: 'p1000000-0000-4000-a000-000000000001',
      warehouseId: 'WH-MAIN',
      receiptRef: 'REC-PO-2026-001',
      receiptDate: '2026-10-01T08:00:00Z',
      initialQuantity: '500.000000',
      remainingQuantity: '350.000000',
      unitCostScaled: '25000000',
      totalInitialCostMinor: '1250000',
      totalRemainingCostMinor: '875000',
      landedCostAddedMinor: '50000',
      status: 'PARTIALLY_CONSUMED',
      createdAt: '2026-10-01T08:00:00Z',
      updatedAt: '2026-10-04T12:00:00Z',
    },
    {
      id: 'cl100000-0000-4000-a000-000000000002',
      tenantId: 'tenant-primary',
      costProfileId: 'cp100000-0000-4000-a000-000000000001',
      productId: 'p1000000-0000-4000-a000-000000000001',
      warehouseId: 'WH-MAIN',
      receiptRef: 'REC-PO-2026-002',
      receiptDate: '2026-10-03T09:00:00Z',
      initialQuantity: '300.000000',
      remainingQuantity: '300.000000',
      unitCostScaled: '28000000',
      totalInitialCostMinor: '840000',
      totalRemainingCostMinor: '840000',
      landedCostAddedMinor: '0',
      status: 'ACTIVE',
      createdAt: '2026-10-03T09:00:00Z',
      updatedAt: '2026-10-03T09:00:00Z',
    },
  ]);

  const [landedCostVouchers] = useState<LandedCostV1[]>([
    {
      id: 'lc100000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      voucherNumber: 'LCV-2026-10-001',
      description: 'Inbound ocean freight and customs brokerage',
      allocationBasis: 'VALUE',
      totalLandedCostMinor: '50000',
      currencyCode: 'USD',
      status: 'POSTED',
      glJournalId: 'j1000000-0000-4000-a000-000000000001',
      postedAt: '2026-10-02T10:00:00Z',
      createdAt: '2026-10-02T10:00:00Z',
      updatedAt: '2026-10-02T10:00:00Z',
    },
  ]);

  const [budgetStructures] = useState<BudgetStructureV1[]>([
    {
      id: 'bs100000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      code: 'OPEX-2026',
      name: 'FY2026 Operating Expense Budget',
      description: 'Corporate operating expenditure allocation with fail-closed spend control',
      budgetType: 'OPERATING_OPEX',
      accountingBookId: 'b1000000-0000-4000-a000-000000000001',
      controlAction: 'HARD_STOP',
      allowOverspendThresholdPct: 5,
      isActive: true,
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
      createdBy: 'finance-director',
      updatedBy: null,
    },
  ]);

  const [budgetRevisions] = useState<BudgetRevisionV1[]>([
    {
      id: 'br100000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      budgetStructureId: 'bs100000-0000-4000-a000-000000000001',
      revisionNumber: 1,
      fiscalYearId: 'fy100000-0000-4000-a000-000000000001',
      status: 'ACTIVE',
      totalAllocatedMinor: '120000000',
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      notes: 'Initial approved operational plan with 100% cent conservation across 12 periods',
      submittedAt: '2026-01-05T09:00:00Z',
      submittedBy: 'budget-planner',
      approvedAt: '2026-01-06T14:30:00Z',
      approvedBy: 'cfo-approver',
      activatedAt: '2026-01-07T08:00:00Z',
      activatedBy: 'finance-controller',
      version: 1,
      createdAt: '2026-01-05T09:00:00Z',
      updatedAt: '2026-01-07T08:00:00Z',
    },
  ]);

  const [budgetLines] = useState<BudgetLineV1[]>([
    {
      id: 'bl100000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      budgetRevisionId: 'br100000-0000-4000-a000-000000000001',
      fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
      accountId: 'a5000000-0000-4000-a000-000000000001',
      costCenterId: 'CC-ENG-101',
      projectCode: 'PRJ-INFRA-REFACTOR',
      allocatedAmountMinor: '10000000',
      revisedAmountMinor: null,
      createdAt: '2026-01-05T09:00:00Z',
      updatedAt: '2026-01-05T09:00:00Z',
    },
    {
      id: 'bl100000-0000-4000-a000-000000000002',
      tenantId: 'tenant-primary',
      budgetRevisionId: 'br100000-0000-4000-a000-000000000001',
      fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
      accountId: 'a6000000-0000-4000-a000-000000000001',
      costCenterId: 'CC-MKT-201',
      projectCode: null,
      allocatedAmountMinor: '5000000',
      revisedAmountMinor: null,
      createdAt: '2026-01-05T09:00:00Z',
      updatedAt: '2026-01-05T09:00:00Z',
    },
  ]);

  const [budgetCommitments] = useState<BudgetCommitmentV1[]>([
    {
      id: 'bc100000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      budgetLineId: 'bl100000-0000-4000-a000-000000000001',
      sourceDocumentType: 'PURCHASE_ORDER',
      sourceDocumentId: 'po-2026-0042',
      documentNumber: 'PO-2026-0042',
      commitmentType: 'ENCUMBRANCE',
      amountMinor: '2500000',
      status: 'ACTIVE',
      createdAt: '2026-01-10T10:00:00Z',
      updatedAt: '2026-01-10T10:00:00Z',
    },
    {
      id: 'bc100000-0000-4000-a000-000000000002',
      tenantId: 'tenant-primary',
      budgetLineId: 'bl100000-0000-4000-a000-000000000001',
      sourceDocumentType: 'AP_BILL',
      sourceDocumentId: 'bill-2026-0118',
      documentNumber: 'BILL-PO-2026-0042',
      commitmentType: 'ACTUAL_CONSUMPTION',
      amountMinor: '4500000',
      status: 'LIQUIDATED',
      createdAt: '2026-01-15T16:00:00Z',
      updatedAt: '2026-01-15T16:00:00Z',
    },
  ]);

  const [periodSubledgerLocks] = useState<PeriodSubledgerLockV1[]>([
    {
      id: 'pl100000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
      subledgerType: 'AP',
      lockStatus: 'HARD_LOCKED',
      lockedAt: '2026-10-04T18:00:00Z',
      lockedBy: 'cfo-lead',
      unlockedAt: null,
      unlockedBy: null,
      notes: 'Vendor bill cutoff complete',
      version: 1,
      createdAt: '2026-10-04T18:00:00Z',
      updatedAt: '2026-10-04T18:00:00Z',
    },
    {
      id: 'pl100000-0000-4000-a000-000000000002',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
      subledgerType: 'AR',
      lockStatus: 'HARD_LOCKED',
      lockedAt: '2026-10-04T18:15:00Z',
      lockedBy: 'cfo-lead',
      unlockedAt: null,
      unlockedBy: null,
      notes: 'Sales billing batch finalized',
      version: 1,
      createdAt: '2026-10-04T18:15:00Z',
      updatedAt: '2026-10-04T18:15:00Z',
    },
    {
      id: 'pl100000-0000-4000-a000-000000000003',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
      subledgerType: 'INVENTORY',
      lockStatus: 'HARD_LOCKED',
      lockedAt: '2026-10-04T18:30:00Z',
      lockedBy: 'inventory-lead',
      unlockedAt: null,
      unlockedBy: null,
      notes: 'Physical counts & landed cost capitalized',
      version: 1,
      createdAt: '2026-10-04T18:30:00Z',
      updatedAt: '2026-10-04T18:30:00Z',
    },
    {
      id: 'pl100000-0000-4000-a000-000000000004',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
      subledgerType: 'FIXED_ASSETS',
      lockStatus: 'SOFT_LOCKED',
      lockedAt: '2026-10-04T18:45:00Z',
      lockedBy: 'asset-lead',
      unlockedAt: null,
      unlockedBy: null,
      notes: 'Monthly depreciation posted; review in progress',
      version: 1,
      createdAt: '2026-10-04T18:45:00Z',
      updatedAt: '2026-10-04T18:45:00Z',
    },
    {
      id: 'pl100000-0000-4000-a000-000000000005',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
      subledgerType: 'TREASURY',
      lockStatus: 'OPEN',
      lockedAt: null,
      lockedBy: null,
      unlockedAt: null,
      unlockedBy: null,
      notes: 'Bank reconciliation pending final fee matching',
      version: 1,
      createdAt: '2026-10-04T19:00:00Z',
      updatedAt: '2026-10-04T19:00:00Z',
    },
    {
      id: 'pl100000-0000-4000-a000-000000000006',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
      subledgerType: 'GL',
      lockStatus: 'OPEN',
      lockedAt: null,
      lockedBy: null,
      unlockedAt: null,
      unlockedBy: null,
      notes: 'Awaiting completion of subledger checklists',
      version: 1,
      createdAt: '2026-10-04T19:00:00Z',
      updatedAt: '2026-10-04T19:00:00Z',
    },
  ]);

  const [periodChecklists] = useState<PeriodCloseChecklistV1[]>([
    {
      id: 'ck100000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
      taskType: 'BANK_RECONCILIATION',
      taskName: 'Reconcile all Bank & Treasury Accounts',
      taskStatus: 'COMPLETED',
      sequenceOrder: 1,
      dependsOnTaskType: null,
      completedAt: '2026-10-04T17:30:00Z',
      completedBy: 'treasury-lead',
      notes: 'All 3 bank accounts reconciled with 0 unverified diff',
      evidenceRef: 'REC-2026-M10-001',
      version: 1,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T17:30:00Z',
    },
    {
      id: 'ck100000-0000-4000-a000-000000000002',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
      taskType: 'INVENTORY_VALUATION',
      taskName: 'Finalize Inventory Costing & Landed Cost',
      taskStatus: 'COMPLETED',
      sequenceOrder: 2,
      dependsOnTaskType: null,
      completedAt: '2026-10-04T18:00:00Z',
      completedBy: 'cost-accountant',
      notes: 'FIFO depletion layers closed, landed costs absorbed',
      evidenceRef: 'LCV-2026-10-001',
      version: 1,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T18:00:00Z',
    },
    {
      id: 'ck100000-0000-4000-a000-000000000003',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
      taskType: 'DEPRECIATION_RUN',
      taskName: 'Execute Fixed Asset Depreciation Run',
      taskStatus: 'COMPLETED',
      sequenceOrder: 3,
      dependsOnTaskType: null,
      completedAt: '2026-10-04T18:20:00Z',
      completedBy: 'fixed-assets-lead',
      notes: 'Monthly depreciation batch posted to GL',
      evidenceRef: 'DEP-RUN-2026-M10',
      version: 1,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T18:20:00Z',
    },
    {
      id: 'ck100000-0000-4000-a000-000000000004',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
      taskType: 'ACCRUAL_AMORTIZATION',
      taskName: 'Post Recurring Accruals & Deferrals',
      taskStatus: 'COMPLETED',
      sequenceOrder: 4,
      dependsOnTaskType: null,
      completedAt: '2026-10-04T18:35:00Z',
      completedBy: 'staff-accountant',
      notes: '12 amortization schedule vouchers posted with cent conservation',
      evidenceRef: 'SCH-PRE-0001',
      version: 1,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T18:35:00Z',
    },
    {
      id: 'ck100000-0000-4000-a000-000000000005',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
      taskType: 'INTERCOMPANY_ELIMINATION',
      taskName: 'Match & Eliminate Intercompany Balances',
      taskStatus: 'IN_PROGRESS',
      sequenceOrder: 5,
      dependsOnTaskType: null,
      completedAt: null,
      completedBy: null,
      notes: 'Bilateral pair verification in progress',
      evidenceRef: null,
      version: 1,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
    {
      id: 'ck100000-0000-4000-a000-000000000006',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
      taskType: 'TRIAL_BALANCE_VERIFICATION',
      taskName: 'Verify Balanced Trial Balance',
      taskStatus: 'PENDING',
      sequenceOrder: 6,
      dependsOnTaskType: 'INTERCOMPANY_ELIMINATION',
      completedAt: null,
      completedBy: null,
      notes: 'Awaiting intercompany completion',
      evidenceRef: null,
      version: 1,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
    {
      id: 'ck100000-0000-4000-a000-000000000007',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
      taskType: 'MAKER_CHECKER_APPROVAL',
      taskName: 'Controller & CFO Close Sign-off',
      taskStatus: 'PENDING',
      sequenceOrder: 7,
      dependsOnTaskType: 'TRIAL_BALANCE_VERIFICATION',
      completedAt: null,
      completedBy: null,
      notes: 'Final sign-off by CFO',
      evidenceRef: null,
      version: 1,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
  ]);

  const [amortizationSchedules] = useState<AccrualAmortizationScheduleV1[]>([
    {
      id: 'as100000-0000-4000-a000-000000000001',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      scheduleNumber: 'SCH-PRE-0001',
      scheduleName: 'Annual Corporate Property Insurance',
      amortizationType: 'PREPAYMENT_AMORTIZATION',
      sourceDocumentType: 'AP_BILL',
      sourceDocumentRef: 'BILL-INS-2026',
      totalAmountMinor: '12000000',
      recognizedAmountMinor: '3000000',
      remainingAmountMinor: '9000000',
      currencyCode: 'USD',
      expenseAccountId: 'c1000000-0000-4000-a000-000000000003',
      balanceSheetAccountId: 'c1000000-0000-4000-a000-000000000001',
      startPeriodId: 'f1000000-0000-4000-a000-000000000001',
      endPeriodId: null,
      periodsCount: 12,
      status: 'ACTIVE',
      autoReversal: false,
      notes: 'Monthly straight-line recognition $10,000.00',
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
    {
      id: 'as100000-0000-4000-a000-000000000002',
      tenantId: 'tenant-primary',
      accountingBookId: 'a1000000-0000-4000-a000-000000000001',
      scheduleNumber: 'SCH-DEF-0002',
      scheduleName: 'Multi-Year Enterprise SaaS Contract (ASC 606)',
      amortizationType: 'DEFERRED_REVENUE_AMORTIZATION',
      sourceDocumentType: 'AR_INVOICE',
      sourceDocumentRef: 'INV-2026-9002',
      totalAmountMinor: '4800000',
      recognizedAmountMinor: '1600000',
      remainingAmountMinor: '3200000',
      currencyCode: 'USD',
      expenseAccountId: 'c1000000-0000-4000-a000-000000000004',
      balanceSheetAccountId: 'c1000000-0000-4000-a000-000000000002',
      startPeriodId: 'f1000000-0000-4000-a000-000000000001',
      endPeriodId: null,
      periodsCount: 12,
      status: 'ACTIVE',
      autoReversal: false,
      notes: 'ASC 606 ratable performance recognition $4,000.00/mo',
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    },
  ]);

  const [healthRatios] = useState<FinancialHealthRatiosV1>({
    tenantId: 'tenant-primary',
    accountingBookId: 'a1000000-0000-4000-a000-000000000001',
    fiscalPeriodId: 'f1000000-0000-4000-a000-000000000001',
    currentRatio: '2.45',
    quickRatio: '1.80',
    workingCapitalMinor: '145000000',
    debtToEquityRatio: '0.65',
    operatingMarginBps: 2250,
    computedAt: '2026-10-04T19:30:00Z',
  });

  const [customExtensions, setCustomExtensions] = useState<Record<string, unknown>>({
    cost_center_code: 'CC-ENG-101',
    statutory_reporting_tag: 'SEC-10K-OPEX',
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [validationResult, setValidationResult] = useState<string | null>(null);

  const handleCustomFieldChange = useCallback((nextValues: Record<string, unknown>) => {
    setCustomExtensions(nextValues);
    const errs = validateDictionaryRules(DEFAULT_FINANCE_DICTIONARY_MANIFEST.validationRules, nextValues);
    setValidationErrors(errs);
  }, []);

  const handleTestRule = useCallback(() => {
    const errs = validateDictionaryRules(DEFAULT_FINANCE_DICTIONARY_MANIFEST.validationRules, customExtensions);
    setValidationErrors(errs);
    setValidationResult(
      Object.keys(errs).length === 0
        ? 'VALID: All Application Dictionary dimension rules satisfied'
        : `INVALID: ${Object.values(errs).join(', ')}`,
    );
  }, [customExtensions]);

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Financial Operations & General Ledger
            </h1>
            <p className="text-xs text-slate-500">
              Multi-Book General Ledger, Treasury Cash Management, Automated Bank Reconciliation (WI-OI-095)
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
            Double-Entry Balanced (100%)
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
            <Building className="w-3.5 h-3.5 mr-1" />
            Treasury Reconciled
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
            <Landmark className="w-3.5 h-3.5 mr-1" />
            Fixed Assets Active
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
            <Globe className="w-3.5 h-3.5 mr-1" />
            Consolidation Active
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            <Package className="w-3.5 h-3.5 mr-1" />
            Costing & Landed Cost Active
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
            <PieChart className="w-3.5 h-3.5 mr-1" />
            Budget Controls Active
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
            Period Close & Forecasting Active
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Lock className="w-3.5 h-3.5 mr-1" />
            Immutable Facts
          </span>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex space-x-1 px-6 bg-white border-b border-slate-200">
        {(
          [
            ['overview', 'Overview', Scale],
            ['books', 'Accounting Books', BookOpen],
            ['coa', 'Chart of Accounts', Layers],
            ['periods', 'Fiscal Periods', Calendar],
            ['journals', 'GL Journals', FileText],
            ['treasury', 'Treasury & Accounts', Building],
            ['reconciliation', 'Reconciliation Studio', RefreshCw],
            ['fixed-assets', 'Fixed Assets', Landmark],
            ['depreciation', 'Depreciation Studio', Calculator],
            ['consolidation', 'Consolidation Studio', Globe],
            ['costing', 'Costing & Landed Cost', Package],
            ['budgeting', 'Budgeting & Planning', PieChart],
            ['close', 'Period Close & Forecasting', ShieldCheck],
            ['reports', 'Financial Statements', BarChart3],
            ['extensions', 'Application Dictionary', TrendingUp],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Legal Entity Books</span>
                <p className="mt-1 text-2xl font-bold text-slate-900">{books.length}</p>
                <span className="text-xs text-emerald-600 font-medium">Primary: {books[0]?.bookCode}</span>
              </div>
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Bank Accounts</span>
                <p className="mt-1 text-2xl font-bold text-slate-900">{bankAccounts.length}</p>
                <span className="text-xs text-emerald-600 font-medium">100% Linked to GL Cash</span>
              </div>
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Treasury Book Balance</span>
                <p className="mt-1 text-2xl font-bold text-slate-900">$150,000.00</p>
                <span className="text-xs text-indigo-600 font-medium">Difference: $0.00 (Balanced)</span>
              </div>
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Posted Journal Vouchers</span>
                <p className="mt-1 text-2xl font-bold text-slate-900">{journals.length}</p>
                <span className="text-xs text-indigo-600 font-medium">Invariant: Σ Debits - Σ Credits = 0</span>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-2">
                iDempiere §3.5, Bigcapital & ISO 20022 Enterprise Treasury Foundation
              </h2>
              <p className="text-sm text-slate-600 mb-4">
                Financial Operations enforces absolute double-entry balance, hardware-grade Row-Level Security in
                schema <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">gigalibs_finance</code>,
                zero floating-point arithmetic (all money in integer minor units), electronic statement parsers (CAMT.053, MT940, OFX, CSV),
                automated deterministic reconciliation, and tamper-proof SHA-256 sealed reconciliation vouchers.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'books' && (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-slate-900">Legal Entity Accounting Books</h3>
            </div>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-slate-500">Book Code</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-500">Book Name</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-500">Currency</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-500">Costing Method</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-500">Primary</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {books.map((b) => (
                  <tr key={b.id}>
                    <td className="px-6 py-4 font-mono font-medium text-slate-900">{b.bookCode}</td>
                    <td className="px-6 py-4 text-slate-600">{b.bookName}</td>
                    <td className="px-6 py-4 text-slate-600">{b.currencyCode}</td>
                    <td className="px-6 py-4 text-slate-600">{b.costingMethod}</td>
                    <td className="px-6 py-4 text-slate-600">{b.isPrimary ? 'Yes' : 'No'}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'coa' && (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-slate-900">Hierarchical Chart of Accounts</h3>
            </div>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-slate-500">Code</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-500">Account Name</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-500">Class</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-500">Subtype</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-500">Normal Balance</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-500">Reconcilable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td className="px-6 py-4 font-mono font-semibold text-slate-900">{a.accountCode}</td>
                    <td className="px-6 py-4 text-slate-800">{a.accountName}</td>
                    <td className="px-6 py-4 text-slate-600">{a.accountClass}</td>
                    <td className="px-6 py-4 text-slate-600">{a.accountSubtype}</td>
                    <td className="px-6 py-4 text-slate-600">{a.normalBalance}</td>
                    <td className="px-6 py-4">
                      {a.isReconcilable ? (
                        <span className="inline-flex items-center text-xs font-medium text-emerald-700">
                          <Check className="w-3.5 h-3.5 mr-1" /> Yes
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">No</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'periods' && (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-slate-900">Fiscal Periods & Accounting Controls</h3>
            </div>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-slate-500">#</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-500">Period Name</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-500">Start Date</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-500">End Date</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {periods.map((p) => (
                  <tr key={p.id}>
                    <td className="px-6 py-4 font-mono text-slate-600">{p.periodNumber}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{p.periodName}</td>
                    <td className="px-6 py-4 text-slate-600">{p.startDate}</td>
                    <td className="px-6 py-4 text-slate-600">{p.endDate}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'journals' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-slate-900">General Ledger Journal Vouchers</h3>
            </div>
            {journals.map((j) => (
              <div key={j.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
                  <div className="flex items-center space-x-3">
                    <span className="font-mono font-bold text-slate-900">{j.journalNumber}</span>
                    <span className="text-slate-500">{j.postingDate}</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium">
                      {j.entryType}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                      {j.status}
                    </span>
                  </div>
                </div>
                <div className="px-6 py-3 border-b border-slate-100 text-xs text-slate-700">
                  {j.description}
                </div>
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-50/50">
                    <tr>
                      <th className="px-4 py-2 text-left text-slate-500">Line</th>
                      <th className="px-4 py-2 text-left text-slate-500">Account</th>
                      <th className="px-4 py-2 text-left text-slate-500">Memo</th>
                      <th className="px-4 py-2 text-right text-slate-500">Debit (Minor)</th>
                      <th className="px-4 py-2 text-right text-slate-500">Credit (Minor)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {j.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-4 py-2 text-slate-600">{l.lineNumber}</td>
                        <td className="px-4 py-2 font-mono font-medium text-slate-900">
                          {l.accountCode} - {l.accountName}
                        </td>
                        <td className="px-4 py-2 text-slate-600">{l.memo}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-900">{l.debitAmountMinor}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-900">{l.creditAmountMinor}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold">
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right text-slate-700">Totals:</td>
                      <td className="px-4 py-2 text-right font-mono text-slate-900">{j.totalDebitMinor}</td>
                      <td className="px-4 py-2 text-right font-mono text-slate-900">{j.totalCreditMinor}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'treasury' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Bank Accounts & Treasury Masters</h3>
                  <p className="text-xs text-slate-500">Authoritative bank account balances linked to GL Cash accounts</p>
                </div>
              </div>
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium text-slate-500">Bank Account</th>
                    <th className="px-6 py-3 text-left font-medium text-slate-500">Account # / Routing</th>
                    <th className="px-6 py-3 text-left font-medium text-slate-500">Currency</th>
                    <th className="px-6 py-3 text-left font-medium text-slate-500">GL Cash Account</th>
                    <th className="px-6 py-3 text-right font-medium text-slate-500">Book Balance</th>
                    <th className="px-6 py-3 text-left font-medium text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {bankAccounts.map((b) => (
                    <tr key={b.id}>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{b.accountName}</div>
                        <div className="text-xs text-slate-500 font-mono">IBAN: {b.iban || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-700">
                        {b.accountNumber} {b.routingCode ? `(${b.routingCode})` : ''}
                      </td>
                      <td className="px-6 py-4 font-mono font-medium text-slate-900">{b.currencyCode}</td>
                      <td className="px-6 py-4 text-xs font-mono text-indigo-700">1000 - Operating Cash & Bank</td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                        {formatMinor(b.currentClearedBalanceMinor, b.currencyCode)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Electronic Bank Statement Ingestion</h3>
              <p className="text-xs text-slate-500 mb-4">
                Upload and ingest multi-format statements: ISO 20022 CAMT.053, SWIFT MT940, OFX 1.x/2.x, or Standard CSV with SHA-256 idempotency.
              </p>
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Statement Number</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Format</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Date</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-500">Closing Balance</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Lines</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {statements.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2 font-mono font-bold text-slate-900">{s.statementNumber}</td>
                      <td className="px-4 py-2 font-mono text-indigo-700">{s.format}</td>
                      <td className="px-4 py-2 text-slate-600">{s.statementDate}</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold text-slate-900">
                        {formatMinor(s.closingBalanceMinor)}
                      </td>
                      <td className="px-4 py-2 font-mono text-slate-700">{s.lineCount} lines</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'reconciliation' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Reconciliation Studio & Seal Verification</h3>
                  <p className="text-xs text-slate-500">
                    Deterministic Pass 1 & Pass 2 matching, fee adjustment journal generation, and immutable session sealing.
                  </p>
                </div>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                  <ShieldCheck className="w-4 h-4 mr-1.5" />
                  SEALED & IMMUTABLE
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <span className="text-xs font-medium text-slate-500">Statement Ending Balance</span>
                  <div className="text-xl font-mono font-bold text-slate-900">
                    {formatMinor(reconciliationSession.statementEndingBalanceMinor)}
                  </div>
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-500">Cleared GL Book Balance</span>
                  <div className="text-xl font-mono font-bold text-slate-900">
                    {formatMinor(reconciliationSession.clearedBookBalanceMinor)}
                  </div>
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-500">Unreconciled Difference</span>
                  <div className="text-xl font-mono font-bold text-emerald-600">
                    {formatMinor(reconciliationSession.unreconciledDifferenceMinor)} (Balanced)
                  </div>
                </div>
              </div>

              {reconciliationSession.sealHash && (
                <div className="mt-4 p-3 bg-slate-100 rounded-lg text-xs font-mono text-slate-800 flex items-center justify-between">
                  <div className="truncate">
                    <span className="font-semibold text-slate-900">Cryptographic Seal (SHA-256): </span>
                    {reconciliationSession.sealHash}
                  </div>
                  <span className="text-slate-500 ml-2">By: {reconciliationSession.sealedBy}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Bank Statement Movements (Ingested)
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="p-3 bg-slate-50 rounded border border-slate-200 flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-slate-900">Customer Wire #DEP-1001</div>
                      <div className="text-slate-500 font-mono">2026-10-01 | Ref: DEP-1001</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-700">+$1,500.00</div>
                      <span className="text-[10px] text-emerald-600 font-medium">✓ MATCHED</span>
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border border-slate-200 flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-slate-900">Bank Service Charge #FEE-001</div>
                      <div className="text-slate-500 font-mono">2026-10-03 | Fee Adjustment</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-slate-900">-$15.00</div>
                      <span className="text-[10px] text-emerald-600 font-medium">✓ ADJUSTED & MATCHED</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  General Ledger Cash Movements (GL 1000)
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="p-3 bg-slate-50 rounded border border-slate-200 flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-slate-900">AR Invoice Payment Receipt</div>
                      <div className="text-slate-500 font-mono">2026-10-01 | JRN-2026-000001</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-700">+$1,500.00</div>
                      <span className="text-[10px] text-emerald-600 font-medium">✓ MATCHED</span>
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border border-slate-200 flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-slate-900">Bank Fee Expense Journal</div>
                      <div className="text-slate-500 font-mono">2026-10-03 | Auto-Adjust Voucher</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-slate-900">-$15.00</div>
                      <span className="text-[10px] text-emerald-600 font-medium">✓ MATCHED</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'fixed-assets' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Gross Fixed Assets</span>
                <p className="mt-1 text-2xl font-bold text-slate-900">$1,620,000.00</p>
                <span className="text-xs text-slate-500 font-medium">{fixedAssets.length} Capitalized Assets</span>
              </div>
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Accumulated Depreciation</span>
                <p className="mt-1 text-2xl font-bold text-amber-600">-$84,400.00</p>
                <span className="text-xs text-amber-700 font-medium">Contra-Asset Balance</span>
              </div>
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Net Book Value (NBV)</span>
                <p className="mt-1 text-2xl font-bold text-emerald-700">$1,535,600.00</p>
                <span className="text-xs text-emerald-700 font-medium">Balance Sheet Carrying Value</span>
              </div>
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">EAM Linkage</span>
                <p className="mt-1 text-2xl font-bold text-indigo-700">100%</p>
                <span className="text-xs text-indigo-600 font-medium">Synchronized with /cmms</span>
              </div>
            </div>

            {/* Asset Register Table */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Fixed Asset Register</h3>
                  <p className="text-xs text-slate-500">
                    Authoritative capital assets register linking physical EAM equipment to balance sheet accounts
                  </p>
                </div>
                <button className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700">
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Asset</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="px-4 py-3">Asset Code</th>
                      <th className="px-4 py-3">Asset Name</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Acquisition Date</th>
                      <th className="px-4 py-3 text-right">Cost Basis</th>
                      <th className="px-4 py-3 text-right">Accum. Depr.</th>
                      <th className="px-4 py-3 text-right">Net Book Value</th>
                      <th className="px-4 py-3">EAM / CMMS Ref</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fixedAssets.map((asset) => (
                      <tr key={asset.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-indigo-600">{asset.assetCode}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{asset.assetName}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                            asset.status === 'CAPITALIZED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {asset.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{asset.acquisitionDate}</td>
                        <td className="px-4 py-3 font-mono text-right text-slate-900">
                          ${(Number(asset.acquisitionCostMinor) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 font-mono text-right text-amber-700">
                          -${(Number(asset.accumulatedDepreciationMinor) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 font-mono text-right font-bold text-emerald-700">
                          ${(Number(asset.currentBookValueMinor) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3">
                          {asset.physicalAssetRef ? (
                            <span className="inline-flex items-center text-xs text-indigo-600 hover:underline">
                              <ExternalLink className="w-3 h-3 mr-1" />
                              {asset.assetTag ?? 'CMMS Asset'}
                            </span>
                          ) : (
                            <span className="text-slate-400">Non-Physical</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'depreciation' && (
          <div className="space-y-6">
            {/* Depreciation Runner Action Card */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Depreciation Studio & Periodic Posting</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Automated multi-method depreciation calculation with exact integer minor units and balanced General Ledger vouchers
                  </p>
                </div>
                <button className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
                  <Calculator className="w-4 h-4" />
                  <span>Post Period Run (2026-10)</span>
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100 text-xs">
                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <span className="text-slate-500 font-medium">Target Fiscal Period</span>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">2026-10 (October 2026)</p>
                </div>
                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <span className="text-slate-500 font-medium">Forecasted Period Expense</span>
                  <p className="text-sm font-bold text-amber-700 mt-0.5">$5,133.33</p>
                </div>
                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <span className="text-slate-500 font-medium">Posting Rule</span>
                  <p className="text-sm font-bold text-emerald-700 mt-0.5">Debit: Depr Expense / Credit: Accum Depr</p>
                </div>
              </div>
            </div>

            {/* Projected Schedules Table */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200">
                <h4 className="text-sm font-semibold text-slate-900">Projected Depreciation Schedule (Current Period)</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="px-4 py-3">Schedule ID</th>
                      <th className="px-4 py-3">Schedule Date</th>
                      <th className="px-4 py-3">Period No.</th>
                      <th className="px-4 py-3 text-right">Depreciation Expense</th>
                      <th className="px-4 py-3 text-right">Accumulated Depreciation</th>
                      <th className="px-4 py-3 text-right">Forecasted Book Value</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {depreciationSchedules.map((sched) => (
                      <tr key={sched.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-slate-600">{sched.id.slice(0, 16)}...</td>
                        <td className="px-4 py-3 text-slate-900 font-medium">{sched.scheduleDate}</td>
                        <td className="px-4 py-3 font-mono">Period #{sched.periodNumber}</td>
                        <td className="px-4 py-3 font-mono text-right font-bold text-amber-700">
                          ${(Number(sched.depreciationAmountMinor) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 font-mono text-right text-slate-700">
                          ${(Number(sched.accumulatedDepreciationMinor) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 font-mono text-right text-emerald-700 font-medium">
                          ${(Number(sched.bookValueMinor) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                            {sched.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'consolidation' && (
          <div className="space-y-6">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Consolidation Groups</span>
                <p className="mt-1 text-2xl font-bold text-slate-900">{consolidationGroups.length}</p>
                <span className="text-xs text-slate-500 font-medium">Reporting: {consolidationGroups[0]?.reportingCurrency}</span>
              </div>
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Member Legal Entities</span>
                <p className="mt-1 text-2xl font-bold text-slate-900">{consolidationEntities.length}</p>
                <span className="text-xs text-emerald-600 font-medium">100% Wholly Owned & Controlled</span>
              </div>
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Intercompany Eliminations</span>
                <p className="mt-1 text-2xl font-bold text-indigo-600">
                  ${(Number(consolidationEliminations.reduce((acc, e) => acc + Number(e.eliminationAmountMinor), 0)) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
                <span className="text-xs text-slate-500 font-medium">{consolidationEliminations.length} Active Bilateral Vouchers</span>
              </div>
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Cumulative Translation Adj. (CTA)</span>
                <p className="mt-1 text-2xl font-bold text-teal-600">
                  ${(Number(consolidationRuns[0]?.totalCtaMinor ?? '0') / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
                <span className="text-xs text-slate-500 font-medium">IAS 21 Equity Balancing Reserve</span>
              </div>
            </div>

            {/* Multi-Entity Group Structure Card */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Consolidation Group Hierarchy & Entity Topology</h4>
                  <p className="text-xs text-slate-500">Multi-tier holding structure with reporting currency translations</p>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                  IFRS 10 / ASC 810 Standard
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium text-slate-500">Group Code</th>
                      <th className="px-6 py-3 text-left font-medium text-slate-500">Group Name</th>
                      <th className="px-6 py-3 text-left font-medium text-slate-500">Reporting Currency</th>
                      <th className="px-6 py-3 text-left font-medium text-slate-500">CTA Equity Account</th>
                      <th className="px-6 py-3 text-left font-medium text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {consolidationGroups.map((g) => (
                      <tr key={g.id}>
                        <td className="px-6 py-4 font-mono font-bold text-slate-900">{g.code}</td>
                        <td className="px-6 py-4 font-medium text-slate-900">{g.name}</td>
                        <td className="px-6 py-4 font-mono text-slate-700">{g.reportingCurrency}</td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-500">{g.ctaGlAccountId.slice(0, 18)}...</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                            ACTIVE
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bilateral Intercompany Elimination Matrix */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Bilateral Intercompany Eliminations Matrix</h4>
                  <p className="text-xs text-slate-500">Automated offsetting of reciprocal intra-group balances and trading accounts</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium text-slate-500">Run Number</th>
                      <th className="px-6 py-3 text-left font-medium text-slate-500">Debit Account (Clearing)</th>
                      <th className="px-6 py-3 text-left font-medium text-slate-500">Credit Account (Clearing)</th>
                      <th className="px-6 py-3 text-right font-medium text-slate-500">Elimination Amount</th>
                      <th className="px-6 py-3 text-left font-medium text-slate-500">Discrepancy</th>
                      <th className="px-6 py-3 text-left font-medium text-slate-500">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {consolidationEliminations.map((elim) => (
                      <tr key={elim.id}>
                        <td className="px-6 py-4 font-mono text-xs text-slate-700">CRUN-2026-M10-001</td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-600">{elim.debitGlAccountId.slice(0, 18)}...</td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-600">{elim.creditGlAccountId.slice(0, 18)}...</td>
                        <td className="px-6 py-4 font-mono text-right font-bold text-indigo-700">
                          ${(Number(elim.eliminationAmountMinor) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                            $0.00 Variance
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-600">{elim.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Consolidated Financial Statements Preview */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">Consolidated Trial Balance & Group Rollup</h4>
                  <p className="text-xs text-slate-500">
                    Net consolidated balance sheet and P&L figures with verified double-entry balancing
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    <ShieldCheck className="w-4 h-4 mr-1.5" />
                    Consolidated Double-Entry Balanced: $1,700,000.00
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'costing' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Costing & Landed Cost Studio</h3>
                <p className="text-sm text-slate-500">
                  Perpetual inventory valuation (FIFO, Moving Average, Standard Cost), landed cost capitalization & automated COGS
                </p>
              </div>
              <div className="flex space-x-3">
                <button className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Revalue Inventory (NRV)</span>
                </button>
                <button className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700">
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Landed Cost Voucher</span>
                </button>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Active Valuation Model</span>
                <p className="mt-1 text-2xl font-bold text-indigo-700">FIFO</p>
                <span className="text-xs text-slate-500">IAS 2 / ASC 330 Compliant</span>
              </div>
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Total Carrying Asset Value</span>
                <p className="mt-1 text-2xl font-bold text-slate-900">$17,150.00</p>
                <span className="text-xs text-emerald-600 font-medium">Reconciled to GL 1400 (100%)</span>
              </div>
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Capitalized Landed Costs</span>
                <p className="mt-1 text-2xl font-bold text-emerald-600">$500.00</p>
                <span className="text-xs text-slate-500">Ocean Freight & Brokerage</span>
              </div>
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Active FIFO Layers</span>
                <p className="mt-1 text-2xl font-bold text-slate-900">{costLayers.length}</p>
                <span className="text-xs text-slate-500">650 total units in stock</span>
              </div>
            </div>

            {/* Active FIFO Cost Layers Queue */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">Active Inbound Cost Layers Queue (FIFO)</h4>
                  <p className="text-xs text-slate-500">Chronological consumption queue determining exact unit cost on order dispatch</p>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                  Exact Integer Precision (Zero-Float)
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                    <tr>
                      <th className="py-3 px-4">Receipt Ref</th>
                      <th className="py-3 px-4">Receipt Date</th>
                      <th className="py-3 px-4">Warehouse</th>
                      <th className="py-3 px-4 text-right">Initial Qty</th>
                      <th className="py-3 px-4 text-right">Remaining Qty</th>
                      <th className="py-3 px-4 text-right">Unit Cost</th>
                      <th className="py-3 px-4 text-right">Landed Cost Added</th>
                      <th className="py-3 px-4 text-right">Carrying Value</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {costLayers.map((layer) => (
                      <tr key={layer.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-medium text-slate-900">{layer.receiptRef}</td>
                        <td className="py-3 px-4 text-slate-600">{new Date(layer.receiptDate).toLocaleDateString()}</td>
                        <td className="py-3 px-4 text-slate-600">{layer.warehouseId}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">{parseFloat(layer.initialQuantity).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">{parseFloat(layer.remainingQuantity).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-mono text-indigo-600">
                          ${(parseInt(layer.unitCostScaled, 10) / 1000000).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-600">
                          +${(parseInt(layer.landedCostAddedMinor, 10) / 100).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">
                          ${(parseInt(layer.totalRemainingCostMinor, 10) / 100).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              layer.status === 'ACTIVE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {layer.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Landed Cost Vouchers & Capitalization */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">Landed Cost Capitalization Vouchers</h4>
                  <p className="text-xs text-slate-500">Freight, customs duties, and handling absorbed into inventory carrying costs</p>
                </div>
              </div>

              <div className="space-y-3">
                {landedCostVouchers.map((voucher) => (
                  <div key={voucher.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-slate-900">{voucher.voucherNumber}</span>
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
                          {voucher.status}
                        </span>
                        <span className="text-xs text-slate-500">Basis: {voucher.allocationBasis}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{voucher.description}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500">Total Absorbed</span>
                      <p className="font-mono text-base font-bold text-emerald-700">
                        ${(parseInt(voucher.totalLandedCostMinor, 10) / 100).toFixed(2)} {voucher.currencyCode}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'budgeting' && (
          <div className="space-y-6">
            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Total Budget Allocated</span>
                <p className="mt-1 text-2xl font-bold font-mono text-slate-900">$1,200,000.00</p>
                <span className="text-xs text-indigo-600 font-medium">12-Period Equal Distribution (100% Cent Conserved)</span>
              </div>
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Encumbered Commitments</span>
                <p className="mt-1 text-2xl font-bold font-mono text-amber-700">$25,000.00</p>
                <span className="text-xs text-amber-600 font-medium">Active Requisitions & Purchase Orders</span>
              </div>
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Actual Expense Incurred</span>
                <p className="mt-1 text-2xl font-bold font-mono text-rose-700">$45,000.00</p>
                <span className="text-xs text-rose-600 font-medium">Liquidated Invoices & General Ledger Debits</span>
              </div>
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Uncommitted Headroom (Avail)</span>
                <p className="mt-1 text-2xl font-bold font-mono text-emerald-700">$80,000.00</p>
                <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-emerald-600 h-1.5 rounded-full" style={{ width: '46.7%' }}></div>
                </div>
                <span className="text-xs text-emerald-600 font-medium mt-1 inline-block">46.7% Period Burn Rate</span>
              </div>
            </div>

            {/* Budget Structures & Revisions Overview */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">Budget Structures & Versioned Revisions</h4>
                  <p className="text-xs text-slate-500">Multi-tier models, maker-checker governance, and fail-closed spend policies</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {budgetStructures.map((bs) => (
                  <div key={bs.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-slate-900">{bs.code}</span>
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-800">
                          {bs.budgetType}
                        </span>
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800">
                          POLICY: {bs.controlAction}
                        </span>
                      </div>
                      <span className="text-xs font-medium text-slate-500">Tol: +{bs.allowOverspendThresholdPct}%</span>
                    </div>
                    <p className="text-sm font-medium text-slate-800">{bs.name}</p>
                    <p className="text-xs text-slate-500">{bs.description}</p>
                  </div>
                ))}

                {budgetRevisions.map((rev) => (
                  <div key={rev.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-slate-900">Revision #{rev.revisionNumber}</span>
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
                          {rev.status}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-slate-500">
                        Total: ${(parseInt(rev.totalAllocatedMinor, 10) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{rev.notes}</p>
                    <div className="text-[11px] font-mono text-slate-400 truncate">
                      SHA-256 Checksum: {rev.checksum}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Dimensional Budget Lines & Burn-Down Grid */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">Dimensional Budget Allocation Grid</h4>
                  <p className="text-xs text-slate-500">Segment allocations across Natural Accounts, Cost Centers, and Fiscal Periods</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                    <tr>
                      <th className="py-3 px-4">Cost Center</th>
                      <th className="py-3 px-4">Account ID</th>
                      <th className="py-3 px-4">Project Ref</th>
                      <th className="py-3 px-4 text-right">Allocated</th>
                      <th className="py-3 px-4 text-right">Encumbered</th>
                      <th className="py-3 px-4 text-right">Actual Spent</th>
                      <th className="py-3 px-4 text-right">Available Headroom</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {budgetLines.map((line) => {
                      const allocated = parseInt(line.allocatedAmountMinor, 10);
                      const isLine1 = line.costCenterId === 'CC-ENG-101';
                      const enc = isLine1 ? 2500000 : 0;
                      const act = isLine1 ? 4500000 : 0;
                      const avail = allocated - (enc + act);

                      return (
                        <tr key={line.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-mono font-medium text-slate-900">{line.costCenterId}</td>
                          <td className="py-3 px-4 font-mono text-slate-600">{line.accountId.substring(0, 8)}...</td>
                          <td className="py-3 px-4 text-slate-600">{line.projectCode ?? '—'}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                            ${(allocated / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-amber-700">
                            ${(enc / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-rose-700">
                            ${(act / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                            ${(avail / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
                              UNDER_BUDGET
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Commitment Accounting Subledger */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">Commitment Accounting & Encumbrance Ledger</h4>
                  <p className="text-xs text-slate-500">Requisitions, Purchase Orders, and Invoice Liquidations preserving budget availability</p>
                </div>
              </div>

              <div className="space-y-3">
                {budgetCommitments.map((c) => (
                  <div key={c.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-slate-900">{c.documentNumber}</span>
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                          {c.sourceDocumentType}
                        </span>
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-800">
                          {c.commitmentType}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            c.status === 'ACTIVE'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {c.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">Source ID: {c.sourceDocumentId}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500">Amount</span>
                      <p className="font-mono text-base font-bold text-slate-900">
                        ${(parseInt(c.amountMinor, 10) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'close' && (
          <div className="space-y-6">
            {/* Header & Financial Health KPIs */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Period Close Orchestration & Financial Health</h3>
                <p className="text-sm text-slate-600">
                  Subledger lockout guards, milestone checklists with maker-checker approvals, automated accrual amortization schedules, and multi-period forecasting.
                </p>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <span className="text-xs font-medium text-slate-500">Current Ratio</span>
                  <p className="text-lg font-bold text-slate-900 mt-0.5">{healthRatios.currentRatio}</p>
                  <span className="text-[10px] text-emerald-600 font-medium">Target: &gt; 2.0 (Healthy)</span>
                </div>
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <span className="text-xs font-medium text-slate-500">Quick Ratio</span>
                  <p className="text-lg font-bold text-slate-900 mt-0.5">{healthRatios.quickRatio}</p>
                  <span className="text-[10px] text-emerald-600 font-medium">Target: &gt; 1.0 (Liquid)</span>
                </div>
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <span className="text-xs font-medium text-slate-500">Working Capital</span>
                  <p className="text-lg font-bold text-slate-900 mt-0.5">
                    ${(parseInt(healthRatios.workingCapitalMinor, 10) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                  <span className="text-[10px] text-indigo-600 font-medium">Current Assets - CL</span>
                </div>
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <span className="text-xs font-medium text-slate-500">Debt-to-Equity</span>
                  <p className="text-lg font-bold text-slate-900 mt-0.5">{healthRatios.debtToEquityRatio}</p>
                  <span className="text-[10px] text-emerald-600 font-medium">Target: &lt; 1.5 (Solvent)</span>
                </div>
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <span className="text-xs font-medium text-slate-500">Operating Margin</span>
                  <p className="text-lg font-bold text-slate-900 mt-0.5">
                    {(healthRatios.operatingMarginBps / 100).toFixed(2)}%
                  </p>
                  <span className="text-[10px] text-emerald-600 font-medium">Operating Profit / Rev</span>
                </div>
              </div>
            </div>

            {/* Subledger Lockouts Grid */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Subledger Cutoff & Lockout Matrix</h4>
                  <p className="text-xs text-slate-500">
                    Granular subledger locks prevent retroactive document postings during close cycles.
                  </p>
                </div>
                <span className="text-xs font-mono px-2 py-1 bg-slate-100 rounded text-slate-700">Period: FY2026-M10 (October)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {periodSubledgerLocks.map((lock) => (
                  <div key={lock.id} className="border border-slate-200 rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-slate-900">
                        {lock.subledgerType === 'AP' && 'Accounts Payable (AP)'}
                        {lock.subledgerType === 'AR' && 'Accounts Receivable (AR)'}
                        {lock.subledgerType === 'INVENTORY' && 'Inventory & Costing'}
                        {lock.subledgerType === 'FIXED_ASSETS' && 'Fixed Assets Register'}
                        {lock.subledgerType === 'TREASURY' && 'Treasury & Bank Clearing'}
                        {lock.subledgerType === 'GL' && 'General Ledger (GL)'}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          lock.lockStatus === 'HARD_LOCKED'
                            ? 'bg-rose-100 text-rose-800'
                            : lock.lockStatus === 'SOFT_LOCKED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {lock.lockStatus}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{lock.notes}</p>
                    <div className="text-[11px] text-slate-400">
                      {lock.lockedBy ? `Locked by ${lock.lockedBy}` : 'Open for standard transactions'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Close Checklist & Year-End Rollover (2 Columns) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Period Close Checklist */}
              <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900">Period Close Checklist</h4>
                  <span className="text-xs font-medium text-indigo-600">4 / 7 Milestones Completed</span>
                </div>

                <div className="space-y-2">
                  {periodChecklists.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between p-3 border border-slate-100 rounded-lg bg-slate-50 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-slate-400">#{task.sequenceOrder}</span>
                          <span className="font-medium text-slate-900">{task.taskName}</span>
                        </div>
                        {task.notes && <p className="text-slate-500 text-[11px]">{task.notes}</p>}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                          task.taskStatus === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : task.taskStatus === 'IN_PROGRESS'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {task.taskStatus}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Year-End Close & Retained Earnings Card */}
              <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
                <h4 className="text-sm font-semibold text-slate-900">Year-End Retained Earnings Rollover Engine</h4>
                <p className="text-xs text-slate-500">
                  Zeros temporary P&L accounts into the Retained Earnings balance sheet equity account with an immutable closing journal voucher.
                </p>

                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Total Fiscal Revenue:</span>
                    <span className="font-mono font-bold text-emerald-700">$600,000.00</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Total Fiscal Operating Expenses:</span>
                    <span className="font-mono font-bold text-rose-700">$450,000.00</span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex justify-between text-xs">
                    <span className="font-semibold text-slate-900">Computed Net Income:</span>
                    <span className="font-mono font-bold text-indigo-700 text-sm">$150,000.00</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Target Equity Account:</span>
                    <span className="font-mono text-slate-700">3000 (Retained Earnings)</span>
                  </div>
                </div>

                <div className="flex space-x-3 pt-2">
                  <button className="flex-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium">
                    Preview Zeroing Vouchers
                  </button>
                  <button className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium">
                    Execute Year-End Close
                  </button>
                </div>
              </div>
            </div>

            {/* Recurring Accruals & Deferrals Amortization Table */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Recurring Accruals & Deferrals Schedules</h4>
                  <p className="text-xs text-slate-500">
                    Cent-conserving straight-line amortization for prepayments, ASC 606 deferred revenue, and day-1 auto-reversing accruals.
                  </p>
                </div>
                <button className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium flex items-center space-x-1">
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Schedule</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2">Schedule #</th>
                      <th className="px-3 py-2">Name / Type</th>
                      <th className="px-3 py-2">Total Amount</th>
                      <th className="px-3 py-2">Recognized</th>
                      <th className="px-3 py-2">Remaining</th>
                      <th className="px-3 py-2">Progress</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {amortizationSchedules.map((sch) => {
                      const total = parseInt(sch.totalAmountMinor, 10);
                      const recognized = parseInt(sch.recognizedAmountMinor, 10);
                      const pct = Math.round((recognized / total) * 100);
                      return (
                        <tr key={sch.id} className="hover:bg-slate-50">
                          <td className="px-3 py-3 font-mono font-medium text-slate-900">{sch.scheduleNumber}</td>
                          <td className="px-3 py-3">
                            <span className="font-medium text-slate-900 block">{sch.scheduleName}</span>
                            <span className="text-[11px] text-slate-400 font-mono">{sch.amortizationType}</span>
                          </td>
                          <td className="px-3 py-3 font-mono font-bold text-slate-900">
                            ${(total / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-3 font-mono text-emerald-700">
                            ${(recognized / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-3 font-mono text-slate-600">
                            ${(parseInt(sch.remainingAmountMinor, 10) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-3 w-36">
                            <div className="flex items-center space-x-2">
                              <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${pct}%` }}></div>
                              </div>
                              <span className="text-[10px] font-mono text-slate-500">{pct}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800">
                              {sch.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">Real-Time General Ledger Statements</h3>
            <p className="text-sm text-slate-600">
              Live statements calculated instantaneously from immutable General Ledger journal facts:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <span className="font-semibold text-slate-900">Trial Balance</span>
                <p className="text-xs text-slate-500 mt-1">
                  Certifies debit and credit turnover equality across all chart accounts.
                </p>
                <div className="mt-3 text-xs font-mono text-emerald-700">Status: Balanced (Σ Debits = Σ Credits)</div>
              </div>
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <span className="font-semibold text-slate-900">Balance Sheet</span>
                <p className="text-xs text-slate-500 mt-1">
                  Point-in-time financial position: Assets = Liabilities + Equity.
                </p>
                <div className="mt-3 text-xs font-mono text-emerald-700">Status: Balanced (A = L + E)</div>
              </div>
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <span className="font-semibold text-slate-900">Income Statement (P&L)</span>
                <p className="text-xs text-slate-500 mt-1">
                  Operating performance: Revenues - COGS - Expenses = Net Income.
                </p>
                <div className="mt-3 text-xs font-mono text-emerald-700">Status: Real-Time Accrual</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'extensions' && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Application Dictionary Integration</h3>
                <p className="text-sm text-slate-500">
                  Metadata-driven dimension forms and Safe AST balance rule validation
                </p>
              </div>
              <button
                onClick={handleTestRule}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
              >
                Validate Double-Entry Safe AST
              </button>
            </div>

            {validationResult && (
              <div className="p-3 bg-slate-100 rounded text-xs font-mono text-slate-800">
                {validationResult}
              </div>
            )}

            <div className="pt-4 border-t border-slate-200">
              <DictionaryRenderer
                permissions={permissions}
                manifest={DEFAULT_FINANCE_DICTIONARY_MANIFEST}
                values={customExtensions}
                onChange={handleCustomFieldChange}
                errors={validationErrors}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
