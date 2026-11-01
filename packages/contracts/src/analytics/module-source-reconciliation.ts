import { z } from 'zod';

export const MODULE_ANALYTICS_CONTROL_TOTAL_V1 = 'MODULE_ANALYTICS_CONTROL_TOTAL_V1' as const;

const SourceKeySchema = z.string().regex(/^[a-z][a-z0-9-]{1,62}$/);
const CatalogModuleKeySchema = z.string().regex(/^[a-z][a-z0-9-]{1,62}$/);

/** Producer-reported control total for source-count parity (WI-OI-131 B7). */
export const ModuleAnalyticsControlTotalV1Schema = z
  .object({
    catalogModuleKey: CatalogModuleKeySchema,
    sourceKey: SourceKeySchema,
    producerRecordCount: z.number().int().nonnegative(),
    reportedAt: z.string().datetime({ offset: true }),
    backfillComplete: z.boolean().default(false),
    backfillCursor: z.string().trim().min(1).max(256).nullable().optional(),
    backfillBatchSeq: z.number().int().nonnegative().optional(),
  })
  .strict();

export type ModuleAnalyticsControlTotalV1 = z.infer<typeof ModuleAnalyticsControlTotalV1Schema>;

export function parseModuleAnalyticsControlTotalV1(input: unknown): ModuleAnalyticsControlTotalV1 {
  return ModuleAnalyticsControlTotalV1Schema.parse(input);
}

export const ModuleSourceReconciliationStatusV1Schema = z.enum(['MATCH', 'UNDER', 'OVER', 'UNKNOWN']);
export type ModuleSourceReconciliationStatusV1 = z.infer<typeof ModuleSourceReconciliationStatusV1Schema>;
