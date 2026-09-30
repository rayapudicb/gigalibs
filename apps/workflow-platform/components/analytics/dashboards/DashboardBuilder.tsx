'use client';

/**
 * WI-OI-103e: build or edit a dashboard. Pick saved charts, their size and order, and which fields viewers can filter
 * by. Filter candidates are the fields of the chosen charts' models; each shows how many charts it reaches.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Checkbox, Container, Heading, Input, Label, Text } from '@medusajs/ui';
import type {
  AnalyticsModelCatalogV1,
  ChartViewV1,
  DashboardFilterV1,
  DashboardTileSizeV1,
  DashboardV1,
  SaveDashboardV1,
} from '@gigalibs/contracts';
import { MAX_DASHBOARD_FILTERS, MAX_DASHBOARD_TILES } from '@gigalibs/contracts';
import { chartTypeLabel } from '@/lib/analytics/chart-render';
import { analyticsApi } from '../explore/analytics-api';

const selectClass =
  'rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-sm text-ui-fg-base focus:outline-none focus:ring-2 focus:ring-ui-border-interactive';
const SIZES: Array<{ value: DashboardTileSizeV1; label: string }> = [
  { value: 'small', label: 'Third' },
  { value: 'medium', label: 'Half' },
  { value: 'large', label: 'Full width' },
];

const humanize = (field: string) => field.replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());

export function DashboardBuilder({ dashboardId }: { dashboardId?: string }) {
  const router = useRouter();
  const [views, setViews] = useState<ChartViewV1[] | null>(null);
  const [catalogs, setCatalogs] = useState<Record<string, AnalyticsModelCatalogV1>>({});
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [timeRange, setTimeRange] = useState(true);
  const [tiles, setTiles] = useState<Array<{ chartViewId: string; size: DashboardTileSizeV1 }>>([]);
  const [filters, setFilters] = useState<DashboardFilterV1[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    analyticsApi<ChartViewV1[]>('v1/chart-views').then(setViews).catch((cause: Error) => {
      setViews([]);
      setError(cause.message);
    });
    if (!dashboardId) return;
    analyticsApi<DashboardV1>(`v1/dashboards/${dashboardId}`)
      .then((dashboard) => {
        setName(dashboard.name);
        setDescription(dashboard.description ?? '');
        setTimeRange(dashboard.timeRange);
        setTiles(dashboard.tiles.map((tile) => ({ chartViewId: tile.chartViewId, size: tile.size })));
        setFilters(dashboard.filters);
      })
      .catch((cause: Error) => setError(cause.message));
  }, [dashboardId]);

  const viewById = useMemo(() => new Map((views ?? []).map((view) => [view.id, view] as const)), [views]);
  const chosenModels = useMemo(
    () => [...new Set(tiles.map((tile) => viewById.get(tile.chartViewId)?.query.semanticModelId).filter(Boolean) as string[])],
    [tiles, viewById],
  );

  useEffect(() => {
    for (const modelId of chosenModels) {
      if (catalogs[modelId]) continue;
      analyticsApi<AnalyticsModelCatalogV1>(`v1/semantic-models/${modelId}/catalog`)
        .then((catalog) => setCatalogs((current) => ({ ...current, [modelId]: catalog })))
        .catch(() => undefined);
    }
  }, [chosenModels, catalogs]);

  /** Filterable fields of the chosen charts' models, with how many chosen charts each reaches. */
  const candidates = useMemo(() => {
    const reach = new Map<string, number>();
    for (const tile of tiles) {
      const modelId = viewById.get(tile.chartViewId)?.query.semanticModelId;
      const catalog = modelId ? catalogs[modelId] : undefined;
      for (const field of catalog?.fields ?? []) {
        if (field.type === 'date' || field.type === 'timestamp') continue;
        reach.set(field.name, (reach.get(field.name) ?? 0) + 1);
      }
    }
    return [...reach.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tiles, viewById, catalogs]);

  const toggleTile = (id: string) =>
    setTiles((current) =>
      current.some((tile) => tile.chartViewId === id)
        ? current.filter((tile) => tile.chartViewId !== id)
        : current.length < MAX_DASHBOARD_TILES
          ? [...current, { chartViewId: id, size: 'medium' }]
          : current,
    );
  const move = (index: number, by: -1 | 1) =>
    setTiles((current) => {
      const next = [...current];
      const [tile] = next.splice(index, 1);
      next.splice(index + by, 0, tile!);
      return next;
    });
  const toggleFilter = (field: string) =>
    setFilters((current) =>
      current.some((filter) => filter.field === field)
        ? current.filter((filter) => filter.field !== field)
        : current.length < MAX_DASHBOARD_FILTERS
          ? [...current, { field, label: humanize(field) }]
          : current,
    );

  const save = async () => {
    setSaving(true);
    setError(null);
    const body: SaveDashboardV1 = {
      name: name.trim(),
      description: description.trim() || null,
      timeRange,
      filters: filters.filter((filter) => candidates.some(([field]) => field === filter.field)),
      tiles,
    };
    try {
      const saved = await analyticsApi<DashboardV1>(dashboardId ? `v1/dashboards/${dashboardId}` : 'v1/dashboards', {
        method: dashboardId ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      router.push(`/analytics/dashboards/${saved.id}`);
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <Container className="flex w-full flex-col gap-4 p-5 lg:w-96 lg:shrink-0">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dashboard-name">Name</Label>
          <Input id="dashboard-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dashboard-description">Description (optional)</Label>
          <Input id="dashboard-description" value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-ui-fg-base">Shared filters (up to {MAX_DASHBOARD_FILTERS})</legend>
          <div className="flex items-center gap-2">
            <Checkbox id="filter-time" checked={timeRange} onCheckedChange={() => setTimeRange((value) => !value)} />
            <Label htmlFor="filter-time" className="font-normal">Date range (charts with a time axis)</Label>
          </div>
          {candidates.length === 0 ? (
            <Text size="xsmall" className="text-ui-fg-subtle">Choose charts to see the fields they can be filtered by.</Text>
          ) : (
            candidates.map(([field, count]) => {
              const chosen = filters.find((filter) => filter.field === field);
              return (
                <div key={field} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Checkbox id={`filter-${field}`} checked={Boolean(chosen)} onCheckedChange={() => toggleFilter(field)} />
                    <Label htmlFor={`filter-${field}`} className="font-normal">
                      {field} <span className="text-ui-fg-muted">({count} of {tiles.length} charts)</span>
                    </Label>
                  </div>
                  {chosen ? (
                    <Input
                      aria-label={`Label for the ${field} filter`}
                      size="small"
                      value={chosen.label}
                      maxLength={60}
                      onChange={(event) =>
                        setFilters((current) =>
                          current.map((filter) => (filter.field === field ? { ...filter, label: event.target.value } : filter)),
                        )
                      }
                    />
                  ) : null}
                </div>
              );
            })
          )}
        </fieldset>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Button
          type="button"
          isLoading={saving}
          disabled={saving || !name.trim() || tiles.length === 0 || filters.some((filter) => !filter.label.trim())}
          onClick={() => void save()}
        >
          {dashboardId ? 'Save changes' : 'Create dashboard'}
        </Button>
      </Container>

      <Container className="flex min-w-0 flex-1 flex-col gap-3 p-5">
        <Heading level="h2">Charts on this dashboard</Heading>
        {tiles.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">Pick saved charts below; they appear here in order.</Text>
        ) : (
          <ol className="flex flex-col gap-2">
            {tiles.map((tile, index) => {
              const view = viewById.get(tile.chartViewId);
              return (
                <li key={tile.chartViewId} className="flex flex-wrap items-center gap-2 rounded-md border border-ui-border-base p-2">
                  <Text size="small" className="min-w-0 flex-1 text-ui-fg-base">
                    {index + 1}. {view?.name ?? 'Unknown chart'}
                  </Text>
                  {view ? <Badge size="2xsmall">{chartTypeLabel[view.visual.type]}</Badge> : null}
                  <select
                    aria-label={`Size of ${view?.name ?? 'chart'}`}
                    className={selectClass}
                    value={tile.size}
                    onChange={(event) =>
                      setTiles((current) =>
                        current.map((item, at) => (at === index ? { ...item, size: event.target.value as DashboardTileSizeV1 } : item)),
                      )
                    }
                  >
                    {SIZES.map((size) => (
                      <option key={size.value} value={size.value}>{size.label}</option>
                    ))}
                  </select>
                  <Button type="button" size="small" variant="transparent" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up">
                    ↑
                  </Button>
                  <Button
                    type="button"
                    size="small"
                    variant="transparent"
                    disabled={index === tiles.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label="Move down"
                  >
                    ↓
                  </Button>
                </li>
              );
            })}
          </ol>
        )}

        <Heading level="h3" className="mt-2">Saved charts</Heading>
        {views === null ? (
          <Text size="small" className="text-ui-fg-subtle">Loading…</Text>
        ) : views.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">No saved charts yet. Build and save charts in Explore first.</Text>
        ) : (
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {views.map((view) => (
              <li key={view.id} className="flex items-center gap-2">
                <Checkbox
                  id={`tile-${view.id}`}
                  checked={tiles.some((tile) => tile.chartViewId === view.id)}
                  onCheckedChange={() => toggleTile(view.id)}
                />
                <Label htmlFor={`tile-${view.id}`} className="font-normal">
                  {view.name} <span className="text-ui-fg-muted">({chartTypeLabel[view.visual.type]})</span>
                </Label>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </div>
  );
}
