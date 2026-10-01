'use client';

/**
 * Draws an analytics query result as a chosen chart type (WI-OI-103d, ECharts per ADR-0004). The chart holds no data
 * of its own: it is re-drawn from the result on every change. Colours come from the ui-* design tokens at runtime.
 */

import { useEffect, useRef, useState } from 'react';
import { Table, Text } from '@medusajs/ui';
import type { AnalyticsQueryResultV1, ChartTypeV1, PlaceDirectoryV1 } from '@gigalibs/contracts';
import * as echarts from 'echarts/core';
import {
  BarChart,
  FunnelChart,
  GaugeChart,
  HeatmapChart,
  LineChart,
  MapChart,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  TreemapChart,
} from 'echarts/charts';
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { formatCell, placeMap, toEChartsOption } from '@/lib/analytics/chart-render';
import { analyticsApi } from './analytics-api';

echarts.use([
  BarChart,
  FunnelChart,
  GaugeChart,
  HeatmapChart,
  LineChart,
  MapChart,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  TreemapChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TooltipComponent,
  VisualMapComponent,
  SVGRenderer,
]);

const PALETTE_TOKENS = [
  '--tag-blue-icon',
  '--tag-green-icon',
  '--tag-orange-icon',
  '--tag-purple-icon',
  '--tag-red-icon',
  '--tag-neutral-icon',
];

function designTokens() {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    palette: PALETTE_TOKENS.map(token).filter(Boolean),
    text: { color: token('--fg-base') || 'currentColor', muted: token('--fg-subtle') || 'currentColor' },
    // WI-OI-105e: the place map's colour scale, from the green tag tokens.
    scale: {
      low: token('--tag-green-bg') || 'currentColor',
      high: token('--tag-green-icon') || 'currentColor',
      empty: token('--bg-subtle') || 'transparent',
      border: token('--border-strong') || 'currentColor',
    },
  };
}

function timeGrain(result: AnalyticsQueryResultV1): string | undefined {
  const time = result.columns.find((column) => column.role === 'time');
  return time ? /\((day|week|month|quarter|year)\)$/.exec(time.label)?.[1] : undefined;
}

export function ResultTable({ result }: { result: AnalyticsQueryResultV1 }) {
  const grain = timeGrain(result);
  return (
    <div className="overflow-x-auto">
      <Table>
        <Table.Header>
          <Table.Row>
            {result.columns.map((column) => (
              <Table.HeaderCell key={column.name} className={column.role === 'measure' ? 'text-right' : undefined}>
                {column.label}
              </Table.HeaderCell>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {result.rows.map((row, rowIndex) => (
            <Table.Row key={rowIndex}>
              {row.map((cell, index) => (
                <Table.Cell key={index} className={result.columns[index]?.role === 'measure' ? 'text-right tabular-nums' : undefined}>
                  {formatCell(cell, result.columns[index]?.role === 'time' ? grain : undefined)}
                </Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  );
}

function KpiTiles({ result }: { result: AnalyticsQueryResultV1 }) {
  const row = result.rows[0] ?? [];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {result.columns.map((column, index) =>
        column.role === 'measure' ? (
          <div key={column.name} className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
            <Text size="small" className="text-ui-fg-subtle">
              {column.label}
            </Text>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ui-fg-base">{formatCell(row[index] ?? null)}</p>
          </div>
        ) : null,
      )}
    </div>
  );
}

function EChart({ result, type, height }: { result: AnalyticsQueryResultV1; type: ChartTypeV1; height: number }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!element.current) return;
    const chart = echarts.init(element.current, undefined, { renderer: 'svg' });
    const tokens = designTokens();
    const option = toEChartsOption(result, type, tokens.palette, tokens.text);
    if (option) chart.setOption(option, true);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [result, type]);
  return <div ref={element} style={{ height }} className="w-full" />;
}

/**
 * WI-OI-105e: places drawn by their boundaries and coloured by the first measure. The boundaries come from the places
 * this member may see (under the question's place, when it has one), so the map never outlines a place outside their
 * scope.
 */
function PlaceMapChart({ result, placeUnder, height }: { result: AnalyticsQueryResultV1; placeUnder?: string; height: number }) {
  const element = useRef<HTMLDivElement>(null);
  const [directory, setDirectory] = useState<PlaceDirectoryV1 | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notDrawn, setNotDrawn] = useState(0);
  useEffect(() => {
    let current = true;
    setDirectory(null);
    setProblem(null);
    analyticsApi<PlaceDirectoryV1>(`v1/places/directory?boundaries=true${placeUnder ? `&under=${encodeURIComponent(placeUnder)}` : ''}`)
      .then((loaded) => current && setDirectory(loaded))
      .catch((cause: Error) => current && setProblem(cause.message));
    return () => {
      current = false;
    };
  }, [placeUnder]);
  useEffect(() => {
    if (!element.current || !directory) return;
    const tokens = designTokens();
    const mapName = `places-${placeUnder ?? 'all'}-${directory.places.length}`;
    const drawn = placeMap(result, directory.places, mapName, tokens.scale, tokens.text);
    if (!drawn) {
      setProblem('None of these places has a boundary to draw.');
      return;
    }
    setNotDrawn(drawn.notDrawn);
    echarts.registerMap(mapName, drawn.geoJson as never);
    const chart = echarts.init(element.current, undefined, { renderer: 'svg' });
    chart.setOption(drawn.option, true);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [directory, result, placeUnder]);
  if (problem) return <Text size="small" className="text-ui-fg-subtle">{problem}</Text>;
  return (
    <div className="flex flex-col gap-1">
      <div ref={element} style={{ height }} className="w-full" role="img" aria-label="Map of places coloured by the first measure" />
      {notDrawn > 0 ? (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {`${notDrawn} row${notDrawn === 1 ? '' : 's'} not on the map: records in no known place, or places without a boundary. Show data to see them.`}
        </Text>
      ) : null}
    </div>
  );
}

export function AnalyticsChart({
  result,
  type,
  height = 380,
  placeUnder,
}: {
  result: AnalyticsQueryResultV1;
  type: ChartTypeV1;
  height?: number;
  /** WI-OI-105e: the place the question is about, so the place map loads only its boundaries. */
  placeUnder?: string | undefined;
}) {
  if (result.rows.length === 0) {
    return (
      <Text size="small" className="text-ui-fg-subtle">
        No rows match this question.
      </Text>
    );
  }
  if (type === 'table') return <ResultTable result={result} />;
  if (type === 'kpi') return <KpiTiles result={result} />;
  if (type === 'place_map') return <PlaceMapChart result={result} height={height} {...(placeUnder ? { placeUnder } : {})} />;
  return <EChart result={result} type={type} height={height} />;
}
