'use client';

/**
 * Saved charts (WI-OI-103d d6): the tenant's chart views. Each one stores a question and a chart type, never data;
 * opening it re-runs the stored question now (`GET v1/chart-views/:id/data`). Replaces the static Industry Charts
 * gallery, which showed stored payloads.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Badge, Button, Container, Heading, Text } from '@medusajs/ui';
import type { AnalyticsQueryResultV1, ChartViewV1 } from '@gigalibs/contracts';
import { chartTypeLabel } from '@/lib/analytics/chart-render';
import { AnalyticsChart } from './AnalyticsChart';
import { analyticsApi } from './analytics-api';

export function SavedChartViews() {
  const [views, setViews] = useState<ChartViewV1[] | null>(null);
  const [selected, setSelected] = useState<ChartViewV1 | null>(null);
  const [result, setResult] = useState<AnalyticsQueryResultV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    analyticsApi<ChartViewV1[]>('v1/chart-views')
      .then(setViews)
      .catch((cause: Error) => {
        setViews([]);
        setError(cause.message);
      });
  }, []);

  const open = async (view: ChartViewV1) => {
    setSelected(view);
    setResult(null);
    setError(null);
    setBusy(true);
    try {
      const answer = await analyticsApi<{ view: ChartViewV1; result: AnalyticsQueryResultV1 }>(`v1/chart-views/${view.id}/data`);
      setResult(answer.result);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <Container className="flex w-full flex-col gap-3 lg:w-80 lg:shrink-0">
        <div className="flex items-center justify-between gap-2">
          <Heading level="h2">Saved charts</Heading>
          <Button size="small" variant="secondary" asChild>
            <Link href="/analytics/explore">New chart</Link>
          </Button>
        </div>
        {views === null ? (
          <Text size="small" className="text-ui-fg-subtle">Loading…</Text>
        ) : views.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            No saved charts yet. Build one in Explore and save it; it will appear here.
          </Text>
        ) : (
          <ul className="flex flex-col gap-1">
            {views.map((view) => (
              <li key={view.id}>
                <button
                  type="button"
                  onClick={() => void open(view)}
                  aria-current={selected?.id === view.id}
                  className={`flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-ui-bg-base-hover ${
                    selected?.id === view.id ? 'bg-ui-bg-base-pressed' : ''
                  }`}
                >
                  <Text size="small" weight="plus" className="text-ui-fg-base">{view.name}</Text>
                  <div className="flex items-center gap-2">
                    <Badge size="2xsmall">{chartTypeLabel[view.visual.type]}</Badge>
                    <Text size="xsmall" className="text-ui-fg-muted">{new Date(view.createdAt).toLocaleDateString()}</Text>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Container>

      <Container className="flex min-w-0 flex-1 flex-col gap-3">
        {error && <Alert variant="error">{error}</Alert>}
        {!selected ? (
          <Text size="small" className="text-ui-fg-subtle">Pick a saved chart to run its question on the current data.</Text>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <Heading level="h2">{selected.name}</Heading>
              {selected.description && <Text size="small" className="text-ui-fg-subtle">{selected.description}</Text>}
            </div>
            {busy && <Text size="small" className="text-ui-fg-subtle">Running…</Text>}
            {result && <AnalyticsChart result={result} type={selected.visual.type} />}
          </>
        )}
      </Container>
    </div>
  );
}
