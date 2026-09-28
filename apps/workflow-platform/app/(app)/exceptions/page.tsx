'use client';

import type {
  CursorPage,
  OperationalExceptionStatus,
  OperationalExceptionSummary,
} from '@/lib/api-types';
import { requestJson } from '@/lib/client-api';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  Text,
} from '@medusajs/ui';
import { ArrowPath } from '@medusajs/icons';

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load operational exceptions.');
      setPage({ items: [], nextCursor: null });
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

  const getStatusColor = (st: string) => {
    switch (st.toUpperCase()) {
      case 'OPEN':
        return 'red';
      case 'ASSIGNED':
      case 'RETRY_SCHEDULED':
        return 'orange';
      case 'RESOLVED':
        return 'green';
      default:
        return 'grey';
    }
  };

  return (
    <div className="space-y-6 p-8 min-h-screen bg-ui-bg-subtle text-ui-fg-base font-sans">
      {/* ── Action Toolbar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ui-border-base pb-3">
        <div className="flex items-center gap-2">
          <Badge color="green" size="small">Exception Queue</Badge>
          <Text size="small" className="text-ui-fg-subtle">
            {page?.items.length ?? 0} Operational Exceptions
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="small"
            onClick={() => void load()}
          >
            <ArrowPath className="w-4 h-4 mr-1.5" />
            Refresh Exceptions
          </Button>
          <Link href="/recovery">
            <Button variant="primary" size="small" className="bg-ui-button-inverted text-ui-fg-on-inverted font-semibold whitespace-nowrap">
              Recovery Studio →
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Filter Pills ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {(['OPEN', 'ASSIGNED', 'RETRY_SCHEDULED', 'RESOLVED', 'ALL'] as const).map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => setStatus(item)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
              status === item
                ? 'bg-ui-button-inverted text-ui-fg-on-inverted font-semibold shadow-xs'
                : 'bg-ui-bg-base text-ui-fg-subtle hover:text-ui-fg-base hover:bg-ui-bg-base-hover border border-ui-border-base'
            }`}
          >
            {item.toLowerCase().replaceAll('_', ' ')}
          </button>
        ))}
      </div>

      {error && (
        <Alert variant="error">
          <span>{error}</span>
        </Alert>
      )}

      {/* ── Exceptions List ─────────────────────────────────────── */}
      <div className="space-y-4">
        {(page?.items.length ?? 0) === 0 ? (
          <Container className="p-12 text-center border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest">
            <Text weight="plus" className="text-ui-fg-base">Zero exceptions in quarantine</Text>
            <Text size="small" className="text-ui-fg-subtle mt-1">
              All processing pipelines and three-way match operations are operating within policy thresholds.
            </Text>
          </Container>
        ) : (
          page?.items.map((item) => (
            <Container
              key={item.id}
              className="p-5 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest space-y-4"
            >
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge color="red" size="small">
                      {item.kind.toLowerCase().replaceAll('_', ' ')} · {item.rootCauseCode}
                    </Badge>
                    <Badge color={getStatusColor(item.status)} size="small">
                      {item.status.toLowerCase().replaceAll('_', ' ')}
                    </Badge>
                  </div>
                  <Heading level="h2" className="mt-2 text-base font-semibold text-ui-fg-base">
                    {item.title}
                  </Heading>
                  <Text size="small" className="mt-1 text-ui-fg-subtle">
                    {item.summary}
                  </Text>
                  {item.sourceEvent && (
                    <Text size="xsmall" className="mt-1 text-ui-fg-muted font-mono">
                      {item.sourceEvent.classification.toLowerCase()} · {item.sourceEvent.eventType}{' '}
                      v{item.sourceEvent.eventVersion} · event {item.sourceEvent.eventId}
                    </Text>
                  )}
                </div>
                <div className="text-right text-xs text-ui-fg-muted">
                  <div className="font-medium text-ui-fg-base">{item.environment.displayName}</div>
                  <div className="mt-1">{new Date(item.openedAt).toLocaleString()}</div>
                </div>
              </div>

              <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3 text-xs font-mono text-ui-fg-subtle overflow-auto max-h-40">
                <pre>{JSON.stringify(item.businessImpact, null, 2)}</pre>
              </div>

              {item.status !== 'RESOLVED' && (
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-ui-border-base">
                  <input
                    aria-label={`Recovery reason for ${item.id}`}
                    value={reasons[item.id] ?? ''}
                    onChange={(event) =>
                      setReasons((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                    placeholder="Enter audit recovery justification..."
                    maxLength={2000}
                    className="min-w-72 flex-1 rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none transition"
                  />
                  {item.retryable && (
                    <Button
                      variant="primary"
                      size="small"
                      disabled={working === item.id}
                      isLoading={working === item.id}
                      onClick={() => void recover(item, 'retry')}
                    >
                      Retry
                    </Button>
                  )}
                  {item.kind === 'PROCESSING_FAILURE' && (
                    <Button
                      variant="secondary"
                      size="small"
                      disabled={working === item.id}
                      onClick={() => void recover(item, 'replay')}
                    >
                      Replay
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="small"
                    disabled={working === item.id}
                    onClick={() => void recover(item, 'resolve')}
                  >
                    Resolve
                  </Button>
                </div>
              )}
            </Container>
          ))
        )}
      </div>
    </div>
  );
}
