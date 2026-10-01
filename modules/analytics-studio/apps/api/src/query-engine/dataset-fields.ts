import { type AnalyticsFieldType, AnalyticsFieldTypeSchema } from '@gigalibs/contracts';
import type { DatabaseService } from '../database/database.service.js';

/**
 * The analytical fields a dataset version exposes, with their types, from its published mapping (WI-OI-103a/d). This
 * is the whitelist for every query and the field list for every picker, so the two can never disagree.
 */
export async function loadDatasetFields(
  db: Pick<DatabaseService, 'queryWithTenant'>,
  tenantId: string,
  datasetVersionId: string,
): Promise<Map<string, AnalyticsFieldType>> {
  const mappingResult = await db.queryWithTenant<{ field_mappings: unknown }>(
    tenantId,
    `SELECT mv.field_mappings
     FROM gigalibs_analytics.analytical_dataset_versions adv
     JOIN gigalibs_analytics.studio_mapping_versions mv
       ON mv.mapping_id = adv.mapping_id AND mv.version_number = adv.mapping_version
     WHERE adv.id = $1`,
    [datasetVersionId],
  );
  const rawMappings = mappingResult.rows[0]?.field_mappings;
  const mappings: Array<{ analyticalField?: unknown; analyticalType?: unknown; place?: unknown }> = Array.isArray(rawMappings)
    ? rawMappings
    : typeof rawMappings === 'string'
      ? JSON.parse(rawMappings)
      : [];
  const fields = new Map<string, AnalyticsFieldType>();
  for (const mapping of mappings) {
    const type = AnalyticsFieldTypeSchema.safeParse(mapping.analyticalType);
    if (typeof mapping.analyticalField === 'string' && type.success) fields.set(mapping.analyticalField, type.data);
    // WI-OI-105c: a place-tagged dataset also exposes each record's place id (its path stays internal, for scope).
    if (mapping.place) fields.set('place_id', 'string');
  }
  return fields;
}
