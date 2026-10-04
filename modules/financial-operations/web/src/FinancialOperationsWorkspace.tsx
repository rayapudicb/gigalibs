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

export function FinancialOperationsWorkspace() {
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
