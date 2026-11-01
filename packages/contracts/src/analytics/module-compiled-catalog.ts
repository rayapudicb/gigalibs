import { z } from 'zod';
import { ModuleAnalyticsDefaultViewV1Schema, ModuleAnalyticsDimensionV1Schema, ModuleAnalyticsMeasureV1Schema } from './module-source-contract.js';
import { ModuleSourceReconciliationStatusV1Schema } from './module-source-reconciliation.js';

/** Governed catalog returned for a compiled module source (WI-OI-131 B8). */
export const ModuleAnalyticsCompiledSourceCatalogV1Schema = z
  .object({
    sourceId: z.string().uuid(),
    sourceKey: z.string(),
    title: z.string(),
    catalogModuleKey: z.string(),
    contractVersion: z.number().int().positive(),
    semanticModelId: z.string().uuid(),
    mappingId: z.string().uuid(),
    moduleLifecycle: z.string().nullable(),
    measures: z.array(ModuleAnalyticsMeasureV1Schema),
    dimensions: z.array(ModuleAnalyticsDimensionV1Schema),
    defaultViews: z.array(ModuleAnalyticsDefaultViewV1Schema),
    freshnessTargetSeconds: z.number().int().positive(),
    eventTimeField: z.string(),
    primaryKeyField: z.string(),
    reconciliationStatus: ModuleSourceReconciliationStatusV1Schema.nullable().optional(),
  })
  .strict();

export type ModuleAnalyticsCompiledSourceCatalogV1 = z.infer<typeof ModuleAnalyticsCompiledSourceCatalogV1Schema>;
