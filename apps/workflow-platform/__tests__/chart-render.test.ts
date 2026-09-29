/**
 * WI-OI-103d — chart rendering: only chart types that fit a result's shape are offered, and results become ECharts
 * options without any stored data or hard-coded colours.
 */
import type { AnalyticsQueryColumnV1, AnalyticsQueryResultV1 } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { compatibleChartTypes, formatCell, resultShape, toEChartsOption } from '../lib/analytics/chart-render';

const palette = ['var-a', 'var-b', 'var-c', 'var-d', 'var-e', 'var-f'];
const column = (name: string, role: AnalyticsQueryColumnV1['role'], type: AnalyticsQueryColumnV1['type'] = 'string', label = name) =>
  ({ name, role, type, label }) as AnalyticsQueryColumnV1;
const result = (columns: AnalyticsQueryColumnV1[], rows: AnalyticsQueryResultV1['rows']): AnalyticsQueryResultV1 => ({
  semanticModelId: '00000000-0000-4000-8000-000000000001',
  datasetVersionId: 'dsv',
  definitionVersion: 1,
  measureVersions: {},
  asOf: '2026-09-29T00:00:00Z',
  freshness: 'FRESH',
  watermark: null,
  columns,
  rows,
  truncated: false,
});

const byMonthAndField = result(
  [column('day', 'time', 'timestamp', 'day (month)'), column('field', 'dimension'), column('yield', 'measure', 'number', 'Yield t/ha')],
  [
    ['2026-07-01T00:00:00.000Z', 'North', 4.2],
    ['2026-07-01T00:00:00.000Z', 'South', 3.1],
    ['2026-08-01T00:00:00.000Z', 'North', 4.8],
  ],
);
const byCrop = result(
  [column('crop', 'dimension'), column('area', 'measure', 'number', 'Area ha')],
  [
    ['Maize', 120],
    ['Wheat', 80],
  ],
);

describe('compatibleChartTypes', () => {
  it('offers time charts first for time by dimension, and never pie', () => {
    const types = compatibleChartTypes(resultShape(byMonthAndField));
    expect(types[0]).toBe('line');
    expect(types).toContain('heatmap');
    expect(types).not.toContain('pie');
    expect(types.at(-1)).toBe('table');
  });

  it('offers part-to-whole charts for one dimension and one measure', () => {
    expect(compatibleChartTypes(resultShape(byCrop))).toEqual(
      expect.arrayContaining(['column', 'bar', 'pie', 'donut', 'funnel', 'treemap', 'table']),
    );
  });

  it('offers KPI and gauge for a single total, and a map only with coordinates', () => {
    expect(compatibleChartTypes({ time: 0, dimensions: 0, measures: 1 })).toEqual(['kpi', 'gauge', 'table']);
    expect(compatibleChartTypes({ time: 0, dimensions: 1, measures: 1 })).not.toContain('map');
    expect(compatibleChartTypes({ time: 0, dimensions: 3, measures: 1, latitude: 'lat', longitude: 'lon' })[0]).toBe('map');
  });

  it('offers sankey only for two dimensions and one measure', () => {
    expect(compatibleChartTypes({ time: 0, dimensions: 2, measures: 1 })).toContain('sankey');
    expect(compatibleChartTypes({ time: 1, dimensions: 1, measures: 1 })).not.toContain('sankey');
  });
});

describe('toEChartsOption', () => {
  it('draws one series per second-group value, formatted by grain', () => {
    const option = toEChartsOption(byMonthAndField, 'line', palette) as any;
    expect(option.xAxis.data).toEqual(['2026-07', '2026-08']);
    expect(option.series.map((s: any) => s.name)).toEqual(['North', 'South']);
    expect(option.series[1].data).toEqual([3.1, null]); // a missing value stays missing
    expect(option.color).toEqual(palette);
    expect(option.aria.enabled).toBe(true);
  });

  it('switches the same result to stacked columns and horizontal bars without re-querying', () => {
    const stacked = toEChartsOption(byMonthAndField, 'stacked_column', palette) as any;
    expect(stacked.series.every((s: any) => s.type === 'bar' && s.stack === 'total')).toBe(true);
    const bar = toEChartsOption(byCrop, 'bar', palette) as any;
    expect(bar.yAxis.type).toBe('category');
    expect(bar.xAxis.type).toBe('value');
  });

  it('draws pie, heatmap and sankey', () => {
    expect((toEChartsOption(byCrop, 'donut', palette) as any).series[0].data).toEqual([
      { name: 'Maize', value: 120 },
      { name: 'Wheat', value: 80 },
    ]);
    const heat = toEChartsOption(byMonthAndField, 'heatmap', palette) as any;
    expect(heat.series[0].data).toContainEqual([0, 0, 4.2]);
    const flows = result(
      [column('from', 'dimension'), column('to', 'dimension'), column('t', 'measure', 'number')],
      [
        ['Field A', 'Silo', 10],
        ['Silo', 'Market', 8],
      ],
    );
    const sankey = toEChartsOption(flows, 'sankey', palette) as any;
    expect(sankey.series[0].links).toContainEqual({ source: 'Silo', target: 'Market', value: 8 });
    expect(sankey.series[0].data.map((n: any) => n.name)).toContain('Silo ›'); // cycles avoided
  });

  it('returns no ECharts option for table and KPI, or for an empty result', () => {
    expect(toEChartsOption(byCrop, 'table', palette)).toBeNull();
    expect(toEChartsOption(byCrop, 'kpi', palette)).toBeNull();
    expect(toEChartsOption(result(byCrop.columns, []), 'column', palette)).toBeNull();
  });
});

describe('formatCell', () => {
  it('formats time by grain and values plainly', () => {
    expect(formatCell('2026-08-15T00:00:00.000Z', 'quarter')).toBe('2026-Q3');
    expect(formatCell('2026-08-15T00:00:00.000Z', 'year')).toBe('2026');
    expect(formatCell(3.14159)).toBe('3.14');
    expect(formatCell(null)).toBe('—');
  });
});
