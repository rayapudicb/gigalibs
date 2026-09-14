'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import type { RunDetail, RunStatus, StepSummary } from '@/lib/api-types'
import { requestJson } from '@/lib/client-api'
import { Container, Heading, Text, Button, StatusBadge, Alert, Table } from '@medusajs/ui'

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

  if (loading && !run) return <div className="p-8 text-xs text-ui-fg-muted">Loading run…</div>

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8 font-sans text-ui-fg-base">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/runs" className="text-xs text-ui-fg-muted hover:text-ui-fg-base">← Runs</Link>
          <Heading level="h1" className="mt-2 text-2xl font-bold text-ui-fg-base">Execution detail</Heading>
          <Text size="xsmall" className="mt-1 break-all font-mono text-ui-fg-interactive">{runId}</Text>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void load()} disabled={loading} variant="secondary" size="small">
            Refresh
          </Button>
          {run && ['queued', 'running'].includes(run.status) && (
            <Button
              onClick={() => void cancel()}
              disabled={cancelling}
              variant="danger"
              size="small"
              isLoading={cancelling}
            >
              Cancel run
            </Button>
          )}
        </div>
      </div>

      {error && <Alert variant="error" className="text-xs">{error}</Alert>}

      {run && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl">
              <Text size="xsmall" weight="plus" className="uppercase text-ui-fg-muted font-semibold">Status</Text>
              <div className="mt-1.5">
                <StatusBadge color={run.status === 'succeeded' ? 'green' : run.status === 'running' ? 'blue' : run.status === 'failed' ? 'red' : 'grey'}>
                  {run.status.replace('_', ' ')}
                </StatusBadge>
              </div>
            </Container>
            <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl">
              <Text size="xsmall" weight="plus" className="uppercase text-ui-fg-muted font-semibold">Workflow version</Text>
              <div className="mt-1 font-mono text-sm font-semibold text-ui-fg-base">{`v${run.workflow_version}`}</div>
            </Container>
            <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl">
              <Text size="xsmall" weight="plus" className="uppercase text-ui-fg-muted font-semibold">Trigger</Text>
              <div className="mt-1 text-sm font-semibold text-ui-fg-base">{run.trigger_type}</div>
            </Container>
            <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl">
              <Text size="xsmall" weight="plus" className="uppercase text-ui-fg-muted font-semibold">Duration</Text>
              <div className="mt-1 font-mono text-sm font-semibold text-ui-fg-base">{duration(run.started_at, run.completed_at)}</div>
            </Container>
          </div>

          {(run.error_class || run.error_summary) && (
            <Alert variant="error" className="text-xs">
              <div className="font-semibold">{run.error_class || 'Execution failure'}</div>
              {run.error_summary && <div className="mt-1">{run.error_summary}</div>}
            </Alert>
          )}

          <Container className="p-0 overflow-hidden border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl">
            <div className="border-b border-ui-border-base px-5 py-3">
              <Heading level="h2" className="text-sm font-semibold text-ui-fg-base">Node attempts</Heading>
            </div>
            {run.steps.length === 0 ? (
              <div className="p-8 text-center text-xs text-ui-fg-muted">No node attempts have started.</div>
            ) : (
              <div className="divide-y divide-ui-border-base">
                {run.steps.map((step) => <StepRow key={step.id} step={step} />)}
              </div>
            )}
          </Container>

          <Container className="grid gap-3 border border-ui-border-base bg-ui-bg-base p-5 text-xs shadow-elevation-card-rest rounded-xl md:grid-cols-2">
            <Evidence label="Workflow checksum" value={run.workflow_checksum} />
            <Evidence label="Correlation ID" value={run.correlation_id} />
            <Evidence label="Schema version" value={run.workflow_schema_version} />
            <Evidence label="Compiler version" value={run.workflow_compiler_version} />
          </Container>
        </>
      )}
    </div>
  )
}

function StepRow({ step }: { step: StepSummary }) {
  return (
    <div className="grid grid-cols-12 gap-4 px-5 py-3 text-xs items-center hover:bg-ui-bg-subtle-hover transition">
      <div className="col-span-3">
        <div className="font-medium text-ui-fg-base">{step.node_id}</div>
        <div className="text-[10px] text-ui-fg-muted font-mono">{step.node_type}</div>
      </div>
      <div className="col-span-2 text-ui-fg-subtle">attempt {step.attempt}</div>
      <div className="col-span-2">
        <StatusBadge color={step.status === 'succeeded' ? 'green' : step.status === 'running' ? 'blue' : step.status === 'failed' ? 'red' : 'grey'}>
          {step.status}
        </StatusBadge>
      </div>
      <div className="col-span-2 text-ui-fg-muted font-mono">{step.duration_ms === null ? '—' : `${step.duration_ms} ms`}</div>
      <div className="col-span-3 break-words text-[11px] text-ui-tag-red-text">{step.error_detail || '—'}</div>
    </div>
  )
}

function Evidence({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-ui-fg-muted font-medium">{label}: </span>
      <span className="break-all font-mono text-ui-fg-base">{value}</span>
    </div>
  )
}

function duration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return 'Not started'
  if (!completedAt) return 'In progress'
  return `${Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())} ms`
}
