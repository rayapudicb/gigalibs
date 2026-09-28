'use client';

import type { FormEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type View = 'overview' | 'cost-centers' | 'expenses' | 'setup';
type CostCenter = {
  id: string;
  code: string;
  name: string;
  managerName: string;
  managerEmail: string;
  currency: string;
  allocatedBudgetMinor: number;
  spentBudgetMinor: number;
  fiscalYear: number;
  status: string;
};
type Expense = {
  id: string;
  costCenterId: string;
  costCenterCode?: string;
  employeeName: string;
  merchant: string;
  category: string;
  currency: string;
  amountMinor: number;
  taxMinor: number;
  status: string;
  version: number;
};
type Metrics = {
  totalAllocatedMinor: number;
  totalSpentMinor: number;
  pendingApprovalsCount: number;
  approvedTotalMinor: number;
  reimbursedTotalMinor: number;
  costCentersCount: number;
};

class SpendError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function requestSpend<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/spend/${path}`, {
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
    throw new SpendError(response.status, payload.detail ?? message ?? payload.title ?? 'Request failed.');
  }
  return payload;
}

function money(currency: string, minor: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100);
}

export default function SpendManagementWorkbench() {
  const [view, setView] = useState<View>('overview');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [metrics, setMetrics] = useState<Metrics>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      await requestSpend('v1/setup');
      const [centers, persistedExpenses, currentMetrics] = await Promise.all([
        requestSpend<CostCenter[]>('v1/cost-centers'),
        requestSpend<Expense[]>('v1/expenses'),
        requestSpend<Metrics>('v1/analytics/metrics'),
      ]);
      setCostCenters(centers);
      setExpenses(persistedExpenses);
      setMetrics(currentMetrics);
      setConfigured(true);
    } catch (caught) {
      if (caught instanceof SpendError && caught.status === 404) {
        setConfigured(false);
        setView('setup');
      } else {
        setError(caught instanceof Error ? caught.message : 'Spend Management could not be loaded.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);
  const defaultCurrency = costCenters[0]?.currency ?? 'USD';

  return (
    <div className="min-h-full bg-[#f6f8f7] p-6 lg:p-9">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap gap-2" aria-label="Spend Management sections">
            {([['overview', 'Overview'], ['cost-centers', 'Cost centers'], ['expenses', 'Expenses'], ['setup', 'Configuration']] as const).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setView(key)} disabled={configured === false && key !== 'setup'} className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40 ${view === key ? 'bg-zinc-950 text-white' : 'border border-zinc-300 bg-white text-zinc-700'}`}>{label}</button>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">LIVE LOCAL UAT</span>
            <button type="button" onClick={() => void load()} className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-zinc-50">Refresh</button>
          </div>
        </div>
        {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
        {loading ? <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">Loading persisted spend records…</div> : null}
        {!loading && view === 'setup' ? <Setup configured={configured === true} reload={load} /> : null}
        {!loading && configured && view === 'overview' ? <Overview metrics={metrics} currency={defaultCurrency} open={setView} /> : null}
        {!loading && configured && view === 'cost-centers' ? <CostCenters records={costCenters} reload={load} /> : null}
        {!loading && configured && view === 'expenses' ? <Expenses records={expenses} costCenters={costCenters} reload={load} /> : null}
      </div>
    </div>
  );
}

function Overview({ metrics, currency, open }: { metrics?: Metrics; currency: string; open: (view: View) => void }) {
  const values = [
    ['Allocated budget', money(currency, metrics?.totalAllocatedMinor ?? 0)],
    ['Approved spend', money(currency, metrics?.approvedTotalMinor ?? 0)],
    ['Reimbursed', money(currency, metrics?.reimbursedTotalMinor ?? 0)],
    ['Pending approvals', String(metrics?.pendingApprovalsCount ?? 0)],
  ];
  return <div className="space-y-5">
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{values.map(([label, value]) => <article key={label} className="rounded-2xl border border-zinc-200 bg-white p-5"><p className="text-sm text-zinc-500">{label}</p><p className="mt-3 text-2xl font-semibold">{value}</p></article>)}</section>
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-6"><div><h2 className="text-lg font-semibold">Expense control workflow</h2><p className="mt-1 text-sm text-zinc-500">Create a budget, submit an expense, approve it with an ETag, and record reimbursement.</p></div><button type="button" onClick={() => open('expenses')} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white">Open expenses</button></section>
  </div>;
}

function Setup({ configured, reload }: { configured: boolean; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  async function configure() {
    setBusy(true); setMessage(undefined);
    try { await requestSpend('v1/setup', { method: 'POST', body: '{}' }); setMessage('Spend tenant binding was persisted.'); await reload(); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Setup failed.'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-zinc-200 bg-white p-6"><h2 className="text-xl font-semibold">Spend configuration</h2><p className="mt-2 text-sm text-zinc-600">This binds the verified suite tenant to the Spend PostgreSQL schema. No sample records are inserted.</p>{message ? <p className="mt-4 rounded-lg bg-zinc-100 p-3 text-sm">{message}</p> : null}<button type="button" disabled={busy || configured} onClick={() => void configure()} className="mt-5 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{configured ? 'Configured' : busy ? 'Configuring…' : 'Configure Spend Management'}</button></section>;
}

function CostCenters({ records, reload }: { records: CostCenter[]; reload: () => Promise<void> }) {
  const [show, setShow] = useState(records.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(undefined);
    const form = event.currentTarget; const data = new FormData(form);
    try {
      await requestSpend('v1/cost-centers', { method: 'POST', body: JSON.stringify({ code: data.get('code'), name: data.get('name'), managerName: data.get('managerName'), managerEmail: data.get('managerEmail'), currency: String(data.get('currency')).toUpperCase(), allocatedBudgetMinor: Number(data.get('allocatedBudgetMinor')), fiscalYear: Number(data.get('fiscalYear')) }) });
      form.reset(); setShow(false); await reload();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Cost center creation failed.'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Cost centers</h2><p className="text-sm text-zinc-500">Persisted budget ownership and consumption.</p></div><button type="button" onClick={() => setShow(!show)} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white">{show ? 'Close' : 'Add cost center'}</button></div>
    {show ? <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-6 md:grid-cols-2"><Field label="Code" name="code" required/><Field label="Name" name="name" required/><Field label="Manager name" name="managerName" required/><Field label="Manager email" name="managerEmail" type="email" required/><Field label="Currency" name="currency" defaultValue="USD" pattern="[A-Za-z]{3}" required/><Field label="Fiscal year" name="fiscalYear" type="number" defaultValue={String(new Date().getFullYear())} required/><Field label="Allocated budget (minor units)" name="allocatedBudgetMinor" type="number" min="0" required/>{error ? <p className="text-sm text-red-700 md:col-span-2">{error}</p> : null}<button disabled={busy} className="w-fit rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white">{busy ? 'Saving…' : 'Save cost center'}</button></form> : null}
    <Table headers={['Code', 'Name', 'Manager', 'Budget', 'Spent', 'Year']} empty="No cost centers have been created.">{records.map((item) => <tr key={item.id} className="border-t border-zinc-100"><Cell strong>{item.code}</Cell><Cell>{item.name}</Cell><Cell>{item.managerName}</Cell><Cell>{money(item.currency, item.allocatedBudgetMinor)}</Cell><Cell>{money(item.currency, item.spentBudgetMinor)}</Cell><Cell>{item.fiscalYear}</Cell></tr>)}</Table>
  </section>;
}

function Expenses({ records, costCenters, reload }: { records: Expense[]; costCenters: CostCenter[]; reload: () => Promise<void> }) {
  const [show, setShow] = useState(records.length === 0);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const centerName = useMemo(() => new Map(costCenters.map((item) => [item.id, item.code])), [costCenters]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy('create'); setError(undefined);
    const form = event.currentTarget; const data = new FormData(form);
    try {
      await requestSpend('v1/expenses', { method: 'POST', body: JSON.stringify({ costCenterId: data.get('costCenterId'), employeeName: data.get('employeeName'), employeeEmail: data.get('employeeEmail'), merchant: data.get('merchant'), category: data.get('category'), paymentMethod: data.get('paymentMethod'), currency: String(data.get('currency')).toUpperCase(), amountMinor: Number(data.get('amountMinor')), taxMinor: Number(data.get('taxMinor') || 0) }) });
      form.reset(); setShow(false); await reload();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Expense creation failed.'); }
    finally { setBusy(undefined); }
  }
  async function transition(expense: Expense, action: 'approve' | 'reimburse') {
    setBusy(expense.id); setError(undefined);
    try { await requestSpend(`v1/expenses/${expense.id}/${action}`, { method: 'POST', headers: action === 'approve' ? { 'If-Match': `"${expense.version}"` } : {}, body: '{}' }); await reload(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : `Expense ${action} failed.`); }
    finally { setBusy(undefined); }
  }
  if (costCenters.length === 0) return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">Create a cost center before submitting an expense.</div>;
  return <section className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Expenses</h2><p className="text-sm text-zinc-500">Submitted, approved, and reimbursed PostgreSQL records.</p></div><button type="button" onClick={() => setShow(!show)} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white">{show ? 'Close' : 'Submit expense'}</button></div>
    {show ? <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-6 md:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">Cost center<select name="costCenterId" required className="rounded-lg border border-zinc-300 px-3 py-2.5 font-normal"><option value="">Select a cost center</option>{costCenters.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label><Field label="Employee name" name="employeeName" required/><Field label="Employee email" name="employeeEmail" type="email" required/><Field label="Merchant / supplier" name="merchant" required/><Field label="Spend category" name="category" required/><Field label="Payment method" name="paymentMethod" defaultValue="CORPORATE_CARD" required/><Field label="Currency" name="currency" defaultValue={costCenters[0]?.currency ?? 'USD'} required/><Field label="Amount (minor units)" name="amountMinor" type="number" min="1" required/><Field label="Tax (minor units)" name="taxMinor" type="number" min="0" defaultValue="0"/>{error ? <p className="text-sm text-red-700 md:col-span-2">{error}</p> : null}<button disabled={busy === 'create'} className="w-fit rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white">{busy === 'create' ? 'Saving…' : 'Submit expense'}</button></form> : null}
    {!show && error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    <Table headers={['Merchant', 'Employee', 'Cost center', 'Category', 'Amount', 'Status', 'Action']} empty="No expenses have been submitted.">{records.map((item) => <tr key={item.id} className="border-t border-zinc-100"><Cell strong>{item.merchant}</Cell><Cell>{item.employeeName}</Cell><Cell>{item.costCenterCode ?? centerName.get(item.costCenterId) ?? '—'}</Cell><Cell>{item.category}</Cell><Cell>{money(item.currency, item.amountMinor)}</Cell><Cell>{item.status}</Cell><Cell>{item.status === 'SUBMITTED' ? <button type="button" disabled={busy === item.id} onClick={() => void transition(item, 'approve')} className="rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800">Approve</button> : item.status === 'APPROVED' ? <button type="button" disabled={busy === item.id} onClick={() => void transition(item, 'reimburse')} className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">Record reimbursement</button> : <span className="text-xs text-zinc-500">Complete</span>}</Cell></tr>)}</Table>
  </section>;
}

type FieldProps = { label: string; name: string; type?: string; defaultValue?: string; required?: boolean; pattern?: string; min?: string };
function Field({ label, ...props }: FieldProps) { return <label className="grid gap-1.5 text-sm font-medium text-zinc-800">{label}<input {...props} className="rounded-lg border border-zinc-300 px-3 py-2.5 font-normal outline-none focus:border-violet-600"/></label>; }
function Table({ headers, empty, children }: { headers: string[]; empty: string; children: ReactNode }) { const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children); return <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500"><tr>{headers.map((item) => <th key={item} className="px-4 py-3 font-semibold">{item}</th>)}</tr></thead><tbody>{hasRows ? children : <tr><td colSpan={headers.length} className="px-4 py-10 text-center text-zinc-500">{empty}</td></tr>}</tbody></table></div>; }
function Cell({ children, strong = false }: { children: ReactNode; strong?: boolean }) { return <td className={`px-4 py-3 text-zinc-700 ${strong ? 'font-semibold text-zinc-950' : ''}`}>{children}</td>; }
