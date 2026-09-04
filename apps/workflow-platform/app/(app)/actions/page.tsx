'use client';

import type { BusinessActionStatus, BusinessActionSummary, CursorPage } from '@/lib/api-types';
import { requestJson } from '@/lib/client-api';
import { formatMinorAmount } from '@/lib/money';
import { useCallback, useEffect, useState } from 'react';

export default function ActionQueuePage() {
  const [status, setStatus] = useState<'ALL' | BusinessActionStatus>('PENDING_APPROVAL');
  const [page, setPage] = useState<CursorPage<BusinessActionSummary> | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const query = new URLSearchParams({ limit: '100' });
    if (status !== 'ALL') query.set('status', status);
    try {
      setPage(await requestJson(`/api/control/ap/actions?${query}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load approval actions.');
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(actionId: string, decision: 'approve' | 'reject') {
    const reason = reasons[actionId]?.trim();
    if (!reason || reason.length < 3) {
      setError('Enter a decision reason of at least three characters.');
      return;
    }
    setWorking(actionId);
    setError(null);
    try {
      await requestJson(`/api/control/ap/actions/${encodeURIComponent(actionId)}/${decision}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to record the decision.');
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Approval work queue</h1>
        <p className="mt-1 text-sm text-gray-400">
          Policy-gated business actions backed by immutable evidence.
        </p>
      </div>
      <div className="flex gap-2">
        {(['PENDING_APPROVAL', 'PROPOSED', 'SUCCEEDED', 'REJECTED', 'FAILED', 'ALL'] as const).map(
          (item) => (
            <button
              type="button"
              key={item}
              onClick={() => setStatus(item)}
              className={`rounded-lg px-3 py-1.5 text-xs ${status === item ? 'bg-indigo-600/20 text-indigo-300' : 'text-gray-400 hover:bg-gray-800'}`}
            >
              {item.toLowerCase().replaceAll('_', ' ')}
            </button>
          ),
        )}
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-300"
        >
          {error}
        </div>
      )}
      <div className="space-y-3">
        {(page?.items.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-700 p-12 text-center text-sm text-gray-500">
            No actions match this filter.
          </div>
        ) : (
          page?.items.map((action) => (
            <section key={action.id} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-white">
                    {action.supplierInvoice.invoiceNumber} · {action.supplierInvoice.supplier.name}
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {action.actionType} · {action.risk.toLowerCase()} risk ·{' '}
                    {action.approvals.length}/{action.requiredApprovals} approvals
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-gray-200">
                    {formatMinorAmount(
                      action.supplierInvoice.totalMinor,
                      action.supplierInvoice.currency,
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {action.status.toLowerCase().replaceAll('_', ' ')}
                  </div>
                </div>
              </div>
              <pre className="mt-4 overflow-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-400">
                {JSON.stringify(action.preview, null, 2)}
              </pre>
              {action.status === 'PENDING_APPROVAL' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <input
                    aria-label={`Decision reason for ${action.id}`}
                    value={reasons[action.id] ?? ''}
                    onChange={(event) =>
                      setReasons((current) => ({ ...current, [action.id]: event.target.value }))
                    }
                    placeholder="Decision reason"
                    maxLength={2000}
                    className="min-w-72 flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    disabled={working === action.id}
                    onClick={() => void decide(action.id, 'approve')}
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={working === action.id}
                    onClick={() => void decide(action.id, 'reject')}
                    className="rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
