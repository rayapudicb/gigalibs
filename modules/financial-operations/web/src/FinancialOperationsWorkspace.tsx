'use client';

import { holdsPermission } from '@gigalibs/contracts';
import { createRecordClient, MetadataWindow, type RecordClient, usePublishedManifest } from '@gigalibs/configuration-react';
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

// WI-OI-120l (U12, ADR-0033 D1): the general ledger on metadata windows over Financial Operations' record dispatcher.
// Manual journals are drafted, submitted and approved by a second person before they post (owner decision 2026-10-06).
// Two panels stay inside the governed screen: setting up a book (legal entity, fiscal year, optional starter chart of
// accounts) and the reports (trial balance, income statement, balance sheet), all from Finance's API as the signed-in
// user. The hand-written screen with sample books, banks and balances is gone.

const BASE_PATH = '/api/financial-operations';

const WINDOWS = [
  { surface: 'finance-journal-drafts', label: 'Journal entry' },
  { surface: 'finance-journals', label: 'Posted journals' },
  { surface: 'finance-accounts', label: 'Chart of accounts' },
  { surface: 'finance-periods', label: 'Periods' },
  { surface: 'finance-books', label: 'Books' },
] as const;

type Tab = (typeof WINDOWS)[number]['surface'] | 'setup' | 'reports';

const field =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none';
const primary =
  'rounded-md bg-ui-button-inverted px-3 py-1.5 text-sm font-medium text-ui-fg-on-inverted hover:bg-ui-button-inverted-hover disabled:opacity-50';
const box = 'rounded-lg border border-ui-border-base bg-ui-bg-base p-4';

function holds(permissions: readonly string[], permission: string): boolean {
  return holdsPermission(permissions, permission);
}

export interface FinancialOperationsWorkspaceProps {
  /** The signed-in user's permissions, for the windows' deny-by-default rules (the server still decides). */
  readonly permissions?: readonly string[];
}

export function FinancialOperationsWorkspace({ permissions = [] }: FinancialOperationsWorkspaceProps = {}) {
  const [tab, setTab] = useState<Tab>('finance-journal-drafts');
  const client = useMemo(() => createRecordClient({ basePath: BASE_PATH }), []);
  const canSetUp = holds(permissions, 'finance:books:manage');
  const tabs: readonly { surface: Tab; label: string }[] = [
    ...WINDOWS,
    { surface: 'reports', label: 'Reports' },
    ...(canSetUp ? [{ surface: 'setup' as const, label: 'Set up a book' }] : []),
  ];
  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-ui-fg-base">General ledger</h1>
        <p className="text-sm text-ui-fg-subtle">
          Books, chart of accounts, periods and journals of your organization. A manual journal is drafted, submitted and approved by a second person before it posts.
        </p>
      </header>
      <nav role="tablist" aria-label="General ledger" className="flex flex-wrap gap-1 border-b border-ui-border-base">
        {tabs.map((entry) => (
          <button
            key={entry.surface}
            type="button"
            role="tab"
            aria-selected={tab === entry.surface}
            className={`px-3 py-2 text-sm ${tab === entry.surface ? 'border-b-2 border-ui-border-interactive font-medium text-ui-fg-base' : 'text-ui-fg-subtle hover:text-ui-fg-base'}`}
            onClick={() => setTab(entry.surface)}
          >
            {entry.label}
          </button>
        ))}
      </nav>
      {tab === 'setup' ? <SetUpBook /> : tab === 'reports' ? <Reports /> : <FinanceWindow key={tab} surface={tab} client={client} permissions={permissions} />}
    </div>
  );
}

function FinanceWindow({ surface, client, permissions }: { surface: string; client: RecordClient; permissions: readonly string[] }) {
  const state = usePublishedManifest({ moduleKey: 'financial-operations', entityKey: surface, surfaceKey: surface });
  if (state.status === 'loading') return <p className="text-sm text-ui-fg-muted">Loading the window…</p>;
  if (state.status !== 'ready') {
    return (
      <div role="alert" className={box}>
        <p className="text-sm font-medium text-ui-fg-error">{state.status === 'forbidden' ? 'No access' : 'This window is not available'}</p>
        <p className="mt-1 text-sm text-ui-fg-subtle">{state.message}</p>
      </div>
    );
  }
  return <MetadataWindow manifest={state.manifest} client={client} permissions={permissions} />;
}

/** A JSON call to Finance or the control plane, with the server's message on refusal. */
async function call<T>(path: string, init?: { method: 'POST'; body: unknown }): Promise<T> {
  const response = await fetch(path, {
    method: init?.method ?? 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(init ? { 'Content-Type': 'application/json' } : {}) },
    ...(init ? { body: JSON.stringify(init.body) } : {}),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const nested = record.message && typeof record.message === 'object' ? (record.message as Record<string, unknown>) : record;
    const message = typeof nested.message === 'string' ? nested.message : typeof record.title === 'string' ? record.title : typeof record.detail === 'string' ? record.detail : null;
    throw new Error(message ?? `The request failed (${response.status}).`);
  }
  return body as T;
}

interface Book {
  readonly id: string;
  readonly bookCode: string;
  readonly bookName: string;
  readonly currencyCode: string;
}

function useBooks(version = 0) {
  const [books, setBooks] = useState<readonly Book[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    call<readonly Book[]>(`${BASE_PATH}/v1/books`)
      .then((found) => setBooks(found))
      .catch((error: Error) => setFailure(error.message));
  }, [version]);
  return { books, failure };
}

/** A small standard chart a new book can start from; accounts can be renamed, extended or made inactive later. */
const STARTER_CHART: readonly [string, string, string, string, string][] = [
  ['1000', 'Cash at bank', 'ASSET', 'BANK', 'DEBIT'],
  ['1100', 'Accounts receivable', 'ASSET', 'ACCOUNTS_RECEIVABLE', 'DEBIT'],
  ['1200', 'Inventory', 'ASSET', 'CURRENT_ASSET', 'DEBIT'],
  ['1300', 'Prepaid expenses', 'ASSET', 'CURRENT_ASSET', 'DEBIT'],
  ['1500', 'Equipment', 'ASSET', 'FIXED_ASSET', 'DEBIT'],
  ['1590', 'Accumulated depreciation', 'ASSET', 'FIXED_ASSET', 'CREDIT'],
  ['2000', 'Accounts payable', 'LIABILITY', 'ACCOUNTS_PAYABLE', 'CREDIT'],
  ['2100', 'Accrued liabilities', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT'],
  ['2200', 'Sales tax payable', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT'],
  ['2500', 'Long-term loan', 'LIABILITY', 'LONG_TERM_LIABILITY', 'CREDIT'],
  ['3000', 'Share capital', 'EQUITY', 'EQUITY', 'CREDIT'],
  ['3100', 'Retained earnings', 'EQUITY', 'RETAINED_EARNINGS', 'CREDIT'],
  ['4000', 'Sales revenue', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT'],
  ['4100', 'Service revenue', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT'],
  ['4900', 'Other income', 'REVENUE', 'OTHER_REVENUE', 'CREDIT'],
  ['5000', 'Cost of goods sold', 'EXPENSE', 'COST_OF_GOODS_SOLD', 'DEBIT'],
  ['6000', 'Salaries and wages', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT'],
  ['6100', 'Rent', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT'],
  ['6200', 'Utilities', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT'],
  ['6300', 'Depreciation expense', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT'],
  ['6400', 'Office and supplies', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT'],
  ['7000', 'Income tax expense', 'EXPENSE', 'TAX_EXPENSE', 'DEBIT'],
];

interface Party {
  readonly id: string;
  readonly code: string;
  readonly displayName: string;
}

function Labelled({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-ui-fg-subtle" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

function SetUpBook() {
  const [version, setVersion] = useState(0);
  const { books } = useBooks(version);
  const [parties, setParties] = useState<readonly Party[] | null>(null);
  const [partyFailure, setPartyFailure] = useState<string | null>(null);
  const [form, setForm] = useState({ partyId: '', code: 'MAIN', name: 'Main ledger', currency: 'USD', costing: 'STANDARD', year: String(new Date().getFullYear()), chart: true });
  const [yearForm, setYearForm] = useState({ bookId: '', year: String(new Date().getFullYear() + 1), chart: false });
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<readonly { tone: 'info' | 'error'; text: string }[]>([]);
  const note = useCallback((tone: 'info' | 'error', text: string) => setLog((current) => [...current, { tone, text }]), []);

  useEffect(() => {
    call<{ items: readonly Party[] }>('/api/control/parties?partyType=ORGANIZATION&limit=100')
      .then((found) => setParties(found.items))
      .catch((error: Error) => setPartyFailure(error.message));
  }, []);

  /** Adds the standard accounts a book does not have yet (by code); answers how many were added. */
  async function addStarterChart(bookId: string): Promise<number> {
    const existing = new Set((await call<readonly { accountCode: string }[]>(`${BASE_PATH}/v1/accounts?bookId=${encodeURIComponent(bookId)}`)).map((account) => account.accountCode));
    let added = 0;
    for (const [code, name, accountClass, subtype, normal] of STARTER_CHART) {
      if (existing.has(code)) continue;
      await call(`${BASE_PATH}/v1/accounts`, {
        method: 'POST',
        body: {
          accountingBookId: bookId, accountCode: code, accountName: name, accountClass, accountSubtype: subtype, normalBalance: normal,
          isReconcilable: subtype === 'BANK', isSubledgerControl: subtype === 'ACCOUNTS_RECEIVABLE' || subtype === 'ACCOUNTS_PAYABLE',
        },
      });
      added += 1;
    }
    return added;
  }

  /** The year, then (when asked) the starter chart; each step is reported on its own, so one refusal does not hide the other. */
  async function completeBook(bookId: string, year: string, chart: boolean) {
    try {
      await call(`${BASE_PATH}/v1/fiscal-years/standard`, { method: 'POST', body: { accountingBookId: bookId, year: Number(year) } });
      note('info', `Fiscal year ${year} created with twelve open monthly periods.`);
    } catch (error) {
      note('error', `Fiscal year ${year}: ${(error as Error).message}`);
    }
    if (!chart) return;
    try {
      const added = await addStarterChart(bookId);
      note('info', added > 0 ? `Starter chart: ${added} accounts created. Edit or extend it under Chart of accounts.` : 'Starter chart: the book already has every standard account.');
    } catch (error) {
      note('error', `Starter chart: ${(error as Error).message}`);
    }
  }

  async function createBook(event: FormEvent) {
    event.preventDefault();
    if (!form.partyId) return note('error', 'Choose the legal entity the book belongs to.');
    setBusy(true);
    setLog([]);
    try {
      const book = await call<Book>(`${BASE_PATH}/v1/books`, {
        method: 'POST',
        body: { bookCode: form.code.trim(), bookName: form.name.trim(), legalEntityPartyId: form.partyId, currencyCode: form.currency.trim().toUpperCase(), costingMethod: form.costing, isPrimary: (books ?? []).length === 0 },
      });
      note('info', `Book ${book.bookCode} created.`);
      setVersion((current) => current + 1);
      await completeBook(book.id, form.year, form.chart);
    } catch (error) {
      note('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addYear(event: FormEvent) {
    event.preventDefault();
    if (!yearForm.bookId) return note('error', 'Choose a book.');
    setBusy(true);
    setLog([]);
    try {
      await completeBook(yearForm.bookId, yearForm.year, yearForm.chart);
    } finally {
      setBusy(false);
    }
  }

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return (
    <section className="grid max-w-5xl gap-6 lg:grid-cols-2">
      <form className={`${box} space-y-3`} onSubmit={(event) => void createBook(event)} aria-label="Set up a book">
        <h2 className="text-sm font-semibold text-ui-fg-base">Set up a book</h2>
        <p className="text-sm text-ui-fg-subtle">A book belongs to a legal entity, keeps one currency, and needs a fiscal year before journals post.</p>
        <Labelled label="Legal entity" htmlFor="setup-party">
          <select id="setup-party" className={field} value={form.partyId} onChange={set('partyId')}>
            <option value="">Choose…</option>
            {(parties ?? []).map((party) => (
              <option key={party.id} value={party.id}>
                {party.code} — {party.displayName}
              </option>
            ))}
          </select>
          {partyFailure && <p className="text-xs text-ui-fg-error">{partyFailure}</p>}
          {parties && parties.length === 0 && (
            <p className="text-xs text-ui-fg-muted">
              No organizations yet. Add your company under <a className="text-ui-fg-interactive hover:underline" href="/parties">Parties</a> first.
            </p>
          )}
        </Labelled>
        <div className="grid grid-cols-2 gap-3">
          <Labelled label="Book code" htmlFor="setup-code"><input id="setup-code" className={field} value={form.code} onChange={set('code')} /></Labelled>
          <Labelled label="Currency" htmlFor="setup-currency"><input id="setup-currency" className={field} maxLength={3} value={form.currency} onChange={set('currency')} /></Labelled>
        </div>
        <Labelled label="Book name" htmlFor="setup-name"><input id="setup-name" className={field} value={form.name} onChange={set('name')} /></Labelled>
        <div className="grid grid-cols-2 gap-3">
          <Labelled label="Costing method" htmlFor="setup-costing">
            <select id="setup-costing" className={field} value={form.costing} onChange={set('costing')}>
              <option value="STANDARD">Standard</option>
              <option value="FIFO">FIFO</option>
              <option value="AVERAGE">Moving average</option>
            </select>
          </Labelled>
          <Labelled label="First fiscal year" htmlFor="setup-year"><input id="setup-year" className={field} inputMode="numeric" value={form.year} onChange={set('year')} /></Labelled>
        </div>
        <label className="flex items-center gap-2 text-sm text-ui-fg-base">
          <input type="checkbox" checked={form.chart} onChange={(event) => setForm((current) => ({ ...current, chart: event.target.checked }))} />
          Start from a standard chart of {STARTER_CHART.length} accounts (no amounts)
        </label>
        <button type="submit" className={primary} disabled={busy}>
          {busy ? 'Setting up…' : 'Set up the book'}
        </button>
      </form>
      <div className="space-y-4">
        <form className={`${box} space-y-3`} onSubmit={(event) => void addYear(event)} aria-label="Add a fiscal year">
          <h2 className="text-sm font-semibold text-ui-fg-base">Add a fiscal year</h2>
          <Labelled label="Book" htmlFor="year-book">
            <select id="year-book" className={field} value={yearForm.bookId} onChange={(event) => setYearForm((current) => ({ ...current, bookId: event.target.value }))}>
              <option value="">Choose…</option>
              {(books ?? []).map((book) => (
                <option key={book.id} value={book.id}>
                  {book.bookCode} — {book.bookName}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled label="Year" htmlFor="year-year">
            <input id="year-year" className={field} inputMode="numeric" value={yearForm.year} onChange={(event) => setYearForm((current) => ({ ...current, year: event.target.value }))} />
          </Labelled>
          <label className="flex items-center gap-2 text-sm text-ui-fg-base">
            <input type="checkbox" checked={yearForm.chart} onChange={(event) => setYearForm((current) => ({ ...current, chart: event.target.checked }))} />
            Also add any standard accounts the book does not have
          </label>
          <button type="submit" className={primary} disabled={busy}>
            Add the year
          </button>
        </form>
        {log.length > 0 && (
          <ul className={`${box} space-y-1 text-sm`} aria-live="polite">
            {log.map((entry, index) => (
              <li key={index} className={entry.tone === 'error' ? 'text-ui-fg-error' : 'text-ui-fg-base'}>
                {entry.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Minor units as a decimal amount, without floating point. */
function amount(minor: string, currency: string): string {
  const negative = minor.startsWith('-');
  const digits = (negative ? minor.slice(1) : minor).padStart(3, '0');
  const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${whole}.${digits.slice(-2)} ${currency}`;
}

interface TrialBalance {
  readonly currencyCode: string;
  readonly isBalanced: boolean;
  readonly totalDebitsMinor: string;
  readonly totalCreditsMinor: string;
  readonly lines: readonly { accountCode: string; accountName: string; endingDebitMinor: string; endingCreditMinor: string }[];
}
interface Item {
  readonly accountCode: string;
  readonly accountName: string;
  readonly amountMinor: string;
}
interface IncomeStatement {
  readonly currencyCode: string;
  readonly revenues: { totalMinor: string; items: readonly Item[] };
  readonly costOfGoodsSold: { totalMinor: string; items: readonly Item[] };
  readonly grossProfitMinor: string;
  readonly operatingExpenses: { totalMinor: string; items: readonly Item[] };
  readonly operatingIncomeMinor: string;
  readonly netIncomeMinor: string;
}
interface Side {
  readonly totalMinor: string;
  readonly sections: readonly { sectionName: string; totalMinor: string; items: readonly Item[] }[];
}
interface BalanceSheet {
  readonly currencyCode: string;
  readonly isBalanced: boolean;
  readonly assets: Side;
  readonly liabilities: Side;
  readonly equity: Side;
}

type Report = { kind: 'tb'; data: TrialBalance } | { kind: 'is'; data: IncomeStatement } | { kind: 'bs'; data: BalanceSheet };

function Reports() {
  const { books, failure: booksFailure } = useBooks();
  const today = new Date().toISOString().slice(0, 10);
  const [bookId, setBookId] = useState('');
  const [kind, setKind] = useState<'tb' | 'is' | 'bs'>('tb');
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<Report | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!bookId && books && books[0]) setBookId(books[0].id);
  }, [books, bookId]);

  async function run(event: FormEvent) {
    event.preventDefault();
    if (!bookId) return setMessage('Choose a book.');
    setBusy(true);
    setMessage(null);
    setReport(null);
    try {
      const query = new URLSearchParams({ bookId, ...(kind === 'is' ? { fromDate: from, toDate: to } : { asOfDate: to }) });
      const path = kind === 'tb' ? 'trial-balance' : kind === 'is' ? 'income-statement' : 'balance-sheet';
      const data = await call<unknown>(`${BASE_PATH}/v1/reports/${path}?${query.toString()}`);
      setReport({ kind, data } as Report);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-5xl space-y-4">
      <form className="grid grid-cols-1 items-end gap-3 sm:grid-cols-5" onSubmit={(event) => void run(event)} aria-label="Run a report">
        <Labelled label="Book" htmlFor="report-book">
          <select id="report-book" className={field} value={bookId} onChange={(event) => setBookId(event.target.value)}>
            <option value="">Choose…</option>
            {(books ?? []).map((book) => (
              <option key={book.id} value={book.id}>
                {book.bookCode} — {book.bookName}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Report" htmlFor="report-kind">
          <select id="report-kind" className={field} value={kind} onChange={(event) => setKind(event.target.value as 'tb' | 'is' | 'bs')}>
            <option value="tb">Trial balance</option>
            <option value="is">Income statement</option>
            <option value="bs">Balance sheet</option>
          </select>
        </Labelled>
        {kind === 'is' && (
          <Labelled label="From" htmlFor="report-from">
            <input id="report-from" type="date" className={field} value={from} onChange={(event) => setFrom(event.target.value)} />
          </Labelled>
        )}
        <Labelled label={kind === 'is' ? 'To' : 'As of'} htmlFor="report-to">
          <input id="report-to" type="date" className={field} value={to} onChange={(event) => setTo(event.target.value)} />
        </Labelled>
        <button type="submit" className={primary} disabled={busy}>
          {busy ? 'Running…' : 'Run report'}
        </button>
      </form>
      {booksFailure && <p className="text-sm text-ui-fg-error">{booksFailure}</p>}
      {books && books.length === 0 && <p className="text-sm text-ui-fg-muted">No books yet: set one up first.</p>}
      {message && (
        <p role="alert" className="text-sm text-ui-fg-error">
          {message}
        </p>
      )}
      {report?.kind === 'tb' && <TrialBalanceView report={report.data} />}
      {report?.kind === 'is' && <IncomeStatementView report={report.data} />}
      {report?.kind === 'bs' && <BalanceSheetView report={report.data} />}
      <p className="text-xs text-ui-fg-muted">Reports use posted journals only; drafts awaiting approval are not included.</p>
    </section>
  );
}

const th = 'px-3 py-2 text-left text-xs font-medium text-ui-fg-subtle';
const td = 'px-3 py-1.5 text-sm text-ui-fg-base';

function Balanced({ ok }: { ok: boolean }) {
  return <p className={`text-sm font-medium ${ok ? 'text-ui-fg-interactive' : 'text-ui-fg-error'}`}>{ok ? 'Balanced' : 'Does not balance'}</p>;
}

function TrialBalanceView({ report }: { report: TrialBalance }) {
  return (
    <div className={`${box} space-y-2`}>
      <Balanced ok={report.isBalanced} />
      <table className="w-full">
        <thead>
          <tr>
            <th className={th}>Account</th>
            <th className={`${th} text-right`}>Debit</th>
            <th className={`${th} text-right`}>Credit</th>
          </tr>
        </thead>
        <tbody>
          {report.lines.map((line) => (
            <tr key={line.accountCode} className="border-t border-ui-border-base">
              <td className={td}>{`${line.accountCode} — ${line.accountName}`}</td>
              <td className={`${td} text-right`}>{line.endingDebitMinor !== '0' ? amount(line.endingDebitMinor, report.currencyCode) : ''}</td>
              <td className={`${td} text-right`}>{line.endingCreditMinor !== '0' ? amount(line.endingCreditMinor, report.currencyCode) : ''}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-ui-border-strong font-medium">
            <td className={td}>Total</td>
            <td className={`${td} text-right`}>{amount(report.totalDebitsMinor, report.currencyCode)}</td>
            <td className={`${td} text-right`}>{amount(report.totalCreditsMinor, report.currencyCode)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Block({ title, items, total, currency }: { title: string; items: readonly Item[]; total: string; currency: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-ui-fg-base">{title}</h3>
      {items.map((item) => (
        <div key={item.accountCode} className="flex justify-between text-sm text-ui-fg-base">
          <span>{`${item.accountCode} — ${item.accountName}`}</span>
          <span>{amount(item.amountMinor, currency)}</span>
        </div>
      ))}
      <div className="flex justify-between border-t border-ui-border-base pt-1 text-sm font-medium text-ui-fg-base">
        <span>Total {title.toLowerCase()}</span>
        <span>{amount(total, currency)}</span>
      </div>
    </div>
  );
}

function IncomeStatementView({ report }: { report: IncomeStatement }) {
  const c = report.currencyCode;
  return (
    <div className={`${box} space-y-4`}>
      <Block title="Revenue" items={report.revenues.items} total={report.revenues.totalMinor} currency={c} />
      <Block title="Cost of goods sold" items={report.costOfGoodsSold.items} total={report.costOfGoodsSold.totalMinor} currency={c} />
      <p className="flex justify-between text-sm font-semibold text-ui-fg-base"><span>Gross profit</span><span>{amount(report.grossProfitMinor, c)}</span></p>
      <Block title="Operating expenses" items={report.operatingExpenses.items} total={report.operatingExpenses.totalMinor} currency={c} />
      <p className="flex justify-between text-sm font-semibold text-ui-fg-base"><span>Operating income</span><span>{amount(report.operatingIncomeMinor, c)}</span></p>
      <p className="flex justify-between text-base font-semibold text-ui-fg-base"><span>Net income</span><span>{amount(report.netIncomeMinor, c)}</span></p>
    </div>
  );
}

function BalanceSheetView({ report }: { report: BalanceSheet }) {
  const c = report.currencyCode;
  const side = (title: string, value: Side) => (
    <div className="space-y-3">
      {value.sections.map((section) => (
        <Block key={section.sectionName} title={section.sectionName} items={section.items} total={section.totalMinor} currency={c} />
      ))}
      <p className="flex justify-between text-sm font-semibold text-ui-fg-base"><span>Total {title}</span><span>{amount(value.totalMinor, c)}</span></p>
    </div>
  );
  return (
    <div className={`${box} space-y-4`}>
      <Balanced ok={report.isBalanced} />
      {side('assets', report.assets)}
      {side('liabilities', report.liabilities)}
      {side('equity', report.equity)}
    </div>
  );
}
