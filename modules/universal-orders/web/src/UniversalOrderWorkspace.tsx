'use client';

import React, { useState, useCallback } from 'react';
import {
  ShoppingBag,
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
  Truck,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Check,
  X,
  ExternalLink,
  Layers,
  Send,
} from 'lucide-react';
import type {
  SalesQuoteV1,
  SalesOrderV1,
  OrderInventoryAllocationV1,
  FulfillmentOrderV1,
  CustomerInvoiceV1,
  CustomerCreditMemoV1,
  CompiledDictionaryManifestV1,
} from '@gigalibs/contracts';
import {
  DictionaryRenderer,
  validateDictionaryRules,
} from '@gigalibs/configuration-react';

type WorkspaceTab =
  | 'overview'
  | 'quotes'
  | 'orders'
  | 'atp'
  | 'fulfillment'
  | 'invoices'
  | 'credit-memos'
  | 'extensions';

const DEFAULT_ORDERS_DICTIONARY_MANIFEST: CompiledDictionaryManifestV1 = {
  manifestVersion: 1,
  packageKey: 'pkg-universal-orders',
  checksum: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  compiledAt: '2026-10-04T00:00:00.000Z',
  entities: [
    {
      entityKey: 'sales-orders',
      moduleKey: 'universal-orders',
      label: 'Sales Orders',
      description: 'Customer commercial sales commitments with inventory reservation & fulfillment tracking.',
      ownership: 'MODULE_CORE',
      primaryKeyField: 'id',
      isVersioned: true,
      isAuditLogged: true,
      isSoftDeletable: false,
    },
    {
      entityKey: 'sales-quotes',
      moduleKey: 'universal-orders',
      label: 'Sales Quotations',
      description: 'Customer price proposals and quotation commitments with expiry dates.',
      ownership: 'MODULE_CORE',
      primaryKeyField: 'id',
      isVersioned: true,
      isAuditLogged: true,
      isSoftDeletable: false,
    },
  ],
  fields: [
    {
      fieldKey: 'delivery_priority',
      entityKey: 'sales-orders',
      label: 'Delivery Priority Level',
      description: 'Operational priority for fulfillment queue and warehouse dispatching.',
      type: 'TEXT',
      required: true,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      helpText: 'e.g. STANDARD, EXPEDITED, WHITE_GLOVE, RUSH',
      maskOnDisplay: false,
    },
    {
      fieldKey: 'customer_tax_exemption_cert',
      entityKey: 'sales-orders',
      label: 'Tax Exemption Certificate Number',
      description: 'Jurisdictional resale or tax exemption documentation identifier.',
      type: 'TEXT',
      required: false,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      helpText: 'e.g. TX-EXEMPT-2026-8812',
      maskOnDisplay: false,
    },
    {
      fieldKey: 'carrier_account_number',
      entityKey: 'sales-orders',
      label: 'Customer Third-Party Freight Account',
      description: 'Third-party carrier account for billing freight directly to customer.',
      type: 'TEXT',
      required: false,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      helpText: 'e.g. FEDEX-ACCT-981245 or DHL-GLOBAL-112',
      maskOnDisplay: false,
    },
    {
      fieldKey: 'credit_limit_override_authorized',
      entityKey: 'sales-orders',
      label: 'Credit Limit Exception Override Authorized',
      description: 'Flag indicating whether a finance controller signed off on credit exposure exception.',
      type: 'BOOLEAN',
      required: false,
      readOnly: false,
      isSystemLocked: false,
      classification: 'CONFIDENTIAL',
      helpText: 'Must be authorized by Credit Risk Officer if account is above limit.',
      maskOnDisplay: false,
    },
  ],
  references: [
    {
      referenceKey: 'ref-delivery-priorities',
      referenceType: 'VALUE_LIST',
      staticValues: [
        { value: 'STANDARD', label: 'Standard Ground Delivery' },
        { value: 'EXPEDITED', label: 'Expedited Air Freight' },
        { value: 'WHITE_GLOVE', label: 'White Glove Installation' },
        { value: 'RUSH', label: 'Emergency Same-Day Dispatch' },
      ],
    },
  ],
  validationRules: [
    {
      ruleKey: 'rule-credit-override-notice',
      label: 'Credit Limit Exception Notification',
      errorMessage: 'Credit limit exception override authorized. Requires Finance Controller co-sign off on invoice.',
      severity: 'WARNING',
      condition: {
        operator: 'EQ',
        field: 'credit_limit_override_authorized',
        value: true,
      },
    },
  ],
  relationships: [],
  views: [],
  navigation: [],
  actions: [],
  messages: [],
};

export interface UniversalOrderWorkspaceProps {
  readonly tenantId?: string;
  readonly orgUnitId?: string;
}

export function UniversalOrderWorkspace({
  tenantId = 'default-tenant',
  orgUnitId = 'default-org',
}: UniversalOrderWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [searchTerm, setSearchTerm] = useState('');

  // Metadata Dynamic Extensions State
  const [customExtensions, setCustomExtensions] = useState<Record<string, unknown>>({
    delivery_priority: 'EXPEDITED',
    customer_tax_exemption_cert: 'TX-EXEMPT-2026-8812',
    carrier_account_number: 'FEDEX-ACCT-981245',
    credit_limit_override_authorized: true,
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const handleCustomFieldChange = useCallback((nextValues: Record<string, unknown>) => {
    setCustomExtensions(nextValues);
    const errs = validateDictionaryRules(DEFAULT_ORDERS_DICTIONARY_MANIFEST.validationRules, nextValues);
    setValidationErrors(errs);
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 font-sans">
      {/* Top Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-600 text-white shadow-sm">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Universal Order Management &amp; Fulfillment
            </h1>
            <p className="text-xs text-slate-500">
              Sales Quotes, ATP Allocations, Warehouse Fulfillment &amp; AR Invoicing
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
            onClick={() => setActiveTab('quotes')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'quotes'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Quotations
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
            Sales Orders
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('atp')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'atp'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ATP Matrix
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('fulfillment')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'fulfillment'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Fulfillment
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('invoices')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'invoices'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Customer Invoices
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('credit-memos')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'credit-memos'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Credit Memos
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('extensions')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'extensions'
                ? 'bg-white text-slate-900 shadow-sm font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-blue-600" />
            Extensions
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 p-6 overflow-y-auto">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider">Pending Quotes</span>
                  <FileText className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-2xl font-bold text-slate-900">12</div>
                <div className="text-xs text-slate-500 mt-1">Valued at $142,500.00</div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider">Open Sales Orders</span>
                  <ShoppingBag className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-2xl font-bold text-slate-900">28</div>
                <div className="text-xs text-emerald-600 font-medium mt-1">24 ATP Confirmed</div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider">Ready To Dispatch</span>
                  <Truck className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-2xl font-bold text-slate-900">7</div>
                <div className="text-xs text-amber-600 font-medium mt-1">3 Expedited Priority</div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider">Unbilled Shipments</span>
                  <Receipt className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="text-2xl font-bold text-slate-900">3</div>
                <div className="text-xs text-slate-500 mt-1">Invoicing ready ($38,200.00)</div>
              </div>
            </div>

            {/* Invariant & Architecture Banner */}
            <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-xl p-6 shadow-md">
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/30 text-blue-200 border border-blue-400/30 mb-2">
                    Phase 7 Architecture Verified
                  </span>
                  <h2 className="text-lg font-bold">Universal Order Management Invariants Enforced</h2>
                  <p className="text-sm text-blue-200 mt-1 max-w-3xl">
                    ATP reservations ensure <code className="text-blue-100 font-mono">Allocated Qty &le; Ordered Qty</code>.
                    Outbound fulfillments enforce <code className="text-blue-100 font-mono">Shipped Qty &le; Allocated Qty</code>.
                    Customer billing guarantees <code className="text-blue-100 font-mono">Invoiced Qty &le; Shipped Qty</code>.
                    All monetary fields are stored strictly in integer minor units (e.g. cents).
                  </p>
                </div>
                <div className="p-3 bg-white/10 rounded-lg backdrop-blur-sm">
                  <ShieldCheck className="w-8 h-8 text-blue-300" />
                </div>
              </div>
            </div>

            {/* Recent Orders Overview Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 text-sm">Recent Active Sales Orders</h3>
                <span className="text-xs text-slate-500">Live operational ledger</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-medium border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Order #</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Order Status</th>
                      <th className="px-4 py-3">Allocation Status</th>
                      <th className="px-4 py-3">Fulfillment Status</th>
                      <th className="px-4 py-3 text-right">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-700">
                    <tr>
                      <td className="px-4 py-3 font-mono font-medium text-blue-600">SO-2026-00101</td>
                      <td className="px-4 py-3">Acme Industrial Systems Ltd</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          CONFIRMED
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          ALLOCATED
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          PARTIAL_SHIPPED
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">$18,450.00</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-mono font-medium text-blue-600">SO-2026-00102</td>
                      <td className="px-4 py-3">Apex Global Logistics Corp</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          PROCESSING
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ALLOCATED
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
                          UNFULFILLED
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">$9,820.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: QUOTATIONS */}
        {activeTab === 'quotes' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-7xl mx-auto">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Customer Sales Quotations</h3>
                <p className="text-xs text-slate-500">Commercial pricing commitments &amp; quote-to-order conversions</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> New Quote
              </button>
            </div>
            <div className="p-8 text-center text-slate-500">
              <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-700">Sales Quotation Registry</p>
              <p className="text-xs text-slate-400">Integrated with Phase 4 Product &amp; Pricing Catalogues</p>
            </div>
          </div>
        )}

        {/* TAB 3: SALES ORDERS */}
        {activeTab === 'orders' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-7xl mx-auto">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Sales Orders Register</h3>
                <p className="text-xs text-slate-500">Commercial orders with strict tenant isolation and state progression</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Create Sales Order
              </button>
            </div>
            <div className="p-8 text-center text-slate-500">
              <ShoppingBag className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-700">Sales Orders Live Directory</p>
              <p className="text-xs text-slate-400">Connected to schema <code className="font-mono">gigalibs_orders.sales_orders</code></p>
            </div>
          </div>
        )}

        {/* TAB 4: ATP MATRIX */}
        {activeTab === 'atp' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-7xl mx-auto">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Available-to-Promise (ATP) Inventory Allocations</h3>
                <p className="text-xs text-slate-500">Real-time soft reservations against Phase 5 Warehouse stock</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Recompute ATP
              </button>
            </div>
            <div className="p-8 text-center text-slate-500">
              <Layers className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-700">ATP Reservation Matrix</p>
              <p className="text-xs text-slate-400">Enforces Allocated Qty &le; Ordered Qty at database and service boundary</p>
            </div>
          </div>
        )}

        {/* TAB 5: FULFILLMENT */}
        {activeTab === 'fulfillment' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-7xl mx-auto">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Outbound Fulfillment Orders</h3>
                <p className="text-xs text-slate-500">Pick, pack, weigh, and carrier dispatch management</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
              >
                <Truck className="w-3.5 h-3.5" /> Create Shipment
              </button>
            </div>
            <div className="p-8 text-center text-slate-500">
              <Truck className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-700">Outbound Fulfillment Operations</p>
              <p className="text-xs text-slate-400">Guarantees Shipped Qty &le; Allocated Qty across multi-pack dispatch</p>
            </div>
          </div>
        )}

        {/* TAB 6: INVOICES */}
        {activeTab === 'invoices' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-7xl mx-auto">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Customer Accounts Receivable (AR) Invoices</h3>
                <p className="text-xs text-slate-500">Commercial billing generated strictly against confirmed shipments</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
              >
                <Receipt className="w-3.5 h-3.5" /> Generate Invoice
              </button>
            </div>
            <div className="p-8 text-center text-slate-500">
              <Receipt className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-700">AR Invoice Ledger</p>
              <p className="text-xs text-slate-400">Guarantees Invoiced Qty &le; Shipped Qty with integer minor unit math</p>
            </div>
          </div>
        )}

        {/* TAB 7: CREDIT MEMOS */}
        {activeTab === 'credit-memos' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-7xl mx-auto">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Customer Credit Memos &amp; RMA Returns</h3>
                <p className="text-xs text-slate-500">Post-sale customer returns and AR credit adjustments</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Issue Credit Memo
              </button>
            </div>
            <div className="p-8 text-center text-slate-500">
              <RotateCcw className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-700">RMA and Credit Memo Ledger</p>
              <p className="text-xs text-slate-400">Connected to schema <code className="font-mono">gigalibs_orders.customer_credit_memos</code></p>
            </div>
          </div>
        )}

        {/* TAB 8: APPLICATION DICTIONARY & EXTENSIONS */}
        {activeTab === 'extensions' && (
          <div className="space-y-6 max-w-7xl mx-auto">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-blue-600" />
                    Application Dictionary Dynamic Form Rendering
                  </h2>
                  <p className="text-xs text-slate-500">
                    Live UI generated declaratively via <code className="font-mono">&lt;DictionaryRenderer /&gt;</code> using Application Dictionary metadata.
                  </p>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  <ShieldCheck className="w-3.5 h-3.5" /> AST Validated
                </div>
              </div>

              <div className="mt-4">
                <DictionaryRenderer
                  manifest={DEFAULT_ORDERS_DICTIONARY_MANIFEST}
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
                Stored in <code className="font-mono text-blue-700">gigalibs_orders.sales_orders.custom_extensions</code>.
              </p>
              <pre className="mt-4 p-4 rounded-lg bg-slate-900 text-blue-400 font-mono text-xs overflow-x-auto">
                {JSON.stringify(customExtensions, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
