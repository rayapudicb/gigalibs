'use client';

import { requestJson } from '@/lib/client-api';
import {
  resolveMetricSpec,
  type MetricCatalogueV1,
  type MetricDrilldownV1,
  type MetricUnit,
} from '@gigalibs/contracts';
import { ArrowPath, ChevronRight, ExclamationCircle, Spinner } from '@medusajs/icons';
import { Alert, Badge, Button, Container, Heading, Table, Text } from '@medusajs/ui';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const WINDOWS = [
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 180, label: 'Last 180 days' },
  { days: 365, label: 'Last 365 days' },
] as const;

const selectClass =
  'h-8 rounded-md bg-ui-bg-field px-2 txt-compact-small text-ui-fg-base shadow-borders-base outline-none transition-fg hover:bg-ui-bg-field-hover focus-visible:shadow-borders-interactive-with-active';

interface Props {
  demoLab: boolean;
  canManageDemo: boolean;
  canDeleteDemo: boolean;
}

/** Turns a place code such as STORE_012 into "Store 012" for display; the code itself stays visible. */
function placeLabel(code: string): string {
  const words = code.split('_').map((word) => (/^\d+$/.test(word) ? word : word.charAt(0) + word.slice(1).toLowerCase()));
  return words.join(' ');
}

function formatValue(value: number | null, unit: MetricUnit, currency: string | null): string {
  if (value === null) return '—';
  const digits = Math.abs(value) >= 100 ? 0 : 2;
  const number = value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  switch (unit) {
    case 'HOURS':
      return `${number} h`;
    case 'MINUTES':
      return `${number} min`;
    case 'KG':
      return `${number} kg`;
    case 'CURRENCY':
      return currency ? `${number} ${currency}` : number;
    default:
      return number;
  }
}

function dayOffset(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

// WI-OI-064f: estate → region → site drill-down over place rollups, metrics from the activated catalogue.
export function PlaceDrilldownExplorer({ demoLab, canManageDemo, canDeleteDemo }: Props) {
  const [catalogue, setCatalogue] = useState<MetricCatalogueV1 | null>(null);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState('labour_hours');
  const [days, setDays] = useState<number>(90);
  const [path, setPath] = useState<string[]>([]);
  const [result, setResult] = useState<MetricDrilldownV1 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const current = await requestJson<{ manifest: { catalogue: MetricCatalogueV1 } }>(
          '/api/control/configuration/catalogues/current?kind=METRIC_CATALOGUE&surfaceKey=operations',
        );
        setCatalogue(current.manifest.catalogue);
      } catch (reason) {
        setCatalogueError((reason as Error).message);
      }
      try {
        const catalogues = await requestJson<{ items: Array<{ kind: string; surfaceKey: string; activation: unknown }> }>(
          '/api/control/configuration/catalogues',
        );
        const country = catalogues.items.find((item) => item.kind === 'COUNTRY_PACK' && item.activation);
        if (country) {
          const pack = await requestJson<{ manifest: { catalogue: { currency: string } } }>(
            `/api/control/configuration/catalogues/current?kind=COUNTRY_PACK&surfaceKey=${country.surfaceKey}`,
          );
          setCurrency(pack.manifest.catalogue.currency);
        }
      } catch {
        // Currency is a display nicety; amounts still render without it.
      }
    })();
  }, []);

  const spec = useMemo(() => (catalogue ? resolveMetricSpec(catalogue, metricKey) : undefined), [catalogue, metricKey]);

  const load = useCallback(async () => {
    if (!spec) return;
    setLoading(true);
    setError(null);
    const started = performance.now();
    try {
      const response = await requestJson<MetricDrilldownV1>('/api/analytics/v1/places/metric-drilldown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metric: spec, under: path.join('.'), from: dayOffset(days - 1), to: dayOffset(0) }),
      });
      setResult(response);
      setElapsed(Math.round(performance.now() - started));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [spec, path, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const children = result?.items.filter((item) => !item.self) ?? [];
  const self = result?.items.find((item) => item.self);
  const total = result?.total.value ?? null;

  return (
    <section className="min-h-full bg-ui-bg-subtle px-[5px] py-5 text-ui-fg-base" aria-labelledby="drilldown-title">
      <div className="mx-auto w-full max-w-[1800px] space-y-5">
        <Container className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Text size="xsmall" weight="plus" className="uppercase tracking-[0.18em] text-ui-fg-muted">Analytics Studio</Text>
              <Heading level="h1" id="drilldown-title" className="mt-2">Place drill-down</Heading>
              <Text size="small" className="mt-1 max-w-3xl text-ui-fg-subtle">
                Governed metrics across your estate, from the whole organisation down to a single site. Metrics come from
                the activated catalogue in Configuration Studio.
              </Text>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {demoLab ? <Badge color="orange" size="small">Demo Lab · synthetic data</Badge> : null}
              <Button asChild size="small" variant="secondary"><Link href="/analytics">Analytics overview</Link></Button>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 txt-compact-small text-ui-fg-subtle">
              Metric
              <select aria-label="Metric" className={selectClass} value={metricKey} onChange={(event) => setMetricKey(event.target.value)} disabled={!catalogue}>
                {(catalogue?.metrics ?? []).map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 txt-compact-small text-ui-fg-subtle">
              Window
              <select aria-label="Window" className={selectClass} value={days} onChange={(event) => setDays(Number(event.target.value))}>
                {WINDOWS.map((window) => <option key={window.days} value={window.days}>{window.label}</option>)}
              </select>
            </label>
            <Button type="button" size="small" variant="transparent" onClick={() => void load()} disabled={loading || !spec}>
              <ArrowPath /> Refresh
            </Button>
            {elapsed !== null ? <Text size="xsmall" className="text-ui-fg-muted">Answered in {elapsed} ms</Text> : null}
          </div>
        </Container>

        {catalogueError ? (
          <Alert variant="warning">
            No metric catalogue is active for this workspace. Install and activate the operations metric catalogue in
            Configuration Studio, then return here. ({catalogueError})
          </Alert>
        ) : null}

        {demoLab ? <DemoLabPanel canManage={canManageDemo} canDelete={canDeleteDemo} onChanged={() => { setPath([]); void load(); }} /> : null}

        <Container className="p-5">
          <nav aria-label="Place path" className="flex flex-wrap items-center gap-1 txt-compact-small">
            <button type="button" className="rounded px-1 text-ui-fg-interactive hover:underline disabled:text-ui-fg-base disabled:no-underline" disabled={path.length === 0} onClick={() => setPath([])}>Estate</button>
            {path.map((code, index) => (
              <span key={`${code}-${index}`} className="flex items-center gap-1">
                <ChevronRight className="text-ui-fg-muted" />
                <button type="button" className="rounded px-1 text-ui-fg-interactive hover:underline disabled:text-ui-fg-base disabled:no-underline" disabled={index === path.length - 1} onClick={() => setPath(path.slice(0, index + 1))}>
                  {placeLabel(code)}
                </button>
              </span>
            ))}
          </nav>

          <div className="mt-4 flex flex-wrap items-baseline gap-3">
            <Heading level="h2">{spec?.label ?? 'Metric'}</Heading>
            <span className="text-3xl font-semibold tabular-nums">{spec ? formatValue(total, spec.unit, currency) : '—'}</span>
            {spec?.kind === 'RATIO' ? <Badge size="2xsmall" color="grey">ratio of totals</Badge> : null}
          </div>

          {error ? <Alert variant="error" role="alert" className="mt-4">{error}</Alert> : null}
          {loading && !result ? (
            <Text size="small" className="mt-4 flex items-center gap-2 text-ui-fg-subtle"><Spinner className="animate-spin" /> Loading…</Text>
          ) : null}

          {result && children.length === 0 && !self ? (
            <div className="mt-5 rounded-lg border border-dashed border-ui-border-strong p-6 text-center">
              <Text weight="plus">No data for this place and window</Text>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                {demoLab ? 'Generate synthetic data in the Demo Lab panel above.' : 'Facts arrive from connected modules; try a longer window.'}
              </Text>
            </div>
          ) : null}

          {spec && children.length > 0 ? (
            <DrilldownChart
              items={children}
              unit={spec.unit}
              currency={currency}
              onSelect={(code) => setPath([...path, code])}
            />
          ) : null}

          {spec && result && (children.length > 0 || self) ? (
            <div className="mt-4 overflow-x-auto">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Place</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">{spec.label}</Table.HeaderCell>
                    {spec.kind === 'AGGREGATE' ? <Table.HeaderCell className="text-right">Share</Table.HeaderCell> : null}
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {children.map((item) => (
                    <Table.Row key={item.path} className="cursor-pointer" onClick={() => setPath([...path, item.code])}>
                      <Table.Cell className="py-2">
                        <span className="block txt-compact-small-plus">{placeLabel(item.code)}</span>
                        <span className="font-mono text-xs text-ui-fg-muted">{item.path}</span>
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">{formatValue(item.value, spec.unit, currency)}</Table.Cell>
                      {spec.kind === 'AGGREGATE' ? (
                        <Table.Cell className="text-right tabular-nums">
                          {total && item.value !== null ? `${((item.value / total) * 100).toFixed(1)} %` : '—'}
                        </Table.Cell>
                      ) : null}
                    </Table.Row>
                  ))}
                  {self ? (
                    <Table.Row>
                      <Table.Cell className="py-2">
                        <span className="block txt-compact-small-plus">Recorded directly on {placeLabel(self.code)}</span>
                        <span className="font-mono text-xs text-ui-fg-muted">{self.path}</span>
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">{formatValue(self.value, spec.unit, currency)}</Table.Cell>
                      {spec.kind === 'AGGREGATE' ? (
                        <Table.Cell className="text-right tabular-nums">
                          {total && self.value !== null ? `${((self.value / total) * 100).toFixed(1)} %` : '—'}
                        </Table.Cell>
                      ) : null}
                    </Table.Row>
                  ) : null}
                </Table.Body>
              </Table>
            </div>
          ) : null}
        </Container>
      </div>
    </section>
  );
}

/** ECharts (ADR-0004) horizontal bars coloured from the Medusa theme; clicking a bar drills into that place. */
function DrilldownChart({ items, unit, currency, onSelect }: {
  items: MetricDrilldownV1['items'];
  unit: MetricUnit;
  currency: string | null;
  onSelect: (code: string) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    let chart: { dispose: () => void; resize: () => void } | null = null;
    const resize = () => chart?.resize();
    void import('echarts').then((echarts) => {
      if (disposed || !host.current) return;
      const css = getComputedStyle(document.documentElement);
      const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
      const sorted = [...items].sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
      const instance = echarts.init(host.current, undefined, { renderer: 'svg' });
      instance.setOption({
        animationDuration: 250,
        grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
        tooltip: {
          trigger: 'item',
          valueFormatter: (value: number) => formatValue(value, unit, currency),
        },
        xAxis: {
          type: 'value',
          axisLabel: { color: token('--fg-muted', '#71717a') },
          splitLine: { lineStyle: { color: token('--border-base', '#e4e4e7') } },
        },
        yAxis: {
          type: 'category',
          data: sorted.map((item) => placeLabel(item.code)),
          axisLabel: { color: token('--fg-subtle', '#52525b') },
          axisLine: { lineStyle: { color: token('--border-base', '#e4e4e7') } },
        },
        series: [
          {
            type: 'bar',
            data: sorted.map((item) => ({ value: item.value ?? 0, code: item.code })),
            itemStyle: { color: token('--fg-interactive', '#3b82f6'), borderRadius: [0, 4, 4, 0] },
            emphasis: { itemStyle: { color: token('--tag-blue-icon', '#60a5fa') } },
            cursor: 'pointer',
          },
        ],
      });
      instance.on('click', (event) => {
        const data = event.data as { code?: string } | null | undefined;
        if (data?.code) select.current(data.code);
      });
      chart = instance;
      window.addEventListener('resize', resize);
    });
    return () => {
      disposed = true;
      window.removeEventListener('resize', resize);
      chart?.dispose();
    };
  }, [items, unit, currency]);

  return (
    <div
      ref={host}
      role="img"
      aria-label="Bar chart of the metric for each place; select a bar or a table row to drill in"
      className="mt-4 w-full"
      style={{ height: Math.min(520, 60 + items.length * 28) }}
    />
  );
}

function DemoLabPanel({ canManage, canDelete, onChanged }: { canManage: boolean; canDelete: boolean; onChanged: () => void }) {
  const [dataset, setDataset] = useState<{ facts: number; rollupRows: number; from: string | null; to: string | null } | null>(null);
  const [days, setDays] = useState(180);
  const [busy, setBusy] = useState<'generate' | 'reset' | 'delete' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDataset(await requestJson('/api/demo-lab/dataset'));
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function run(action: 'generate' | 'reset' | 'delete') {
    if (action === 'delete' && !window.confirm('Retire this Demo Lab workspace? Its synthetic data is deleted and nobody can open it again; the audit trail is kept.')) return;
    setBusy(action);
    setError(null);
    setMessage(null);
    const started = performance.now();
    try {
      const result = await requestJson<{ facts?: number; rollupRows?: number }>(`/api/demo-lab/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'generate' ? { days } : {}),
      });
      if (action === 'delete') {
        window.location.assign('/login');
        return;
      }
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      setMessage(action === 'generate'
        ? `Generated ${(result.facts ?? 0).toLocaleString()} synthetic facts in ${seconds} s.`
        : 'Synthetic data removed.');
      await refresh();
      onChanged();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Container className="space-y-3 border-l-4 border-l-ui-tag-orange-icon p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading level="h2">Demo Lab</Heading>
          <Text size="small" className="mt-1 max-w-3xl text-ui-fg-subtle">
            This workspace holds synthetic data only, generated from its industry pack. It is excluded from value
            reporting and can be reset or deleted at any time.
          </Text>
        </div>
        <Text size="small" className="tabular-nums text-ui-fg-subtle">
          {dataset ? `${dataset.facts.toLocaleString()} synthetic facts${dataset.from ? ` · ${dataset.from} to ${dataset.to}` : ''}` : '—'}
        </Text>
      </div>
      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Days of synthetic history" className={selectClass} value={days} onChange={(event) => setDays(Number(event.target.value))}>
            {[30, 90, 180, 365].map((value) => <option key={value} value={value}>{value} days</option>)}
          </select>
          <Button type="button" size="small" isLoading={busy === 'generate'} disabled={busy !== null} onClick={() => void run('generate')}>Generate synthetic data</Button>
          <Button type="button" size="small" variant="secondary" isLoading={busy === 'reset'} disabled={busy !== null} onClick={() => void run('reset')}>Reset</Button>
          {canDelete ? (
            <Button type="button" size="small" variant="danger" isLoading={busy === 'delete'} disabled={busy !== null} onClick={() => void run('delete')}>Retire workspace</Button>
          ) : null}
        </div>
      ) : null}
      {message ? <Alert variant="success" role="status">{message}</Alert> : null}
      {error ? <Alert variant="error" role="alert"><ExclamationCircle className="inline" /> {error}</Alert> : null}
    </Container>
  );
}
