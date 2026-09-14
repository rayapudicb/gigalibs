'use client';

import React, { useState, useEffect } from 'react';
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  StatusBadge,
  Table,
  Text,
  toast,
} from '@medusajs/ui';
import {
  ArrowDownTray,
  BuildingTax,
  CheckCircleSolid,
  GridList,
  MagnifyingGlass,
  Plus,
  Sparkles,
} from '@medusajs/icons';
import { Database, Users, CreditCard, Layers, FileCheck2, ShieldCheck, Globe, Building, Coins, Clock, Info } from 'lucide-react';
import {
  MASTER_CUSTOMERS,
  MASTER_VENDORS,
  MASTER_ACCOUNTS,
  MASTER_COST_CENTERS,
  MASTER_SIGNERS,
  type MasterCustomer,
  type MasterVendor,
  type MasterAccount,
  type MasterCostCenter,
  type MasterSigner,
} from '@/lib/master-data-catalog';
import type { MasterDataScope, BaseMasterRecord } from '@/lib/master-data-store';

type MasterDataTab =
  | 'countries'
  | 'jurisdictions'
  | 'classifications'
  | 'accounts'
  | 'currencies'
  | 'payment-terms'
  | 'customers'
  | 'vendors'
  | 'cost-centers'
  | 'signers';

type ScopeFilter = 'ALL' | 'PLATFORM_GLOBAL' | 'PLATFORM_TEMPLATE' | 'TENANT_LOCAL';

interface MasterRecordRow {
  id: string;
  scope: MasterDataScope;
  code: string;
  name: string;
  status: string;
  version: number;
  isShadowed?: boolean;
  payload: Record<string, any>;
}

export function MasterDataStudioWorkbench() {
  const [activeTab, setActiveTab] = useState<MasterDataTab>('accounts');
  const [selectedScope, setSelectedScope] = useState<ScopeFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [allRecords, setAllRecords] = useState<MasterRecordRow[]>([]);
  const [showArchExplainer, setShowArchExplainer] = useState(true);

  // New item modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [targetScope, setTargetScope] = useState<MasterDataScope>('PLATFORM_GLOBAL');
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('ASSET');
  const [newDetail, setNewDetail] = useState('');

  const fetchRecords = () => {
    setLoading(true);
    fetch('/api/master-data')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.records) return;
        setAllRecords(
          data.records.map((r: any) => ({
            id: r.id,
            scope: r.scope,
            code: r.code,
            name: r.name,
            status: r.status,
            version: r.version,
            payload: r.payload || {},
          })),
        );
      })
      .catch((err) => {
        console.error('Failed to fetch master data', err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  // Filter by active tab, scope, and search query
  const filteredRecords = allRecords.filter((rec) => {
    let matchesTab = false;
    if (activeTab === 'accounts') matchesTab = rec.id.includes('acc-') || rec.code.match(/^\d{4}$/) !== null;
    else if (activeTab === 'currencies') matchesTab = rec.id.includes('curr-') || rec.code.length === 3; // ISO-4217 codes are 3 chars — no hardcoded list
    else if (activeTab === 'payment-terms') matchesTab = rec.id.includes('pt-') || rec.code.startsWith('NET_') || rec.code === 'DUE_ON_RECEIPT';
    else if (activeTab === 'customers') matchesTab = rec.id.includes('cust-') || rec.code.startsWith('CUST-');
    else if (activeTab === 'vendors') matchesTab = rec.id.includes('vend-') || rec.code.startsWith('VEND-');
    else if (activeTab === 'cost-centers') matchesTab = rec.id.includes('cc-') || rec.code.startsWith('CC-');
    else if (activeTab === 'signers') matchesTab = rec.id.includes('sgn-') || rec.payload?.email !== undefined;

    if (!matchesTab) return false;

    if (selectedScope !== 'ALL' && rec.scope !== selectedScope) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      rec.code.toLowerCase().includes(q) ||
      rec.name.toLowerCase().includes(q) ||
      JSON.stringify(rec.payload).toLowerCase().includes(q)
    );
  });

  const handleCreateRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode || !newName) return;

    const payloadObj: Record<string, any> = {
      description: newDetail || 'Governed master data catalog record.',
    };

    if (activeTab === 'accounts') {
      payloadObj.category = newCategory;
      payloadObj.standard = 'GAAP / IFRS ASC 205';
      payloadObj.normalBalance = newCategory === 'ASSET' || newCategory === 'EXPENSE' ? 'DEBIT' : 'CREDIT';
    } else if (activeTab === 'currencies') {
      payloadObj.symbol = newDetail || '$';
      payloadObj.decimals = 2;
    } else if (activeTab === 'payment-terms') {
      payloadObj.days = parseInt(newDetail, 10) || 30;
    } else if (activeTab === 'customers') {
      payloadObj.billingEmail = newDetail || '';
      payloadObj.taxId = '';
      payloadObj.currency = 'USD';
      payloadObj.paymentTerms = 'NET_30';
      payloadObj.creditLimitUsd = 1000000;
    } else if (activeTab === 'vendors') {
      payloadObj.remittanceEmail = newDetail || 'remit@vendor.com';
      payloadObj.taxId = '';
      payloadObj.defaultCategory = newCategory;
      payloadObj.paymentMethod = 'ACH_DIRECT';
      payloadObj.currency = 'USD';
    }

    const newRecord = {
      entityKey: activeTab,
      domain: activeTab === 'accounts' ? 'FINANCE' : activeTab === 'currencies' || activeTab === 'payment-terms' ? 'REFERENCE' : 'COUNTERPARTY',
      code: newCode,
      name: newName,
      scope: targetScope,
      recordPayload: payloadObj,
    };

    fetch('/api/master-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRecord),
    })
      .then((res) => {
        if (res.ok) {
          toast.success('Master Entity Created', {
            description: `Published ${newCode} under scope ${targetScope}.`,
          });
          fetchRecords();
        } else {
          toast.error('Creation Failed', { description: 'Server rejected master data record.' });
        }
      })
      .catch(() => {
        toast.error('Network Error', { description: 'Could not connect to master data engine.' });
      });

    setModalOpen(false);
    setNewCode('');
    setNewName('');
    setNewDetail('');
  };

  const handleExportCsv = () => {
    if (filteredRecords.length === 0) return;
    const headers = ['id', 'scope', 'code', 'name', 'status', 'version', 'details'];
    const csvRows = [
      headers.join(','),
      ...filteredRecords.map((r) =>
        [
          `"${r.id}"`,
          `"${r.scope}"`,
          `"${r.code}"`,
          `"${r.name.replace(/"/g, '""')}"`,
          `"${r.status}"`,
          r.version,
          `"${JSON.stringify(r.payload).replace(/"/g, '""')}"`,
        ].join(','),
      ),
    ].join('\n');

    const blob = new Blob([csvRows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeTab}_${selectedScope.toLowerCase()}_master_data.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const globalCount = allRecords.filter((r) => r.scope === 'PLATFORM_GLOBAL').length;
  const tenantCount = allRecords.filter((r) => r.scope === 'TENANT_LOCAL').length;

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Studio Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Badge color="purple">3-Tier Master Data Governance</Badge>
            <Badge color="blue">Multi-Tier MDM Architecture</Badge>
            <StatusBadge color="green">PLATFORM &amp; TENANT BOUNDARY</StatusBadge>
          </div>
          <Heading level="h1" className="mt-2 text-2xl font-bold tracking-tight text-zinc-950 flex items-center gap-2.5">
            <Database className="w-6 h-6 text-purple-600" />
            <span>Master Data Governance Hub</span>
          </Heading>
          <Text className="mt-1 text-sm text-zinc-600">
            Authoritative reference catalog cascading platform-level global standards down to tenant workspaces with isolated local overrides.
          </Text>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            className="flex items-center gap-1.5 text-xs font-medium"
            onClick={handleExportCsv}
            disabled={filteredRecords.length === 0}
          >
            <ArrowDownTray className="w-3.5 h-3.5 text-blue-600" />
            <span>Export CSV</span>
          </Button>
          <Button
            variant="primary"
            className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5 text-xs"
            onClick={() => {
              setTargetScope(selectedScope === 'PLATFORM_GLOBAL' ? 'PLATFORM_GLOBAL' : 'TENANT_LOCAL');
              setModalOpen(true);
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Master Entity</span>
          </Button>
        </div>
      </div>

      {/* Platform Admin Architecture Explainer Banner */}
      {showArchExplainer && (
        <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border border-purple-200 rounded-2xl p-6 relative">
          <button
            type="button"
            onClick={() => setShowArchExplainer(false)}
            className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 text-xs font-bold"
          >
            ✕ Dismiss Guide
          </button>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-600 rounded-xl text-white shadow-sm shrink-0">
              <Globe className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <Heading level="h2" className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <span>Enterprise MDM Architecture: How Platform Admin &amp; Tenants Coexist</span>
                <Badge color="purple" size="small">True Multi-Tenant SaaS Pattern</Badge>
              </Heading>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3 text-xs text-zinc-700">
                <div className="bg-white/80 p-3 rounded-xl border border-purple-100 shadow-xs">
                  <div className="flex items-center gap-1.5 font-bold text-purple-900 mb-1">
                    <Globe className="w-3.5 h-3.5 text-purple-600" />
                    <span>Tier 1: PLATFORM_GLOBAL</span>
                  </div>
                  <p className="leading-relaxed">
                    Maintained by <strong>Platform Admins</strong>. Reference currencies, GAAP Chart of Accounts, and standard payment terms. Available read-only to all tenants instantly with zero per-tenant DB table overhead.
                  </p>
                </div>
                <div className="bg-white/80 p-3 rounded-xl border border-purple-100 shadow-xs">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900 mb-1">
                    <Building className="w-3.5 h-3.5 text-blue-600" />
                    <span>Tier 2: TENANT_LOCAL</span>
                  </div>
                  <p className="leading-relaxed">
                    Created by <strong>Tenant Operators or ERP Sync</strong> (Salesforce, SAP, NetSuite). Isolated to the tenant workspace (Customers, Vendors, Cost Centers). Stored with tenant scoping, not in global tables.
                  </p>
                </div>
                <div className="bg-white/80 p-3 rounded-xl border border-purple-100 shadow-xs">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-900 mb-1">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Tier 3: Shadowing &amp; Overrides</span>
                  </div>
                  <p className="leading-relaxed">
                    If a tenant creates a local record matching a global code (e.g. custom GL account <code>1010</code>), the metadata engine <strong>shadows the global definition</strong> locally without polluting other tenants.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Governance Scope Level Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-zinc-50 border border-zinc-200">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Governance Scope Filter:</span>
          <div className="inline-flex rounded-lg border border-zinc-300 bg-white p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setSelectedScope('ALL')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                selectedScope === 'ALL'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Unified Hierarchy ({allRecords.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedScope('PLATFORM_GLOBAL')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1 ${
                selectedScope === 'PLATFORM_GLOBAL'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Globe className="w-3 h-3" />
              <span>Platform Global Admin ({globalCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedScope('TENANT_LOCAL')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1 ${
                selectedScope === 'TENANT_LOCAL'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Building className="w-3 h-3" />
              <span>Tenant Local Workspace ({tenantCount})</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="w-full sm:w-64">
          <Input
            type="search"
            size="small"
            placeholder="Search code, title, details..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Navigation Tabs (10 Enterprise Master Data Domains) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 text-sm">
        {[
          { id: 'countries', label: 'Countries (ISO-3166)', icon: Globe, defaultScope: 'PLATFORM_GLOBAL' },
          { id: 'jurisdictions', label: 'Tax Jurisdictions', icon: BuildingTax, defaultScope: 'PLATFORM_GLOBAL' },
          { id: 'classifications', label: 'Data Classifications (5 Tiers)', icon: ShieldCheck, defaultScope: 'PLATFORM_GLOBAL' },
          { id: 'accounts', label: 'Chart of Accounts (GAAP)', icon: Layers, defaultScope: 'PLATFORM_GLOBAL' },
          { id: 'currencies', label: 'Currencies (ISO-4217)', icon: Coins, defaultScope: 'PLATFORM_GLOBAL' },
          { id: 'payment-terms', label: 'Standard Payment Terms', icon: Clock, defaultScope: 'PLATFORM_GLOBAL' },
          { id: 'customers', label: 'Customers & Debtors', icon: Users, defaultScope: 'TENANT_LOCAL' },
          { id: 'vendors', label: 'Suppliers & Vendors', icon: CreditCard, defaultScope: 'TENANT_LOCAL' },
          { id: 'cost-centers', label: 'Cost Centers & Budgets', icon: Building, defaultScope: 'TENANT_LOCAL' },
          { id: 'signers', label: 'Corporate Signers Directory', icon: FileCheck2, defaultScope: 'TENANT_LOCAL' },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          const tabCount = allRecords.filter((r) => {
            if (tab.id === 'countries') return r.id.includes('country-') || r.payload?.alpha3 !== undefined;
            if (tab.id === 'jurisdictions') return r.id.includes('jur-') || r.payload?.taxType !== undefined;
            if (tab.id === 'classifications') return r.id.includes('class-') || r.payload?.retentionYears !== undefined;
            if (tab.id === 'accounts') return r.id.includes('acc-') || r.code.match(/^\d{4}$/) !== null;
            if (tab.id === 'currencies') return r.id.includes('curr-') || r.code.length === 3; // ISO-4217
            if (tab.id === 'payment-terms') return r.id.includes('pt-') || r.code.startsWith('NET_') || r.code === 'DUE_ON_RECEIPT';
            if (tab.id === 'customers') return r.id.includes('cust-') || r.code.startsWith('CUST-');
            if (tab.id === 'vendors') return r.id.includes('vend-') || r.code.startsWith('VEND-');
            if (tab.id === 'cost-centers') return r.id.includes('cc-') || r.code.startsWith('CC-');
            if (tab.id === 'signers') return r.id.includes('sgn-') || r.payload?.email !== undefined;
            return false;
          }).length;


          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as MasterDataTab)}
              className={`pb-3 px-4 font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                active
                  ? 'border-purple-600 text-purple-900 font-bold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-purple-600' : 'text-zinc-400'}`} />
              <span>{tab.label}</span>
              <Badge color={active ? 'purple' : 'grey'} size="small" className="font-mono">
                {tabCount}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Main Master Data Table */}
      <Container className="p-0 border border-zinc-200 rounded-xl overflow-hidden shadow-xs bg-white">
        <Table>
          <Table.Header>
            <Table.Row className="bg-zinc-50/80">
              <Table.HeaderCell className="text-xs font-bold text-zinc-700">Governance Tier</Table.HeaderCell>
              <Table.HeaderCell className="text-xs font-bold text-zinc-700">Entity Code</Table.HeaderCell>
              <Table.HeaderCell className="text-xs font-bold text-zinc-700">Legal Name / Title</Table.HeaderCell>
              <Table.HeaderCell className="text-xs font-bold text-zinc-700">Specifications &amp; Configuration</Table.HeaderCell>
              <Table.HeaderCell className="text-xs font-bold text-zinc-700">Status</Table.HeaderCell>
              <Table.HeaderCell className="text-xs font-bold text-zinc-700 text-right">Version</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {loading ? (
              <Table.Row>
                <td colSpan={6} className="text-center py-12 text-zinc-500 text-xs">
                  Loading Master Data Governance Records...
                </td>
              </Table.Row>
            ) : filteredRecords.length === 0 ? (
              <Table.Row>
                <td colSpan={6} className="text-center py-12 text-zinc-500 text-xs">
                  No master data records found under scope &quot;{selectedScope}&quot; matching your query.
                </td>
              </Table.Row>
            ) : (
              filteredRecords.map((rec) => {
                const isGlobal = rec.scope === 'PLATFORM_GLOBAL';
                return (
                  <Table.Row key={rec.id} className="hover:bg-zinc-50/50 transition-colors">
                    <Table.Cell>
                      <div className="flex flex-col gap-1">
                        <Badge color={isGlobal ? 'purple' : 'green'} size="small" className="w-fit font-bold">
                          {isGlobal ? 'PLATFORM GLOBAL' : 'TENANT LOCAL'}
                        </Badge>
                        <span className="text-[10px] text-zinc-400">
                          {isGlobal ? 'Propagated cross-tenant' : 'Private tenant partition'}
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="font-mono text-xs font-bold text-purple-900">
                      {rec.code}
                    </Table.Cell>
                    <Table.Cell className="text-xs font-medium text-zinc-900">
                      {rec.name}
                    </Table.Cell>
                    <Table.Cell className="text-xs text-zinc-600">
                      {activeTab === 'countries' && (
                        <div className="flex items-center gap-2 font-mono">
                          <span className="font-bold text-zinc-900">{rec.payload?.alpha3 || rec.code}</span>
                          <span className="text-zinc-500">Cur: {rec.payload?.defaultCurrency ?? 'USD'}</span>
                          <span className="text-zinc-400">({rec.payload?.region ?? 'GLOBAL'})</span>
                          <Badge color="purple" size="small">{rec.payload?.callingCode ?? '+1'}</Badge>
                        </div>
                      )}
                      {activeTab === 'jurisdictions' && (
                        <div className="flex items-center gap-2">
                          <Badge color="blue" size="small">{rec.payload?.taxType || 'TAX'}</Badge>
                          <span className="font-bold text-zinc-800">{rec.payload?.defaultStandardRatePercent ?? 0}% Standard</span>
                          <span className="text-zinc-400 truncate max-w-xs">{rec.payload?.statutoryAuthority || 'Tax Dept'}</span>
                        </div>
                      )}
                      {activeTab === 'classifications' && (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <Badge color="purple" size="small">Retention: {rec.payload?.retentionYears ?? 7} Yrs</Badge>
                            <span className="font-mono text-[11px] text-zinc-700 font-semibold">{rec.payload?.maskingPolicy || 'NONE'}</span>
                            <span className="text-zinc-400 text-[11px] truncate max-w-sm">{rec.payload?.legalBasis}</span>
                          </div>
                          <span className="text-[11px] text-zinc-500">{rec.payload?.description}</span>
                        </div>
                      )}
                      {activeTab === 'accounts' && (

                        <div className="flex items-center gap-2">
                          <Badge color="blue" size="small">{rec.payload?.category || 'ACCOUNT'}</Badge>
                          <span className="text-zinc-500">{rec.payload?.description || 'GAAP ASC 205 Account'}</span>
                        </div>
                      )}
                      {activeTab === 'currencies' && (
                        <div className="flex items-center gap-2 font-mono">
                          <span className="font-bold text-zinc-900">{rec.payload?.symbol || '$'}</span>
                          <span className="text-zinc-500">Decimals: {rec.payload?.decimals ?? 2}</span>
                        </div>
                      )}
                      {activeTab === 'payment-terms' && (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-800">{rec.payload?.days ?? 30} Days Maturity</span>
                          <span className="text-zinc-400">Standard Terms</span>
                        </div>
                      )}
                      {activeTab === 'customers' && (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span>{rec.payload?.billingEmail || 'finance@customer.invalid'}</span>
                            <span className="rounded bg-zinc-100 px-1 font-mono text-[10px] font-bold text-zinc-800">
                              {rec.payload?.countryCode ?? 'US'} / {rec.payload?.jurisdictionCode ?? 'US-CA'}
                            </span>
                            <span className="rounded bg-purple-100 text-purple-800 px-1 text-[9px] font-semibold">
                              {rec.payload?.dataClassification ?? 'FINANCIAL_SOX'}
                            </span>
                          </div>
                          <span className="text-[11px] text-zinc-400 font-mono">Credit Limit: ${((rec.payload?.creditLimitUsd || 1000000)).toLocaleString()}</span>
                        </div>
                      )}
                      {activeTab === 'vendors' && (
                        <div className="flex flex-col gap-0.5">
                          <span>{rec.payload?.remittanceEmail || 'ap@vendor.invalid'}</span>
                          <span className="text-[11px] text-zinc-400">{rec.payload?.defaultCategory || 'General Supplier'}</span>
                        </div>
                      )}
                      {activeTab === 'cost-centers' && (
                        <div className="flex flex-col gap-0.5">
                          <span>Manager: {rec.payload?.managerName || 'Operations Lead'}</span>
                          <span className="text-[11px] text-zinc-400 font-mono">Budget: ${((rec.payload?.allocatedBudgetUsd || 500000)).toLocaleString()}</span>
                        </div>
                      )}
                      {activeTab === 'signers' && (
                        <div className="flex flex-col gap-0.5">
                          <span>{rec.payload?.email || 'signer@organization.invalid'}</span>
                          <span className="text-[11px] text-zinc-400">{rec.payload?.role || 'Authorized Signatory'}</span>
                        </div>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={rec.status === 'ACTIVE' ? 'green' : 'grey'}>
                        {rec.status}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell className="text-right font-mono text-xs text-zinc-500">
                      v{rec.version}
                    </Table.Cell>
                  </Table.Row>
                );
              })
            )}
          </Table.Body>
        </Table>
      </Container>

      {/* Modal for Creating New Master Entity with Scope Selection */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <Heading level="h2" className="text-base font-bold text-zinc-900">
                New Master Data Record ({activeTab})
              </Heading>
              <button
                type="button"
                className="text-zinc-400 hover:text-zinc-700 font-bold"
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRecord} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-zinc-700 mb-1">Target Governance Scope *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetScope('PLATFORM_GLOBAL')}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 ${
                      targetScope === 'PLATFORM_GLOBAL'
                        ? 'border-purple-600 bg-purple-50 text-purple-950 font-bold'
                        : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    <span className="flex items-center gap-1 text-purple-700">
                      <Globe className="w-3.5 h-3.5" />
                      PLATFORM_GLOBAL
                    </span>
                    <span className="text-[10px] text-zinc-500 font-normal">Propagates to all tenants globally</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetScope('TENANT_LOCAL')}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 ${
                      targetScope === 'TENANT_LOCAL'
                        ? 'border-purple-600 bg-purple-50 text-purple-950 font-bold'
                        : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    <span className="flex items-center gap-1 text-green-700">
                      <Building className="w-3.5 h-3.5" />
                      TENANT_LOCAL
                    </span>
                    <span className="text-[10px] text-zinc-500 font-normal">Private to this workspace only</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Entity Code / Key *</label>
                <input
                  type="text"
                  required
                  className="w-full rounded-lg border border-zinc-300 p-2 text-xs font-mono uppercase"
                  placeholder="e.g. GL-4090 or CUST-ALPHA"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Entity Name / Legal Title *</label>
                <input
                  type="text"
                  required
                  className="w-full rounded-lg border border-zinc-300 p-2 text-xs"
                  placeholder="e.g. Enterprise Consulting Revenue"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>

              {activeTab === 'accounts' && (
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Account Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 p-2 text-xs bg-white"
                  >
                    <option value="ASSET">ASSET (Debit Normal)</option>
                    <option value="LIABILITY">LIABILITY (Credit Normal)</option>
                    <option value="EQUITY">EQUITY (Credit Normal)</option>
                    <option value="REVENUE">REVENUE (Credit Normal)</option>
                    <option value="EXPENSE">EXPENSE (Debit Normal)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  {activeTab === 'currencies' ? 'Currency Symbol' : activeTab === 'payment-terms' ? 'Payment Term Days' : 'Specification / Email'}
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-zinc-300 p-2 text-xs"
                  placeholder={activeTab === 'currencies' ? '$' : activeTab === 'payment-terms' ? '30' : 'finance@organization.com'}
                  value={newDetail}
                  onChange={(e) => setNewDetail(e.target.value)}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-zinc-200">
                <Button variant="secondary" size="small" type="button" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="small" type="submit" className="bg-purple-600 text-white">
                  Publish to {targetScope === 'PLATFORM_GLOBAL' ? 'Global Catalog' : 'Tenant Workspace'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
