import { z } from 'zod';

export const TENANT_ENTITLEMENTS_CHANGED_V1 = 'tenant.entitlements.changed.v1' as const;
export const TENANT_ENTITLEMENTS_CHANGED_V2 = 'tenant.entitlements.changed.v2' as const;
export const TENANT_MODULE_ENTITLEMENTS_SNAPSHOT_V2 = 'TENANT_MODULE_ENTITLEMENTS_SNAPSHOT_V2' as const;

const CatalogModuleKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,62}$/, 'catalogModuleKey must match the platform module catalogue key.');

export const TenantModuleEntitlementStateV2Schema = z
  .object({
    catalogModuleKey: CatalogModuleKeySchema,
    status: z.enum(['ENABLED', 'DISABLED']),
  })
  .strict();
export type TenantModuleEntitlementStateV2 = z.infer<typeof TenantModuleEntitlementStateV2Schema>;

/** Control-plane entitlement snapshot relayed to Analytics (WI-OI-131 A4). */
export const TenantModuleEntitlementsSnapshotV2Schema = z
  .object({
    tenantId: z.string().trim().min(1).max(64),
    snapshotVersion: z.number().int().positive(),
    enabledModuleKeys: z.array(CatalogModuleKeySchema),
    modules: z.array(TenantModuleEntitlementStateV2Schema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const enabled = new Set(value.enabledModuleKeys);
    for (const row of value.modules) {
      if (row.status === 'ENABLED' && !enabled.has(row.catalogModuleKey)) {
        context.addIssue({
          code: 'custom',
          message: `enabledModuleKeys must include ${row.catalogModuleKey} when status is ENABLED.`,
          path: ['enabledModuleKeys'],
        });
      }
      if (row.status === 'DISABLED' && enabled.has(row.catalogModuleKey)) {
        context.addIssue({
          code: 'custom',
          message: `enabledModuleKeys must not include ${row.catalogModuleKey} when status is DISABLED.`,
          path: ['enabledModuleKeys'],
        });
      }
    }
  });
export type TenantModuleEntitlementsSnapshotV2 = z.infer<typeof TenantModuleEntitlementsSnapshotV2Schema>;

export function parseTenantModuleEntitlementsSnapshotV2(input: unknown): TenantModuleEntitlementsSnapshotV2 {
  return TenantModuleEntitlementsSnapshotV2Schema.parse(input);
}
