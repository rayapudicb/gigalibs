'use client';

import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type {
  ExemptionCertificate, NexusMonitorSummary, TaxJurisdiction, TaxLedgerEntry, TaxRate,
} from '@/lib/tax-api';
import { formatMinorToCurrency, formatRateBasisPoints, requestTax } from '@/lib/tax-api';

type View = 'jurisdictions' | 'rates' | 'exemptions' | 'calculator' | 'monitor' | 'setup';

export default function TaxConfigurationWorkbench() {
  const [view, setView] = useState<View>('jurisdictions');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [jurisdictions, setJurisdictions] = useState<TaxJurisdiction[]>([]);
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [exemptions, setExemptions] = useState<ExemptionCertificate[]>([]);
  const [ledger, setLedger] = useState<TaxLedgerEntry[]>([]);
  const [monitor, setMonitor] = useState<NexusMonitorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    try {
      await requestTax('v1/setup');
      const [j, r, e, l, m] = await Promise.all([
        requestTax<TaxJurisdiction[]>('api/tax/v1/jurisdictions'),
        requestTax<TaxRate[]>('api/tax/v1/rates'),
        requestTax<ExemptionCertificate[]>('api/tax/v1/exemptions'),
        requestTax<TaxLedgerEntry[]>('api/tax/v1/ledger'),
        requestTax<NexusMonitorSummary[]>('api/tax/v1/nexus-status'),
      ]);
      setJurisdictions(j); setRates(r); setExemptions(e); setLedger(l); setMonitor(m);
      setConfigured(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Tax Configuration could not be loaded.';
      if (message.includes('404')) { setConfigured(false); setView('setup'); }
      else setError(message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => void load(), [load]);
  const tabs: [View, string][] = [
    ['jurisdictions', 'Jurisdictions'], ['rates', 'Rate rules'],
    ['exemptions', 'Exemptions'], ['calculator', 'Calculator & ledger'],
    ['monitor', 'Nexus monitor'], ['setup', 'Configuration'],
  ];

  return <div className="min-h-full bg-[#f6f8f7] p-6 lg:p-9"><div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm md:flex-row md:items-center">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Financial operations</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">Tax Configuration</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">Tenant-scoped jurisdictions, effective rates, reviewed exemptions, tax decisions, and nexus thresholds backed by PostgreSQL.</p></div>
      <div className="flex items-center gap-3"><span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">LOCAL UAT BUILD</span>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium">Refresh</button></div>
    </header>
    <nav className="flex flex-wrap gap-2" aria-label="Tax Configuration sections">{tabs.map(([key, label]) =>
      <button key={key} type="button" disabled={configured === false && key !== 'setup'} onClick={() => setView(key)} className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40 ${view === key ? 'bg-zinc-950 text-white' : 'border border-zinc-300 bg-white text-zinc-700'}`}>{label}</button>)}</nav>
    {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
    {loading ? <Panel>Loading persisted tax configuration…</Panel> : null}
    {!loading && view === 'setup' ? <Setup configured={configured === true} reload={load} /> : null}
    {!loading && configured && view === 'jurisdictions' ? <Jurisdictions rows={jurisdictions} reload={load} /> : null}
    {!loading && configured && view === 'rates' ? <Rates rows={rates} jurisdictions={jurisdictions} reload={load} /> : null}
    {!loading && configured && view === 'exemptions' ? <Exemptions rows={exemptions} jurisdictions={jurisdictions} reload={load} /> : null}
    {!loading && configured && view === 'calculator' ? <Calculator ledger={ledger} jurisdictions={jurisdictions} reload={load} /> : null}
    {!loading && configured && view === 'monitor' ? <Monitor rows={monitor} /> : null}
  </div></div>;
}

function Setup({ configured, reload }: { configured: boolean; reload(): Promise<void> }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string>();
  async function configure() { setBusy(true); setMessage(undefined); try {
    await requestTax('v1/setup', { method: 'POST', body: '{}' }); await reload();
  } catch (error) { setMessage(error instanceof Error ? error.message : 'Setup failed.'); } finally { setBusy(false); } }
  return <Panel><h2 className="text-xl font-semibold">Tenant binding</h2><p className="mt-2 text-sm text-zinc-600">Bind the verified suite tenant to the Tax schema. This creates no rates, jurisdictions, or sample records.</p>{message ? <ErrorText>{message}</ErrorText> : null}<button type="button" disabled={configured || busy} onClick={() => void configure()} className="mt-5 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{configured ? 'Configured' : busy ? 'Configuring…' : 'Configure Tax'}</button></Panel>;
}

function Jurisdictions({ rows, reload }: { rows: TaxJurisdiction[]; reload(): Promise<void> }) {
  const [open, setOpen] = useState(rows.length === 0);
  return <section className="space-y-4"><SectionTitle title="Jurisdictions" detail="Authoritative tenant configuration. Nothing is pre-populated." action={() => setOpen(!open)} actionLabel={open ? 'Close' : 'Add jurisdiction'} />
    {open ? <ActionForm submit={async (data) => {
      await requestTax('api/tax/v1/jurisdictions', { method: 'POST', body: JSON.stringify({
        countryCode: data.get('countryCode'), jurisdictionCode: data.get('jurisdictionCode'), jurisdictionName: data.get('jurisdictionName'), taxType: data.get('taxType'), standardRateBasisPoints: Number(data.get('standardRateBasisPoints')), reducedRateBasisPoints: Number(data.get('reducedRateBasisPoints')), hasPhysicalNexus: data.get('hasPhysicalNexus') === 'on', hasEconomicNexus: data.get('hasEconomicNexus') === 'on', economicThresholdRevenueMinor: Number(data.get('economicThresholdRevenueMinor')), economicThresholdTransactions: Number(data.get('economicThresholdTransactions')),
      }) }); await reload(); setOpen(false);
    }}><Field name="countryCode" label="Country code" placeholder="US" maxLength={2} /><Field name="jurisdictionCode" label="Jurisdiction code" placeholder="CA" /><Field name="jurisdictionName" label="Name" placeholder="California" /><Select name="taxType" label="Tax type" options={['SALES_TAX','VAT','GST','USE_TAX']} /><Field name="standardRateBasisPoints" label="Standard rate (basis points)" type="number" placeholder="725" /><Field name="reducedRateBasisPoints" label="Reduced rate (basis points)" type="number" placeholder="0" /><Field name="economicThresholdRevenueMinor" label="Economic threshold (minor units)" type="number" placeholder="10000000" /><Field name="economicThresholdTransactions" label="Transaction threshold" type="number" placeholder="200" /><Check name="hasPhysicalNexus" label="Physical nexus" /><Check name="hasEconomicNexus" label="Economic nexus tracking" /></ActionForm> : null}
    <Table headers={['Code','Name','Type','Standard rate','Revenue / threshold','Status']} rows={rows.map((r) => [r.jurisdictionCode, r.jurisdictionName, r.taxType, formatRateBasisPoints(r.standardRateBasisPoints), `${formatMinorToCurrency(r.currentPeriodRevenueMinor)} / ${formatMinorToCurrency(r.economicThresholdRevenueMinor)}`, r.status])} empty="No jurisdictions configured." /></section>;
}

function Rates({ rows, jurisdictions, reload }: { rows: TaxRate[]; jurisdictions: TaxJurisdiction[]; reload(): Promise<void> }) {
  const [open, setOpen] = useState(rows.length === 0);
  return <section className="space-y-4"><SectionTitle title="Effective rate rules" detail="Overlapping effective periods for the same category are rejected." action={() => setOpen(!open)} actionLabel={open ? 'Close' : 'Add rate'} />
    {open ? <ActionForm submit={async (data) => { await requestTax('api/tax/v1/rates', { method: 'POST', body: JSON.stringify({ jurisdictionId: data.get('jurisdictionId'), productCategory: data.get('productCategory'), rateBasisPoints: Number(data.get('rateBasisPoints')), isExempt: data.get('isExempt') === 'on', effectiveFrom: data.get('effectiveFrom'), effectiveUntil: data.get('effectiveUntil') || null }) }); await reload(); setOpen(false); }}><Select name="jurisdictionId" label="Jurisdiction" options={jurisdictions.map((j) => j.id)} labels={jurisdictions.map((j) => `${j.jurisdictionCode} — ${j.jurisdictionName}`)} /><Field name="productCategory" label="Product category" placeholder="SERVICES" /><Field name="rateBasisPoints" label="Rate (basis points)" type="number" placeholder="725" /><Field name="effectiveFrom" label="Effective from" type="date" /><Field name="effectiveUntil" label="Effective until (optional)" type="date" required={false} /><Check name="isExempt" label="Category is exempt" /></ActionForm> : null}
    <Table headers={['Jurisdiction','Category','Rate','Effective from','Effective until','Treatment']} rows={rows.map((r) => [r.jurisdictionCode ?? r.jurisdictionId, r.productCategory, formatRateBasisPoints(r.rateBasisPoints), r.effectiveFrom, r.effectiveUntil ?? 'Open-ended', r.isExempt ? 'Exempt' : 'Taxable'])} empty="No rate rules configured." /></section>;
}

function Exemptions({ rows, jurisdictions, reload }: { rows: ExemptionCertificate[]; jurisdictions: TaxJurisdiction[]; reload(): Promise<void> }) {
  const [open, setOpen] = useState(false); const [verification, setVerification] = useState(''); const [error, setError] = useState<string>();
  async function verify(id: string) { setError(undefined); try { await requestTax(`api/tax/v1/exemptions/${id}/verify`, { method: 'POST', body: JSON.stringify({ verificationReference: verification }) }); setVerification(''); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Verification failed.'); } }
  return <section className="space-y-4"><SectionTitle title="Exemption certificates" detail="New certificates remain pending until an authorized reviewer records evidence." action={() => setOpen(!open)} actionLabel={open ? 'Close' : 'Submit certificate'} />
    {open ? <ActionForm submit={async (data) => { await requestTax('api/tax/v1/exemptions', { method: 'POST', body: JSON.stringify({ customerId: data.get('customerId'), customerName: data.get('customerName'), certificateNumber: data.get('certificateNumber'), jurisdictionCode: data.get('jurisdictionCode'), exemptionReason: data.get('exemptionReason'), documentUrl: data.get('documentUrl'), validFrom: data.get('validFrom'), validUntil: data.get('validUntil') }) }); await reload(); setOpen(false); }}><Field name="customerId" label="Customer ID" placeholder="customer-100" /><Field name="customerName" label="Customer name" placeholder="Customer legal name" /><Field name="certificateNumber" label="Certificate number" placeholder="CERT-100" /><Select name="jurisdictionCode" label="Jurisdiction" options={jurisdictions.map((j) => j.jurisdictionCode)} /><Field name="exemptionReason" label="Reason" placeholder="RESALE_CERTIFICATE" /><Field name="documentUrl" label="Evidence URL" type="url" placeholder="https://…" /><Field name="validFrom" label="Valid from" type="date" /><Field name="validUntil" label="Valid until" type="date" /></ActionForm> : null}
    {rows.some((r) => !r.isVerified) ? <Panel><label className="text-sm font-medium">Verification evidence reference<input value={verification} onChange={(e) => setVerification(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2" placeholder="Reviewer ticket or evidence reference" /></label>{error ? <ErrorText>{error}</ErrorText> : null}</Panel> : null}
    <div className="grid gap-4">{rows.map((r) => <Panel key={r.id}><div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="font-semibold">{r.customerName} · {r.certificateNumber}</h3><p className="mt-1 text-sm text-zinc-500">{r.jurisdictionCode} · {r.exemptionReason} · {r.validFrom} to {r.validUntil}</p></div><div className="flex items-center gap-2"><Status value={r.isVerified ? 'VERIFIED' : 'PENDING REVIEW'} />{!r.isVerified ? <button type="button" disabled={verification.trim().length < 3} onClick={() => void verify(r.id)} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Verify</button> : null}</div></div></Panel>)}{rows.length === 0 ? <Panel>No exemption certificates submitted.</Panel> : null}</div></section>;
}

function Calculator({ ledger, jurisdictions, reload }: { ledger: TaxLedgerEntry[]; jurisdictions: TaxJurisdiction[]; reload(): Promise<void> }) {
  return <section className="space-y-4"><SectionTitle title="Tax calculator and decision ledger" detail="Every calculation requires a caller-owned idempotency key and persists its exact result." />
    <ActionForm submit={async (data) => { const idempotencyKey = String(data.get('idempotencyKey')); await requestTax('api/tax/v1/calculate', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ sourceModule: data.get('sourceModule'), documentId: data.get('documentId'), documentReference: data.get('documentReference') || undefined, jurisdictionCode: data.get('jurisdictionCode'), productCategory: data.get('productCategory'), taxableAmountMinor: Number(data.get('taxableAmountMinor')), customerId: data.get('customerId') || undefined, transactionDate: data.get('transactionDate') }) }); await reload(); }}><Field name="sourceModule" label="Source module" placeholder="ACCOUNTS_RECEIVABLE" /><Field name="documentId" label="Document ID" placeholder="invoice-100" /><Field name="documentReference" label="Document reference (optional)" placeholder="INV-100" required={false} /><Select name="jurisdictionCode" label="Jurisdiction" options={jurisdictions.map((j) => j.jurisdictionCode)} /><Field name="productCategory" label="Product category" placeholder="SERVICES" /><Field name="taxableAmountMinor" label="Taxable amount (minor units)" type="number" placeholder="10000" /><Field name="customerId" label="Customer ID (optional)" placeholder="customer-100" required={false} /><Field name="transactionDate" label="Transaction date" type="date" /><Field name="idempotencyKey" label="Idempotency key" placeholder="tax-invoice-100-v1" /></ActionForm>
    <Table headers={['Document','Jurisdiction','Category','Taxable','Rate','Tax','Created']} rows={ledger.map((r) => [r.documentReference ?? r.documentId, r.jurisdictionCode, r.productCategory, formatMinorToCurrency(r.taxableAmountMinor), formatRateBasisPoints(r.appliedRateBasisPoints), formatMinorToCurrency(r.calculatedTaxMinor), new Date(r.createdAt).toLocaleString()])} empty="No tax decisions recorded." /></section>;
}

function Monitor({ rows }: { rows: NexusMonitorSummary[] }) { return <section className="space-y-4"><SectionTitle title="Nexus threshold monitor" detail="Derived only from persisted tax calculation volume and configured thresholds." /><div className="grid gap-4 md:grid-cols-2">{rows.map((r) => <Panel key={r.jurisdictionCode}><div className="flex justify-between gap-4"><div><h3 className="font-semibold">{r.jurisdictionName}</h3><p className="text-sm text-zinc-500">{r.countryCode} · {r.jurisdictionCode}</p></div><Status value={r.status.replaceAll('_', ' ')} /></div><p className="mt-5 text-sm">Revenue: {formatMinorToCurrency(r.currentRevenueMinor)} / {formatMinorToCurrency(r.thresholdRevenueMinor)} ({r.revenuePercent}%)</p><p className="mt-2 text-sm">Transactions: {r.currentTransactions} / {r.thresholdTransactions} ({r.transactionPercent}%)</p></Panel>)}{rows.length === 0 ? <Panel>No active jurisdictions to monitor.</Panel> : null}</div></section>; }

function ActionForm({ submit, children }: { submit(data: FormData): Promise<void>; children: React.ReactNode }) { const [busy, setBusy] = useState(false); const [error, setError] = useState<string>(); async function onSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(undefined); try { await submit(new FormData(event.currentTarget)); } catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); } finally { setBusy(false); } } return <form onSubmit={(e) => void onSubmit(e)} className="rounded-2xl border border-zinc-200 bg-white p-6"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>{error ? <ErrorText>{error}</ErrorText> : null}<button disabled={busy} className="mt-5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Saving…' : 'Save'}</button></form>; }
function Field({ name, label, type = 'text', placeholder, required = true, maxLength }: { name: string; label: string; type?: string; placeholder?: string; required?: boolean; maxLength?: number }) { return <label className="text-sm font-medium text-zinc-700">{label}<input name={name} type={type} placeholder={placeholder} required={required} maxLength={maxLength} min={type === 'number' ? 0 : undefined} className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-950" /></label>; }
function Select({ name, label, options, labels }: { name: string; label: string; options: string[]; labels?: string[] }) { return <label className="text-sm font-medium text-zinc-700">{label}<select name={name} required className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5">{options.length === 0 ? <option value="">No options configured</option> : options.map((o, i) => <option key={o} value={o}>{labels?.[i] ?? o}</option>)}</select></label>; }
function Check({ name, label }: { name: string; label: string }) { return <label className="flex items-center gap-2 self-end rounded-lg border border-zinc-200 px-3 py-2.5 text-sm"><input name={name} type="checkbox" />{label}</label>; }
function SectionTitle({ title, detail, action, actionLabel }: { title: string; detail: string; action?(): void; actionLabel?: string }) { return <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-zinc-500">{detail}</p></div>{action ? <button type="button" onClick={action} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">{actionLabel}</button> : null}</div>; }
function Table({ headers, rows, empty }: { headers: string[]; rows: (string | number)[][]; empty: string }) { return <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-zinc-50 text-zinc-500"><tr>{headers.map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="border-t border-zinc-100">{row.map((v, j) => <td key={j} className="px-4 py-3">{v}</td>)}</tr>)}{rows.length === 0 ? <tr><td colSpan={headers.length} className="px-4 py-10 text-center text-zinc-500">{empty}</td></tr> : null}</tbody></table></div>; }
function Panel({ children }: { children: React.ReactNode }) { return <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-700">{children}</section>; }
function Status({ value }: { value: string }) { return <span className="h-fit rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold">{value}</span>; }
function ErrorText({ children }: { children: React.ReactNode }) { return <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{children}</p>; }
