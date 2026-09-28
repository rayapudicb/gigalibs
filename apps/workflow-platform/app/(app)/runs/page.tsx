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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow execution runs.');
      setRuns({ items: [], total: 0, offset: 0, limit: 100 });
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
      {/* ── Action Toolbar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ui-border-base pb-3">
        <div className="flex items-center gap-2">
          <Badge color="green" size="small">Execution History</Badge>
          <Text size="small" className="text-ui-fg-subtle">
            {runs?.total ?? 0} Recorded Workflow Executions
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
          <Link href="/workflows">
            <Button variant="primary" size="small" className="bg-ui-button-inverted text-ui-fg-on-inverted font-semibold whitespace-nowrap">
              Workflow Studio →
            </Button>
          </Link>
        </div>
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
