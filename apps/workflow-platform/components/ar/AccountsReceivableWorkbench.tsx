'use client';

import type { FormEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StudioSurfaceBoundary } from '@/components/configuration/StudioMode';
import { MASTER_COUNTRIES, MASTER_TAX_JURISDICTIONS } from '@/lib/master-data-catalog';


type View = 'overview' | 'setup' | 'customers' | 'invoices' | 'new-invoice';

interface Customer {
  id: string;
  legalName: string;
  billingEmail: string;
  externalReference?: string;
  currency: string;
  countryCode?: string;
  jurisdictionCode?: string;
  dataClassification?: string;
  status: string;
}

interface Invoice {
  id: string;
  customerId: string;
  invoiceNumber: string | null;
  status: 'DRAFT' | 'ISSUED';
  currency: string;
  issueDate: string;
  dueDate: string;
  subtotalMinor: number;
  totalMinor: number;
  amountDueMinor: number;
  version: number;
}

interface DraftLine {
  key: string;
  description: string;
  quantity: string;
  unitAmountMinor: string;
}

class ArError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function requestAr<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/ar/${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    title?: string;
    detail?: string;
  };
  if (!response.ok) {
    throw new ArError(response.status, payload.detail ?? payload.title ?? 'Request failed.');
  }
  return payload;
}

function idempotencyKey(): string {
  return crypto.randomUUID();
}

function money(currency: string, minor: number): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${currency} ${minor.toLocaleString()} minor units`;
  }
}

export default function AccountsReceivableWorkbench() {
  const [view, setView] = useState<View>('overview');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [customerPage, invoicePage] = await Promise.all([
        requestAr<{ items: Customer[] }>('v1/customers?pageSize=100'),
        requestAr<{ items: Invoice[] }>('v1/invoices?pageSize=100'),
      ]);
      setCustomers(customerPage.items);
      setInvoices(invoicePage.items);
      setConfigured(true);
    } catch (caught) {
      if (caught instanceof ArError && caught.status === 409) {
        setConfigured(false);
        setView('setup');
      } else {
        setError(caught instanceof Error ? caught.message : 'Accounts Receivable could not be loaded.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(
    () => ({
      drafts: invoices.filter((invoice) => invoice.status === 'DRAFT').length,
      issued: invoices.filter((invoice) => invoice.status === 'ISSUED').length,
      outstanding: invoices
        .filter((invoice) => invoice.status === 'ISSUED')
        .reduce((sum, invoice) => sum + invoice.amountDueMinor, 0),
    }),
    [invoices],
  );
  const studioSurface =
    view === 'customers'
      ? { registrationKey: 'ar-customer-record', screenLabel: 'Customers' }
      : view === 'invoices'
        ? { registrationKey: 'ar-invoice-draft', screenLabel: 'Invoices' }
        : view === 'new-invoice'
          ? { registrationKey: 'ar-invoice-draft', screenLabel: 'Create invoice' }
          : { registrationKey: undefined, screenLabel: view === 'setup' ? 'Configuration' : 'Overview' };

  return (
    <StudioSurfaceBoundary
      registrationKey={studioSurface.registrationKey}
      moduleLabel="Accounts Receivable"
      screenLabel={studioSurface.screenLabel}
    >
      <div className="min-h-full bg-[#f6f8f7] p-6 lg:p-9">
        <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm md:flex-row md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Financial operations
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
              Accounts Receivable
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">
              Tenant-scoped customers, invoice drafts, revisions, and immutable issuance backed by
              PostgreSQL.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {process.env.NEXT_PUBLIC_ENV_LABEL ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {process.env.NEXT_PUBLIC_ENV_LABEL}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium"
            >
              Refresh
            </button>
          </div>
        </header>

        <nav className="flex flex-wrap gap-2" aria-label="Accounts Receivable sections">
          {([
            ['overview', 'Overview'],
            ['customers', 'Customers'],
            ['invoices', 'Invoices'],
            ['new-invoice', 'Create invoice'],
            ['setup', 'Configuration'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              disabled={configured === false && key !== 'setup'}
              className={`rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                view === key
                  ? 'bg-zinc-950 text-white'
                  : 'border border-zinc-300 bg-white text-zinc-700'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        {loading ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
            Loading persisted Accounts Receivable records…
          </div>
        ) : null}
        {!loading && view === 'setup' ? (
          <SetupPanel configured={configured === true} onConfigured={load} />
        ) : null}
        {!loading && configured && view === 'overview' ? (
          <Overview
            customers={customers}
            invoices={invoices}
            totals={totals}
            open={setView}
          />
        ) : null}
        {!loading && configured && view === 'customers' ? (
          <CustomersPanel customers={customers} reload={load} />
        ) : null}
        {!loading && configured && view === 'invoices' ? (
          <InvoicesPanel invoices={invoices} customers={customers} reload={load} />
        ) : null}
        {!loading && configured && view === 'new-invoice' ? (
          <InvoicePanel
            customers={customers}
            onCreated={async () => {
              await load();
              setView('invoices');
            }}
          />
        ) : null}
        </div>
      </div>
    </StudioSurfaceBoundary>
  );
}

function Overview({
  customers,
  invoices,
  totals,
  open,
}: {
  customers: Customer[];
  invoices: Invoice[];
  totals: { drafts: number; issued: number; outstanding: number };
  open: (view: View) => void;
}) {
  const currency = invoices.find((invoice) => invoice.status === 'ISSUED')?.currency ?? 'USD';
  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Customers', customers.length.toLocaleString()],
          ['Draft invoices', totals.drafts.toLocaleString()],
          ['Issued invoices', totals.issued.toLocaleString()],
          ['Outstanding', money(currency, totals.outstanding)],
        ].map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-3 text-2xl font-semibold text-zinc-950">{value}</p>
          </article>
        ))}
      </section>
      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Real AR workflow</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Create a customer, save a draft, review server-calculated totals, then issue the
              immutable invoice.
            </p>
          </div>
          <button
            type="button"
            onClick={() => open('new-invoice')}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
          >
            Create invoice
          </button>
        </div>
      </section>
    </div>
  );
}

function SetupPanel({
  configured,
  onConfigured,
}: {
  configured: boolean;
  onConfigured: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);
    const data = new FormData(event.currentTarget);
    try {
      await requestAr('v1/setup', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey() },
        body: JSON.stringify({
          legalName: data.get('legalName'),
          legalIdentifier: data.get('legalIdentifier') || undefined,
          defaultCurrency: String(data.get('defaultCurrency')).toUpperCase(),
          locale: data.get('locale'),
          timeZone: data.get('timeZone'),
          invoiceSeriesCode: String(data.get('invoiceSeriesCode')).toUpperCase(),
          invoicePrefix: String(data.get('invoicePrefix')).toUpperCase(),
          invoicePadding: Number(data.get('invoicePadding')),
        }),
      });
      setMessage('Accounts Receivable configuration was saved to PostgreSQL.');
      await onConfigured();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Configuration failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6">
      <h2 className="text-xl font-semibold">
        {configured ? 'AR configuration' : 'Configure this tenant for AR'}
      </h2>
      <p className="mt-2 text-sm text-zinc-600">
        This creates the tenant billing entity and invoice numbering series. Enter real UAT values.
      </p>
      {message ? <p className="mt-4 rounded-lg bg-zinc-100 p-3 text-sm">{message}</p> : null}
      <form onSubmit={submit} className="mt-6 grid gap-4 md:grid-cols-2">
        <Field label="Legal name" name="legalName" required />
        <Field label="Legal identifier" name="legalIdentifier" />
        <Field label="Default currency" name="defaultCurrency" defaultValue="USD" required pattern="[A-Za-z]{3}" />
        <Field label="Locale" name="locale" defaultValue="en-US" required />
        <Field label="Time zone" name="timeZone" defaultValue="UTC" required />
        <Field label="Series code" name="invoiceSeriesCode" defaultValue="STANDARD" required />
        <Field label="Invoice prefix" name="invoicePrefix" defaultValue="INV-" required />
        <Field label="Number padding" name="invoicePadding" type="number" defaultValue="6" min="1" max="12" required />
        <div className="md:col-span-2">
          <button disabled={busy} className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? 'Saving…' : 'Save configuration'}
          </button>
        </div>
      </form>
    </section>
  );
}

function CustomersPanel({
  customers,
  reload,
}: {
  customers: Customer[];
  reload: () => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(customers.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [countryCode, setCountryCode] = useState('US');
  const [jurisdictionCode, setJurisdictionCode] = useState('US-CA');
  const [currency, setCurrency] = useState('USD');

  const availableJurisdictions = useMemo(() => {
    const list = MASTER_TAX_JURISDICTIONS.filter((j) => j.countryCode === countryCode);
    return list.length > 0 ? list : [{ jurisdictionCode: `${countryCode}-FED`, name: `${countryCode} Statutory Tax Authority`, defaultStandardRatePercent: 0 }];
  }, [countryCode]);

  const handleCountryChange = (newCountry: string) => {
    setCountryCode(newCountry);
    const country = MASTER_COUNTRIES.find((c) => c.code === newCountry);
    if (country) {
      setCurrency(country.defaultCurrency);
    }
    const matching = MASTER_TAX_JURISDICTIONS.filter((j) => j.countryCode === newCountry);
    if (matching.length > 0 && matching[0]) {
      setJurisdictionCode(matching[0].jurisdictionCode);
    } else {
      setJurisdictionCode(`${newCountry}-FED`);
    }
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await requestAr('v1/customers', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey() },
        body: JSON.stringify({
          legalName: data.get('legalName'),
          billingEmail: data.get('billingEmail'),
          externalReference: data.get('externalReference') || undefined,
          currency: String(currency).toUpperCase(),
          countryCode: String(countryCode).toUpperCase(),
          jurisdictionCode: String(jurisdictionCode).toUpperCase(),
          dataClassification: String(data.get('dataClassification') || 'FINANCIAL_SOX'),
        }),
      });
      form.reset();
      setShowForm(false);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Customer creation failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Customers & Counterparties</h2>
          <p className="text-sm text-zinc-500">Governed tenant debtors linked to universal country & tax master data.</p>
        </div>
        <button type="button" onClick={() => setShowForm(!showForm)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
          {showForm ? 'Close' : '+ Add debtor'}
        </button>
      </div>
      {showForm ? (
        <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-6 md:grid-cols-2">
          <Field label="Legal entity name" name="legalName" required />
          <Field label="Billing email" name="billingEmail" type="email" required />
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Country (ISO 3166-1 Master Data)</label>
            <select
              name="countryCode"
              value={countryCode}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium"
            >
              {MASTER_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name} ({c.defaultCurrency} / {c.region})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Tax Jurisdiction (Nexus Authority)</label>
            <select
              name="jurisdictionCode"
              value={jurisdictionCode}
              onChange={(e) => setJurisdictionCode(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium"
            >
              {availableJurisdictions.map((j) => (
                <option key={j.jurisdictionCode} value={j.jurisdictionCode}>
                  {j.jurisdictionCode} — {j.name} ({j.defaultStandardRatePercent}%)
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Settlement Currency (ISO 4217)</label>
            <input
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-mono font-bold uppercase"
              required
            />
          </div>
          <Field label="ERP / External contract reference" name="externalReference" />
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Statutory Data Classification</label>
            <select name="dataClassification" defaultValue="FINANCIAL_SOX" className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">
              <option value="FINANCIAL_SOX">FINANCIAL_SOX — Statutory Audit Ledger (SOX 404 / 10-Yr Immutable)</option>
              <option value="RESTRICTED_PII">RESTRICTED_PII — Sensitive Personal Identity (GDPR / CCPA Protected)</option>
              <option value="CONFIDENTIAL">CONFIDENTIAL — Commercial Non-Disclosure (Pricing / Terms)</option>
              <option value="INTERNAL">INTERNAL — General Enterprise Operations</option>
              <option value="PUBLIC">PUBLIC — Open Reference</option>
            </select>
          </div>
          {error ? <p className="text-sm text-red-700 md:col-span-2">{error}</p> : null}
          <button disabled={busy} className="w-fit rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white">
            {busy ? 'Saving…' : 'Save customer'}
          </button>
        </form>
      ) : null}

      <DataTable headers={['Customer / Debtor', 'Country', 'Jurisdiction', 'Billing Email', 'Currency', 'Classification', 'Status']} empty="No customers have been created.">
        {customers.map((customer) => (
          <tr key={customer.id} className="border-t border-zinc-100">
            <Cell strong>
              <div>
                <span className="font-medium text-zinc-900">{customer.legalName}</span>
                {customer.externalReference && (
                  <span className="ml-2 font-mono text-[10px] text-zinc-500">({customer.externalReference})</span>
                )}
              </div>
            </Cell>
            <Cell>
              <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs font-bold text-zinc-800">
                {customer.countryCode ?? 'US'}
              </span>
            </Cell>
            <Cell>
              <span className="font-mono text-xs font-semibold text-blue-700">
                {customer.jurisdictionCode ?? 'US-CA'}
              </span>
            </Cell>
            <Cell>{customer.billingEmail}</Cell>
            <Cell><span className="font-mono font-medium">{customer.currency}</span></Cell>
            <Cell>
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                customer.dataClassification === 'RESTRICTED_PII'
                  ? 'bg-red-100 text-red-800 border border-red-200'
                  : customer.dataClassification === 'CONFIDENTIAL'
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-purple-100 text-purple-800 border border-purple-200'
              }`}>
                {customer.dataClassification ?? 'FINANCIAL_SOX'}
              </span>
            </Cell>
            <Cell>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                {customer.status}
              </span>
            </Cell>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}

function InvoicesPanel({
  invoices,
  customers,
  reload,
}: {
  invoices: Invoice[];
  customers: Customer[];
  reload: () => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();
  const customerName = (id: string) => customers.find((customer) => customer.id === id)?.legalName ?? id;

  async function issue(invoice: Invoice) {
    const reason = window.prompt('Reason for permanent invoice issuance:');
    if (!reason?.trim()) return;
    setBusyId(invoice.id);
    setError(undefined);
    try {
      await requestAr(`v1/invoices/${invoice.id}/issue`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey(),
          'If-Match': `"${invoice.version}"`,
        },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invoice issue failed.');
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Invoices</h2>
        <p className="text-sm text-zinc-500">Draft and immutable issued records loaded from PostgreSQL.</p>
      </div>
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <DataTable headers={['Invoice #', 'Debtor / Counterparty', 'Jurisdiction', 'Classification', 'Status', 'Due date', 'Total', 'Action']} empty="No invoices have been created.">
        {invoices.map((invoice) => {
          const cust = customers.find((c) => c.id === invoice.customerId);
          return (
            <tr key={invoice.id} className="border-t border-zinc-100">
              <Cell strong>
                <div className="font-mono font-medium text-zinc-900">
                  {invoice.invoiceNumber ?? 'Unnumbered draft'}
                </div>
              </Cell>
              <Cell>{customerName(invoice.customerId)}</Cell>
              <Cell>
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-zinc-800">
                    {cust?.countryCode ?? 'US'}
                  </span>
                  <span className="font-mono text-xs font-semibold text-blue-700">
                    {cust?.jurisdictionCode ?? 'US-CA'}
                  </span>
                </div>
              </Cell>
              <Cell>
                <span className="inline-flex items-center rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-purple-800">
                  {cust?.dataClassification ?? 'FINANCIAL_SOX'}
                </span>
              </Cell>
              <Cell>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                  invoice.status === 'ISSUED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  {invoice.status}
                </span>
              </Cell>
              <Cell>{invoice.dueDate}</Cell>
              <Cell><span className="font-mono font-bold text-zinc-900">{money(invoice.currency, invoice.totalMinor)}</span></Cell>
              <Cell>
                {invoice.status === 'DRAFT' ? (
                  <button type="button" disabled={busyId === invoice.id} onClick={() => void issue(invoice)} className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                    {busyId === invoice.id ? 'Issuing…' : 'Issue invoice'}
                  </button>
                ) : (
                  <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">Immutable Seal</span>
                )}
              </Cell>
            </tr>
          );
        })}
      </DataTable>
    </section>
  );
}

function InvoicePanel({ customers, onCreated }: { customers: Customer[]; onCreated: () => Promise<void> }) {
  const [lines, setLines] = useState<DraftLine[]>([
    { key: crypto.randomUUID(), description: '', quantity: '1', unitAmountMinor: '0' },
  ]);
  const [busy, setBusy] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [countryCode, setCountryCode] = useState('US');         // overridden by customer selection
  const [jurisdictionCode, setJurisdictionCode] = useState('US-CA'); // overridden by customer selection
  const [currency, setCurrency] = useState('USD');               // overridden by customer selection
  const [error, setError] = useState<string>();
  const today = new Date().toISOString().slice(0, 10);

  const selectedCust = customers.find((c) => c.id === selectedCustomerId);

  // Derive payment terms from the selected customer; fallback to 30 days if none set
  const paymentTermsDays: number = (() => {
    const terms = (selectedCust as any)?.paymentTerms ?? (selectedCust as any)?.paymentTermsDays;
    if (typeof terms === 'number') return terms;
    if (typeof terms === 'string') {
      const match = /NET_(\d+)/.exec(terms);
      if (match) return parseInt(match[1], 10);
      if (terms === 'DUE_ON_RECEIPT') return 0;
    }
    return 30; // platform default; configurable via billing entity settings
  })();
  const due = new Date(Date.now() + paymentTermsDays * 86_400_000).toISOString().slice(0, 10);
  const invoiceDataClassification = selectedCust?.dataClassification ?? 'FINANCIAL_SOX';

  useEffect(() => {
    if (selectedCust) {
      setCountryCode(selectedCust.countryCode ?? 'US');
      setJurisdictionCode(selectedCust.jurisdictionCode ?? 'US-CA');
      setCurrency(selectedCust.currency ?? 'USD');
    }
  }, [selectedCust]);

  const availableJurisdictions = useMemo(() => {
    const list = MASTER_TAX_JURISDICTIONS.filter((j) => j.countryCode === countryCode);
    return list.length > 0 ? list : [{ jurisdictionCode: `${countryCode}-FED`, name: `${countryCode} Statutory Tax Authority`, defaultStandardRatePercent: 0 }];
  }, [countryCode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      await requestAr('v1/invoices', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey() },
        body: JSON.stringify({
          customerId: data.get('customerId'),
          currency: String(currency).toUpperCase(),
          countryCode: String(countryCode).toUpperCase(),
          jurisdictionCode: String(jurisdictionCode).toUpperCase(),
          dataClassification: invoiceDataClassification,
          issueDate: data.get('issueDate'),
          dueDate: data.get('dueDate'),
          purchaseOrderReference: data.get('purchaseOrderReference') || undefined,
          lines: lines.map((line) => ({
            description: line.description,
            quantity: line.quantity,
            unitAmountMinor: Number(line.unitAmountMinor),
          })),
        }),
      });
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invoice creation failed.');
    } finally {
      setBusy(false);
    }
  }

  if (customers.length === 0) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">Create a debtor / customer before generating an invoice.</div>;
  }

  return (
    <form onSubmit={submit} className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6">
      <div>
        <h2 className="text-xl font-semibold">Generate Governed Invoice Draft</h2>
        <p className="text-sm text-zinc-500">Calculates double-entry receivables, statutory jurisdiction tax, and SOX cryptographic seals.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          Debtor / Counterparty
          <select
            name="customerId"
            required
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2.5 font-normal"
          >
            <option value="">Select a debtor / customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.legalName} ({customer.countryCode ?? 'US'} / {customer.jurisdictionCode ?? 'US-CA'})
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Billing Currency (ISO 4217)</label>
          <input
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-mono font-bold"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Country Code (ISO 3166-1)</label>
          <input
            name="countryCode"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-mono font-bold"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Tax Jurisdiction (Nexus Authority)</label>
          <select
            name="jurisdictionCode"
            value={jurisdictionCode}
            onChange={(e) => setJurisdictionCode(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-medium"
          >
            {availableJurisdictions.map((j) => (
              <option key={j.jurisdictionCode} value={j.jurisdictionCode}>
                {j.jurisdictionCode} — {j.name} ({j.defaultStandardRatePercent}%)
              </option>
            ))}
          </select>
        </div>
        <Field label="Statutory issue date" name="issueDate" type="date" defaultValue={today} required />
        <Field label="Net payment due date" name="dueDate" type="date" defaultValue={due} required />
        <Field label="Purchase order / Master agreement reference" name="purchaseOrderReference" />
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Audit Data Classification</label>
          <input
            name="dataClassification"
            readOnly
            value="FINANCIAL_SOX (Statutory Audit Ledger)"
            className="w-full rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5 text-sm font-medium text-purple-900"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Line items</h3>
          <button type="button" onClick={() => setLines((current) => [...current, { key: crypto.randomUUID(), description: '', quantity: '1', unitAmountMinor: '0' }])} className="text-sm font-semibold text-emerald-700">
            + Add line
          </button>
        </div>
        {lines.map((line, index) => (
          <div key={line.key} className="grid gap-3 rounded-xl bg-zinc-50 p-4 md:grid-cols-[1fr_140px_180px_auto]">
            <LineField label="Description" value={line.description} onChange={(value) => setLines((current) => current.map((item) => item.key === line.key ? { ...item, description: value } : item))} />
            <LineField label="Quantity" value={line.quantity} onChange={(value) => setLines((current) => current.map((item) => item.key === line.key ? { ...item, quantity: value } : item))} />
            <LineField label="Unit amount (minor)" type="number" value={line.unitAmountMinor} onChange={(value) => setLines((current) => current.map((item) => item.key === line.key ? { ...item, unitAmountMinor: value } : item))} />
            <button aria-label={`Remove line ${index + 1}`} type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} className="self-end rounded-lg border border-zinc-300 px-3 py-2 disabled:opacity-30">×</button>
          </div>
        ))}
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <button disabled={busy} className="rounded-lg bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? 'Saving…' : 'Save draft'}
      </button>
    </form>
  );
}

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  pattern?: string;
  min?: string;
  max?: string;
}

function Field({ label, ...inputProps }: FieldProps) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
      {label}
      <input {...inputProps} className="rounded-lg border border-zinc-300 px-3 py-2.5 font-normal outline-none focus:border-emerald-600" />
    </label>
  );
}

function LineField({ label, type = 'text', value, onChange }: { label: string; type?: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-medium">
      {label}
      <input required type={type} min={type === 'number' ? 0 : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2" />
    </label>
  );
}

function DataTable({ headers, empty, children }: { headers: string[]; empty: string; children: ReactNode }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>{headers.map((header) => <th key={header} className="px-4 py-3 font-semibold">{header}</th>)}</tr>
        </thead>
        <tbody>{hasRows ? children : <tr><td colSpan={headers.length} className="px-4 py-10 text-center text-zinc-500">{empty}</td></tr>}</tbody>
      </table>
    </div>
  );
}

function Cell({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <td className={`px-4 py-3 text-zinc-700 ${strong ? 'font-semibold text-zinc-950' : ''}`}>{children}</td>;
}
