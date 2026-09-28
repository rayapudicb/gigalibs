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
import {
  ArrowPath,
  Sparkles,
  CheckCircleSolid,
  ShieldCheck,
} from '@medusajs/icons';
import {
  Zap,
  Radio,
  Building2,
  CreditCard,
  Coins,
  Scale,
  Database,
  Package,
  Receipt,
  Wallet,
  BarChart3,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

interface MeteringInfo {
  dimensionCode: string;
  dimensionName: string;
  unitName: string;
  includedMonthlyUnits: number;
  overageUnitPriceUsd: number;
  meteringType: string;
}

interface CurrentUsage {
  unitsConsumed: number;
  includedUnits: number;
  percentConsumed: number;
  overageCostUsd: number;
}

interface CatalogModule {
  code: string;
  name: string;
  category: string;
  monthlyPriceUsd: number;
  description: string;
  icon: string;
  badge: string | null;
  capabilities: string[];
  is_core: boolean;
  isInstalled: boolean;
  metering?: MeteringInfo | null;
  currentUsage?: CurrentUsage | null;
}

interface BillingInvoice {
  id: string;
  invoice_number: string;
  total_usd: string;
  payment_method: string;
  status: string;
  line_items: any[];
  issued_at: string;
  paid_at: string;
}

interface TenantWallet {
  id: string;
  capabilityCode: string;
  capabilityName: string;
  unitName: string;
  balance: number;
  totalCredited: number;
  totalConsumed: number;
  percentRemaining: number;
  status: string;
  lastRechargeAt: string | null;
  updatedAt: string;
}

interface RechargePack {
  id: string;
  capabilityCode: string;
  packName: string;
  creditUnits: number;
  priceUsd: number;
  description: string;
}

export default function MarketplacePage() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'wallets' | 'invoices'>('catalog');
  const [modules, setModules] = useState<CatalogModule[]>([]);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [wallets, setWallets] = useState<TenantWallet[]>([]);
  const [packs, setPacks] = useState<RechargePack[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasingModule, setPurchasingModule] = useState<CatalogModule | null>(null);
  const [selectedRechargePack, setSelectedRechargePack] = useState<RechargePack | null>(null);
  const [isProcessingPurchase, setIsProcessingPurchase] = useState(false);
  const [isProcessingRecharge, setIsProcessingRecharge] = useState(false);
  const [hydrationProgress, setHydrationProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, iRes, wRes] = await Promise.all([
        fetch('/api/marketplace/v1/tenant/v1/marketplace/catalog'),
        fetch('/api/marketplace/v1/tenant/v1/marketplace/invoices'),
        fetch('/api/marketplace/v1/tenant/v1/marketplace/wallet'),
      ]);

      if (mRes.status === 403) {
        setError('Access denied: "module-marketplace" entitlement or "marketplace:read" permission required.');
        return;
      }

      if (mRes.ok) setModules(await mRes.json());
      if (iRes.ok) setInvoices(await iRes.json());
      if (wRes.ok) {
        const wData = await wRes.json();
        setWallets(wData.wallets || []);
        setPacks(wData.packs || []);
      }
    } catch (err: any) {
      setError(`Unable to connect to Module Marketplace service: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRecharge = async (pack: RechargePack) => {
    setIsProcessingRecharge(true);
    setError(null);
    try {
      const res = await fetch('/api/marketplace/v1/tenant/v1/marketplace/wallet/recharge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: pack.id }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.title || 'Recharge failed');
      }
      const data = await res.json();
      setSuccessMessage(
        `Wallet Recharged! +${data.creditUnitsAdded.toLocaleString()} credits added. New Balance: ${data.newBalance.toLocaleString()}. Invoice ${data.invoiceNumber} settled.`,
      );
      setSelectedRechargePack(null);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessingRecharge(false);
    }
  };

  const handleConfirmPurchase = async () => {
    if (!purchasingModule) return;
    setIsProcessingPurchase(true);
    setError(null);
    setHydrationProgress(20);

    const interval = setInterval(() => {
      setHydrationProgress((prev) => (prev < 90 ? prev + 25 : prev));
    }, 200);

    try {
      const res = await fetch('/api/marketplace/v1/tenant/v1/marketplace/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleCode: purchasingModule.code,
          billingCycle: 'MONTHLY',
        }),
      });

      clearInterval(interval);
      setHydrationProgress(100);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.title || 'Purchase failed');
      }

      const data = await res.json();
      setSuccessMessage(
        `${data.moduleName} activated! Invoice ${data.invoiceNumber} settled. Schema ${data.hydratedSchema} hydrated in <200ms.`,
      );
      setPurchasingModule(null);
      await loadData();
    } catch (err: any) {
      clearInterval(interval);
      setError(err.message);
    } finally {
      setIsProcessingPurchase(false);
      setHydrationProgress(0);
    }
  };

  const installedCount = modules.filter((m) => m.isInstalled).length;

  return (
    <div className="flex flex-col gap-6 p-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <Heading level="h1" className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              Module Marketplace & Usage Billing
            </Heading>
            <Badge color="blue" size="small">ENTERPRISE BILLING</Badge>
            <Badge color="green" size="small">ONLINE</Badge>
          </div>
          <Text className="text-gray-500 dark:text-gray-400 mt-1">
            Self-service module catalog, usage metering, credit wallet management, and double-entry billing ledger.
          </Text>
        </div>
        <Button
          variant="secondary"
          size="small"
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5"
        >
          <ArrowPath className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Notifications */}
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}
      {successMessage && (
        <Alert variant="success" className="mb-4">
          {successMessage}
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Modules</span>
            <Package className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-gray-900 dark:text-white">{installedCount}</span>
            <span className="text-xs text-emerald-600 font-medium">of {modules.length} installed</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Credit Wallets</span>
            <Wallet className="w-4 h-4 text-purple-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-gray-900 dark:text-white">{wallets.length}</span>
            <span className="text-xs text-gray-500">capability wallets</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Billing Invoices</span>
            <Receipt className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-gray-900 dark:text-white">{invoices.length}</span>
            <span className="text-xs text-gray-500">corporate ledger entries</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-gray-200 dark:border-gray-800 gap-2">
        {(['catalog', 'wallets', 'invoices'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 capitalize ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'catalog' && <Package className="w-4 h-4" />}
            {tab === 'wallets' && <Wallet className="w-4 h-4" />}
            {tab === 'invoices' && <Receipt className="w-4 h-4" />}
            {tab === 'catalog' ? `Module Catalog (${modules.length})` : tab === 'wallets' ? `Credit Wallets (${wallets.length})` : `Invoices (${invoices.length})`}
          </button>
        ))}
      </div>

      {/* TAB: Catalog */}
      {activeTab === 'catalog' && (
        <div className="flex flex-col gap-4">
          {modules.length === 0 && !loading ? (
            <div className="p-12 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900">
              <Package className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              <Heading level="h3" className="text-base font-semibold text-gray-900 dark:text-white">
                Module Catalog Unavailable
              </Heading>
              <Text className="text-gray-500 text-sm mt-1">
                The marketplace service is not currently reachable. Verify MARKETPLACE_API_URL configuration.
              </Text>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {modules.map((mod) => (
                <div
                  key={mod.code}
                  className={`p-5 rounded-xl border shadow-xs flex flex-col gap-4 bg-white dark:bg-gray-900 ${
                    mod.isInstalled
                      ? 'border-emerald-300 dark:border-emerald-800'
                      : 'border-gray-200 dark:border-gray-800'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-white">{mod.name}</span>
                        {mod.isInstalled && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        )}
                      </div>
                      <span className="text-xs text-gray-500">{mod.category}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold font-mono text-gray-900 dark:text-white">
                        ${mod.monthlyPriceUsd.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500">/ month</div>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{mod.description}</p>

                  {mod.currentUsage && mod.metering && (
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{mod.metering.dimensionName}</span>
                        <span>{mod.currentUsage.unitsConsumed.toLocaleString()} / {mod.currentUsage.includedUnits.toLocaleString()} {mod.metering.unitName}</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${mod.currentUsage.percentConsumed > 80 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, mod.currentUsage.percentConsumed)}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-400">{mod.currentUsage.percentConsumed}% consumed</div>
                    </div>
                  )}

                  {mod.isInstalled ? (
                    <Badge color="green" size="small">Active & Entitled</Badge>
                  ) : (
                    <Button
                      variant="primary"
                      size="small"
                      onClick={() => setPurchasingModule(mod)}
                      className="mt-auto"
                    >
                      <Sparkles className="w-4 h-4 mr-1" /> Activate Module
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: Credit Wallets */}
      {activeTab === 'wallets' && (
        <div className="flex flex-col gap-6">
          {wallets.length === 0 && !loading ? (
            <div className="p-12 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900">
              <Wallet className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              <Heading level="h3" className="text-base font-semibold text-gray-900 dark:text-white">
                No Credit Wallets Active
              </Heading>
              <Text className="text-gray-500 text-sm mt-1">
                Credit wallets are created when you purchase usage-metered capabilities.
              </Text>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {wallets.map((wallet) => (
                <div
                  key={wallet.id}
                  className={`p-5 rounded-xl border shadow-xs bg-white dark:bg-gray-900 ${
                    wallet.status === 'EXHAUSTED'
                      ? 'border-rose-300 dark:border-rose-800'
                      : 'border-gray-200 dark:border-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-semibold text-gray-900 dark:text-white">{wallet.capabilityName}</span>
                    <Badge color={wallet.status === 'EXHAUSTED' ? 'red' : 'green'} size="small">
                      {wallet.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <span className="text-xs text-gray-500">Balance</span>
                      <p className="font-bold font-mono text-blue-600 dark:text-blue-400">
                        {wallet.balance.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Consumed</span>
                      <p className="font-bold font-mono text-gray-700 dark:text-gray-300">
                        {wallet.totalConsumed.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Remaining %</span>
                      <p className="font-bold font-mono text-emerald-600">
                        {wallet.percentRemaining}%
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${wallet.percentRemaining < 20 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                      style={{ width: `${wallet.percentRemaining}%` }}
                    />
                  </div>
                  <div className="mt-3 text-xs text-gray-500">
                    Unit: {wallet.unitName}
                    {wallet.lastRechargeAt && ` • Last recharged: ${new Date(wallet.lastRechargeAt).toLocaleDateString()}`}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recharge Packs */}
          {packs.length > 0 && (
            <div>
              <Heading level="h3" className="text-base font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-500" /> Credit Recharge Packs
              </Heading>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {packs.map((pack) => (
                  <div
                    key={pack.id}
                    className={`p-4 rounded-xl border shadow-xs bg-white dark:bg-gray-900 cursor-pointer transition-all ${
                      selectedRechargePack?.id === pack.id
                        ? 'border-blue-500 ring-2 ring-blue-300'
                        : 'border-gray-200 dark:border-gray-800 hover:border-blue-300'
                    }`}
                    onClick={() => setSelectedRechargePack(selectedRechargePack?.id === pack.id ? null : pack)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm text-gray-900 dark:text-white">{pack.packName}</span>
                      <span className="text-lg font-bold font-mono text-blue-600">${pack.priceUsd}</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">{pack.description || `+${pack.creditUnits.toLocaleString()} ${pack.capabilityCode} units`}</p>
                    <div className="text-xs text-emerald-600 font-medium">
                      +{pack.creditUnits.toLocaleString()} credits
                    </div>
                  </div>
                ))}
              </div>
              {selectedRechargePack && (
                <div className="mt-4 flex items-center gap-4">
                  <Button
                    variant="primary"
                    size="small"
                    disabled={isProcessingRecharge}
                    onClick={() => handleRecharge(selectedRechargePack)}
                  >
                    {isProcessingRecharge ? 'Processing...' : `Purchase ${selectedRechargePack.packName} — $${selectedRechargePack.priceUsd}`}
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setSelectedRechargePack(null)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB: Invoices */}
      {activeTab === 'invoices' && (
        <div className="flex flex-col gap-4">
          {invoices.length === 0 && !loading ? (
            <div className="p-12 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900">
              <Receipt className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              <Heading level="h3" className="text-base font-semibold text-gray-900 dark:text-white">
                No Billing Invoices
              </Heading>
              <Text className="text-gray-500 text-sm mt-1">
                Invoices appear here when modules are purchased or wallets are recharged.
              </Text>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-xs">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Invoice Number</Table.HeaderCell>
                    <Table.HeaderCell>Total</Table.HeaderCell>
                    <Table.HeaderCell>Payment Method</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                    <Table.HeaderCell>Issued At</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {invoices.map((inv) => (
                    <Table.Row key={inv.id}>
                      <Table.Cell className="font-mono text-xs text-gray-900 dark:text-white">
                        {inv.invoice_number}
                      </Table.Cell>
                      <Table.Cell className="font-bold font-mono text-gray-900 dark:text-white">
                        ${parseFloat(inv.total_usd).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </Table.Cell>
                      <Table.Cell className="text-xs text-gray-500">
                        {inv.payment_method.replace(/_/g, ' ')}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color={inv.status === 'PAID' ? 'green' : inv.status === 'VOID' ? 'red' : 'orange'} size="small">
                          {inv.status}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell className="text-xs text-gray-500">
                        {new Date(inv.issued_at).toLocaleDateString()}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Purchase Confirmation Modal */}
      {purchasingModule && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-gray-800 mb-4">
              <Sparkles className="w-6 h-6 text-blue-500" />
              <Heading level="h2" className="text-lg font-bold">Activate Module</Heading>
            </div>

            <div className="mb-6">
              <p className="text-gray-700 dark:text-gray-300 text-sm">
                You are about to activate <strong>{purchasingModule.name}</strong> via corporate invoiced ledger.
              </p>
              <div className="mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Module:</span>
                  <span className="font-semibold">{purchasingModule.name}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-600">Billing Cycle:</span>
                  <span className="font-semibold">Monthly</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-600">Amount:</span>
                  <span className="font-bold text-blue-700 dark:text-blue-300">
                    ${purchasingModule.monthlyPriceUsd.toLocaleString()} / month
                  </span>
                </div>
              </div>

              {hydrationProgress > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Schema hydration in progress...</span>
                    <span>{hydrationProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                    <div
                      className="h-2 bg-blue-500 rounded-full transition-all duration-200"
                      style={{ width: `${hydrationProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="small"
                type="button"
                disabled={isProcessingPurchase}
                onClick={() => setPurchasingModule(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="small"
                disabled={isProcessingPurchase}
                onClick={handleConfirmPurchase}
              >
                {isProcessingPurchase ? 'Activating...' : 'Confirm Purchase'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
