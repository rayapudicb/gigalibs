import { z } from 'zod';

export const MODULE_ANALYTICS_FACT_V1 = 'MODULE_ANALYTICS_FACT_V1' as const;

const SourceKeySchema = z.string().regex(/^[a-z][a-z0-9-]{1,62}$/);
const CatalogModuleKeySchema = z.string().regex(/^[a-z][a-z0-9-]{1,62}$/);

export const ModuleAnalyticsFactKindV1Schema = z.enum(['UPSERT', 'REVERSAL']);
export type ModuleAnalyticsFactKindV1 = z.infer<typeof ModuleAnalyticsFactKindV1Schema>;

export const ModuleAnalyticsDataOriginV1Schema = z.enum(['PRODUCTION', 'TEST']);
export type ModuleAnalyticsDataOriginV1 = z.infer<typeof ModuleAnalyticsDataOriginV1Schema>;

/** Normalized fact body stored in Analytics raw records (registry-driven ingest, WI-OI-131 B6). */
export const ModuleAnalyticsFactIngestV1Schema = z
  .object({
    catalogModuleKey: CatalogModuleKeySchema,
    sourceKey: SourceKeySchema,
    eventId: z.string().trim().min(1).max(128),
    aggregateId: z.string().trim().min(1).max(128),
    aggregateVersion: z.number().int().positive(),
    occurredAt: z.string().datetime({ offset: true }),
    factSchemaVersion: z.number().int().min(1).max(9999),
    factKind: ModuleAnalyticsFactKindV1Schema.default('UPSERT'),
    reversalOfEventId: z.string().trim().min(1).max(128).optional(),
    dataOrigin: ModuleAnalyticsDataOriginV1Schema.default('PRODUCTION'),
    ownerUnitId: z.string().trim().min(1).max(64).nullable().optional(),
    ownerPlaceId: z.string().trim().min(1).max(128).nullable().optional(),
    fact: z.record(z.string(), z.unknown()),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.factKind === 'REVERSAL' && !value.reversalOfEventId) {
      context.addIssue({
        code: 'custom',
        message: 'reversalOfEventId is required when factKind is REVERSAL.',
        path: ['reversalOfEventId'],
      });
    }
  });

export type ModuleAnalyticsFactIngestV1 = z.infer<typeof ModuleAnalyticsFactIngestV1Schema>;

export function parseModuleAnalyticsFactIngestV1(input: unknown): ModuleAnalyticsFactIngestV1 {
  return ModuleAnalyticsFactIngestV1Schema.parse(input);
}

/** Relay envelope payload for MODULE_ANALYTICS_FACT_V1 (producer → Analytics inbox). */
export const ModuleAnalyticsFactRelayPayloadV1Schema = ModuleAnalyticsFactIngestV1Schema;
export type ModuleAnalyticsFactRelayPayloadV1 = ModuleAnalyticsFactIngestV1;
