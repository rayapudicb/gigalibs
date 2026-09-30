import { z } from 'zod';
import { ChartTypeV1Schema } from './chart-view.js';
import { AnalyticsFieldNameSchema, AnalyticsQueryResultV1Schema, AnalyticsScalarSchema } from './query.js';

// WI-OI-103e (ADR-0016 F13): a dashboard is a set of saved chart views plus shared filters. It stores which filters
// exist, never data or chosen values; the viewer picks values, and each filter applies to every chart whose model has
// that field. Each chart reports which filters applied and which were skipped, so nothing is silently ignored.

export const MAX_DASHBOARD_TILES = 12;
export const MAX_DASHBOARD_FILTERS = 5;

/** small = a third of the row, medium = half, large = the full row. */
export const DashboardTileSizeV1Schema = z.enum(['small', 'medium', 'large']);
export type DashboardTileSizeV1 = z.infer<typeof DashboardTileSizeV1Schema>;

export const DashboardFilterV1Schema = z
  .object({ field: AnalyticsFieldNameSchema, label: z.string().trim().min(1).max(60) })
  .strict();
export type DashboardFilterV1 = z.infer<typeof DashboardFilterV1Schema>;

export const SaveDashboardV1Schema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1_000).nullable().default(null),
    /** Offer a from/to date range that applies to every chart with a time axis. */
    timeRange: z.boolean().default(true),
    filters: z.array(DashboardFilterV1Schema).max(MAX_DASHBOARD_FILTERS).default([]),
    tiles: z
      .array(z.object({ chartViewId: z.string().uuid(), size: DashboardTileSizeV1Schema.default('medium') }).strict())
      .min(1)
      .max(MAX_DASHBOARD_TILES),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.filters.map((filter) => filter.field)).size !== value.filters.length) {
      context.addIssue({ code: 'custom', path: ['filters'], message: 'Each field can be a shared filter only once.' });
    }
    if (new Set(value.tiles.map((tile) => tile.chartViewId)).size !== value.tiles.length) {
      context.addIssue({ code: 'custom', path: ['tiles'], message: 'Each saved chart can appear only once.' });
    }
  });
export type SaveDashboardV1 = z.input<typeof SaveDashboardV1Schema>;

export const DashboardTileV1Schema = z.object({
  id: z.string().uuid(),
  chartViewId: z.string().uuid(),
  name: z.string(),
  chartType: ChartTypeV1Schema,
  size: DashboardTileSizeV1Schema,
});
export type DashboardTileV1 = z.infer<typeof DashboardTileV1Schema>;

export const DashboardV1Schema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  timeRange: z.boolean(),
  filters: z.array(DashboardFilterV1Schema),
  tiles: z.array(DashboardTileV1Schema),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DashboardV1 = z.infer<typeof DashboardV1Schema>;

export const DashboardSummaryV1Schema = DashboardV1Schema.pick({
  id: true,
  name: true,
  description: true,
  updatedAt: true,
}).extend({ tileCount: z.number().int().nonnegative() });
export type DashboardSummaryV1 = z.infer<typeof DashboardSummaryV1Schema>;

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date such as 2026-09-01.');

/** The values a viewer picked for this view of the dashboard. */
export const DashboardDataRequestV1Schema = z
  .object({
    time: z
      .object({ from: IsoDateSchema, to: IsoDateSchema })
      .strict()
      .refine((value) => value.from <= value.to, { message: 'from must be on or before to.', path: ['to'] })
      .optional(),
    filters: z
      .array(z.object({ field: AnalyticsFieldNameSchema, values: z.array(AnalyticsScalarSchema).min(1).max(100) }).strict())
      .max(MAX_DASHBOARD_FILTERS)
      .default([]),
  })
  .strict();
export type DashboardDataRequestV1 = z.input<typeof DashboardDataRequestV1Schema>;

export const DashboardTileDataV1Schema = DashboardTileV1Schema.extend({
  /** Shared filters applied to this chart ("time" for the date range). */
  applied: z.array(z.string()),
  /** Shared filters this chart cannot take, with the reason. */
  skipped: z.array(z.object({ filter: z.string(), reason: z.string() })),
  result: AnalyticsQueryResultV1Schema.nullable(),
  error: z.string().nullable(),
});
export type DashboardTileDataV1 = z.infer<typeof DashboardTileDataV1Schema>;

export const DashboardDataV1Schema = z.object({
  dashboardId: z.string().uuid(),
  tiles: z.array(DashboardTileDataV1Schema),
  generatedAt: z.string(),
});
export type DashboardDataV1 = z.infer<typeof DashboardDataV1Schema>;

/** Distinct values of a shared filter's field across the dashboard's charts, for the viewer's picker. */
export const DashboardFilterValuesV1Schema = z.object({
  field: z.string(),
  values: z.array(AnalyticsScalarSchema),
  truncated: z.boolean(),
});
export type DashboardFilterValuesV1 = z.infer<typeof DashboardFilterValuesV1Schema>;
