'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RunList, RunStatus } from '@/lib/api-types'
import { requestJson } from '@/lib/client-api'

type StatusFilter = 'all' | RunStatus

const STATUS_STYLES: Record<RunStatus, string> = {
  succeeded: 'border-emerald-800/50 bg-emerald-500/10 text-emerald-400',
  running: 'border-blue-800/50 bg-blue-500/10 text-blue-400',
  failed: 'border-red-800/50 bg-red-500/10 text-red-400',
  queued: 'border-gray-700 bg-gray-500/10 text-gray-400',
  cancelled: 'border-gray-700 bg-gray-800 text-gray-400',
  action_required: 'border-orange-800/50 bg-orange-500/10 text-orange-400',
}

export default function RunsPage() {
  const [runs, setRuns] = useState<RunList | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = filter === 'all' ? '' : `?status=${encodeURIComponent(filter)}`
      setRuns(await requestJson<RunList>(`/api/runs${query}`))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load execution runs.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { void load() }, [load])
  const items = useMemo(() => runs?.items ?? [], [runs])

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Runs</h1>
        <p className="mt-1 text-sm text-gray-400">Durable, tenant-scoped execution history from the execution plane.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {(['all', 'succeeded', 'running', 'queued', 'failed', 'action_required', 'cancelled'] as const).map((status) => (
          <button key={status} onClick={() => setFilter(status)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${filter === status ? 'bg-indigo-600/20 text-indigo-400' : 'text-gray-400 hover:bg-gray-800'}`}>
            {status.replace('_', ' ')}
          </button>
        ))}
        <button onClick={() => void load()} disabled={loading} className="ml-auto text-xs text-gray-400 hover:text-white disabled:opacity-50">Refresh</button>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">{error}</div>}
      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        <div className="grid grid-cols-12 gap-4 border-b border-gray-800 px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">
          <div className="col-span-2">Status</div><div className="col-span-3">Workflow</div><div className="col-span-2">Version</div><div className="col-span-2">Trigger</div><div className="col-span-3">Queued</div>
        </div>
        {loading && !runs ? (
          <div className="p-12 text-center text-sm text-gray-400">Loading runs…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">No runs found for this filter.</div>
        ) : items.map((run) => (
          <Link key={run.id} href={`/runs/${encodeURIComponent(run.id)}`} className="grid grid-cols-12 gap-4 border-b border-gray-800 px-5 py-4 text-sm last:border-b-0 hover:bg-gray-800/60">
            <div className="col-span-2"><span className={`rounded-full border px-2 py-1 text-xs ${STATUS_STYLES[run.status]}`}>{run.status.replace('_', ' ')}</span></div>
            <div className="col-span-3 truncate font-mono text-xs text-indigo-300">{run.workflow_id}</div>
            <div className="col-span-2 text-gray-300">v{run.workflow_version}</div>
            <div className="col-span-2 text-gray-300">{run.trigger_type}</div>
            <div className="col-span-3 text-xs text-gray-500">{new Date(run.queued_at).toLocaleString()}</div>
          </Link>
        ))}
      </div>
      {runs && <p className="text-xs text-gray-500">Showing {runs.items.length} of {runs.total} runs.</p>}
    </div>
  )
}
