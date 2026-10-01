import type { ChartTypeV1 } from './chart-view.js';
import type { AnalyticsQueryResultV1 } from './query.js';

// WI-OI-103d: which chart types fit a query result, decided by its shape (time, dimension and measure columns). Shared by
// the Explore screen, which offers only these types, and the API, which refuses a saved chart view of any other type.

export interface AnalyticsResultShape {
  readonly time: number;
  readonly dimensions: number;
  readonly measures: number;
  /** Numeric dimension fields that hold coordinates, when present (map charts). */
  readonly latitude?: string | undefined;
  readonly longitude?: string | undefined;
  /** WI-OI-105e: the result is grouped by the place a record was tagged with (place map charts). */
  readonly place?: boolean;
}

export const chartTypeLabel: Readonly<Record<ChartTypeV1, string>> = {
  table: 'Table',
  kpi: 'KPI',
  line: 'Line',
  area: 'Area',
  stacked_area: 'Stacked area',
  column: 'Column',
  stacked_column: 'Stacked column',
  bar: 'Bar',
  stacked_bar: 'Stacked bar',
  pie: 'Pie',
  donut: 'Donut',
  scatter: 'Scatter',
  bubble: 'Bubble',
  heatmap: 'Heatmap',
  treemap: 'Treemap',
  funnel: 'Funnel',
  gauge: 'Gauge',
  radar: 'Radar',
  sankey: 'Sankey',
  map: 'Map (points)',
  place_map: 'Map (places)',
};

export function resultShape(result: Pick<AnalyticsQueryResultV1, 'columns'>): AnalyticsResultShape {
  const dimensions = result.columns.filter((column) => column.role === 'dimension');
  const numeric = (pattern: RegExp) =>
    dimensions.find((column) => column.type === 'number' && pattern.test(column.name))?.name;
  return {
    time: result.columns.filter((column) => column.role === 'time').length,
    dimensions: dimensions.length,
    measures: result.columns.filter((column) => column.role === 'measure').length,
    latitude: numeric(/^(lat|latitude)$/i),
    longitude: numeric(/^(lon|lng|longitude)$/i),
    place: dimensions.some((column) => column.name === 'place_id' && column.type === 'string'),
  };
}

/** Chart types that fit a result's shape, best first. `table` always fits. */
export function compatibleChartTypes(shape: AnalyticsResultShape): ChartTypeV1[] {
  const groups = shape.time + shape.dimensions;
  const m = shape.measures;
  const types: ChartTypeV1[] = [];
  if (m === 0) return ['table'];

  if (shape.place && shape.time === 0 && shape.dimensions === 1) types.push('place_map');
  if (shape.latitude && shape.longitude && shape.time === 0 && shape.dimensions <= 3) types.push('map');

  if (groups === 0) {
    types.push('kpi');
    if (m === 1) types.push('gauge');
  } else if (groups === 1) {
    if (shape.time === 1) {
      types.push('line', 'area', 'column', 'bar');
      if (m >= 2) types.push('stacked_area', 'stacked_column', 'stacked_bar');
    } else {
      types.push('column', 'bar', 'line', 'area');
      if (m === 1) types.push('pie', 'donut', 'funnel', 'treemap');
      if (m >= 2) types.push('stacked_column', 'stacked_bar', 'scatter');
      if (m >= 3) types.push('bubble', 'radar');
    }
  } else if (groups === 2 && m === 1) {
    if (shape.time === 1) types.push('line', 'area', 'stacked_area', 'stacked_column', 'column', 'heatmap');
    else types.push('stacked_column', 'column', 'stacked_bar', 'bar', 'heatmap', 'treemap', 'sankey');
  }
  types.push('table');
  return [...new Set(types)];
}
