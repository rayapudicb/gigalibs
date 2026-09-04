'use client';

import type { WorkflowPipeline } from '@/lib/api-types';
import { requestJson } from '@/lib/client-api';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type StatusFilter = 'ALL' | WorkflowPipeline['status'];

const STATUS_STYLES: Record<WorkflowPipeline['status'], string> = {
  ACTIVE: 'border-emerald-800/60 bg-emerald-500/10 text-emerald-400',
  DRAFT: 'border-amber-800/60 bg-amber-500/10 text-amber-400',
  PAUSED: 'border-sky-800/60 bg-sky-500/10 text-sky-400',
  ARCHIVED: 'border-gray-700 bg-gray-800 text-gray-400',
};

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowPipeline[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWorkflows(await requestJson<WorkflowPipeline[]>('/api/workflows'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load workflows.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  const visible = useMemo(
    () =>
      filter === 'ALL' ? workflows : workflows.filter((workflow) => workflow.status === filter),
    [filter, workflows],
  );

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Workflows</h1>
          <p className="mt-1 text-sm text-gray-400">
            Tenant-scoped workflow drafts and published versions.
          </p>
        </div>
        <Link
          href="/workflows/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          New workflow
        </Link>
      </div>

      <div className="flex items-center gap-3">
        {(['ALL', 'ACTIVE', 'DRAFT', 'PAUSED', 'ARCHIVED'] as const).map((status) => (
          <button
            type="button"
            key={status}
            onClick={() => setFilter(status)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${filter === status ? 'bg-indigo-600/20 text-indigo-400' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            {status === 'ALL' ? 'All' : status.toLowerCase()}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto text-xs text-gray-400 hover:text-white disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-300"
        >
          {error}
        </div>
      )}
      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-12 text-center text-sm text-gray-400">
          Loading workflows…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/50 p-14 text-center">
          <h2 className="font-semibold text-white">No workflows found</h2>
          <p className="mt-2 text-sm text-gray-400">Create a tenant-owned draft to begin.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
          {visible.map((workflow) => (
            <Link
              key={workflow.id}
              href={`/workflows/${encodeURIComponent(workflow.id)}/canvas`}
              className="grid grid-cols-12 gap-4 border-b border-gray-800 px-5 py-4 last:border-b-0 hover:bg-gray-800/60"
            >
              <div className="col-span-5 min-w-0">
                <div className="truncate font-semibold text-white">{workflow.name}</div>
                <div className="mt-1 truncate text-xs text-gray-500">
                  {workflow.description || 'No description'}
                </div>
              </div>
              <div className="col-span-2 self-center text-sm text-gray-300">
                {workflow.targetApp}
              </div>
              <div className="col-span-2 self-center">
                <span
                  className={`rounded-full border px-2 py-1 text-xs ${STATUS_STYLES[workflow.status]}`}
                >
                  {workflow.status.toLowerCase()}
                </span>
              </div>
              <div className="col-span-1 self-center text-sm text-gray-300">
                {workflow.activeVersion ? `v${workflow.activeVersion}` : '—'}
              </div>
              <div className="col-span-2 self-center text-right text-xs text-gray-500">
                {new Date(workflow.updatedAt).toLocaleString()}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
