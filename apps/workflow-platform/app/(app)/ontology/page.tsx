'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Badge,
  Button,
  Heading,
  Table,
  Text,
  Alert,
} from '@medusajs/ui';
import { ArrowPath } from '@medusajs/icons';
import {
  Building2,
  FileText,
  Layers,
  Network,
  Database,
  Cpu,
  RefreshCw,
  X,
  Plus,
  BarChart3,
} from 'lucide-react';

type Tab = 'graph' | 'parties' | 'agreements' | 'transactions' | 'assets';

interface Party {
  id: string;
  code: string;
  name: string;
  category: string;
  riskTier: string;
  creditScore: number | null;
  country: string;
  activeAgreementsCount: number;
  totalTransactionVolumeUsd: number;
}

interface Agreement {
  id: string;
  code: string;
  title: string;
  partyCode: string;
  type: string;
  status: string;
  expirationDate: string;
  totalValueUsd: number;
  paymentTerms: string;
}

interface Transaction {
  id: string;
  code: string;
  partyCode: string;
  agreementCode: string;
  type: string;
  amountUsd: number;
  status: string;
  transactionDate: string;
}

interface Asset {
  id: string;
  code: string;
  name: string;
  category: string;
  partyCode: string;
  operationalStatus: string;
  location: string;
}

interface Party360Stats {
  totalCommittedContractUsd: number;
  totalBilledUsd: number;
  disputedAmountUsd: number;
  matchDefectRatePercent: number;
  activeAssetCount: number;
  complianceScore: number;
}

interface Party360View {
  party: Party;
  agreements: Agreement[];
  transactions: Transaction[];
  assets: Asset[];
  stats: Party360Stats;
}

const RISK_COLOR: Record<string, 'green' | 'orange' | 'red'> = {
  LOW: 'green',
  MEDIUM: 'orange',
  HIGH: 'red',
};

const STATUS_COLOR: Record<string, 'green' | 'orange' | 'red' | 'blue'> = {
  ACTIVE: 'green',
  DISPUTED: 'red',
  EXPIRING_SOON: 'orange',
  RECONCILED: 'green',
  PENDING_MATCH: 'blue',
  DISCREPANCY_FLAGGED: 'red',
  OPTIMAL: 'green',
  DEGRADED: 'orange',
  MAINTENANCE: 'blue',
};

export default function OntologyPage() {
  const [activeTab, setActiveTab] = useState<Tab>('graph');
  const [parties, setParties] = useState<Party[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [graph, setGraph] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [party360, setParty360] = useState<Party360View | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showCreateParty, setShowCreateParty] = useState(false);
  const [newParty, setNewParty] = useState({ code: '', name: '', category: 'SUPPLIER', risk_tier: 'LOW', country: 'US' });
  const [creating, setCreating] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, aRes, tRes, asRes, gRes] = await Promise.all([
        fetch('/api/ontology/parties'),
        fetch('/api/ontology/agreements'),
        fetch('/api/ontology/transactions'),
        fetch('/api/ontology/assets'),
        fetch('/api/ontology/graph'),
      ]);

      if (pRes.status === 403) {
        const body = await pRes.json().catch(() => ({}));
        setError(body.title || 'Access denied: "operational-ontology" entitlement or "ontology:read" permission required.');
        return;
      }

      if (pRes.ok) setParties(await pRes.json());
      if (aRes.ok) setAgreements(await aRes.json());
      if (tRes.ok) setTransactions(await tRes.json());
      if (asRes.ok) setAssets(await asRes.json());
      if (gRes.ok) setGraph(await gRes.json());
    } catch (err: any) {
      setError(`Unable to connect to Operational Ontology service: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleParty360 = async (code: string) => {
    try {
      const res = await fetch(`/api/ontology/parties/${encodeURIComponent(code)}/360`);
      if (res.ok) {
        setParty360(await res.json());
        setIsDrawerOpen(true);
      }
    } catch {
      // silently ignore — user can retry
    }
  };

  const handleCreateParty = async () => {
    if (!newParty.code || !newParty.name) return;
    setCreating(true);
    try {
      const res = await fetch('/api/ontology/parties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newParty),
      });
      if (res.ok) {
        setShowCreateParty(false);
        setNewParty({ code: '', name: '', category: 'SUPPLIER', risk_tier: 'LOW', country: 'US' });
        await loadAll();
      }
    } catch {
      // noop
    } finally {
      setCreating(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'graph', label: 'Graph Overview', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'parties', label: `Parties (${parties.length})`, icon: <Building2 className="w-4 h-4" /> },
    { id: 'agreements', label: `Agreements (${agreements.length})`, icon: <FileText className="w-4 h-4" /> },
    { id: 'transactions', label: `Transactions (${transactions.length})`, icon: <Database className="w-4 h-4" /> },
    { id: 'assets', label: `Assets (${assets.length})`, icon: <Cpu className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col gap-6 p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <Heading level="h1" className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              Operational Ontology & Sovereign Digital Twin
            </Heading>
            <Badge color="blue" size="small">360° ENTITY GRAPH</Badge>
          </div>
          <Text className="text-gray-500 dark:text-gray-400 mt-1">
            360-degree party, agreement, asset, and transaction knowledge graph with sovereign tenant isolation.
          </Text>
        </div>
        <Button variant="secondary" size="small" onClick={loadAll} disabled={loading} className="flex items-center gap-1.5">
          <ArrowPath className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Parties', count: parties.length, icon: <Building2 className="w-4 h-4 text-blue-500" /> },
          { label: 'Agreements', count: agreements.length, icon: <FileText className="w-4 h-4 text-purple-500" /> },
          { label: 'Transactions', count: transactions.length, icon: <Database className="w-4 h-4 text-amber-500" /> },
          { label: 'Assets', count: assets.length, icon: <Cpu className="w-4 h-4 text-emerald-500" /> },
        ].map((card) => (
          <div key={card.label} className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{card.label}</span>
              {card.icon}
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-gray-900 dark:text-white">{card.count}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-gray-200 dark:border-gray-800 gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Graph Overview */}
      {activeTab === 'graph' && (
        <div className="flex flex-col gap-6">
          {!graph && !loading ? (
            <div className="p-12 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
              <Network className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              <Heading level="h3" className="text-base font-semibold text-gray-900 dark:text-white">No Graph Data</Heading>
              <Text className="text-gray-500 text-sm mt-1">Create parties, agreements, transactions and assets to build the knowledge graph.</Text>
            </div>
          ) : graph ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Parties by Category */}
              <div className="p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-500" /> Parties by Category
                </h3>
                {graph.parties?.byCategory?.length > 0 ? (
                  graph.parties.byCategory.map((row: any) => (
                    <div key={row.category} className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{row.category.replace(/_/g, ' ')}</span>
                      <Badge color="blue" size="small">{row.count}</Badge>
                    </div>
                  ))
                ) : (
                  <Text className="text-gray-400 text-sm">No party data</Text>
                )}
              </div>

              {/* Agreements by Type */}
              <div className="p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-500" /> Agreements by Type
                </h3>
                {graph.agreements?.byType?.length > 0 ? (
                  graph.agreements.byType.map((row: any) => (
                    <div key={row.type} className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <span className="text-xs text-gray-600 dark:text-gray-400">{row.type.replace(/_/g, ' ')}</span>
                      <Badge color="purple" size="small">{row.count}</Badge>
                    </div>
                  ))
                ) : (
                  <Text className="text-gray-400 text-sm">No agreement data</Text>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Parties */}
      {activeTab === 'parties' && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button variant="primary" size="small" onClick={() => setShowCreateParty(true)} className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Add Party
            </Button>
          </div>

          {parties.length === 0 && !loading ? (
            <div className="p-12 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
              <Building2 className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              <Heading level="h3" className="text-base font-semibold text-gray-900 dark:text-white">No Parties</Heading>
              <Text className="text-gray-500 text-sm mt-1">Add parties (suppliers, customers, agencies) to start building the digital twin.</Text>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-xs">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Code</Table.HeaderCell>
                    <Table.HeaderCell>Name</Table.HeaderCell>
                    <Table.HeaderCell>Category</Table.HeaderCell>
                    <Table.HeaderCell>Risk Tier</Table.HeaderCell>
                    <Table.HeaderCell>Credit Score</Table.HeaderCell>
                    <Table.HeaderCell>Actions</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {parties.map((party) => (
                    <Table.Row key={party.id}>
                      <Table.Cell className="font-mono text-xs font-semibold text-gray-900 dark:text-white">{party.code}</Table.Cell>
                      <Table.Cell className="text-sm text-gray-900 dark:text-white">{party.name}</Table.Cell>
                      <Table.Cell className="text-xs text-gray-500">{party.category.replace(/_/g, ' ')}</Table.Cell>
                      <Table.Cell>
                        <Badge color={RISK_COLOR[party.riskTier] || 'blue'} size="small">{party.riskTier}</Badge>
                      </Table.Cell>
                      <Table.Cell className="font-mono text-sm text-gray-700 dark:text-gray-300">
                        {party.creditScore ?? '—'}
                      </Table.Cell>
                      <Table.Cell>
                        <Button variant="secondary" size="small" onClick={() => handleParty360(party.code)}>
                          360° View
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Agreements */}
      {activeTab === 'agreements' && (
        <div className="flex flex-col gap-4">
          {agreements.length === 0 && !loading ? (
            <div className="p-12 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
              <FileText className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              <Heading level="h3" className="text-base font-semibold text-gray-900 dark:text-white">No Agreements</Heading>
              <Text className="text-gray-500 text-sm mt-1">Agreements are created when parties enter contracts.</Text>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-xs">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Code</Table.HeaderCell>
                    <Table.HeaderCell>Title</Table.HeaderCell>
                    <Table.HeaderCell>Party</Table.HeaderCell>
                    <Table.HeaderCell>Type</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                    <Table.HeaderCell>Value (USD)</Table.HeaderCell>
                    <Table.HeaderCell>Expires</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {agreements.map((ag) => (
                    <Table.Row key={ag.id}>
                      <Table.Cell className="font-mono text-xs">{ag.code}</Table.Cell>
                      <Table.Cell className="text-sm text-gray-900 dark:text-white max-w-xs truncate">{ag.title}</Table.Cell>
                      <Table.Cell className="font-mono text-xs text-gray-500">{ag.partyCode}</Table.Cell>
                      <Table.Cell className="text-xs text-gray-500">{ag.type.replace(/_/g, ' ')}</Table.Cell>
                      <Table.Cell>
                        <Badge color={STATUS_COLOR[ag.status] || 'blue'} size="small">{ag.status.replace(/_/g, ' ')}</Badge>
                      </Table.Cell>
                      <Table.Cell className="font-mono text-sm font-bold text-gray-900 dark:text-white">
                        ${Number(ag.totalValueUsd).toLocaleString()}
                      </Table.Cell>
                      <Table.Cell className="text-xs text-gray-500">
                        {new Date(ag.expirationDate).toLocaleDateString()}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Transactions */}
      {activeTab === 'transactions' && (
        <div className="flex flex-col gap-4">
          {transactions.length === 0 && !loading ? (
            <div className="p-12 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
              <Database className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              <Heading level="h3" className="text-base font-semibold text-gray-900 dark:text-white">No Transactions</Heading>
              <Text className="text-gray-500 text-sm mt-1">Transactions appear here as they are created and reconciled.</Text>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-xs">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Code</Table.HeaderCell>
                    <Table.HeaderCell>Party</Table.HeaderCell>
                    <Table.HeaderCell>Type</Table.HeaderCell>
                    <Table.HeaderCell>Amount (USD)</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                    <Table.HeaderCell>Date</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {transactions.map((tx) => (
                    <Table.Row key={tx.id}>
                      <Table.Cell className="font-mono text-xs">{tx.code}</Table.Cell>
                      <Table.Cell className="font-mono text-xs text-gray-500">{tx.partyCode}</Table.Cell>
                      <Table.Cell className="text-xs text-gray-500">{tx.type}</Table.Cell>
                      <Table.Cell className="font-mono text-sm font-bold text-gray-900 dark:text-white">
                        ${Number(tx.amountUsd).toLocaleString()}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color={STATUS_COLOR[tx.status] || 'blue'} size="small">{tx.status.replace(/_/g, ' ')}</Badge>
                      </Table.Cell>
                      <Table.Cell className="text-xs text-gray-500">
                        {new Date(tx.transactionDate).toLocaleDateString()}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Assets */}
      {activeTab === 'assets' && (
        <div className="flex flex-col gap-4">
          {assets.length === 0 && !loading ? (
            <div className="p-12 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
              <Cpu className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              <Heading level="h3" className="text-base font-semibold text-gray-900 dark:text-white">No Assets</Heading>
              <Text className="text-gray-500 text-sm mt-1">Operational assets linked to parties and agreements appear here.</Text>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {assets.map((asset) => (
                <div key={asset.id} className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xs">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">{asset.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{asset.code}</p>
                    </div>
                    <Badge color={STATUS_COLOR[asset.operationalStatus] || 'blue'} size="small">
                      {asset.operationalStatus}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500">{asset.category.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-400 mt-1">{asset.location}</p>
                  <p className="text-xs text-gray-400">Party: {asset.partyCode}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 360° Party Drawer */}
      {isDrawerOpen && party360 && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-start justify-end p-4 z-50">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl w-full max-w-xl h-full max-h-screen overflow-y-auto shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
              <div>
                <Heading level="h2" className="text-base font-bold text-gray-900 dark:text-white">
                  {party360.party.name}
                </Heading>
                <p className="text-xs text-gray-500 font-mono">{party360.party.code}</p>
              </div>
              <button onClick={() => setIsDrawerOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-5">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: 'Committed', value: `$${(party360.stats.totalCommittedContractUsd / 1_000_000).toFixed(1)}M` },
                  { label: 'Billed', value: `$${(party360.stats.totalBilledUsd / 1_000_000).toFixed(1)}M` },
                  { label: 'Compliance', value: `${party360.stats.complianceScore}%` },
                ].map((stat) => (
                  <div key={stat.label} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <p className="text-xs text-gray-500">{stat.label}</p>
                    <p className="font-bold font-mono text-lg text-gray-900 dark:text-white">{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 text-sm">
                <span className="text-gray-500">Defect Rate:</span>
                <span className={`font-semibold ${party360.stats.matchDefectRatePercent > 20 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {party360.stats.matchDefectRatePercent}%
                </span>
                <span className="text-gray-500 ml-3">Disputed:</span>
                <span className="font-semibold text-amber-600">
                  ${party360.stats.disputedAmountUsd.toLocaleString()}
                </span>
              </div>

              {/* Agreements */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Agreements ({party360.agreements.length})</h4>
                {party360.agreements.length === 0 ? (
                  <p className="text-xs text-gray-400">No agreements</p>
                ) : (
                  party360.agreements.slice(0, 5).map((ag) => (
                    <div key={ag.id} className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <span className="text-xs font-mono text-gray-700 dark:text-gray-300">{ag.code}</span>
                      <Badge color={STATUS_COLOR[ag.status] || 'blue'} size="small">{ag.status}</Badge>
                    </div>
                  ))
                )}
              </div>

              {/* Transactions */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Recent Transactions ({party360.transactions.length})</h4>
                {party360.transactions.length === 0 ? (
                  <p className="text-xs text-gray-400">No transactions</p>
                ) : (
                  party360.transactions.slice(0, 5).map((tx) => (
                    <div key={tx.id} className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <span className="text-xs font-mono text-gray-700 dark:text-gray-300">${Number(tx.amountUsd).toLocaleString()}</span>
                      <Badge color={STATUS_COLOR[tx.status] || 'blue'} size="small">{tx.status.replace(/_/g, ' ')}</Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Party Modal */}
      {showCreateParty && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800 mb-4">
              <Heading level="h2" className="text-lg font-bold">Add Party</Heading>
              <button onClick={() => setShowCreateParty(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="flex flex-col gap-3">
              {[
                { label: 'Code *', key: 'code', type: 'text', placeholder: 'SUPPLIER-001' },
                { label: 'Name *', key: 'name', type: 'text', placeholder: 'Acme Corp' },
                { label: 'Country', key: 'country', type: 'text', placeholder: 'US' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
                  <input
                    type={type}
                    value={(newParty as any)[key]}
                    onChange={(e) => setNewParty((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                <select
                  value={newParty.category}
                  onChange={(e) => setNewParty((p) => ({ ...p, category: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  {['SUPPLIER', 'CUSTOMER', 'FEDERAL_AGENCY', 'REGIONAL_OPERATOR'].map((c) => (
                    <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Risk Tier</label>
                <select
                  value={newParty.risk_tier}
                  onChange={(e) => setNewParty((p) => ({ ...p, risk_tier: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  {['LOW', 'MEDIUM', 'HIGH'].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="secondary" size="small" onClick={() => setShowCreateParty(false)}>Cancel</Button>
              <Button variant="primary" size="small" disabled={creating || !newParty.code || !newParty.name} onClick={handleCreateParty}>
                {creating ? 'Creating...' : 'Create Party'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
