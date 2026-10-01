/**
 * Chart rendering for analytics query results (WI-OI-103d, ECharts per ADR-0004).
 *
 * A chart holds no data: it is an AnalyticsQueryV1 plus a visual choice. These pure functions look at the *shape* of a
 * result (how many time, dimension and measure columns it has) to offer only the chart types that fit, and turn a result
 * into an ECharts option. Colours are passed in (resolved from the ui-* design tokens at runtime), never hard-coded.
 */

import { type AnalyticsQueryResultV1, type ChartTypeV1, type PlaceDirectoryEntryV1, resultShape } from '@gigalibs/contracts';
import type { EChartsOption } from 'echarts';

type Cell = string | number | boolean | null;

// The shape rules are shared with the API, which refuses chart views of a type that does not fit.
export { chartTypeLabel, compatibleChartTypes, resultShape } from '@gigalibs/contracts';
export type { AnalyticsResultShape as ResultShape } from '@gigalibs/contracts';

/** Map and table/KPI are drawn without (or with a simplified) ECharts option; everything else is an ECharts chart. */
export function isEChartsType(type: ChartTypeV1): boolean {
  return type !== 'table' && type !== 'kpi';
}

export function toEChartsOption(
  result: AnalyticsQueryResultV1,
  type: ChartTypeV1,
  palette: readonly string[],
  text: { readonly color: string; readonly muted: string } = { color: 'inherit', muted: 'inherit' },
): EChartsOption | null {
  if (!isEChartsType(type) || type === 'place_map' || result.rows.length === 0) return null;
  const columns = result.columns;
  const timeIndex = columns.findIndex((column) => column.role === 'time');
  const dimensionIndexes = columns.flatMap((column, index) => (column.role === 'dimension' ? [index] : []));
  const measureIndexes = columns.flatMap((column, index) => (column.role === 'measure' ? [index] : []));
  const groupIndexes = [...(timeIndex >= 0 ? [timeIndex] : []), ...dimensionIndexes];
  const grain = timeIndex >= 0 ? /\((day|week|month|quarter|year)\)$/.exec(columns[timeIndex]!.label)?.[1] : undefined;
  const labelOf = (row: readonly Cell[], index: number): string => formatCell(row[index] ?? null, index === timeIndex ? grain : undefined);
  const numberOf = (row: readonly Cell[], index: number): number | null => {
    const value = row[index];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  const base: EChartsOption = {
    color: [...palette],
    aria: { enabled: true },
    textStyle: { color: text.color },
    tooltip: { trigger: 'item' },
    animationDuration: 300,
  };
  const legend = (show: boolean): EChartsOption['legend'] =>
    show ? { top: 0, type: 'scroll', textStyle: { color: text.muted } } : { show: false };
  const axisLabel = { color: text.muted };

  // Categories and series: one group column → one series per measure; two group columns → one series per value of
  // the second, for the single measure.
  const categories = unique(result.rows.map((row) => labelOf(row, groupIndexes[0] ?? 0)));
  const seriesSets: Array<{ name: string; values: Array<number | null> }> = [];
  if (groupIndexes.length === 2) {
    const secondValues = unique(result.rows.map((row) => labelOf(row, groupIndexes[1]!)));
    for (const second of secondValues) {
      const values = categories.map((category) => {
        const row = result.rows.find(
          (candidate) => labelOf(candidate, groupIndexes[0]!) === category && labelOf(candidate, groupIndexes[1]!) === second,
        );
        return row ? numberOf(row, measureIndexes[0]!) : null;
      });
      seriesSets.push({ name: second, values });
    }
  } else {
    for (const measureIndex of measureIndexes) {
      seriesSets.push({
        name: columns[measureIndex]!.label,
        values: categories.map((category) => {
          const row = result.rows.find((candidate) => labelOf(candidate, groupIndexes[0] ?? 0) === category);
          return row ? numberOf(row, measureIndex) : null;
        }),
      });
    }
  }

  switch (type) {
    case 'line':
    case 'area':
    case 'stacked_area':
    case 'column':
    case 'stacked_column':
    case 'bar':
    case 'stacked_bar': {
      const horizontal = type === 'bar' || type === 'stacked_bar';
      const stacked = type.startsWith('stacked_');
      const seriesType = type === 'line' || type === 'area' || type === 'stacked_area' ? 'line' : 'bar';
      const categoryAxis = { type: 'category' as const, data: categories, axisLabel };
      const valueAxis = { type: 'value' as const, axisLabel };
      return {
        ...base,
        tooltip: { trigger: 'axis' },
        legend: legend(seriesSets.length > 1),
        grid: { left: 8, right: 16, top: seriesSets.length > 1 ? 36 : 16, bottom: 8, containLabel: true },
        xAxis: horizontal ? valueAxis : categoryAxis,
        yAxis: horizontal ? categoryAxis : valueAxis,
        series: seriesSets.map((set) => ({
          name: set.name,
          type: seriesType,
          data: set.values,
          ...(stacked ? { stack: 'total' } : {}),
          ...(type === 'area' || type === 'stacked_area' ? { areaStyle: {} } : {}),
          ...(seriesType === 'line' ? { smooth: true, connectNulls: false } : {}),
        })),
      } as EChartsOption;
    }
    case 'pie':
    case 'donut':
    case 'funnel': {
      const data = categories.map((name, index) => ({ name, value: seriesSets[0]?.values[index] ?? 0 }));
      if (type === 'funnel') {
        return { ...base, legend: legend(true), series: [{ type: 'funnel', left: '10%', width: '80%', sort: 'descending', data }] };
      }
      return {
        ...base,
        legend: legend(true),
        series: [{ type: 'pie', radius: type === 'donut' ? ['45%', '70%'] : '70%', top: 24, data, label: { color: text.muted } }],
      };
    }
    case 'treemap': {
      const data =
        groupIndexes.length === 2
          ? categories.map((name, index) => ({
              name,
              children: seriesSets
                .map((set) => ({ name: set.name, value: set.values[index] ?? 0 }))
                .filter((child) => child.value > 0),
            }))
          : categories.map((name, index) => ({ name, value: seriesSets[0]?.values[index] ?? 0 }));
      return { ...base, series: [{ type: 'treemap', roam: false, breadcrumb: { show: false }, data }] };
    }
    case 'heatmap': {
      const yCategories = seriesSets.map((set) => set.name);
      const data: Array<[number, number, number | null]> = [];
      seriesSets.forEach((set, yIndex) => set.values.forEach((value, xIndex) => data.push([xIndex, yIndex, value])));
      const values = data.map((cell) => cell[2]).filter((value): value is number => value !== null);
      return {
        ...base,
        grid: { left: 8, right: 16, top: 16, bottom: 48, containLabel: true },
        xAxis: { type: 'category', data: categories, axisLabel },
        yAxis: { type: 'category', data: yCategories, axisLabel },
        visualMap: {
          min: values.length ? Math.min(...values) : 0,
          max: values.length ? Math.max(...values) : 1,
          orient: 'horizontal',
          left: 'center',
          bottom: 0,
          calculable: true,
          inRange: { color: [palette[5] ?? palette[0] ?? '#999', palette[0] ?? '#333'] },
          textStyle: { color: text.muted },
        },
        series: [{ type: 'heatmap', data }],
      } as EChartsOption;
    }
    case 'scatter':
    case 'bubble': {
      const [xIndex, yIndex, sizeIndex] = measureIndexes;
      const sizes = result.rows.map((row) => (sizeIndex === undefined ? null : numberOf(row, sizeIndex)));
      const maxSize = Math.max(1, ...sizes.map((size) => Math.abs(size ?? 0)));
      return {
        ...base,
        grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
        xAxis: { type: 'value', name: columns[xIndex!]?.label, axisLabel, nameTextStyle: { color: text.muted } },
        yAxis: { type: 'value', name: columns[yIndex!]?.label, axisLabel, nameTextStyle: { color: text.muted } },
        series: [
          {
            type: 'scatter',
            data: result.rows.map((row, index) => ({
              name: groupIndexes.length ? labelOf(row, groupIndexes[0]!) : '',
              value: [numberOf(row, xIndex!), numberOf(row, yIndex!)],
              symbolSize: type === 'bubble' ? 8 + 32 * Math.sqrt(Math.abs(sizes[index] ?? 0) / maxSize) : 10,
            })),
          },
        ],
      } as EChartsOption;
    }
    case 'gauge': {
      const value = numberOf(result.rows[0]!, measureIndexes[0]!) ?? 0;
      return {
        ...base,
        series: [{ type: 'gauge', max: niceCeiling(value), detail: { valueAnimation: true, color: text.color }, data: [{ value, name: columns[measureIndexes[0]!]!.label }] }],
      } as EChartsOption;
    }
    case 'radar': {
      const indicators = measureIndexes.map((index) => ({
        name: columns[index]!.label,
        max: niceCeiling(Math.max(0, ...result.rows.map((row) => numberOf(row, index) ?? 0))),
      }));
      return {
        ...base,
        legend: legend(true),
        radar: { indicator: indicators, axisName: { color: text.muted } },
        series: [
          {
            type: 'radar',
            data: result.rows.slice(0, 10).map((row) => ({
              name: labelOf(row, groupIndexes[0] ?? 0),
              value: measureIndexes.map((index) => numberOf(row, index) ?? 0),
            })),
          },
        ],
      } as EChartsOption;
    }
    case 'sankey': {
      const [sourceIndex, targetIndex] = groupIndexes;
      const sources = new Set(result.rows.map((row) => labelOf(row, sourceIndex!)));
      // A node name used on both sides would form a cycle, which Sankey forbids; mark the target side.
      const targetName = (name: string) => (sources.has(name) ? `${name} ›` : name);
      const links = result.rows
        .map((row) => ({ source: labelOf(row, sourceIndex!), target: targetName(labelOf(row, targetIndex!)), value: numberOf(row, measureIndexes[0]!) ?? 0 }))
        .filter((link) => link.value > 0);
      const nodes = unique(links.flatMap((link) => [link.source, link.target])).map((name) => ({ name }));
      return { ...base, series: [{ type: 'sankey', data: nodes, links, emphasis: { focus: 'adjacency' }, label: { color: text.color } }] } as EChartsOption;
    }
    case 'map': {
      const shape = resultShape(result);
      const latIndex = columns.findIndex((column) => column.name === shape.latitude);
      const lonIndex = columns.findIndex((column) => column.name === shape.longitude);
      const labelIndex = dimensionIndexes.find((index) => index !== latIndex && index !== lonIndex);
      const measureIndex = measureIndexes[0]!;
      const values = result.rows.map((row) => Math.abs(numberOf(row, measureIndex) ?? 0));
      const maxValue = Math.max(1, ...values);
      return {
        ...base,
        grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
        xAxis: { type: 'value', scale: true, name: 'Longitude', axisLabel, nameTextStyle: { color: text.muted } },
        yAxis: { type: 'value', scale: true, name: 'Latitude', axisLabel, nameTextStyle: { color: text.muted } },
        series: [
          {
            type: 'scatter',
            name: columns[measureIndex]!.label,
            data: result.rows.map((row, index) => ({
              name: labelIndex === undefined ? '' : labelOf(row, labelIndex),
              value: [numberOf(row, lonIndex), numberOf(row, latIndex), numberOf(row, measureIndex)],
              symbolSize: 8 + 28 * Math.sqrt(values[index]! / maxValue),
            })),
          },
        ],
      } as EChartsOption;
    }
    default:
      return null;
  }
}

export function formatCell(value: Cell, grain?: string): string {
  if (value === null) return '—';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (grain && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    if (grain === 'year') return value.slice(0, 4);
    if (grain === 'month') return value.slice(0, 7);
    if (grain === 'quarter') return `${value.slice(0, 4)}-Q${Math.ceil(Number(value.slice(5, 7)) / 3)}`;
    return value.slice(0, 10);
  }
  return value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil((value * 1.1) / magnitude) * magnitude;
}

/**
 * WI-OI-105e: a place map. Each place in the result (grouped by `place_id`) is drawn by its boundary and coloured by
 * the first measure; places around them (the farm's other fields) are drawn empty for context. Records in no known
 * place, and places without a boundary, cannot be drawn and are counted instead.
 */
export interface PlaceMap {
  readonly geoJson: { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; properties: { name: string }; geometry: unknown }> };
  readonly option: EChartsOption;
  /** Result rows that could not be drawn: no place ("Unplaced") or a place without a boundary. */
  readonly notDrawn: number;
}

export function placeMap(
  result: AnalyticsQueryResultV1,
  places: readonly PlaceDirectoryEntryV1[],
  mapName: string,
  colors: { readonly low: string; readonly high: string; readonly empty: string; readonly border: string },
  text: { readonly color: string; readonly muted: string } = { color: 'inherit', muted: 'inherit' },
): PlaceMap | null {
  const placeIndex = result.columns.findIndex((column) => column.name === 'place_id');
  const measureIndex = result.columns.findIndex((column) => column.role === 'measure');
  if (placeIndex < 0 || measureIndex < 0) return null;
  const drawable = new Map(places.filter((place) => place.boundary).map((place) => [place.id, place] as const));
  const values = new Map<string, number>();
  let notDrawn = 0;
  for (const row of result.rows) {
    const id = row[placeIndex];
    const value = row[measureIndex];
    if (typeof id !== 'string' || !drawable.has(id)) notDrawn += 1;
    else values.set(id, typeof value === 'number' ? value : 0);
  }
  if (drawable.size === 0) return null;
  // Larger places first, so a field is drawn over its farm.
  const ordered = [...drawable.values()].sort((a, b) => (b.areaM2 ?? 0) - (a.areaM2 ?? 0) || a.depth - b.depth);
  const latitudes = ordered.flatMap((place) => ringLatitudes(place.boundary));
  const midLatitude = latitudes.length ? (Math.min(...latitudes) + Math.max(...latitudes)) / 2 : 0;
  const numbers = [...values.values()];
  const low = numbers.length ? Math.min(...numbers) : 0;
  const high = numbers.length ? Math.max(...numbers) : 1;
  const measureLabel = result.columns[measureIndex]!.label;
  return {
    geoJson: {
      type: 'FeatureCollection',
      features: ordered.map((place) => ({ type: 'Feature', properties: { name: place.id }, geometry: place.boundary })),
    },
    notDrawn,
    option: {
      aria: { enabled: true },
      textStyle: { color: text.color },
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const item = params as { data?: { placeName?: string; value?: number | null } };
          const value = item.data?.value;
          return `${item.data?.placeName ?? ''}<br/>${measureLabel}: ${value === null || value === undefined ? 'no records' : formatCell(value)}`;
        },
      },
      visualMap: {
        type: 'continuous',
        min: low === high ? Math.min(0, low) : low,
        max: high,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        text: [formatCell(high), formatCell(low === high ? Math.min(0, low) : low)],
        textStyle: { color: text.muted },
        inRange: { color: [colors.low, colors.high] },
        outOfRange: { color: colors.empty },
      },
      series: [
        {
          type: 'map',
          map: mapName,
          name: measureLabel,
          roam: true,
          // Equal distances north and east at this latitude.
          aspectScale: Math.max(0.2, Math.cos((midLatitude * Math.PI) / 180)),
          layoutCenter: ['50%', '46%'],
          layoutSize: '88%',
          itemStyle: { borderColor: colors.border, borderWidth: 1, areaColor: colors.empty },
          emphasis: { label: { show: true, color: text.color }, itemStyle: { borderWidth: 2 } },
          label: { show: false },
          data: ordered.map((place) => ({
            name: place.id,
            placeName: place.name,
            value: values.has(place.id) ? values.get(place.id)! : null,
            ...(values.has(place.id) ? {} : { itemStyle: { areaColor: colors.empty } }),
          })),
        },
      ],
    } as EChartsOption,
  };
}

function ringLatitudes(boundary: PlaceDirectoryEntryV1['boundary']): number[] {
  if (!boundary) return [];
  const polygons = boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates;
  return polygons.flatMap((polygon) => (polygon[0] ?? []).map((position) => position[1]));
}
