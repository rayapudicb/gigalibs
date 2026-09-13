'use client';

import type { Customer, Invoice, InvoiceSeries } from '@/lib/api-types';
import { humanError, newIdempotencyKey, requestJson } from '@/lib/browser-api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ErrorState, LoadingState } from './feedback';

// ─── Amount helpers ───────────────────────────────────────────────────────────

/**
 * Convert a human-typed decimal string (e.g. "1,500.00" or "15.5") to minor
 * units.  Returns NaN for non-numeric / empty input so callers can validate.
 */
function decimalToMinor(raw: string, currency: string): number {
  // Strip thousands separators (commas and narrow-no-break space) then parse
  const cleaned = raw.replace(/[, ]/g, '').trim();
  if (!/^(\d+(\.\d*)?)$/.test(cleaned)) return Number.NaN;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN;
  const scale = minorScale(currency);
  return Math.round(parsed * scale);
}

/** Returns how many minor units are in one major unit for the given currency. */
function minorScale(currency: string): number {
  const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'BIF', 'CLP', 'GNF', 'ISK', 'MGA', 'PYG', 'RWF', 'UGX', 'XAF', 'XOF', 'XPF']);
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100;
}

/** Format minor units as a human-readable decimal string. */
function minorToDecimal(minor: number, currency: string): string {
  const scale = minorScale(currency);
  return (minor / scale).toFixed(scale === 1 ? 0 : 2);
}

/** Parse a quantity string into a JS number for preview. */
function parseQty(qty: string): number {
  const n = Number(qty);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditableLine {
  key: string;
  description: string;
  /** Decimal string the user typed, e.g. "1,500.00" or "15" */
  unitAmountDecimal: string;
  quantity: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InvoiceEditor({ invoiceId }: { invoiceId?: string }) {
  const router = useRouter();

  // Data
  const [customers, setCustomers] = useState<Customer[]>();
  const [seriesList, setSeriesList] = useState<InvoiceSeries[]>();
  const [invoice, setInvoice] = useState<Invoice>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  // Form state
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [currency, setCurrency] = useState('USD');
  const [customerSearch, setCustomerSearch] = useState('');
  const [lines, setLines] = useState<EditableLine[]>([
    { key: crypto.randomUUID(), description: '', quantity: '1', unitAmountDecimal: '0.00' },
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const due30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  // Load
  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [customerPage, seriesPage] = await Promise.all([
        requestJson<{ items: Customer[] }>('v1/customers?pageSize=200'),
        requestJson<{ items: InvoiceSeries[] }>('v1/series'),
      ]);
      setCustomers(customerPage.items);
      setSeriesList(seriesPage.items);
      if (invoiceId) {
        const loaded = await requestJson<Invoice>(`v1/invoices/${invoiceId}`);
        if (loaded.status !== 'DRAFT') throw new Error('Only draft invoices can be edited.');
        setInvoice(loaded);
        setSelectedCustomerId(loaded.customerId);
        setCurrency(loaded.currency);
        setLines(
          loaded.lines.map((line) => ({
            key: String(line.position),
            description: line.description,
            quantity: line.quantity,
            unitAmountDecimal: minorToDecimal(line.unitAmountMinor, loaded.currency),
          })),
        );
      }
    } catch (caught) {
      setError(humanError(caught));
    }
  }, [invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // When a customer is selected, auto-set currency to match their currency
  const selectedCustomer = customers?.find((c) => c.id === selectedCustomerId);
  const prevCustomerRef = useRef<string>('');
  useEffect(() => {
    if (!invoice && selectedCustomer && selectedCustomer.id !== prevCustomerRef.current) {
      prevCustomerRef.current = selectedCustomer.id;
      setCurrency(selectedCustomer.currency);
    }
  }, [selectedCustomer, invoice]);

  // Live totals preview
  const preview = useMemo(() => {
    const scale = minorScale(currency);
    let subtotalMinor = 0;
    const lineAmounts = lines.map((line) => {
      const unitMinor = decimalToMinor(line.unitAmountDecimal, currency);
      const qty = parseQty(line.quantity);
      const amount = Number.isNaN(unitMinor) ? 0 : Math.round(unitMinor * qty);
      subtotalMinor += amount;
      return amount;
    });
    return { subtotalMinor, lineAmounts, scale };
  }, [lines, currency]);

  // Filtered customer list for search
  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    const q = customerSearch.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.legalName.toLowerCase().includes(q) ||
        c.billingEmail.toLowerCase().includes(q) ||
        (c.externalReference ?? '').toLowerCase().includes(q),
    );
  }, [customers, customerSearch]);

  // Submit
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);

    // Validate and convert amounts
    const lineErrors: string[] = [];
    const parsedLines = lines.map((line, idx) => {
      const unitAmountMinor = decimalToMinor(line.unitAmountDecimal, currency);
      if (Number.isNaN(unitAmountMinor)) {
        lineErrors.push(`Line ${idx + 1}: "${line.unitAmountDecimal}" is not a valid amount.`);
      }
      return { description: line.description, quantity: line.quantity, unitAmountMinor };
    });
    if (lineErrors.length > 0) {
      setError(lineErrors.join(' '));
      setSaving(false);
      return;
    }

    const body = {
      customerId: String(data.get('customerId')),
      currency: currency.toUpperCase(),
      issueDate: data.get('issueDate'),
      dueDate: data.get('dueDate'),
      ...(String(data.get('purchaseOrderReference') ?? '').trim()
        ? { purchaseOrderReference: data.get('purchaseOrderReference') }
        : {}),
      ...(data.get('invoiceSeriesId') ? { invoiceSeriesId: data.get('invoiceSeriesId') } : {}),
      lines: parsedLines,
    };

    try {
      const saved =
        invoiceId && invoice
          ? await requestJson<Invoice>(`v1/invoices/${invoiceId}`, {
              method: 'PATCH',
              headers: { 'if-match': `"${invoice.version}"` },
              body: JSON.stringify(body),
            })
          : await requestJson<Invoice>('v1/invoices', {
              method: 'POST',
              headers: { 'idempotency-key': newIdempotencyKey() },
              body: JSON.stringify(body),
            });
      router.push(`/invoices/${saved.id}`);
    } catch (caught) {
      setError(humanError(caught));
      setSaving(false);
    }
  }

  function updateLine(key: string, field: keyof Omit<EditableLine, 'key'>, value: string) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, [field]: value } : line)),
    );
  }

  // Loading states
  if (!customers || !seriesList || (invoiceId && !invoice && !error)) {
    return <LoadingState label="Loading invoice editor…" />;
  }

  const defaultSeries = seriesList.find((s) => s.isDefault);
  const fmt = (minor: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(
      minor / minorScale(currency),
    );

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">{invoiceId ? 'Draft revision' : 'New document'}</p>
        <h1>{invoiceId ? 'Edit invoice draft' : 'Create invoice draft'}</h1>
      </div>
      {error ? <ErrorState message={error} retry={() => void load()} /> : null}
      {customers.length === 0 ? (
        <div className="notice warning">
          Create a customer before drafting an invoice.{' '}
          <Link href="/customers">Open customers</Link>
        </div>
      ) : (
        <div className="invoice-editor-layout">
          <form className="panel form-stack invoice-form" onSubmit={submit}>
            {/* ── Document details ── */}
            <fieldset disabled={saving}>
              <legend>Document details</legend>
              <div className="form-grid">
                {/* Customer search + select */}
                <div className="wide customer-field">
                  <label htmlFor="customerSearch">Customer</label>
                  <input
                    id="customerSearch"
                    type="search"
                    placeholder="Filter customers…"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="customer-search"
                    disabled={!!invoiceId} // lock on edit
                  />
                  <select
                    name="customerId"
                    required
                    value={invoiceId ? invoice?.customerId : selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    disabled={!!invoiceId} // customer locked once created
                    size={Math.min(filteredCustomers.length + 1, 6)}
                    className="customer-select"
                  >
                    <option value="" disabled>
                      Select a customer
                    </option>
                    {filteredCustomers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.legalName} · {customer.currency}
                        {customer.billingEmail ? ` · ${customer.billingEmail}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Currency — auto-set from customer, but editable */}
                <label>
                  Currency
                  <select
                    name="currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    disabled={!!invoiceId}
                  >
                    {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK', 'MXN', 'BRL', 'INR', 'ZAR'].map(
                      (c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ),
                    )}
                    {/* Also allow any currency already on the invoice */}
                    {invoice && !['USD','EUR','GBP','CAD','AUD','NZD','CHF','JPY','SGD','HKD','NOK','SEK','DKK','MXN','BRL','INR','ZAR'].includes(invoice.currency) ? (
                      <option value={invoice.currency}>{invoice.currency}</option>
                    ) : null}
                  </select>
                </label>

                <label>
                  Issue date
                  <input
                    name="issueDate"
                    required
                    type="date"
                    defaultValue={invoice?.issueDate ?? today}
                  />
                </label>
                <label>
                  Due date
                  <input
                    name="dueDate"
                    required
                    type="date"
                    defaultValue={invoice?.dueDate ?? due30}
                  />
                </label>
                <label>
                  Purchase order <span className="optional">Optional</span>
                  <input
                    name="purchaseOrderReference"
                    maxLength={100}
                    defaultValue={invoice?.purchaseOrderReference ?? ''}
                  />
                </label>

                {/* Series selector — only show if multiple series exist */}
                {seriesList.length > 1 ? (
                  <label>
                    Invoice series
                    <select name="invoiceSeriesId" defaultValue={invoice?.invoiceSeriesId ?? defaultSeries?.id ?? ''}>
                      {seriesList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} — {s.prefix}{'0'.repeat(s.padding)}{s.isDefault ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            </fieldset>

            {/* ── Line items ── */}
            <fieldset disabled={saving}>
              <div className="legend-row">
                <legend>Line items</legend>
                <button
                  className="text-button"
                  type="button"
                  onClick={() =>
                    setLines((current) => [
                      ...current,
                      {
                        key: crypto.randomUUID(),
                        description: '',
                        quantity: '1',
                        unitAmountDecimal: '0.00',
                      },
                    ])
                  }
                >
                  + Add line
                </button>
              </div>
              <div className="line-list">
                {lines.map((line, index) => {
                  const lineMinor = preview.lineAmounts[index] ?? 0;
                  return (
                    <div className="line-row" key={line.key}>
                      <span className="line-number">{index + 1}</span>
                      <label className="line-desc">
                        Description
                        <input
                          required
                          maxLength={500}
                          value={line.description}
                          onChange={(event) =>
                            updateLine(line.key, 'description', event.target.value)
                          }
                        />
                      </label>
                      <label className="line-qty">
                        Quantity
                        <input
                          required
                          inputMode="decimal"
                          pattern="(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?"
                          value={line.quantity}
                          onChange={(event) => updateLine(line.key, 'quantity', event.target.value)}
                        />
                      </label>
                      <label className="line-amount">
                        Unit amount
                        <input
                          required
                          inputMode="decimal"
                          placeholder="0.00"
                          value={line.unitAmountDecimal}
                          onChange={(event) =>
                            updateLine(line.key, 'unitAmountDecimal', event.target.value)
                          }
                          aria-describedby={`line-total-${line.key}`}
                        />
                      </label>
                      <span className="line-total" id={`line-total-${line.key}`}>
                        {fmt(lineMinor)}
                      </span>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`Remove line ${index + 1}`}
                        disabled={lines.length === 1}
                        onClick={() =>
                          setLines((current) => current.filter((item) => item.key !== line.key))
                        }
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <div className="form-actions">
              <Link
                className="button secondary"
                href={invoiceId ? `/invoices/${invoiceId}` : '/invoices'}
              >
                Cancel
              </Link>
              <button className="button primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : invoiceId ? 'Save changes' : 'Save draft'}
              </button>
            </div>
          </form>

          {/* ── Live totals sidebar ── */}
          <aside className="invoice-preview panel">
            <p className="eyebrow">Live preview</p>
            <dl className="totals-preview">
              {lines.map((line, idx) => {
                const minor = preview.lineAmounts[idx] ?? 0;
                return (
                  <div key={line.key} className="preview-line">
                    <dt className="preview-line-desc">
                      {line.description || <em>Line {idx + 1}</em>}
                    </dt>
                    <dd>{fmt(minor)}</dd>
                  </div>
                );
              })}
              <div className="preview-divider" />
              <div className="preview-subtotal">
                <dt>Subtotal</dt>
                <dd>{fmt(preview.subtotalMinor)}</dd>
              </div>
              <div className="preview-tax">
                <dt>Tax</dt>
                <dd>{fmt(0)}</dd>
              </div>
              <div className="preview-total">
                <dt>Total</dt>
                <dd>{fmt(preview.subtotalMinor)}</dd>
              </div>
            </dl>
            <p className="preview-note">
              Amounts entered as {currency} — server recalculates on save.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
