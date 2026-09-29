'use client';

/**
 * Explore (WI-OI-103d): ask a question of a semantic model — measures by up to three group-bys, per time grain,
 * filtered — see it as any chart that fits, switch chart types in one click, and save it as a chart view. A chart view
 * stores the question and the chart type, never data.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Checkbox, Container, Heading, Input, Label, Text } from '@medusajs/ui';
import type {
  AnalyticsFieldType,
  AnalyticsFilterV1,
  AnalyticsModelCatalogV1,
  AnalyticsModelSummaryV1,
  AnalyticsQueryInputV1,
  AnalyticsQueryResultV1,
  AnalyticsTimeGrain,
  ChartTypeV1,
  ChartViewV1,
} from '@gigalibs/contracts';
import { chartTypeLabel, compatibleChartTypes, resultShape } from '@/lib/analytics/chart-render';
import { AnalyticsChart, ResultTable } from './AnalyticsChart';

type FilterOp = AnalyticsFilterV1['op'];
interface FilterRow {
  field: string;
  op: Exclude<FilterOp, 'between'>;
  value: string;
}

const GRAINS: AnalyticsTimeGrain[] = ['day', 'week', 'month', 'quarter', 'year'];
const selectClass =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-sm text-ui-fg-base focus:outline-none focus:ring-2 focus:ring-ui-border-interactive';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/analytics/${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = (body as { message?: string; detail?: string }).message ?? (body as { detail?: string }).detail;
    if (response.status === 403) throw new Error(detail ?? 'You do not have permission for this.');
    throw new Error(detail ?? `Request failed (${response.status}).`);
  }
  return body as T;
}

function coerce(raw: string, type: AnalyticsFieldType): string | number | boolean {
  if (type === 'number') return Number(raw);
  if (type === 'boolean') return raw.trim().toLowerCase() === 'true';
  return raw.trim();
}

export function ExploreWorkbench() {
  const [models, setModels] = useState<AnalyticsModelSummaryV1[] | null>(null);
  const [modelId, setModelId] = useState('');
  const [catalog, setCatalog] = useState<AnalyticsModelCatalogV1 | null>(null);
  const [measures, setMeasures] = useState<string[]>([]);
  const [dimensions, setDimensions] = useState<string[]>([]);
  const [timeField, setTimeField] = useState('');
  const [grain, setGrain] = useState<AnalyticsTimeGrain>('month');
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [result, setResult] = useState<AnalyticsQueryResultV1 | null>(null);
  const [chartType, setChartType] = useState<ChartTypeV1>('table');
  const [showData, setShowData] = useState(false);
  const [views, setViews] = useState<ChartViewV1[]>([]);
  const [viewName, setViewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshViews = useCallback(() => {
    api<ChartViewV1[]>('v1/chart-views').then(setViews).catch(() => setViews([]));
  }, []);

  useEffect(() => {
    api<AnalyticsModelSummaryV1[]>('v1/semantic-models')
      .then(setModels)
      .catch((cause: Error) => {
        setModels([]);
        setError(cause.message);
      });
    refreshViews();
  }, [refreshViews]);

  useEffect(() => {
    setCatalog(null);
    setResult(null);
    if (!modelId) return;
    api<AnalyticsModelCatalogV1>(`v1/semantic-models/${modelId}/catalog`)
      .then((loaded) => {
        setCatalog(loaded);
        setMeasures((current) => current.filter((name) => loaded.measures.some((measure) => measure.name === name)));
        setDimensions((current) => current.filter((name) => loaded.fields.some((field) => field.name === name)));
      })
      .catch((cause: Error) => setError(cause.message));
  }, [modelId]);

  const fieldType = useMemo(
    () => new Map((catalog?.fields ?? []).map((field) => [field.name, field.type] as const)),
    [catalog],
  );
  const timeFields = (catalog?.fields ?? []).filter((field) => field.type === 'date' || field.type === 'timestamp');
  const chartTypes = result ? compatibleChartTypes(resultShape(result)) : [];

  const query = (): AnalyticsQueryInputV1 => ({
    semanticModelId: modelId,
    measures,
    dimensions,
    ...(timeField ? { time: { field: timeField, grain } } : {}),
    filters: filters
      .filter((row) => row.field && row.value.trim())
      .map((row): AnalyticsFilterV1 => {
        const type = fieldType.get(row.field) ?? 'string';
        return row.op === 'in'
          ? { field: row.field, op: 'in', values: row.value.split(',').map((part) => coerce(part, type)) }
          : { field: row.field, op: row.op, value: coerce(row.value, type) };
      }),
    limit: 1000,
  });

  const run = async (spec: AnalyticsQueryInputV1 = query(), preferred?: ChartTypeV1) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const answer = await api<AnalyticsQueryResultV1>('v1/query/spec', { method: 'POST', body: JSON.stringify(spec) });
      setResult(answer);
      const fitting = compatibleChartTypes(resultShape(answer));
      setChartType((current) => (preferred && fitting.includes(preferred) ? preferred : fitting.includes(current) ? current : fitting[0]!));
    } catch (cause) {
      setResult(null);
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setError(null);
    try {
      await api<ChartViewV1>('v1/chart-views', {
        method: 'POST',
        body: JSON.stringify({ name: viewName.trim(), query: query(), visual: { type: chartType } }),
      });
      setNotice(`Saved "${viewName.trim()}".`);
      setViewName('');
      refreshViews();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const open = async (view: ChartViewV1) => {
    setModelId(view.query.semanticModelId);
    setMeasures(view.query.measures);
    setDimensions(view.query.dimensions);
    setTimeField(view.query.time?.field ?? '');
    if (view.query.time) setGrain(view.query.time.grain);
    setFilters(
      view.query.filters.flatMap((filter): FilterRow[] =>
        filter.op === 'between'
          ? []
          : [{ field: filter.field, op: filter.op, value: filter.op === 'in' ? filter.values.join(', ') : String(filter.value) }],
      ),
    );
    await run(view.query, view.visual.type);
  };

  const toggle = (list: string[], name: string, max: number) =>
    list.includes(name) ? list.filter((item) => item !== name) : list.length < max ? [...list, name] : list;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <Container className="flex w-full flex-col gap-5 lg:w-80 lg:shrink-0">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="explore-model">Model</Label>
          <select id="explore-model" className={selectClass} value={modelId} onChange={(event) => setModelId(event.target.value)}>
            <option value="">{models === null ? 'Loading…' : models.length ? 'Choose a model' : 'No models yet'}</option>
            {(models ?? []).map((model) => (
              <option key={model.id} value={model.id}>
                {model.displayName}
              </option>
            ))}
          </select>
        </div>

        {catalog && (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-ui-fg-base">Measures</legend>
              {catalog.measures.map((measure) => (
                <div key={measure.name} className="flex items-center gap-2">
                  <Checkbox
                    id={`measure-${measure.name}`}
                    checked={measures.includes(measure.name)}
                    onCheckedChange={() => setMeasures((current) => toggle(current, measure.name, 10))}
                  />
                  <Label htmlFor={`measure-${measure.name}`} className="font-normal">
                    {measure.label}
                    {measure.kind === 'formula' && (
                      <Badge size="2xsmall" color="purple" className="ml-1.5">
                        {measure.unit ?? 'formula'}
                      </Badge>
                    )}
                  </Label>
                </div>
              ))}
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-ui-fg-base">Group by (up to 3)</legend>
              {catalog.fields
                .filter((field) => field.name !== timeField)
                .map((field) => (
                  <div key={field.name} className="flex items-center gap-2">
                    <Checkbox
                      id={`dimension-${field.name}`}
                      checked={dimensions.includes(field.name)}
                      onCheckedChange={() => setDimensions((current) => toggle(current, field.name, 3))}
                    />
                    <Label htmlFor={`dimension-${field.name}`} className="font-normal">
                      {field.name} <span className="text-ui-fg-muted">({field.type})</span>
                    </Label>
                  </div>
                ))}
            </fieldset>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="explore-time">Over time</Label>
                <select
                  id="explore-time"
                  className={selectClass}
                  value={timeField}
                  onChange={(event) => {
                    setTimeField(event.target.value);
                    setDimensions((current) => current.filter((name) => name !== event.target.value));
                  }}
                >
                  <option value="">None</option>
                  {timeFields.map((field) => (
                    <option key={field.name} value={field.name}>
                      {field.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="explore-grain">Per</Label>
                <select
                  id="explore-grain"
                  className={selectClass}
                  value={grain}
                  disabled={!timeField}
                  onChange={(event) => setGrain(event.target.value as AnalyticsTimeGrain)}
                >
                  {GRAINS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-ui-fg-base">Filters</legend>
              {filters.map((row, index) => (
                <div key={index} className="grid grid-cols-[1fr_4.5rem_1fr_auto] items-center gap-1.5">
                  <select
                    aria-label="Filter field"
                    className={selectClass}
                    value={row.field}
                    onChange={(event) =>
                      setFilters((current) => current.map((item, i) => (i === index ? { ...item, field: event.target.value } : item)))
                    }
                  >
                    <option value="">Field</option>
                    {catalog.fields.map((field) => (
                      <option key={field.name} value={field.name}>
                        {field.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter operator"
                    className={selectClass}
                    value={row.op}
                    onChange={(event) =>
                      setFilters((current) =>
                        current.map((item, i) => (i === index ? { ...item, op: event.target.value as FilterRow['op'] } : item)),
                      )
                    }
                  >
                    <option value="eq">=</option>
                    <option value="neq">≠</option>
                    <option value="in">in</option>
                    <option value="gte">≥</option>
                    <option value="lte">≤</option>
                  </select>
                  <Input
                    aria-label="Filter value"
                    size="small"
                    placeholder={row.op === 'in' ? 'a, b, c' : 'value'}
                    value={row.value}
                    onChange={(event) =>
                      setFilters((current) => current.map((item, i) => (i === index ? { ...item, value: event.target.value } : item)))
                    }
                  />
                  <Button
                    variant="transparent"
                    size="small"
                    aria-label="Remove filter"
                    onClick={() => setFilters((current) => current.filter((_, i) => i !== index))}
                  >
                    ×
                  </Button>
                </div>
              ))}
              {filters.length < 5 && (
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => setFilters((current) => [...current, { field: '', op: 'eq', value: '' }])}
                >
                  Add filter
                </Button>
              )}
            </fieldset>

            <Button onClick={() => void run()} isLoading={busy} disabled={!measures.length}>
              Show
            </Button>
          </>
        )}

        {views.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-ui-border-base pt-4">
            <Text size="small" weight="plus">
              Saved charts
            </Text>
            {views.map((view) => (
              <button
                key={view.id}
                type="button"
                className="rounded-md px-2 py-1 text-left text-sm text-ui-fg-interactive hover:bg-ui-bg-base-hover"
                onClick={() => void open(view)}
              >
                {view.name} <span className="text-ui-fg-muted">· {chartTypeLabel[view.visual.type]}</span>
              </button>
            ))}
          </div>
        )}
      </Container>

      <Container className="flex min-w-0 flex-1 flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        {notice && <Alert variant="success">{notice}</Alert>}

        {!result ? (
          <div className="flex flex-col gap-1 py-10 text-center">
            <Heading level="h3">Ask a question</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Choose a model and at least one measure, add group-bys, time or filters, then select Show.
            </Text>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge size="2xsmall" color={result.freshness === 'FRESH' ? 'green' : 'orange'}>
                {result.freshness.toLowerCase()}
              </Badge>
              <Text size="small" className="text-ui-fg-subtle">
                {result.rows.length} row{result.rows.length === 1 ? '' : 's'}
                {result.truncated ? ' (more rows match; showing the first 1,000)' : ''}
              </Text>
            </div>

            <div role="group" aria-label="Chart type" className="flex flex-wrap gap-1.5">
              {chartTypes.map((type) => (
                <Button
                  key={type}
                  size="small"
                  variant={type === chartType ? 'primary' : 'secondary'}
                  aria-pressed={type === chartType}
                  onClick={() => setChartType(type)}
                >
                  {chartTypeLabel[type]}
                </Button>
              ))}
            </div>

            <AnalyticsChart result={result} type={chartType} />

            {chartType !== 'table' && (
              <div className="flex flex-col gap-2">
                <Button variant="transparent" size="small" className="self-start" onClick={() => setShowData((value) => !value)}>
                  {showData ? 'Hide data' : 'Show data'}
                </Button>
                {showData && <ResultTable result={result} />}
              </div>
            )}

            <div className="flex flex-col gap-2 border-t border-ui-border-base pt-4 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="explore-save">Save as chart</Label>
                <Input
                  id="explore-save"
                  placeholder="For example: Yield by field per month"
                  value={viewName}
                  onChange={(event) => setViewName(event.target.value)}
                />
              </div>
              <Button variant="secondary" disabled={!viewName.trim()} onClick={() => void save()}>
                Save chart
              </Button>
            </div>
          </>
        )}
      </Container>
    </div>
  );
}
