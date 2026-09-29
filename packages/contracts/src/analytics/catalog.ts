import { z } from 'zod';
import { AnalyticsFieldTypeSchema } from './query.js';

// WI-OI-103d: what a user may put into an AnalyticsQueryV1, for the Explore screen's pickers. Measures are the model's
// base measures plus its approved formula measures; fields come from the dataset's published mapping, which is the
// same whitelist the query engine enforces.

export const AnalyticsModelSummaryV1Schema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  description: z.string().nullable(),
  datasetVersionId: z.string(),
  definitionVersion: z.number().int().nonnegative(),
  updatedAt: z.string(),
});
export type AnalyticsModelSummaryV1 = z.infer<typeof AnalyticsModelSummaryV1Schema>;

export const AnalyticsCatalogMeasureV1Schema = z.object({
  name: z.string(),
  label: z.string(),
  kind: z.enum(['base', 'formula']),
  /** Base measures only. */
  aggregateFn: z.string().nullable(),
  /** Formula measures only: the display unit and the approved version a chart may pin. */
  unit: z.string().nullable(),
  versionId: z.string().uuid().nullable(),
});
export type AnalyticsCatalogMeasureV1 = z.infer<typeof AnalyticsCatalogMeasureV1Schema>;

export const AnalyticsCatalogFieldV1Schema = z.object({ name: z.string(), type: AnalyticsFieldTypeSchema });
export type AnalyticsCatalogFieldV1 = z.infer<typeof AnalyticsCatalogFieldV1Schema>;

export const AnalyticsModelCatalogV1Schema = z.object({
  model: AnalyticsModelSummaryV1Schema,
  measures: z.array(AnalyticsCatalogMeasureV1Schema),
  fields: z.array(AnalyticsCatalogFieldV1Schema),
});
export type AnalyticsModelCatalogV1 = z.infer<typeof AnalyticsModelCatalogV1Schema>;
