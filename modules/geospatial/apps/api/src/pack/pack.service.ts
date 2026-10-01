import { GeospatialIndustrySectionV1Schema, PackApplicationV1Schema } from '@gigalibs/contracts';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { GeospatialPrincipal } from '../auth/authorization.js';
import { GeospatialDatabaseService } from '../database/database.service.js';
import { type CommandContext, PlacesService } from '../places/places.service.js';

/**
 * WI-OI-107 (ADR-0016 F10): Geospatial's section of the tenant's active industry pack. The kernel sends it
 * (`pack.apply`) when a pack is activated; Geospatial keeps it and adds the pack's place types the tenant does not have
 * yet, through the same command people use (audited). Existing place types are never renamed or removed.
 */
@Injectable()
export class GeospatialPackService {
  constructor(
    private readonly database: GeospatialDatabaseService,
    private readonly places: PlacesService,
  ) {}

  async apply(context: CommandContext, rawInput: unknown) {
    const parsed = PackApplicationV1Schema.safeParse(rawInput);
    if (!parsed.success) throw new BadRequestException(`Invalid pack application: ${parsed.error.issues[0]?.path.join('.') ?? ''} ${parsed.error.issues[0]?.message ?? ''}`.trim());
    const application = parsed.data;
    if (application.kind !== 'INDUSTRY') throw new BadRequestException('Geospatial reads industry packs only.');
    const section = GeospatialIndustrySectionV1Schema.safeParse(application.section);
    if (!section.success) {
      throw new BadRequestException(`The pack's Geospatial section is not valid: ${section.error.issues[0]?.path.join('.') ?? ''} ${section.error.issues[0]?.message ?? ''}`.trim());
    }
    const placeTypes = section.data.lists?.placeTypes ?? [];
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const existing = new Set(
        (await client.query<{ code: string }>('SELECT code FROM gigalibs_geospatial.spatial_node_types WHERE tenant_id = $1', [tenantId])).rows.map((row) => row.code),
      );
      const created: string[] = [];
      for (const placeType of placeTypes) {
        if (existing.has(placeType.code)) continue;
        await this.places.createNodeTypeIn(client, context, placeType);
        existing.add(placeType.code);
        created.push(placeType.code);
      }
      await client.query(
        `INSERT INTO gigalibs_geospatial.pack_sections
           (tenant_id, kind, pack_key, pack_version, checksum, published_version_id, section, applied_by, correlation_id)
         VALUES ($1, 'INDUSTRY', $2, $3, $4, $5, $6::jsonb, $7, $8)
         ON CONFLICT (tenant_id, kind) DO UPDATE
           SET pack_key = EXCLUDED.pack_key, pack_version = EXCLUDED.pack_version, checksum = EXCLUDED.checksum,
               published_version_id = EXCLUDED.published_version_id, section = EXCLUDED.section,
               applied_by = EXCLUDED.applied_by, correlation_id = EXCLUDED.correlation_id, applied_at = now()`,
        [tenantId, application.key, application.version, application.checksum, application.publishedVersionId,
          JSON.stringify(section.data), context.principal.subject, context.correlationId],
      );
      await client.query(
        `INSERT INTO gigalibs_geospatial.audit_events
           (id, tenant_id, actor_subject, action, entity_type, entity_id, correlation_id, payload)
         VALUES (gen_random_uuid()::text, $1, $2, 'SPATIAL_PACK_APPLIED', 'PACK_SECTION', 'INDUSTRY', $3, $4::jsonb)`,
        [tenantId, context.principal.subject, context.correlationId,
          JSON.stringify({ key: application.key, version: application.version, checksum: application.checksum, createdPlaceTypes: created })],
      );
      return { status: 'APPLIED' as const, key: application.key, version: application.version, createdPlaceTypes: created };
    });
  }

  async current(principal: GeospatialPrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const result = await client.query<{ kind: string; pack_key: string; pack_version: string; checksum: string; section: unknown; applied_at: Date }>(
        'SELECT kind, pack_key, pack_version, checksum, section, applied_at FROM gigalibs_geospatial.pack_sections WHERE tenant_id = $1',
        [principal.tenantId],
      );
      return {
        items: result.rows.map((row) => ({
          kind: row.kind,
          key: row.pack_key,
          version: row.pack_version,
          checksum: row.checksum,
          section: row.section,
          appliedAt: row.applied_at.toISOString(),
        })),
      };
    });
  }
}
