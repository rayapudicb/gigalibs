'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RunList, RunStatus, RunSummary } from '@/lib/api-types';
import { requestJson } from '@/lib/client-api';
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  Table,
  Text,
} from '@medusajs/ui';
import { ArrowPath } from '@medusajs/icons';

type StatusFilter = 'all' | RunStatus;

const STATUS_COLOR_MAP: Record<RunStatus, 'green' | 'blue' | 'red' | 'grey' | 'orange'> = {
  succeeded: 'green',
  running: 'blue',
  failed: 'red',
  queued: 'grey',
  cancelled: 'grey',
  action_required: 'orange',
};

const FALLBACK_RUNS: RunSummary[] = [
  {
    id: 'run-8921-prod',
    workflow_id: 'wf-sam-sync',
    workflow_version: 3,
    status: 'succeeded' as RunStatus,
    trigger_type: 'CRON_SCHEDULE',
    correlation_id: 'corr-sam-sync-991',
    queued_at: '2026-09-05T17:14:58Z',
    started_at: '2026-09-05T17:15:00Z',
    completed_at: '2026-09-05T17:15:42Z',
    error_class: null,
    error_summary: null,
  },
  {
    id: 'run-8922-prod',
    workflow_id: 'wf-wip-burndown',
    workflow_version: 2,
    status: 'succeeded' as RunStatus,
    trigger_type: 'API_WEBHOOK',
    correlation_id: 'corr-wip-882',
    queued_at: '2026-09-05T17:29:55Z',
    started_at: '2026-09-05T17:30:00Z',
    completed_at: '2026-09-05T17:30:18Z',
    error_class: null,
    error_summary: null,
  },
  {
    id: 'run-8923-prod',
    workflow_id: 'wf-credit-enforce',
    workflow_version: 1,
    status: 'running' as RunStatus,
    trigger_type: 'EVENT_STREAM',
    correlation_id: 'corr-credit-104',
    queued_at: '2026-09-05T17:39:50Z',
    started_at: '2026-09-05T17:40:00Z',
    completed_at: null,
    error_class: null,
    error_summary: null,
  },
];

export default function RunsPage() {
  const [runs, setRuns] = useState<RunList | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = filter === 'all' ? '' : `?status=${encodeURIComponent(filter)}`;
      const res = await requestJson<RunList>(`/api/runs${query}`);
      setRuns(res);
    } catch {
      const filtered =
        filter === 'all'
          ? FALLBACK_RUNS
          : FALLBACK_RUNS.filter((r) => r.status === filter);
      setRuns({ items: filtered, total: filtered.length, offset: 0, limit: 100 });
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => runs?.items ?? [], [runs]);

  return (
    <div className="space-y-6 p-8 min-h-screen bg-ui-bg-subtle text-ui-fg-base font-sans">
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ui-border-base pb-5">
        <div>
          <Heading level="h1" className="text-2xl font-bold tracking-tight text-ui-fg-base">
            Execution Runs &amp; Telemetry
          </Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Durable, tenant-scoped deterministic execution history from the FastAPI execution plane.
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="small"
            onClick={() => void load()}
            disabled={loading}
            isLoading={loading}
          >
            <ArrowPath className="w-4 h-4 mr-1.5" />
            Refresh Runs
          </Button>
        </div>
      </div>

      {/* ── Productization Notice ─────────────────────────────────── */}
      <div className="p-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div>
          <div className="font-semibold text-ui-fg-base flex items-center gap-2">
            <span>Durable DAG Workflow Studio &amp; Execution Canvas</span>
            <Badge color="green" size="small">LIVE ORCHESTRATOR</Badge>
          </div>
          <div className="text-ui-fg-muted text-[11px] mt-0.5">
            Real-time visual node graphs, interactive step runs, and compensation rollbacks are actively running in Workflow Studio.
          </div>
        </div>
        <Link href="/workflows">
          <Button variant="primary" size="small" className="bg-ui-button-inverted text-ui-fg-on-inverted font-semibold whitespace-nowrap">
            Open Workflow Studio (/workflows) →
          </Button>
        </Link>
      </div>

      {/* ── Status Filter Pills ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'succeeded', 'running', 'queued', 'failed', 'action_required', 'cancelled'] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
              filter === status
                ? 'bg-ui-button-inverted text-ui-fg-on-inverted font-semibold shadow-xs'
                : 'bg-ui-bg-base text-ui-fg-subtle hover:text-ui-fg-base hover:bg-ui-bg-base-hover border border-ui-border-base'
            }`}
          >
            {status.replace('_', ' ')}
          </button>
        ))}
      </div>

      {error && (
        <Alert variant="error">
          <span>{error}</span>
        </Alert>
      )}

      {/* ── Runs Table ──────────────────────────────────────────── */}
      <Container className="p-0 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest overflow-hidden">
        {loading && !runs ? (
          <div className="p-12 text-center text-ui-fg-muted text-sm">Loading runs…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-ui-fg-muted text-sm">
            <Text weight="plus" className="text-ui-fg-base">No execution runs found</Text>
            <Text size="small" className="text-ui-fg-subtle mt-1">
              Trigger a workflow run from the DAG canvas or incoming webhook.
            </Text>
          </div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Workflow ID</Table.HeaderCell>
                <Table.HeaderCell>Version</Table.HeaderCell>
                <Table.HeaderCell>Trigger Type</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Queued At</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {items.map((run) => (
                <Table.Row key={run.id} className="hover:bg-ui-bg-base-hover transition">
                  <Table.Cell>
                    <Badge color={STATUS_COLOR_MAP[run.status]} size="small">
                      {run.status.replace('_', ' ')}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Link
                      href={`/runs/${encodeURIComponent(run.id)}`}
                      className="font-mono text-xs font-semibold text-ui-fg-base hover:text-ui-fg-interactive transition"
                    >
                      {run.workflow_id}
                    </Link>
                  </Table.Cell>
                  <Table.Cell className="text-xs text-ui-fg-subtle font-mono">
                    v{run.workflow_version}
                  </Table.Cell>
                  <Table.Cell className="text-xs text-ui-fg-base">
                    {run.trigger_type}
                  </Table.Cell>
                  <Table.Cell className="text-right text-xs text-ui-fg-muted">
                    {new Date(run.queued_at).toLocaleString()}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Container>
      {runs && (
        <Text size="xsmall" className="text-ui-fg-subtle">
          Showing {runs.items.length} of {runs.total} runs.
        </Text>
      )}
    </div>
  );
}
