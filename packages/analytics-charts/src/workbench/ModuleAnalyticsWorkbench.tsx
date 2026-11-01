'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AnalyticsQueryResultV1,
  ModuleAnalyticsCompiledSourceCatalogV1,
  ModuleAnalyticsDefaultViewV1,
} from '@gigalibs/contracts';
import { formatCell } from '../index.js';
import {
  buildBreakdownQuery,
  buildKpiQuery,
  buildTrendQuery,
  pickView,
  type ModuleWorkbenchDateRange,
} from './build-module-queries.js';
import { ModuleAnalyticsChart } from './ModuleAnalyticsChart.js';
import type { ModuleAnalyticsWorkbenchProps } from './types.js';

function defaultDateRange(): ModuleWorkbenchDateRange {
  const to = new Date();
  const from = new Date(to);
  from.setUTCMonth(from.getUTCMonth() - 3);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function measureValue(result: AnalyticsQueryResultV1 | null, measureKey: string): string {
  if (!result || result.rows.length === 0) return '—';
  const measureIndex = result.columns.findIndex((column) => column.name === measureKey && column.role === 'measure');
  if (measureIndex < 0) return '—';
  return formatCell(result.rows[0]![measureIndex] ?? null);
}

function freshnessLabel(result: AnalyticsQueryResultV1 | null): string {
  if (!result) return 'Loading…';
  const parts = [result.freshness.toLowerCase()];
  if (result.watermark) parts.push(`watermark ${result.watermark}`);
  if (result.moduleLineage?.contractVersion) parts.push(`contract v${result.moduleLineage.contractVersion}`);
  return parts.join(' · ');
}

export function ModuleAnalyticsWorkbench(props: ModuleAnalyticsWorkbenchProps) {
  const [catalog, setCatalog] = useState<ModuleAnalyticsCompiledSourceCatalogV1 | null>(null);
  const [view, setView] = useState<ModuleAnalyticsDefaultViewV1 | null>(null);
  const [range, setRange] = useState<ModuleWorkbenchDateRange>(defaultDateRange);
  const [kpis, setKpis] = useState<Record<string, AnalyticsQueryResultV1>>({});
  const [trend, setTrend] = useState<AnalyticsQueryResultV1 | null>(null);
  const [table, setTable] = useState<AnalyticsQueryResultV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const visibleViews = useMemo(() => {
    if (!catalog) return [];
    if (!props.allowedViewKeys?.length) return catalog.defaultViews;
    return catalog.defaultViews.filter((entry) => props.allowedViewKeys!.includes(entry.key));
  }, [catalog, props.allowedViewKeys]);

  const refresh = useCallback(async () => {
    if (!catalog || !view) return;
    setLoading(true);
    setError(null);
    try {
      const kpiEntries = await Promise.all(
        view.kpiMeasureKeys.map(async (measureKey) => {
          const result = await props.runQuery(buildKpiQuery(catalog, measureKey, range));
          return [measureKey, result] as const;
        }),
      );
      setKpis(Object.fromEntries(kpiEntries));
      setTrend(await props.runQuery(buildTrendQuery(catalog, view, range)));
      setTable(await props.runQuery(buildBreakdownQuery(catalog, view, range)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load module analytics.');
    } finally {
      setLoading(false);
    }
  }, [catalog, view, range, props]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const loaded = await props.loadCatalog();
        if (cancelled) return;
        if (loaded.sourceKey !== props.sourceKey) {
          throw new Error('Catalog sourceKey does not match workbench props.');
        }
        const selected = pickView(loaded, props.allowedViewKeys);
        setCatalog(loaded);
        setView(selected);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load module catalog.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.loadCatalog, props.sourceKey, props.allowedViewKeys]);

  useEffect(() => {
    if (catalog && view) void refresh();
  }, [catalog, view, range, refresh]);

  if (error) {
    return (
      <div className={props.className} role="alert">
        <p>{error}</p>
      </div>
    );
  }

  if (!catalog || !view) {
    return (
      <div className={props.className} aria-busy={loading}>
        <p>{loading ? 'Loading module analytics…' : 'No catalog available.'}</p>
      </div>
    );
  }

  const lifecycle = catalog.moduleLifecycle;
  const emptyModule = lifecycle === 'NO_DATA' || (trend?.rows.length ?? 0) === 0;
  const headline = catalog.defaultViews.find((entry) => entry.key === view.key)?.label ?? catalog.title;

  return (
    <div className={props.className} data-source-key={props.sourceKey}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.125rem' }}>{catalog.title}</h2>
          <p style={{ margin: '4px 0 0', color: props.theme?.text.muted ?? '#52525b', fontSize: '0.875rem' }}>
            {freshnessLabel(trend ?? table)} · {headline}
          </p>
        </div>
        <label style={{ marginLeft: 'auto', fontSize: '0.875rem' }}>
          From{' '}
          <input type="date" value={range.from} onChange={(event) => setRange((prev) => ({ ...prev, from: event.target.value }))} />
        </label>
        <label style={{ fontSize: '0.875rem' }}>
          To{' '}
          <input type="date" value={range.to} onChange={(event) => setRange((prev) => ({ ...prev, to: event.target.value }))} />
        </label>
        {visibleViews.length > 1 ? (
          <select
            value={view.key}
            onChange={(event) => {
              const next = visibleViews.find((entry) => entry.key === event.target.value);
              if (next) setView(next);
            }}
            aria-label="Module analytics view"
          >
            {visibleViews.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        ) : null}
      </header>

      {lifecycle === 'UNAVAILABLE' ? (
        <p role="status">This module source is unavailable for your tenant.</p>
      ) : null}

      {emptyModule && lifecycle !== 'UNAVAILABLE' ? (
        <p role="status">No production facts yet for this source. Charts stay empty until data arrives.</p>
      ) : null}

      <section aria-label="Key performance indicators" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        {view.kpiMeasureKeys.map((measureKey) => {
          const measure = catalog.measures.find((entry) => entry.key === measureKey);
          return (
            <article key={measureKey} style={{ border: '1px solid #e4e4e7', borderRadius: 8, padding: 12 }}>
              <p style={{ margin: 0, fontSize: '0.75rem', color: props.theme?.text.muted ?? '#52525b' }}>{measure?.label ?? measureKey}</p>
              <p style={{ margin: '6px 0 0', fontSize: '1.25rem', fontWeight: 600 }}>{measureValue(kpis[measureKey] ?? null, measureKey)}</p>
              {measure?.unit ? (
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: props.theme?.text.muted ?? '#71717a' }}>{measure.unit}</p>
              ) : null}
            </article>
          );
        })}
      </section>

      {trend && trend.rows.length > 0 ? (
        <section aria-label="Trend" style={{ marginBottom: 20 }}>
          <ModuleAnalyticsChart result={trend} type="line" theme={props.theme} />
        </section>
      ) : null}

      {table && table.rows.length > 0 ? (
        <section aria-label="Breakdown table">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr>
                  {table.columns.map((column) => (
                    <th key={column.name} style={{ textAlign: 'left', borderBottom: '1px solid #e4e4e7', padding: '8px 6px' }}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} style={{ borderBottom: '1px solid #f4f4f5', padding: '8px 6px' }}>
                        {formatCell(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {loading ? <p aria-live="polite">Refreshing…</p> : null}
    </div>
  );
}
