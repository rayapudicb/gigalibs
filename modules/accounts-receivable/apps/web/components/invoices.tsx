'use client';

import type { AgingRow, Customer, Invoice } from '@/lib/api-types';
import { humanError, requestJson } from '@/lib/browser-api';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from './feedback';

// ─── Amount helpers ───────────────────────────────────────────────────────────

function minorScale(currency: string): number {
  const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'BIF', 'CLP', 'GNF', 'ISK', 'MGA', 'PYG', 'RWF', 'UGX', 'XAF', 'XOF', 'XPF']);
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100;
}

function displayMinor(currency: string, minor: number): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
      minor / minorScale(currency),
    );
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

function formatIsoDate(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ─── Status helpers ───────────────────────────────────────────────────────────

type ViewTab = 'list' | 'aging';

const AGING_BUCKET_LABELS: Record<string, string> = {
  CURRENT: 'Current',
  OVERDUE_1_30: '1–30 days',
  OVERDUE_31_60: '31–60 days',
  OVERDUE_61_90: '61–90 days',
  OVERDUE_90_PLUS: '90+ days',
  PAID: 'Paid',
  VOIDED: 'Voided',
};

const AGING_BUCKET_CLASS: Record<string, string> = {
  CURRENT: 'issued',
  OVERDUE_1_30: 'overdue-mild',
  OVERDUE_31_60: 'overdue-moderate',
  OVERDUE_61_90: 'overdue-severe',
  OVERDUE_90_PLUS: 'overdue-critical',
  PAID: 'paid',
  VOIDED: 'voided',
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Fetch all customers once and return a Map<id, Customer> for fast lookup. */
function useCustomerMap(): Map<string, Customer> {
  const [map, setMap] = useState<Map<string, Customer>>(new Map());
  const fetched = useRef(false);
  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    requestJson<{ items: Customer[] }>('v1/customers?pageSize=500')
      .then((page) =>
        setMap(new Map(page.items.map((c) => [c.id, c]))),
      )
      .catch(() => {/* non-fatal: IDs fall back to raw UUID display */});
  }, []);
  return map;
}

// ─── Aging view ───────────────────────────────────────────────────────────────

function AgingView({ customerId }: { customerId?: string }) {
  const [rows, setRows] = useState<AgingRow[]>();
  const [bucketFilter, setBucketFilter] = useState('');
  const [error, setError] = useState<string>();
  const customerMap = useCustomerMap();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const q = new URLSearchParams();
      if (bucketFilter) q.set('bucket', bucketFilter);
      if (customerId) q.set('customerId', customerId);
      const page = await requestJson<{ items: AgingRow[] }>(
        `v1/invoices/aging?${q}`,
      );
      setRows(page.items);
    } catch (caught) {
      setError(humanError(caught));
    }
  }, [bucketFilter, customerId]);

  useEffect(() => {
    setRows(undefined);
    void load();
  }, [load]);

  // Bucket summary counts
  const bucketCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!rows) return counts;
    for (const r of rows) {
      counts[r.agingBucket] = (counts[r.agingBucket] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  return (
    <>
      <div className="toolbar">
        <label>
          Bucket
          <select value={bucketFilter} onChange={(e) => setBucketFilter(e.target.value)}>
            <option value="">All buckets</option>
            {Object.keys(AGING_BUCKET_LABELS).map((b) => (
              <option key={b} value={b}>
                {AGING_BUCKET_LABELS[b]}
                {bucketCounts[b] ? ` (${bucketCounts[b]})` : ''}
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary" type="button" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {/* Bucket summary chips */}
      {rows && rows.length > 0 && (
        <div className="aging-summary">
          {Object.entries(AGING_BUCKET_LABELS)
            .filter(([b]) => bucketCounts[b])
            .map(([bucket, label]) => (
              <button
                key={bucket}
                type="button"
                className={`aging-chip ${AGING_BUCKET_CLASS[bucket] ?? ''} ${bucketFilter === bucket ? 'active' : ''}`}
                onClick={() => setBucketFilter((f) => (f === bucket ? '' : bucket))}
              >
                {label}
                <strong>{bucketCounts[bucket]}</strong>
              </button>
            ))}
        </div>
      )}

      {error ? (
        <ErrorState message={error} retry={() => void load()} />
      ) : !rows ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No aging invoices"
          message={bucketFilter ? 'No invoices in this bucket.' : 'All issued invoices are current.'}
        />
      ) : (
        <section className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                {!customerId ? <th>Customer</th> : null}
                <th>Due date</th>
                <th>Days overdue</th>
                <th>Bucket</th>
                <th className="num">Total</th>
                <th className="num">Amount due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const customer = customerMap.get(row.customerId);
                const bucketClass = AGING_BUCKET_CLASS[row.agingBucket] ?? '';
                return (
                  <tr key={row.invoiceId} className={bucketClass}>
                    <td>
                      <Link href={`/invoices/${row.draftId}`}>
                        <strong>{row.invoiceNumber}</strong>
                      </Link>
                    </td>
                    {!customerId ? (
                      <td>
                        {customer ? (
                          <Link href={`/customers/${customer.id}`}>{customer.legalName}</Link>
                        ) : (
                          <span className="mono dimmed">{row.customerId.slice(0, 8)}…</span>
                        )}
                      </td>
                    ) : null}
                    <td>{formatIsoDate(row.dueDate)}</td>
                    <td className="num">
                      {row.daysOverdue > 0 ? (
                        <span className={`overdue-badge ${bucketClass}`}>
                          +{row.daysOverdue}d
                        </span>
                      ) : (
                        <span className="dimmed">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`status ${bucketClass}`}>
                        {AGING_BUCKET_LABELS[row.agingBucket] ?? row.agingBucket}
                      </span>
                    </td>
                    <td className="num">{displayMinor(row.currency, row.totalMinor)}</td>
                    <td className="num">
                      {row.amountDueMinor > 0
                        ? displayMinor(row.currency, row.amountDueMinor)
                        : <span className="dimmed">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

// ─── Invoice list ─────────────────────────────────────────────────────────────

function isOverdue(invoice: Invoice): boolean {
  if (invoice.status !== 'ISSUED' || invoice.isVoided || invoice.amountDueMinor === 0) return false;
  return new Date(invoice.dueDate) < new Date(new Date().toISOString().slice(0, 10));
}

function InvoiceStatusCell({ invoice }: { invoice: Invoice }) {
  if (invoice.isVoided) {
    return <span className="status voided">VOIDED</span>;
  }
  if (invoice.status === 'ISSUED' && isOverdue(invoice)) {
    return <span className="status overdue-mild">OVERDUE</span>;
  }
  return <span className={`status ${invoice.status.toLowerCase()}`}>{invoice.status}</span>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Invoices({ customerId }: { customerId?: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<ViewTab>('list');
  const customerMap = useCustomerMap();

  const load = useCallback(
    async (cursor?: string) => {
      setError(undefined);
      if (cursor) setLoadingMore(true);
      try {
        const query = new URLSearchParams({ pageSize: '50' });
        if (statusFilter) query.set('status', statusFilter);
        if (customerId) query.set('customerId', customerId);
        if (cursor) query.set('cursor', cursor);
        const page = await requestJson<{ items: Invoice[]; nextCursor: string | null }>(
          `v1/invoices?${query}`,
        );
        setInvoices((current) =>
          cursor ? [...(current ?? []), ...page.items] : page.items,
        );
        setNextCursor(page.nextCursor);
      } catch (caught) {
        setError(humanError(caught));
      } finally {
        setLoadingMore(false);
      }
    },
    [statusFilter, customerId],
  );

  useEffect(() => {
    setInvoices(undefined);
    void load();
  }, [load]);

  // Heading text depends on whether we're scoped to a customer
  const headingCustomer = customerId ? customerMap.get(customerId) : undefined;

  return (
    <>
      <div className="page-heading split">
        <div>
          <p className="eyebrow">Document operations</p>
          <h1>
            {headingCustomer ? `${headingCustomer.legalName} · Invoices` : 'Invoices'}
          </h1>
          <p>Draft, review, and atomically issue tenant-scoped invoices.</p>
        </div>
        <Link
          className="button primary"
          href={customerId ? `/invoices/new?customerId=${customerId}` : '/invoices/new'}
        >
          Create invoice
        </Link>
      </div>

      {/* View tabs */}
      <div className="tab-bar">
        <button
          type="button"
          className={`tab ${tab === 'list' ? 'active' : ''}`}
          onClick={() => setTab('list')}
        >
          All invoices
        </button>
        <button
          type="button"
          className={`tab ${tab === 'aging' ? 'active' : ''}`}
          onClick={() => setTab('aging')}
        >
          Aging report
        </button>
      </div>

      {tab === 'aging' ? (
        <AgingView customerId={customerId} />
      ) : (
        <>
          <div className="toolbar">
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">All</option>
                <option value="DRAFT">Draft</option>
                <option value="ISSUED">Issued</option>
              </select>
            </label>
            <button className="button secondary" type="button" onClick={() => void load()}>
              Refresh
            </button>
          </div>

          {error ? (
            <ErrorState message={error} retry={() => void load()} />
          ) : !invoices ? (
            <LoadingState />
          ) : invoices.length === 0 ? (
            <EmptyState
              title="No matching invoices"
              message="Create a draft or change the status filter."
              action={
                <Link className="button primary" href="/invoices/new">
                  Create invoice
                </Link>
              }
            />
          ) : (
            <section className="panel table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Document</th>
                    {!customerId ? <th>Customer</th> : null}
                    <th>Status</th>
                    <th>Issue date</th>
                    <th>Due date</th>
                    <th className="num">Total</th>
                    <th className="num">Amount due</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => {
                    const customer = customerMap.get(invoice.customerId);
                    const isDraft = invoice.status === 'DRAFT';
                    const overdue = isOverdue(invoice);
                    return (
                      <tr key={invoice.id} className={overdue ? 'row-overdue' : undefined}>
                        <td>
                          <Link href={`/invoices/${invoice.id}`}>
                            <strong>
                              {invoice.invoiceNumber ?? (isDraft ? 'Unnumbered draft' : invoice.id.slice(0, 8))}
                            </strong>
                          </Link>
                          {isDraft ? <small className="dimmed">{invoice.id.slice(0, 8)}…</small> : null}
                        </td>
                        {!customerId ? (
                          <td>
                            {customer ? (
                              <Link href={`/customers/${customer.id}`}>{customer.legalName}</Link>
                            ) : (
                              <span className="mono dimmed">{invoice.customerId.slice(0, 8)}…</span>
                            )}
                          </td>
                        ) : null}
                        <td>
                          <InvoiceStatusCell invoice={invoice} />
                        </td>
                        <td>{formatIsoDate(invoice.issueDate)}</td>
                        <td className={overdue ? 'overdue-date' : undefined}>
                          {formatIsoDate(invoice.dueDate)}
                        </td>
                        <td className="num">{displayMinor(invoice.currency, invoice.totalMinor)}</td>
                        <td className="num">
                          {invoice.status === 'ISSUED' && !invoice.isVoided
                            ? invoice.amountDueMinor > 0
                              ? displayMinor(invoice.currency, invoice.amountDueMinor)
                              : <span className="paid-badge">Paid</span>
                            : <span className="dimmed">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {nextCursor ? (
                <div className="pagination-actions">
                  <button
                    className="button secondary"
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void load(nextCursor)}
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              ) : null}
            </section>
          )}
        </>
      )}
    </>
  );
}
