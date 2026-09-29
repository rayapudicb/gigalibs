import { z } from 'zod';
import { AnalyticsQueryV1Schema } from './query.js';

// WI-OI-103d (ADR-0016 F13): a chart view is a saved question plus how to draw it. It stores the query and the visual
// choice, never data, so the same question can be redrawn as any chart type that fits its shape.

export const ChartTypeV1Schema = z.enum([
  'table',
  'kpi',
  'line',
  'area',
  'stacked_area',
  'column',
  'stacked_column',
  'bar',
  'stacked_bar',
  'pie',
  'donut',
  'scatter',
  'bubble',
  'heatmap',
  'treemap',
  'funnel',
  'gauge',
  'radar',
  'sankey',
  'map',
]);
export type ChartTypeV1 = z.infer<typeof ChartTypeV1Schema>;

export const ChartVisualV1Schema = z
  .object({
    type: ChartTypeV1Schema,
    /** Map only: the dimension fields holding latitude and longitude. */
    latitudeField: z.string().max(64).optional(),
    longitudeField: z.string().max(64).optional(),
  })
  .strict();
export type ChartVisualV1 = z.infer<typeof ChartVisualV1Schema>;

export const CreateChartViewV1Schema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1_000).nullable().default(null),
    query: AnalyticsQueryV1Schema,
    visual: ChartVisualV1Schema,
  })
  .strict();
export type CreateChartViewV1 = z.infer<typeof CreateChartViewV1Schema>;

export const ChartViewV1Schema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  query: AnalyticsQueryV1Schema,
  visual: ChartVisualV1Schema,
  createdBy: z.string(),
  createdAt: z.string(),
});
export type ChartViewV1 = z.infer<typeof ChartViewV1Schema>;
