'use client';

/**
 * WI-OI-103e: view a dashboard. The viewer picks shared filter values; every chart re-runs its own saved question with
 * the filters its model can take, and says which filters it applied and which it could not.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Container, Heading, Input, Label, Text } from '@medusajs/ui';
import type { DashboardDataV1, DashboardFilterValuesV1, DashboardTileSizeV1, DashboardV1 } from '@gigalibs/contracts';
import { AnalyticsChart } from '../explore/AnalyticsChart';
import { analyticsApi } from '../explore/analytics-api';

const selectClass =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-sm text-ui-fg-base focus:outline-none focus:ring-2 focus:ring-ui-border-interactive';
const SPAN: Record<DashboardTileSizeV1, string> = { small: 'lg:col-span-2', medium: 'lg:col-span-3', large: 'lg:col-span-6' };

export function DashboardView({ dashboardId, canEdit }: { dashboardId: string; canEdit: boolean }) {
  const [dashboard, setDashboard] = useState<DashboardV1 | null>(null);
  const [options, setOptions] = useState<Record<string, DashboardFilterValuesV1>>({});
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<DashboardDataV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    analyticsApi<DashboardV1>(`v1/dashboards/${dashboardId}`)
      .then((loaded) => {
        setDashboard(loaded);
        for (const filter of loaded.filters) {
          analyticsApi<DashboardFilterValuesV1>(`v1/dashboards/${dashboardId}/filter-values/${filter.field}`)
            .then((values) => setOptions((current) => ({ ...current, [filter.field]: values })))
            .catch(() => undefined);
        }
      })
      .catch((cause: Error) => setError(cause.message));
  }, [dashboardId]);

  const run = useCallback(async () => {
    if (!dashboard) return;
    setBusy(true);
    setError(null);
    const values = options;
    try {
      const answer = await analyticsApi<DashboardDataV1>(`v1/dashboards/${dashboardId}/data`, {
        method: 'POST',
        body: JSON.stringify({
          ...(dashboard.timeRange && from && to ? { time: { from, to } } : {}),
          filters: dashboard.filters
            .filter((filter) => chosen[filter.field])
            .map((filter) => {
              const raw = chosen[filter.field]!;
              const match = values[filter.field]?.values.find((value) => String(value) === raw);
              return { field: filter.field, values: [match ?? raw] };
            }),
        }),
      });
      setData(answer);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }, [dashboard, dashboardId, from, to, chosen, options]);

  // Redraw whenever the dashboard loads or a filter changes (not when picker values arrive); a half-entered date range
  // waits for both ends.
  const latestRun = useRef(run);
  latestRun.current = run;
  useEffect(() => {
    if (dashboard && !from === !to) void latestRun.current();
  }, [dashboard, chosen, from, to]);

  if (!dashboard) {
    return error ? <Alert variant="error">{error}</Alert> : <Text size="small" className="text-ui-fg-subtle">Loading…</Text>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Heading level="h1">{dashboard.name}</Heading>
          {dashboard.description ? <Text size="small" className="text-ui-fg-subtle">{dashboard.description}</Text> : null}
        </div>
        <div className="flex gap-2">
          <Button size="small" variant="secondary" asChild>
            <Link href="/analytics/dashboards">All dashboards</Link>
          </Button>
          {canEdit ? (
            <Button size="small" variant="secondary" asChild>
              <Link href={`/analytics/dashboards/${dashboard.id}/edit`}>Edit</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {dashboard.timeRange || dashboard.filters.length > 0 ? (
        <Container className="flex flex-wrap items-end gap-4 p-4">
          {dashboard.timeRange ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dashboard-from">From</Label>
                <Input id="dashboard-from" type="date" size="small" value={from} onChange={(event) => setFrom(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dashboard-to">To</Label>
                <Input id="dashboard-to" type="date" size="small" value={to} onChange={(event) => setTo(event.target.value)} />
              </div>
            </>
          ) : null}
          {dashboard.filters.map((filter) => (
            <div key={filter.field} className="flex min-w-40 flex-col gap-1.5">
              <Label htmlFor={`dashboard-filter-${filter.field}`}>{filter.label}</Label>
              <select
                id={`dashboard-filter-${filter.field}`}
                className={selectClass}
                value={chosen[filter.field] ?? ''}
                onChange={(event) => setChosen((current) => ({ ...current, [filter.field]: event.target.value }))}
              >
                <option value="">All</option>
                {(options[filter.field]?.values ?? []).map((value) => (
                  <option key={String(value)} value={String(value)}>{String(value)}</option>
                ))}
              </select>
            </div>
          ))}
          {busy ? <Text size="small" className="text-ui-fg-subtle">Updating…</Text> : null}
        </Container>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
        {(data?.tiles ?? dashboard.tiles.map((tile) => ({ ...tile, applied: [], skipped: [], result: null, error: null }))).map((tile) => (
          <Container key={tile.id} className={`flex min-w-0 flex-col gap-2 p-4 ${SPAN[tile.size]}`}>
            <Heading level="h3">{tile.name}</Heading>
            {tile.error ? (
              <Alert variant="error">{tile.error}</Alert>
            ) : tile.result ? (
              <AnalyticsChart result={tile.result} type={tile.chartType} height={280} />
            ) : (
              <Text size="small" className="text-ui-fg-subtle">Loading…</Text>
            )}
            {tile.applied.length > 0 ? (
              <Text size="xsmall" className="text-ui-fg-subtle">Filtered by: {tile.applied.join(', ')}</Text>
            ) : null}
            {tile.skipped.map((skip) => (
              <Text key={skip.filter} size="xsmall" className="text-ui-fg-muted">
                Not filtered by {skip.filter}: {skip.reason}
              </Text>
            ))}
          </Container>
        ))}
      </div>
    </div>
  );
}
