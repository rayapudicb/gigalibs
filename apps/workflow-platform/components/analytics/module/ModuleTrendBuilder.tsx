'use client';

import { useCallback, useMemo, useState } from 'react';
import { Badge, Button, Checkbox, Container, Heading, Input, Label, Text } from '@medusajs/ui';
import type {
  AnalyticsQueryResultV1,
  AnalyticsTimeGrain,
  ChartTypeV1,
  ChartViewV1,
  ModuleAnalyticsCompiledSourceCatalogV1,
} from '@gigalibs/contracts';
import { chartTypeLabel, compatibleChartTypes, formatCell, resultShape } from '@/lib/analytics/chart-render';
import { AnalyticsChart, ResultTable } from '../explore/AnalyticsChart';
import { analyticsApi } from '../explore/analytics-api';
import { buildModuleCompareQuery, buildModuleTrendQuery, type ModuleTrendDateRange } from './build-module-trend-query';

const GRAINS: AnalyticsTimeGrain[] = ['day', 'week', 'month', 'quarter', 'year'];
const selectClass =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-sm text-ui-fg-base focus:outline-none focus:ring-2 focus:ring-ui-border-interactive';

function defaultRange(): ModuleTrendDateRange {
  const to = new Date();
  const from = new Date(to);
  from.setUTCMonth(from.getUTCMonth() - 3);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function priorRange(range: ModuleTrendDateRange): ModuleTrendDateRange {
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  const spanMs = to.getTime() - from.getTime();
  const compareTo = new Date(from.getTime() - 86_400_000);
  const compareFrom = new Date(compareTo.getTime() - spanMs);
  return { from: compareFrom.toISOString().slice(0, 10), to: compareTo.toISOString().slice(0, 10) };
}

function toggle(list: string[], name: string, max: number) {
  return list.includes(name) ? list.filter((item) => item !== name) : list.length < max ? [...list, name] : list;
}

export function ModuleTrendBuilder(props: {
  readonly catalog: ModuleAnalyticsCompiledSourceCatalogV1;
  readonly onSaved?: () => void;
}) {
  const { catalog } = props;
  const [measures, setMeasures] = useState<string[]>(() =>
    catalog.defaultViews[0]?.kpiMeasureKeys.slice(0, 1) ?? catalog.measures.slice(0, 1).map((entry) => entry.key),
  );
  const [dimensions, setDimensions] = useState<string[]>([]);
  const [grain, setGrain] = useState<AnalyticsTimeGrain>('month');
  const [range, setRange] = useState<ModuleTrendDateRange>(defaultRange);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [result, setResult] = useState<AnalyticsQueryResultV1 | null>(null);
  const [compareResult, setCompareResult] = useState<AnalyticsQueryResultV1 | null>(null);
  const [chartType, setChartType] = useState<ChartTypeV1>('line');
  const [viewName, setViewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useCallback(
    () =>
      buildModuleTrendQuery(catalog, {
        measures,
        dimensions,
        grain,
        range,
      }),
    [catalog, measures, dimensions, grain, range],
  );

  const chartTypes = result ? compatibleChartTypes(resultShape(result)) : [];

  const run = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const spec = query();
      const answer = await analyticsApi<AnalyticsQueryResultV1>('v1/query/spec', {
        method: 'POST',
        body: JSON.stringify(spec),
      });
      setResult(answer);
      const fitting = compatibleChartTypes(resultShape(answer));
      setChartType((current) => (fitting.includes(current) ? current : fitting[0] ?? 'table'));

      if (compareEnabled) {
        const compareSpec = buildModuleCompareQuery(catalog, spec, priorRange(range));
        setCompareResult(
          await analyticsApi<AnalyticsQueryResultV1>('v1/query/spec', {
            method: 'POST',
            body: JSON.stringify(compareSpec),
          }),
        );
      } else {
        setCompareResult(null);
      }
    } catch (cause) {
      setResult(null);
      setCompareResult(null);
      setError(cause instanceof Error ? cause.message : 'Preview failed.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!viewName.trim()) {
      setError('Name this chart before saving.');
      return;
    }
    setError(null);
    try {
      await analyticsApi<ChartViewV1>('v1/chart-views', {
        method: 'POST',
        body: JSON.stringify({ name: viewName.trim(), query: query(), visual: { type: chartType } }),
      });
      setNotice(`Saved "${viewName.trim()}".`);
      setViewName('');
      props.onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed.');
    }
  };

  const measureTotal = useMemo(() => {
    if (!result || measures.length !== 1 || result.rows.length === 0) return null;
    const index = result.columns.findIndex((column) => column.name === measures[0] && column.role === 'measure');
    if (index < 0) return null;
    let sum = 0;
    for (const row of result.rows) {
      const value = row[index];
      if (typeof value === 'number' && Number.isFinite(value)) sum += value;
    }
    return sum;
  }, [result, measures]);

  const compareTotal = useMemo(() => {
    if (!compareResult || measures.length !== 1 || compareResult.rows.length === 0) return null;
    const index = compareResult.columns.findIndex((column) => column.name === measures[0] && column.role === 'measure');
    if (index < 0) return null;
    let sum = 0;
    for (const row of compareResult.rows) {
      const value = row[index];
      if (typeof value === 'number' && Number.isFinite(value)) sum += value;
    }
    return sum;
  }, [compareResult, measures]);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <Container className="flex w-full flex-col gap-4 lg:w-80 lg:shrink-0">
        <div>
          <Heading level="h3" className="text-sm font-semibold">
            Trend builder
          </Heading>
          <Text className="text-xs text-ui-fg-muted">Measures and dimensions come from the module source contract only.</Text>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Measures</legend>
          {catalog.measures.map((measure) => (
            <div key={measure.key} className="flex items-center gap-2">
              <Checkbox
                id={`trend-measure-${measure.key}`}
                checked={measures.includes(measure.key)}
                onCheckedChange={() => setMeasures((current) => toggle(current, measure.key, 10))}
              />
              <Label htmlFor={`trend-measure-${measure.key}`} className="font-normal">
                {measure.label}
                <Badge size="2xsmall" color="grey" className="ml-1.5">
                  {measure.unit}
                </Badge>
              </Label>
            </div>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Group by (up to 3)</legend>
          {catalog.dimensions.map((dimension) => (
            <div key={dimension.key} className="flex items-center gap-2">
              <Checkbox
                id={`trend-dimension-${dimension.key}`}
                checked={dimensions.includes(dimension.key)}
                onCheckedChange={() => setDimensions((current) => toggle(current, dimension.key, 3))}
              />
              <Label htmlFor={`trend-dimension-${dimension.key}`} className="font-normal">
                {dimension.label}
              </Label>
            </div>
          ))}
        </fieldset>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trend-grain">Time grain</Label>
            <select id="trend-grain" className={selectClass} value={grain} onChange={(event) => setGrain(event.target.value as AnalyticsTimeGrain)}>
              {GRAINS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trend-from">From</Label>
            <Input id="trend-from" type="date" value={range.from} onChange={(event) => setRange((prev) => ({ ...prev, from: event.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trend-to">To</Label>
            <Input id="trend-to" type="date" value={range.to} onChange={(event) => setRange((prev) => ({ ...prev, to: event.target.value }))} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox id="trend-compare" checked={compareEnabled} onCheckedChange={(checked) => setCompareEnabled(checked === true)} />
          <Label htmlFor="trend-compare" className="font-normal">
            Compare to prior period of equal length
          </Label>
        </div>

        <Button variant="primary" disabled={busy || measures.length === 0} onClick={() => void run()}>
          {busy ? 'Running…' : 'Preview'}
        </Button>

        {error ? (
          <Text className="text-sm text-ui-fg-error" role="alert">
            {error}
          </Text>
        ) : null}
        {notice ? (
          <Text className="text-sm text-ui-fg-interactive" role="status">
            {notice}
          </Text>
        ) : null}
      </Container>

      <Container className="min-w-0 flex-1 flex flex-col gap-4">
        {compareEnabled && measureTotal !== null && compareTotal !== null ? (
          <Text className="text-sm text-ui-fg-muted">
            Current period total: <strong>{formatCell(measureTotal)}</strong> · Prior period:{' '}
            <strong>{formatCell(compareTotal)}</strong>
          </Text>
        ) : null}

        {result ? (
          <>
            <div className="flex flex-wrap gap-2">
              {chartTypes.map((type) => (
                <Button
                  key={type}
                  size="small"
                  variant={chartType === type ? 'primary' : 'secondary'}
                  onClick={() => setChartType(type)}
                >
                  {chartTypeLabel[type]}
                </Button>
              ))}
            </div>
            <AnalyticsChart result={result} type={chartType} />
            <ResultTable result={result} />
            <div className="flex flex-wrap items-end gap-2 border-t border-ui-border-base pt-4">
              <div className="flex flex-col gap-1.5 flex-1 min-w-[12rem]">
                <Label htmlFor="trend-view-name">Save chart</Label>
                <Input id="trend-view-name" value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder="Chart name" />
              </div>
              <Button variant="secondary" disabled={!result} onClick={() => void save()}>
                Save chart view
              </Button>
            </div>
            <Text className="text-xs text-ui-fg-muted">
              Freshness: {result.freshness.toLowerCase()}
              {result.moduleLineage?.contractVersion ? ` · contract v${result.moduleLineage.contractVersion}` : ''}
            </Text>
          </>
        ) : (
          <Text className="text-sm text-ui-fg-muted">Choose measures and preview to see governed results.</Text>
        )}
      </Container>
    </div>
  );
}
