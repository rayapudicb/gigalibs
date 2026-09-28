'use client';

import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type View = 'overview' | 'matrix' | 'convert' | 'ledger' | 'preferences' | 'setup';

type CurrencyPair = {
  id: string;
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  inverseRate: number;
  rateMicros: string;
  inverseRateMicros: string;
  rateSource: string;
  spreadBasisPoints: number;
  status: string;
  effectiveAt: string;
  updatedAt: string;
};

type LedgerEntry = {
  id: string;
  sourceModule: string;
  documentId: string;
  documentReference?: string;
  fromCurrency: string;
  toCurrency: string;
  sourceAmountMinor: number;
  convertedAmountMinor: number;
  appliedRate: number;
  feeMinor: number;
  settlementDate: string;
  idempotencyKey: string;
  calculationTimestamp: string;
};

type TenantPreferences = {
  tenantId: string;
  functionalCurrency: string;
  presentationCurrency: string;
  defaultLocale: string;
  autoConvertForeignInvoices: boolean;
  createdAt: string;
  updatedAt: string;
};

type SetupStatus = {
  configured: boolean;
  tenantId: string;
  functionalCurrency?: string;
};

type ConvertResult = {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  sourceAmountMinor: number;
  convertedAmountMinor: number;
  appliedRate: number;
  appliedRateMicros: number;
  rateSource: string;
  settlementDate: string;
  idempotencyKey: string;
  idempotencyReplayed: boolean;
};

class CurrencyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function requestCurrency<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/currency/${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    message?: string;
    detail?: string;
    title?: string;
  };
  if (!response.ok) {
    const message = Array.isArray(payload.message) ? payload.message.join(', ') : payload.message;
    throw new CurrencyError(
      response.status,
      payload.detail ?? message ?? payload.title ?? 'Request failed.',
    );
  }
  return payload;
}

const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  CAD: 2,
  AUD: 2,
  CHF: 2,
  INR: 2,
  SGD: 2,
  BHD: 3,
};

function formatMoney(currency: string, minor: number): string {
  const decimals = CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
  const major = minor / 10 ** decimals;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(major);
}

export default function MultiCurrencyWorkbench() {
  const [view, setView] = useState<View>('overview');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [pairs, setPairs] = useState<CurrencyPair[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [preferences, setPreferences] = useState<TenantPreferences>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  // Convert Form State
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('EUR');
  const [sourceAmount, setSourceAmount] = useState('1000.00');
  const [documentRef, setDocumentRef] = useState('INV-EU-2026-001');
  const [convertResult, setConvertResult] = useState<ConvertResult>();
  const [converting, setConverting] = useState(false);

  // Preference Form State
  const [prefFunctional, setPrefFunctional] = useState('USD');
  const [prefPresentation, setPrefPresentation] = useState('USD');
  const [prefLocale, setPrefLocale] = useState('en-US');
  const [prefAutoConvert, setPrefAutoConvert] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const status = await requestCurrency<SetupStatus>('v1/setup');
      if (!status.configured) {
        setConfigured(false);
        setView('setup');
        setLoading(false);
        return;
      }
      setConfigured(true);

      const [pairsRes, ledgerRes, prefsRes] = await Promise.all([
        requestCurrency<{ data: CurrencyPair[] }>('v1/pairs'),
        requestCurrency<{ data: LedgerEntry[] }>('v1/ledger?limit=50'),
        requestCurrency<{ data: TenantPreferences }>('v1/preferences'),
      ]);

      setPairs(pairsRes.data || []);
      setLedger(ledgerRes.data || []);
      setPreferences(prefsRes.data);
      if (prefsRes.data) {
        setPrefFunctional(prefsRes.data.functionalCurrency);
        setPrefPresentation(prefsRes.data.presentationCurrency);
        setPrefLocale(prefsRes.data.defaultLocale);
        setPrefAutoConvert(prefsRes.data.autoConvertForeignInvoices);
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Failed to connect to Multi-Currency service.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSetup(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    try {
      await requestCurrency('v1/setup', { method: 'POST', body: '{}' });
      await load();
      setView('overview');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Setup failed.');
      setLoading(false);
    }
  }

  async function handleConvert(event: FormEvent) {
    event.preventDefault();
    setConverting(true);
    setError(undefined);
    try {
      const decimals = CURRENCY_DECIMALS[fromCurrency.toUpperCase()] ?? 2;
      const numValue = Number.parseFloat(sourceAmount);
      if (isNaN(numValue) || numValue <= 0) {
        throw new Error('Please enter a valid positive amount.');
      }
      const amountMinor = Math.round(numValue * 10 ** decimals);

      const res = await requestCurrency<{ data: ConvertResult }>('v1/convert', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          sourceModule: 'WORKBENCH',
          documentReference: documentRef.trim() || undefined,
          fromCurrency: fromCurrency.toUpperCase(),
          toCurrency: toCurrency.toUpperCase(),
          amountMinor,
        }),
      });

      setConvertResult(res.data);
      // Refresh ledger
      const updatedLedger = await requestCurrency<{ data: LedgerEntry[] }>('v1/ledger?limit=50');
      setLedger(updatedLedger.data || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Conversion failed.');
    } finally {
      setConverting(false);
    }
  }

  async function handleSavePreferences(event: FormEvent) {
    event.preventDefault();
    setSavingPrefs(true);
    setError(undefined);
    try {
      const res = await requestCurrency<{ data: TenantPreferences }>('v1/preferences', {
        method: 'PUT',
        body: JSON.stringify({
          functionalCurrency: prefFunctional.toUpperCase(),
          presentationCurrency: prefPresentation.toUpperCase(),
          defaultLocale: prefLocale.trim(),
          autoConvertForeignInvoices: prefAutoConvert,
        }),
      });
      setPreferences(res.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to update preferences.');
    } finally {
      setSavingPrefs(false);
    }
  }

  const activeRate = useMemo(() => {
    if (fromCurrency === toCurrency) return 1.0;
    const direct = pairs.find(
      (p) => p.baseCurrency === fromCurrency && p.targetCurrency === toCurrency,
    );
    if (direct) return direct.rate;
    const inverse = pairs.find(
      (p) => p.baseCurrency === toCurrency && p.targetCurrency === fromCurrency,
    );
    if (inverse) return inverse.inverseRate;
    return null;
  }, [pairs, fromCurrency, toCurrency]);

  return (
    <div className="space-y-6">
      {configured ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap gap-2">
            {(
              [
                ['overview', 'Overview'],
                ['matrix', 'FX Rate Matrix'],
                ['convert', 'Conversion Calculator'],
                ['ledger', 'Conversion Ledger'],
                ['preferences', 'Localization & Preferences'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  view === id
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
              PostgreSQL Persisted
            </span>
            <button
              onClick={() => load()}
              disabled={loading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            onClick={() => load()}
            disabled={loading}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-semibold">Operation Error</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {/* Setup View */}
      {view === 'setup' && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-8 shadow-sm">
          <div className="max-w-xl">
            <h2 className="text-xl font-bold text-amber-900">Configure Multi-Currency Engine</h2>
            <p className="mt-2 text-sm text-amber-800">
              This tenant workspace has not yet bound its currency ledger schema. Initializing
              creates only tenant preferences. Currency rates remain empty until an authoritative
              provider or reviewed import writes them to the PostgreSQL{' '}
              <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs text-amber-900">
                gigalibs_currency
              </code>{' '}
              schema.
            </p>
            <form onSubmit={handleSetup} className="mt-6">
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {loading ? 'Binding Schema...' : 'Initialize Multi-Currency Schema'}
              </button>
            </form>
          </div>
        </section>
      )}

      {/* Overview View */}
      {view === 'overview' && configured && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Active Currency Pairs"
              value={pairs.length.toString()}
              sub={pairs.length > 0 ? 'Persisted source-attributed rates' : 'No rate source configured'}
            />
            <MetricCard
              label="Ledger Conversions"
              value={ledger.length.toString()}
              sub="ACID posted records"
            />
            <MetricCard
              label="Functional Currency"
              value={preferences?.functionalCurrency || 'USD'}
              sub={`Presentation: ${preferences?.presentationCurrency || 'USD'}`}
            />
            <MetricCard
              label="Locale Standard"
              value={preferences?.defaultLocale || 'en-US'}
              sub="ISO 4217 exponent compliant"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Configured FX Rates</h3>
              <p className="mt-1 text-sm text-slate-500">
                Persisted rates with source and effective-time attribution.
              </p>
              <div className="mt-4 divide-y divide-slate-100">
                {pairs.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">
                    No authoritative FX rates are configured for this tenant.
                  </p>
                ) : (
                  pairs.slice(0, 5).map((p) => (
                    <div key={p.id} className="flex items-center justify-between py-3">
                      <div>
                        <span className="font-semibold text-slate-900">
                          {p.baseCurrency}/{p.targetCurrency}
                        </span>
                        <p className="text-xs text-slate-400">{p.rateSource}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-sm font-bold text-slate-800">
                          {p.rate.toFixed(6)}
                        </span>
                        <p className="text-xs text-slate-400">Spread: {p.spreadBasisPoints} bps</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Recent Ledger Activity</h3>
              <p className="mt-1 text-sm text-slate-500">
                Latest cross-currency conversion transactions.
              </p>
              <div className="mt-4 divide-y divide-slate-100">
                {ledger.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">
                    No conversions recorded yet.
                  </p>
                ) : (
                  ledger.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between py-3">
                      <div>
                        <span className="text-sm font-semibold text-slate-900">
                          {entry.documentReference || entry.documentId}
                        </span>
                        <p className="text-xs text-slate-400">
                          {entry.fromCurrency} → {entry.toCurrency} @ {entry.appliedRate.toFixed(4)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-slate-900">
                          {formatMoney(entry.toCurrency, entry.convertedAmountMinor)}
                        </span>
                        <p className="text-xs text-slate-400">{entry.settlementDate}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Matrix View */}
      {view === 'matrix' && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-6">
            <h2 className="text-lg font-semibold text-slate-900">Tenant FX Rate Matrix</h2>
            <p className="text-sm text-slate-500">
              Source-attributed rates loaded from the tenant-scoped PostgreSQL ledger.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-6 py-3 font-semibold">Pair</th>
                  <th className="px-6 py-3 font-semibold">Rate</th>
                  <th className="px-6 py-3 font-semibold">Inverse</th>
                  <th className="px-6 py-3 font-semibold">Rate Source</th>
                  <th className="px-6 py-3 font-semibold">Spread (bps)</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">Effective</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {pairs.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-bold text-slate-900">
                      {p.baseCurrency}/{p.targetCurrency}
                    </td>
                    <td className="px-6 py-4 font-mono font-medium text-slate-900">
                      {p.rate.toFixed(6)}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-500">
                      {p.inverseRate.toFixed(6)}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-600">{p.rateSource}</td>
                    <td className="px-6 py-4 font-mono text-slate-600">{p.spreadBasisPoints}</td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20">
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {new Date(p.effectiveAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {pairs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                      Connect an authoritative rate provider or complete a reviewed rate import.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Convert View */}
      {view === 'convert' && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-semibold text-slate-900">ACID FX Conversion Calculator</h2>
            <p className="mt-1 text-sm text-slate-500">
              Converts currencies with ISO 4217 exponent preservation and posts an immutable record
              to the ledger.
            </p>

            <form onSubmit={handleConvert} className="mt-6 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500">
                    From Currency
                  </label>
                  <select
                    value={fromCurrency}
                    onChange={(e) => setFromCurrency(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  >
                    {['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'CHF', 'AUD', 'INR', 'SGD', 'BHD'].map(
                      (c) => (
                        <option key={c} value={c}>
                          {c} ({CURRENCY_DECIMALS[c] ?? 2} decimals)
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500">
                    To Currency
                  </label>
                  <select
                    value={toCurrency}
                    onChange={(e) => setToCurrency(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  >
                    {['EUR', 'USD', 'GBP', 'JPY', 'CAD', 'CHF', 'AUD', 'INR', 'SGD', 'BHD'].map(
                      (c) => (
                        <option key={c} value={c}>
                          {c} ({CURRENCY_DECIMALS[c] ?? 2} decimals)
                        </option>
                      ),
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500">
                    Source Amount ({fromCurrency})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={sourceAmount}
                    onChange={(e) => setSourceAmount(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-slate-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500">
                    Document Reference (Optional)
                  </label>
                  <input
                    type="text"
                    value={documentRef}
                    onChange={(e) => setDocumentRef(e.target.value)}
                    placeholder="e.g. INV-2026-001"
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  />
                </div>
              </div>

              {activeRate !== null && (
                <div className="rounded-lg bg-slate-50 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Authoritative Applied Rate:</span>
                    <span className="font-mono font-semibold text-slate-900">
                      1 {fromCurrency} = {activeRate.toFixed(6)} {toCurrency}
                    </span>
                  </div>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={converting || activeRate === null}
                  title={activeRate === null ? 'An authoritative rate is required.' : undefined}
                  className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-slate-800 disabled:opacity-50"
                >
                  {converting
                    ? 'Computing & Recording...'
                    : activeRate === null
                      ? 'Authoritative Rate Required'
                      : 'Execute Conversion & Post to Ledger'}
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Conversion Output</h3>
            <p className="mt-1 text-sm text-slate-500">ACID ledger receipt.</p>

            {convertResult ? (
              <div className="mt-6 space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                <div>
                  <span className="text-xs font-medium text-emerald-800">Converted Amount:</span>
                  <p className="text-2xl font-bold text-emerald-900">
                    {formatMoney(convertResult.toCurrency, convertResult.convertedAmountMinor)}
                  </p>
                </div>
                <div className="space-y-1 text-xs text-slate-600">
                  <p>
                    <span className="font-medium text-slate-800">Ledger ID:</span>{' '}
                    {convertResult.id}
                  </p>
                  <p>
                    <span className="font-medium text-slate-800">Rate Source:</span>{' '}
                    {convertResult.rateSource}
                  </p>
                  <p>
                    <span className="font-medium text-slate-800">Settlement:</span>{' '}
                    {convertResult.settlementDate}
                  </p>
                  <p className="truncate">
                    <span className="font-medium text-slate-800">Idempotency Key:</span>{' '}
                    {convertResult.idempotencyKey}
                  </p>
                </div>
                <div className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                  Transaction Committed to PostgreSQL
                </div>
              </div>
            ) : (
              <div className="mt-12 text-center text-sm text-slate-400">
                {activeRate === null
                  ? 'No conversion is available until the selected pair has an authoritative rate.'
                  : 'Execute a conversion to see the persisted ledger record.'}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Ledger View */}
      {view === 'ledger' && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-6">
            <h2 className="text-lg font-semibold text-slate-900">ACID Conversion Ledger</h2>
            <p className="text-sm text-slate-500">
              Authoritative records persisted in PostgreSQL schema
              gigalibs_currency.conversion_ledger.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-6 py-3 font-semibold">Document / Reference</th>
                  <th className="px-6 py-3 font-semibold">From</th>
                  <th className="px-6 py-3 font-semibold">To</th>
                  <th className="px-6 py-3 font-semibold">Source Amount</th>
                  <th className="px-6 py-3 font-semibold">Converted Amount</th>
                  <th className="px-6 py-3 font-semibold">Applied Rate</th>
                  <th className="px-6 py-3 font-semibold">Settlement Date</th>
                  <th className="px-6 py-3 font-semibold">Idempotency Key</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {ledger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {entry.documentReference || entry.documentId}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-800">{entry.fromCurrency}</td>
                    <td className="px-6 py-4 font-bold text-slate-800">{entry.toCurrency}</td>
                    <td className="px-6 py-4 font-mono text-slate-700">
                      {formatMoney(entry.fromCurrency, entry.sourceAmountMinor)}
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-900">
                      {formatMoney(entry.toCurrency, entry.convertedAmountMinor)}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">
                      {entry.appliedRate.toFixed(6)}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">{entry.settlementDate}</td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-400 truncate max-w-[120px]">
                      {entry.idempotencyKey}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Preferences View */}
      {view === 'preferences' && (
        <section className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Tenant Currency & Localization Preferences
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Authoritative functional currency and reporting locale for this tenant workspace.
          </p>

          <form onSubmit={handleSavePreferences} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500">
                Functional Currency
              </label>
              <select
                value={prefFunctional}
                onChange={(e) => setPrefFunctional(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              >
                {['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'INR', 'SGD'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">
                Primary operating currency for balance sheet accounting.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500">
                Presentation Currency
              </label>
              <select
                value={prefPresentation}
                onChange={(e) => setPrefPresentation(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              >
                {['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'INR', 'SGD'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">
                Reporting currency for executive dashboard analytics.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500">
                Default Locale
              </label>
              <input
                type="text"
                value={prefLocale}
                onChange={(e) => setPrefLocale(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-slate-400">
                BCP-47 locale code (e.g. en-US, en-GB, de-DE, ja-JP).
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="autoConvert"
                checked={prefAutoConvert}
                onChange={(e) => setPrefAutoConvert(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
              />
              <label htmlFor="autoConvert" className="text-sm font-medium text-slate-700">
                Auto-convert foreign invoices to functional currency upon approval
              </label>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={savingPrefs}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {savingPrefs ? 'Saving Preferences...' : 'Save Preferences'}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="text-xs font-semibold uppercase text-slate-500">{label}</span>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
