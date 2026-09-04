'use client';

import type { ApDocumentStatus, CursorPage, SupplierInvoiceSummary } from '@/lib/api-types';
import { requestJson } from '@/lib/client-api';
import { formatMinorAmount } from '@/lib/money';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const FILTERS: Array<'ALL' | ApDocumentStatus> = [
  'ALL',
  'EXCEPTION',
  'PENDING_APPROVAL',
  'APPROVED_FOR_PAYMENT',
  'MATCHED',
  'REJECTED',
];

export default function AccountsPayablePage() {
  const [status, setStatus] = useState<'ALL' | ApDocumentStatus>('ALL');
  const [page, setPage] = useState<CursorPage<SupplierInvoiceSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ limit: '100' });
      if (status !== 'ALL') query.set('status', status);
      setPage(await requestJson(`/api/control/ap/invoices?${query}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load supplier invoices.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Accounts payable</h1>
          <p className="mt-1 text-sm text-gray-400">
            Canonical supplier invoices and deterministic three-way match outcomes.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/actions" className={secondary}>
            Approval work queue
          </Link>
          <Link href="/exceptions" className={secondary}>
            Exceptions
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => setStatus(item)}
            className={`rounded-lg px-3 py-1.5 text-xs ${status === item ? 'bg-indigo-600/20 text-indigo-300' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            {item.toLowerCase().replaceAll('_', ' ')}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto text-xs text-gray-400 hover:text-white"
        >
          Refresh
        </button>
      </div>

      {error && <Alert>{error}</Alert>}
      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        <div className="grid grid-cols-12 gap-3 border-b border-gray-800 px-5 py-3 text-xs uppercase tracking-wide text-gray-500">
          <div className="col-span-3">Invoice</div>
          <div className="col-span-3">Supplier</div>
          <div className="col-span-2">PO</div>
          <div className="col-span-2">Amount</div>
          <div className="col-span-2">Outcome</div>
        </div>
        {loading && !page ? (
          <Empty text="Loading invoices…" />
        ) : (page?.items.length ?? 0) === 0 ? (
          <Empty text="No supplier invoices match this filter." />
        ) : (
          page?.items.map((invoice) => (
            <div
              key={invoice.id}
              className="grid grid-cols-12 gap-3 border-b border-gray-800 px-5 py-4 text-sm last:border-0"
            >
              <div className="col-span-3 min-w-0">
                <div className="truncate font-semibold text-white">{invoice.invoiceNumber}</div>
                <div className="mt-1 truncate font-mono text-xs text-gray-500">
                  {invoice.externalId}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {invoice.sourceEvent.classification.toLowerCase()} ·{' '}
                  {invoice.sourceEvent.eventType} v{invoice.sourceEvent.eventVersion}
                </div>
              </div>
              <div className="col-span-3 self-center text-gray-300">{invoice.supplier.name}</div>
              <div className="col-span-2 self-center font-mono text-xs text-gray-400">
                {invoice.purchaseOrder?.externalId ?? 'Awaiting PO'}
              </div>
              <div className="col-span-2 self-center text-gray-200">
                {formatMinorAmount(invoice.totalMinor, invoice.currency)}
              </div>
              <div className="col-span-2 self-center">
                <span className="rounded-full border border-gray-700 px-2 py-1 text-xs text-gray-300">
                  {(invoice.matchEvaluations[0]?.outcome ?? invoice.status)
                    .toLowerCase()
                    .replaceAll('_', ' ')}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
      {page?.nextCursor && (
        <p className="text-xs text-amber-300">
          More records are available; cursor paging is active.
        </p>
      )}
    </div>
  );
}

const secondary =
  'rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800';
function Empty({ text }: { text: string }) {
  return <div className="p-12 text-center text-sm text-gray-500">{text}</div>;
}
function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-300"
    >
      {children}
    </div>
  );
}
