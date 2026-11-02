'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button, Heading, StatusBadge, Text } from '@medusajs/ui';
import type { AnalyticsQueryResultV1, ModuleAnalyticsCompiledSourceCatalogV1 } from '@gigalibs/contracts';
import { formatCell } from '@/lib/analytics/chart-render';
import { buildKpiQuery } from '@gigalibs/analytics-charts/workbench';
import { analyticsApi } from '../explore/analytics-api';
import { ModuleTrendBuilder } from './ModuleTrendBuilder';

interface ModuleSourceListItem {
  readonly sourceId: string;
  readonly sourceKey: string;
  readonly title: string;
  readonly moduleLifecycle: string | null;
  readonly catalogModuleKey: string;
}

interface SourceTile {
  readonly source: ModuleSourceListItem;
  readonly catalog: ModuleAnalyticsCompiledSourceCatalogV1 | null;
  readonly kpiLabel: string | null;
  readonly kpiValue: string | null;
}

function lifecycleBadge(lifecycle: string | null) {
  if (lifecycle === 'UNAVAILABLE' || lifecycle === 'QUARANTINED') return <StatusBadge color="red">{lifecycle ?? 'UNAVAILABLE'}</StatusBadge>;
  if (lifecycle === 'NO_DATA') return <StatusBadge color="orange">NO_DATA</StatusBadge>;
  return <StatusBadge color="green">{lifecycle ?? 'ACTIVE'}</StatusBadge>;
}

export function CentralModuleAnalyticsPanel() {
  const [sources, setSources] = useState<ModuleSourceListItem[] | null>(null);
  const [tiles, setTiles] = useState<SourceTile[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedCatalog, setSelectedCatalog] = useState<ModuleAnalyticsCompiledSourceCatalogV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await analyticsApi<ModuleSourceListItem[]>('v1/module-sources');
      setSources(list);
      if (list.length === 0) {
        setTiles([]);
        setSelectedSourceId(null);
        setSelectedCatalog(null);
        return;
      }
      setSelectedSourceId((current) => current ?? list[0]!.sourceId);
      const nextTiles = await Promise.all(
        list.map(async (source): Promise<SourceTile> => {
          try {
            const catalog = await analyticsApi<ModuleAnalyticsCompiledSourceCatalogV1>(`v1/module-sources/${source.sourceId}/catalog`);
            const view = catalog.defaultViews[0];
            const measureKey = view?.kpiMeasureKeys[0];
            if (!measureKey) {
              return { source, catalog, kpiLabel: null, kpiValue: null };
            }
            const measure = catalog.measures.find((entry) => entry.key === measureKey);
            if (source.moduleLifecycle === 'UNAVAILABLE' || source.moduleLifecycle === 'QUARANTINED') {
              return { source, catalog, kpiLabel: measure?.label ?? measureKey, kpiValue: '—' };
            }
            const result = await analyticsApi<AnalyticsQueryResultV1>('v1/query/spec', {
              method: 'POST',
              body: JSON.stringify(buildKpiQuery(catalog, measureKey)),
            });
            const index = result.columns.findIndex((column) => column.name === measureKey && column.role === 'measure');
            const value = index >= 0 && result.rows[0] ? formatCell(result.rows[0][index] ?? null) : '—';
            return { source, catalog, kpiLabel: measure?.label ?? measureKey, kpiValue: value };
          } catch {
            return { source, catalog: null, kpiLabel: null, kpiValue: null };
          }
        }),
      );
      setTiles(nextTiles);
    } catch (cause) {
      setSources([]);
      setTiles([]);
      setError(cause instanceof Error ? cause.message : 'Unable to load module sources.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    if (!selectedSourceId) {
      setSelectedCatalog(null);
      return;
    }
    const tile = tiles.find((entry) => entry.source.sourceId === selectedSourceId);
    setSelectedCatalog(tile?.catalog ?? null);
  }, [selectedSourceId, tiles]);

  const selectSource = async (sourceId: string) => {
    setSelectedSourceId(sourceId);
    const cached = tiles.find((entry) => entry.source.sourceId === sourceId)?.catalog;
    if (cached) {
      setSelectedCatalog(cached);
      return;
    }
    try {
      setSelectedCatalog(await analyticsApi<ModuleAnalyticsCompiledSourceCatalogV1>(`v1/module-sources/${sourceId}/catalog`));
    } catch (cause) {
      setSelectedCatalog(null);
      setError(cause instanceof Error ? cause.message : 'Unable to load source catalog.');
    }
  };

  if (loading && sources === null) {
    return <Text className="text-sm text-ui-fg-muted">Loading entitled module sources…</Text>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level="h2" className="text-lg font-semibold text-ui-fg-base">
            Module analytics
          </Heading>
          <Text className="text-xs text-ui-fg-muted">
            The modules whose data you may analyse. Choose one to build a trend.
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="small" onClick={() => void loadSources()}>
            Refresh sources
          </Button>
          <Button asChild variant="secondary" size="small">
            <Link href="/analytics/explore">Semantic explore</Link>
          </Button>
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-ui-tag-red-border bg-ui-tag-red-bg p-3 text-sm text-ui-fg-error">
          {error}
        </div>
      ) : null}

      {sources && sources.length === 0 ? (
        <div className="rounded-xl border border-ui-border-base bg-ui-bg-subtle p-8 text-center text-sm text-ui-fg-subtle">
          No module analytics sources are available for this tenant. Enable a module with a declared analytics contract and Analytics read permission.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tiles.map(({ source, kpiLabel, kpiValue }) => (
              <button
                key={source.sourceId}
                type="button"
                onClick={() => void selectSource(source.sourceId)}
                className={`text-left p-5 rounded-xl border shadow-sm transition-colors ${
                  selectedSourceId === source.sourceId
                    ? 'border-ui-border-interactive bg-ui-bg-subtle'
                    : 'border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-base-hover'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Text className="text-sm font-semibold text-ui-fg-base">{source.title}</Text>
                  {lifecycleBadge(source.moduleLifecycle)}
                </div>
                <Text className="text-xs text-ui-fg-muted mb-3">{source.sourceKey}</Text>
                {kpiLabel ? (
                  <>
                    <Text className="text-xs uppercase tracking-wide text-ui-fg-muted">{kpiLabel}</Text>
                    <Text className="text-2xl font-bold text-ui-fg-base">{kpiValue ?? '—'}</Text>
                  </>
                ) : (
                  <Text className="text-xs text-ui-fg-muted">Catalog not compiled yet.</Text>
                )}
              </button>
            ))}
          </div>

          {selectedCatalog ? (
            <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 shadow-sm">
              <ModuleTrendBuilder catalog={selectedCatalog} />
            </div>
          ) : selectedSourceId ? (
            <Text className="text-sm text-ui-fg-muted">Select a source with a compiled catalog to use Trend Builder.</Text>
          ) : null}
        </>
      )}
    </div>
  );
}
