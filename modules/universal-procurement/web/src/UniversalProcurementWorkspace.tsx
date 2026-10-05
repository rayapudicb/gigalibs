'use client';

import React, { useState, useCallback } from 'react';
import {
  ShoppingCart,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Building,
  DollarSign,
  Package,
  Sliders,
  Scale,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';
import type {
  ProcurementRequisitionV1,
  PurchaseOrderV1,
  VendorBillV1,
  DebitMemoV1,
  CompiledDictionaryManifestV1,
} from '@gigalibs/contracts';
import {
  DictionaryRenderer,
  validateDictionaryRules,
} from '@gigalibs/configuration-react';

type WorkspaceTab =
  | 'overview'
  | 'requisitions'
  | 'orders'
  | 'matching'
  | 'bills'
  | 'debit-memos'
  | 'extensions';

const DEFAULT_PROCUREMENT_DICTIONARY_MANIFEST: CompiledDictionaryManifestV1 = {
  manifestVersion: 1,
  packageKey: 'pkg-universal-procurement',
  checksum: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  compiledAt: '2026-10-04T00:00:00.000Z',
  entities: [
    {
      entityKey: 'purchase-orders',
      moduleKey: 'universal-procurement',
      label: 'Purchase Orders',
      description: 'Governed commercial purchase commitments issued to vendors.',
      ownership: 'MODULE_CORE',
      primaryKeyField: 'id',
      isVersioned: true,
      isAuditLogged: true,
      isSoftDeletable: false,
    },
    {
      entityKey: 'procurement-requisitions',
      moduleKey: 'universal-procurement',
      label: 'Procurement Requisitions',
      description: 'Internal purchase requisitions with Delegation of Authority thresholds.',
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
      entityKey: 'purchase-orders',
      label: 'Cost Center Code',
      description: 'Departmental cost center charged for this purchase commitment.',
      type: 'TEXT',
      required: true,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      helpText: 'e.g. CC-ENG-402 or CC-OPS-101',
      maskOnDisplay: false,
    },
    {
      fieldKey: 'project_milestone_code',
      entityKey: 'purchase-orders',
      label: 'Project Milestone Code',
      description: 'Capital project or operational milestone tracking ID.',
      type: 'TEXT',
      required: false,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      helpText: 'e.g. PRJ-2026-Q4-EXP',
      maskOnDisplay: false,
    },
    {
      fieldKey: 'vendor_esg_score',
      entityKey: 'purchase-orders',
      label: 'Vendor ESG Rating (0-100)',
      description: 'Environmental, Social, and Governance audit compliance score.',
      type: 'INTEGER',
      required: false,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      helpText: 'Must be >= 50 for unrestricted procurement approval.',
      maskOnDisplay: false,
    },
    {
      fieldKey: 'custom_payment_clause',
      entityKey: 'purchase-orders',
      label: 'Statutory Payment Terms Clause',
      description: 'Special jurisdiction or retention clause for vendor settlement.',
      type: 'TEXT',
      required: false,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      helpText: 'e.g. 10% retention upon final engineering signoff',
      maskOnDisplay: false,
    },
  ],
  references: [
    {
      referenceKey: 'ref-variance-reasons',
      referenceType: 'VALUE_LIST',
      staticValues: [
        { value: 'EXCHANGE_RATE', label: 'Currency / FX Fluctuation' },
        { value: 'FREIGHT_SURCHARGE', label: 'Unbudgeted Expedited Freight' },
        { value: 'VOLUME_DISCOUNT_MISMATCH', label: 'Tiered Pricing Bracket Adjustment' },
        { value: 'APPROVED_CATALOG_REVISION', label: 'Pre-Approved Vendor Price Revision' },
        { value: 'EMERGENCY_EXPEDITE', label: 'Emergency Operational Expedite' },
      ],
    },
  ],
  validationRules: [
    {
      ruleKey: 'rule-esg-threshold',
      label: 'Vendor ESG Score Policy Threshold',
      errorMessage: 'Vendor ESG score is below policy threshold (50). Requires sustainability officer sign-off.',
      severity: 'WARNING',
      condition: {
        operator: 'GTE',
        field: 'vendor_esg_score',
        value: 50,
      },
    },
  ],
  relationships: [],
  views: [],
  navigation: [],
  actions: [],
  messages: [],
};

export interface UniversalProcurementWorkspaceProps {
  readonly tenantId?: string;
  readonly orgUnitId?: string;
  /** The signed-in user's permissions, for the dictionary renderer (WI-OI-120e). */
  readonly permissions?: readonly string[];
}

export function UniversalProcurementWorkspace({
  tenantId = 'default-tenant',
  orgUnitId = 'default-org',
  permissions = [],
}: UniversalProcurementWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [searchTerm, setSearchTerm] = useState('');

  // Metadata Dynamic Extensions State
  const [customExtensions, setCustomExtensions] = useState<Record<string, unknown>>({
    cost_center_code: 'CC-OPS-101',
    project_milestone_code: 'PRJ-2026-Q4-EXP',
    vendor_esg_score: 78,
    custom_payment_clause: 'Net 30 days upon validated 3-way match',
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const handleCustomFieldChange = useCallback((nextValues: Record<string, unknown>) => {
    setCustomExtensions(nextValues);
    const errs = validateDictionaryRules(DEFAULT_PROCUREMENT_DICTIONARY_MANIFEST.validationRules, nextValues);
    setValidationErrors(errs);
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 font-sans">
      {/* Top Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-600 text-white shadow-sm">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Procurement &amp; Payables
            </h1>
            <p className="text-xs text-slate-500">
              Delegation of Authority, Purchase Orders, 3-Way Matching &amp; Vendor AP
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-sm font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'overview'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('requisitions')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'requisitions'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Requisitions
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'orders'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Orders
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('matching')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'matching'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            3-Way Match
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bills')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'bills'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Vendor Bills
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('debit-memos')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'debit-memos'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Debit Memos
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('extensions')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'extensions'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-emerald-600" />
            Dictionary Extensions
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 overflow-y-auto">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6 max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Active Purchase Orders</span>
                  <Package className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-bold text-slate-900">142</div>
                <div className="text-xs text-slate-500 mt-1">Across 18 qualified vendors</div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Pending Requisitions</span>
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-slate-900">9</div>
                <div className="text-xs text-slate-500 mt-1">Awaiting Delegation of Authority review</div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Price Variance Holds</span>
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-2xl font-bold text-amber-600">3</div>
                <div className="text-xs text-slate-500 mt-1">Invoiced price variance &gt; 1.0%</div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Total Committed (USD)</span>
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-bold text-slate-900">$1,842,500.00</div>
                <div className="text-xs text-slate-500 mt-1">Minor units strictly preserved</div>
              </div>
            </div>

            {/* Quick Invariant Explainer */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900 mb-2 flex items-center gap-2">
                <Scale className="w-5 h-5 text-emerald-600" />
                Mathematical 3-Way Matching Engine Invariant
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                GigaLibs Universal Procurement enforces relational ACID guarantees and mathematical matching rules:
              </p>
              <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200 font-mono text-sm text-slate-800">
                Invoiced Quantity &le; Received Quantity &le; Ordered Quantity
              </div>
              <ul className="mt-3 text-xs text-slate-600 space-y-1.5 list-disc pl-5">
                <li>Goods receipt line quantities are verified directly against Phase 5 warehouse stock balances.</li>
                <li>Invoice prices exceeding PO unit prices by &gt; 1.0% automatically trip a <span className="font-semibold text-amber-600">PRICE_VARIANCE_HOLD</span>.</li>
                <li>Vendor bill payment authorization is prevented until maker-checker supervisor override is recorded with documented justification.</li>
              </ul>
            </div>
          </div>
        )}

        {/* TAB 2: REQUISITIONS */}
        {activeTab === 'requisitions' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Purchase Requisitions</h2>
                <p className="text-xs text-slate-500">Departmental procurement requests subject to DoA threshold policy</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Requisition
              </button>
            </div>
            <div className="p-8 text-center text-slate-500">
              <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-700">Requisitions Live Directory</p>
              <p className="text-xs text-slate-400">Connected to schema <code className="font-mono">gigalibs_procurement.procurement_requisitions</code></p>
            </div>
          </div>
        )}

        {/* TAB 3: ORDERS */}
        {activeTab === 'orders' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Purchase Orders</h2>
                <p className="text-xs text-slate-500">Binding vendor commitments issued across organizational units</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Purchase Order
              </button>
            </div>
            <div className="p-8 text-center text-slate-500">
              <Package className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-700">Purchase Orders Live Directory</p>
              <p className="text-xs text-slate-400">Connected to schema <code className="font-mono">gigalibs_procurement.purchase_orders</code></p>
            </div>
          </div>
        )}

        {/* TAB 4: 3-WAY MATCHING */}
        {activeTab === 'matching' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-7xl mx-auto space-y-6">
            <div className="border-b border-slate-200 pb-4">
              <h2 className="text-base font-semibold text-slate-900">Three-Way Matching Matrix</h2>
              <p className="text-xs text-slate-500">Line-by-line reconciliation: Purchase Order &times; Warehouse Receipt &times; Vendor Invoice</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200 rounded-lg">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">PO Line</th>
                    <th className="p-3">Item / Description</th>
                    <th className="p-3 text-right">Ordered Qty</th>
                    <th className="p-3 text-right">Received Qty</th>
                    <th className="p-3 text-right">Invoiced Qty</th>
                    <th className="p-3 text-right">PO Unit Price</th>
                    <th className="p-3 text-right">Billed Unit Price</th>
                    <th className="p-3 text-center">Variance %</th>
                    <th className="p-3 text-center">Match State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  <tr className="hover:bg-slate-50/50">
                    <td className="p-3 font-mono">PO-00042 #1</td>
                    <td className="p-3 font-medium">Precision Bearing Assembly 6205-2RS</td>
                    <td className="p-3 text-right font-mono">100.0000</td>
                    <td className="p-3 text-right font-mono text-emerald-600">100.0000</td>
                    <td className="p-3 text-right font-mono">100.0000</td>
                    <td className="p-3 text-right font-mono">$12.00</td>
                    <td className="p-3 text-right font-mono">$12.00</td>
                    <td className="p-3 text-center font-mono text-emerald-600">0.00%</td>
                    <td className="p-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Check className="w-3 h-3" /> FULLY_MATCHED
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 bg-amber-50/20">
                    <td className="p-3 font-mono">PO-00042 #2</td>
                    <td className="p-3 font-medium">Synthetic Industrial Gear Oil ISO 320</td>
                    <td className="p-3 text-right font-mono">50.0000</td>
                    <td className="p-3 text-right font-mono text-emerald-600">50.0000</td>
                    <td className="p-3 text-right font-mono">50.0000</td>
                    <td className="p-3 text-right font-mono">$40.00</td>
                    <td className="p-3 text-right font-mono text-amber-700 font-bold">$42.50</td>
                    <td className="p-3 text-center font-mono text-amber-700 font-bold">+6.25%</td>
                    <td className="p-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                        <AlertTriangle className="w-3 h-3" /> VARIANCE_HOLD
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: VENDOR BILLS */}
        {activeTab === 'bills' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Vendor Bills (Accounts Payable)</h2>
                <p className="text-xs text-slate-500">Inbound invoices recorded against purchase commitments</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Record Vendor Bill
              </button>
            </div>
            <div className="p-8 text-center text-slate-500">
              <Receipt className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-700">Vendor Bills Live Directory</p>
              <p className="text-xs text-slate-400">Connected to schema <code className="font-mono">gigalibs_procurement.vendor_bills</code></p>
            </div>
          </div>
        )}

        {/* TAB 6: DEBIT MEMOS */}
        {activeTab === 'debit-memos' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Debit Memos</h2>
                <p className="text-xs text-slate-500">Adjustments, damaged stock deductions, and vendor credits</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Issue Debit Memo
              </button>
            </div>
            <div className="p-8 text-center text-slate-500">
              <RotateCcw className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-700">Debit Memos Live Directory</p>
              <p className="text-xs text-slate-400">Connected to schema <code className="font-mono">gigalibs_procurement.debit_memos</code></p>
            </div>
          </div>
        )}

        {/* TAB 7: APPLICATION DICTIONARY & EXTENSIONS */}
        {activeTab === 'extensions' && (
          <div className="space-y-6 max-w-7xl mx-auto">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-600" />
                    Application Dictionary Dynamic Form Rendering
                  </h2>
                  <p className="text-xs text-slate-500">
                    Live UI generated declaratively via <code className="font-mono">&lt;DictionaryRenderer /&gt;</code> using Application Dictionary metadata.
                  </p>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5" /> AST Validated
                </div>
              </div>

              <div className="mt-4">
                <DictionaryRenderer
                  permissions={permissions}
                  manifest={DEFAULT_PROCUREMENT_DICTIONARY_MANIFEST}
                  values={customExtensions}
                  onChange={handleCustomFieldChange}
                  errors={validationErrors}
                />
              </div>

              {Object.keys(validationErrors).length > 0 && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Validation Policy Warning
                  </div>
                  <ul className="mt-1 list-disc pl-5 space-y-1">
                    {Object.entries(validationErrors).map(([key, msg]) => (
                      <li key={key}>{msg}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Persisted Extension JSON Payload</h2>
              <p className="mt-1 text-xs text-slate-500">
                Stored in <code className="font-mono text-emerald-700">gigalibs_procurement.purchase_orders.custom_extensions</code>.
              </p>
              <pre className="mt-4 p-4 rounded-lg bg-slate-900 text-emerald-400 font-mono text-xs overflow-x-auto">
                {JSON.stringify(customExtensions, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
