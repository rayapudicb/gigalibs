'use client';

import type {
  CursorPage,
  OperationalExceptionStatus,
  OperationalExceptionSummary,
} from '@/lib/api-types';
import { requestJson } from '@/lib/client-api';
import { useCallback, useEffect, useState } from 'react';

export default function ExceptionInboxPage() {
  const [status, setStatus] = useState<'ALL' | OperationalExceptionStatus>('OPEN');
  const [page, setPage] = useState<CursorPage<OperationalExceptionSummary> | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ limit: '100' });
    if (status !== 'ALL') query.set('status', status);
    setError(null);
    try {
      setPage(await requestJson(`/api/control/exceptions?${query}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load exceptions.');
    }
  }, [status]);
  useEffect(() => {
    void load();
  }, [load]);

  async function recover(
    item: OperationalExceptionSummary,
    operation: 'retry' | 'replay' | 'resolve',
  ) {
    const reason = reasons[item.id]?.trim();
    if (!reason || reason.length < 3) {
      setError('Enter a recovery reason of at least three characters.');
      return;
    }
    setWorking(item.id);
    setError(null);
    try {
      await requestJson(`/api/control/exceptions/${encodeURIComponent(item.id)}/${operation}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, idempotencyKey: crypto.randomUUID() }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Recovery request failed.');
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Exception inbox</h1>
        <p className="mt-1 text-sm text-gray-400">
          Recoverable processing failures and evidence-backed business exceptions.
        </p>
      </div>
      <div className="flex gap-2">
        {(['OPEN', 'ASSIGNED', 'RETRY_SCHEDULED', 'RESOLVED', 'ALL'] as const).map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => setStatus(item)}
            className={`rounded-lg px-3 py-1.5 text-xs ${status === item ? 'bg-indigo-600/20 text-indigo-300' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            {item.toLowerCase().replaceAll('_', ' ')}
          </button>
        ))}
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
            No exceptions match this filter.
          </div>
        ) : (
          page?.items.map((item) => (
            <section key={item.id} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-red-300">
                    {item.kind.toLowerCase().replaceAll('_', ' ')} · {item.rootCauseCode}
                  </div>
                  <h2 className="mt-1 font-semibold text-white">{item.title}</h2>
                  <p className="mt-2 text-sm text-gray-400">{item.summary}</p>
                  {item.sourceEvent && (
                    <p className="mt-2 text-xs text-gray-500">
                      {item.sourceEvent.classification.toLowerCase()} · {item.sourceEvent.eventType}{' '}
                      v{item.sourceEvent.eventVersion} · event {item.sourceEvent.eventId}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>{item.environment.displayName}</div>
                  <div className="mt-1">{new Date(item.openedAt).toLocaleString()}</div>
                  <div className="mt-1">{item.status.toLowerCase().replaceAll('_', ' ')}</div>
                </div>
              </div>
              <pre className="mt-4 overflow-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-400">
                {JSON.stringify(item.businessImpact, null, 2)}
              </pre>
              {item.status !== 'RESOLVED' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <input
                    aria-label={`Recovery reason for ${item.id}`}
                    value={reasons[item.id] ?? ''}
                    onChange={(event) =>
                      setReasons((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                    placeholder="Recovery reason"
                    maxLength={2000}
                    className="min-w-72 flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                  />
                  {item.retryable && (
                    <button
                      type="button"
                      disabled={working === item.id}
                      onClick={() => void recover(item, 'retry')}
                      className={primary}
                    >
                      Retry
                    </button>
                  )}
                  {item.kind === 'PROCESSING_FAILURE' && (
                    <button
                      type="button"
                      disabled={working === item.id}
                      onClick={() => void recover(item, 'replay')}
                      className={secondary}
                    >
                      Replay
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={working === item.id}
                    onClick={() => void recover(item, 'resolve')}
                    className={secondary}
                  >
                    Resolve
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

const primary =
  'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const secondary =
  'rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 disabled:opacity-50';
