import { randomUUID } from 'node:crypto';
import {
  PackApplicationV1Schema,
  WorkforceCountrySectionV1Schema,
  WorkforceIndustrySectionV1Schema,
  type PackApplicationV1,
} from '@gigalibs/contracts';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import type { CommandContext } from '../common/commands.js';
import { WorkforceDatabaseService } from '../database/database.service.js';

export interface WorkforcePackSection {
  readonly kind: 'INDUSTRY' | 'COUNTRY';
  readonly key: string;
  readonly version: string;
  readonly checksum: string;
  readonly publishedVersionId: string;
  readonly section: Record<string, unknown>;
  readonly appliedAt: string;
}

/**
 * WI-OI-107 (ADR-0016 F10): Workforce's section of the tenant's active industry and country packs. The kernel sends
 * it (`pack.apply`) when a pack is activated; Workforce validates it against its own section schemas, keeps one copy
 * per pack kind, and audits each change. An identical re-send changes nothing.
 */
@Injectable()
export class WorkforcePackService {
  constructor(private readonly database: WorkforceDatabaseService) {}

  async apply(context: CommandContext, rawInput: unknown): Promise<{ readonly status: 'APPLIED' | 'UNCHANGED'; readonly pack: WorkforcePackSection }> {
    const parsed = PackApplicationV1Schema.safeParse(rawInput);
    if (!parsed.success) throw new BadRequestException(`Invalid pack application: ${parsed.error.issues[0]?.path.join('.') ?? ''} ${parsed.error.issues[0]?.message ?? ''}`.trim());
    const application: PackApplicationV1 = parsed.data;
    const section = (application.kind === 'INDUSTRY' ? WorkforceIndustrySectionV1Schema : WorkforceCountrySectionV1Schema).safeParse(application.section);
    if (!section.success) {
      throw new BadRequestException(`The pack's Workforce section is not valid: ${section.error.issues[0]?.path.join('.') ?? ''} ${section.error.issues[0]?.message ?? ''}`.trim());
    }
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const held = await client.query<{ checksum: string }>(
        'SELECT checksum FROM gigalibs_workforce.pack_sections WHERE tenant_id = $1 AND kind = $2 FOR UPDATE',
        [tenantId, application.kind],
      );
      const unchanged = held.rows[0]?.checksum === application.checksum;
      if (!unchanged) {
        await client.query(
          `INSERT INTO gigalibs_workforce.pack_sections
             (tenant_id, kind, pack_key, pack_version, checksum, published_version_id, section, applied_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
           ON CONFLICT (tenant_id, kind) DO UPDATE
             SET pack_key = EXCLUDED.pack_key, pack_version = EXCLUDED.pack_version, checksum = EXCLUDED.checksum,
                 published_version_id = EXCLUDED.published_version_id, section = EXCLUDED.section,
                 applied_by = EXCLUDED.applied_by, correlation_id = EXCLUDED.correlation_id, applied_at = now()`,
          [tenantId, application.kind, application.key, application.version, application.checksum, application.publishedVersionId,
            JSON.stringify(section.data), context.principal.subject, context.correlationId],
        );
        await client.query(
          `INSERT INTO gigalibs_workforce.audit_events (id, tenant_id, actor_subject, action, entity_type, entity_id, correlation_id, payload)
           VALUES ($1, $2, $3, 'WORKFORCE_PACK_APPLIED', 'PACK_SECTION', $4, $5, $6::jsonb)`,
          [randomUUID(), tenantId, context.principal.subject, application.kind, context.correlationId,
            JSON.stringify({ key: application.key, version: application.version, checksum: application.checksum, publishedVersionId: application.publishedVersionId })],
        );
      }
      const pack = (await this.read(client, tenantId)).find((item) => item.kind === application.kind)!;
      return { status: unchanged ? ('UNCHANGED' as const) : ('APPLIED' as const), pack };
    });
  }

  /** What Workforce holds: its section of the active industry pack and of the active country pack, if any. */
  async current(principal: GigaOpsPrincipal): Promise<{ readonly items: readonly WorkforcePackSection[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => ({ items: await this.read(client, principal.tenantId) }));
  }

  private async read(client: PoolClient, tenantId: string): Promise<WorkforcePackSection[]> {
    const result = await client.query<{
      kind: 'INDUSTRY' | 'COUNTRY';
      pack_key: string;
      pack_version: string;
      checksum: string;
      published_version_id: string;
      section: Record<string, unknown>;
      applied_at: Date;
    }>(
      `SELECT kind, pack_key, pack_version, checksum, published_version_id, section, applied_at
         FROM gigalibs_workforce.pack_sections WHERE tenant_id = $1 ORDER BY kind DESC`,
      [tenantId],
    );
    return result.rows.map((row) => ({
      kind: row.kind,
      key: row.pack_key,
      version: row.pack_version,
      checksum: row.checksum,
      publishedVersionId: row.published_version_id,
      section: row.section,
      appliedAt: row.applied_at.toISOString(),
    }));
  }
}
