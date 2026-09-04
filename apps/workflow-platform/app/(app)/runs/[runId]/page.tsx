'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import type { RunDetail, RunStatus, StepSummary } from '@/lib/api-types'
import { requestJson } from '@/lib/client-api'

const RUN_STATUS_STYLES: Record<RunStatus, string> = {
  succeeded: 'text-emerald-400', running: 'text-blue-400', failed: 'text-red-400',
  queued: 'text-gray-400', cancelled: 'text-gray-400', action_required: 'text-orange-400',
}

export default function RunDetailPage() {
  const params = useParams<{ runId: string }>()
  const runId = params.runId
  const [run, setRun] = useState<RunDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRun(await requestJson<RunDetail>(`/api/runs/${encodeURIComponent(runId)}`))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load run.')
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => { void load() }, [load])

  async function cancel() {
    setCancelling(true)
    setError(null)
    try {
      await requestJson(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' })
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to cancel run.')
    } finally {
      setCancelling(false)
    }
  }

  if (loading && !run) return <div className="p-8 text-sm text-gray-400">Loading run…</div>

  return (
    <div className="mx-auto max-w-6xl space-y-7 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/runs" className="text-sm text-gray-400 hover:text-white">← Runs</Link>
          <h1 className="mt-2 text-2xl font-bold text-white">Execution detail</h1>
          <p className="mt-1 break-all font-mono text-xs text-indigo-300">{runId}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => void load()} disabled={loading} className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-50">Refresh</button>
          {run && ['queued', 'running'].includes(run.status) && (
            <button onClick={() => void cancel()} disabled={cancelling} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50">{cancelling ? 'Cancelling…' : 'Cancel run'}</button>
          )}
        </div>
      </div>
      {error && <div role="alert" className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">{error}</div>}
      {run && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Status" value={run.status.replace('_', ' ')} valueClass={RUN_STATUS_STYLES[run.status]} />
            <Metric label="Workflow version" value={`v${run.workflow_version}`} />
            <Metric label="Trigger" value={run.trigger_type} />
            <Metric label="Duration" value={duration(run.started_at, run.completed_at)} />
          </div>
          {(run.error_class || run.error_summary) && (
            <div className="rounded-xl border border-red-900/70 bg-red-950/20 p-4">
              <div className="text-sm font-semibold text-red-300">{run.error_class || 'Execution failure'}</div>
              {run.error_summary && <p className="mt-1 text-sm text-red-200/80">{run.error_summary}</p>}
            </div>
          )}
          <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
            <div className="border-b border-gray-800 px-5 py-4"><h2 className="font-semibold text-white">Node attempts</h2></div>
            {run.steps.length === 0 ? <div className="p-10 text-center text-sm text-gray-500">No node attempts have started.</div> : run.steps.map((step) => <StepRow key={step.id} step={step} />)}
          </section>
          <section className="grid gap-3 rounded-xl border border-gray-800 bg-gray-900 p-5 text-xs md:grid-cols-2">
            <Evidence label="Workflow checksum" value={run.workflow_checksum} />
            <Evidence label="Correlation ID" value={run.correlation_id} />
            <Evidence label="Schema version" value={run.workflow_schema_version} />
            <Evidence label="Compiler version" value={run.workflow_compiler_version} />
          </section>
        </>
      )}
    </div>
  )
}

function Metric({ label, value, valueClass = 'text-white' }: { label: string; value: string; valueClass?: string }) {
  return <div className="rounded-xl border border-gray-800 bg-gray-900 p-4"><div className="text-xs uppercase text-gray-500">{label}</div><div className={`mt-1 font-semibold ${valueClass}`}>{value}</div></div>
}

function StepRow({ step }: { step: StepSummary }) {
  return (
    <div className="grid grid-cols-12 gap-4 border-b border-gray-800 px-5 py-4 text-sm last:border-b-0">
      <div className="col-span-3"><div className="font-medium text-white">{step.node_id}</div><div className="text-xs text-gray-500">{step.node_type}</div></div>
      <div className="col-span-2 text-gray-300">attempt {step.attempt}</div>
      <div className="col-span-2 text-gray-300">{step.status}</div>
      <div className="col-span-2 text-gray-500">{step.duration_ms === null ? '—' : `${step.duration_ms} ms`}</div>
      <div className="col-span-3 break-words text-xs text-red-300">{step.error_detail || '—'}</div>
    </div>
  )
}

function Evidence({ label, value }: { label: string; value: string }) {
  return <div><span className="text-gray-500">{label}: </span><span className="break-all font-mono text-gray-300">{value}</span></div>
}

function duration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return 'Not started'
  if (!completedAt) return 'In progress'
  return `${Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())} ms`
}
