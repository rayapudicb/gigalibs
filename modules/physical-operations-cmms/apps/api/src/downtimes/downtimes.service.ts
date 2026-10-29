import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { assertUuid, iso, recordMutation } from '../common/command.js';
import { DatabaseService } from '../database/database.service.js';

const StartSchema = z.object({
  startedAt: z.string().datetime().optional(),
  downtimeType: z.enum(['PLANNED', 'UNPLANNED', 'PROCESS']).default('UNPLANNED'),
  failureCauseCode: z.string().max(80).optional(),
  notes: z.string().max(4000).optional(),
  source: z.enum(['MANUAL', 'IOT_AUTO', 'WORKFLOW']).default('MANUAL'),
  externalAlertId: z.string().uuid().optional(),
  workOrderId: z.string().uuid().optional(),
});

const EndSchema = z.object({
  endedAt: z.string().datetime().optional(),
  resolutionNotes: z.string().max(4000).optional(),
});

@Injectable()
export class DowntimesService {
  constructor(private readonly database: DatabaseService) {}

  list(principal: CmmsPrincipal, assetId: string) {
    assertUuid(assetId, 'assetId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const result = await client.query(
        `SELECT id, downtime_type, started_at, ended_at, duration_hours, failure_cause_code, notes, source,
                external_alert_id, work_order_id, created_at
           FROM gigalibs_cmms.asset_downtimes
          WHERE tenant_id = $1 AND asset_id = $2
          ORDER BY started_at DESC LIMIT 100`,
        [principal.tenantId, assetId],
      );
      return { items: result.rows };
    });
  }

  async start(context: CmmsCommandContext, assetId: string, raw: unknown) {
    assertUuid(assetId, 'assetId');
    const body = StartSchema.parse(raw ?? {});
    const id = randomUUID();
    const startedAt = body.startedAt ?? new Date().toISOString();
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const asset = await client.query(`SELECT id FROM gigalibs_cmms.assets WHERE tenant_id = $1 AND id = $2`, [
        context.principal.tenantId,
        assetId,
      ]);
      if (!asset.rows[0]) throw new NotFoundException('Asset was not found.');
      const open = await client.query(
        `SELECT id FROM gigalibs_cmms.asset_downtimes WHERE tenant_id = $1 AND asset_id = $2 AND ended_at IS NULL`,
        [context.principal.tenantId, assetId],
      );
      if (open.rows[0]) throw new BadRequestException('An open downtime already exists for this asset.');
      await client.query(
        `INSERT INTO gigalibs_cmms.asset_downtimes
           (tenant_id, id, asset_id, downtime_type, started_at, duration_hours, failure_cause_code, notes,
            source, external_alert_id, work_order_id, created_by, correlation_id)
         VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,$10,$11,$12)`,
        [
          context.principal.tenantId,
          id,
          assetId,
          body.downtimeType,
          startedAt,
          body.failureCauseCode ?? null,
          body.notes ?? null,
          body.source,
          body.externalAlertId ?? null,
          body.workOrderId ?? null,
          context.principal.subject,
          context.correlationId,
        ],
      );
      await recordMutation(client, context, {
        action: 'DOWNTIME_STARTED',
        aggregateType: 'asset_downtime',
        aggregateId: id,
        aggregateVersion: 1,
        payload: { assetId, downtimeType: body.downtimeType, source: body.source, startedAt: iso(startedAt) },
      });
      await client.query(
        `INSERT INTO gigalibs_cmms.outbox_events
           (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version, correlation_id, schema_version, payload)
         VALUES ($1,$2,'cmms.downtime.v1','DOWNTIME_STARTED_V1','asset_downtime',$3,1,$4,1,$5::jsonb)`,
        [
          randomUUID(),
          context.principal.tenantId,
          id,
          context.correlationId,
          JSON.stringify({ assetId, downtimeId: id, startedAt }),
        ],
      );
      return { id, assetId, startedAt: iso(startedAt), status: 'OPEN' };
    });
  }

  async end(context: CmmsCommandContext, assetId: string, raw: unknown) {
    assertUuid(assetId, 'assetId');
    const body = EndSchema.parse(raw ?? {});
    const endedAt = body.endedAt ?? new Date().toISOString();
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const open = await client.query(
        `SELECT id, started_at FROM gigalibs_cmms.asset_downtimes
          WHERE tenant_id = $1 AND asset_id = $2 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
        [context.principal.tenantId, assetId],
      );
      const row = open.rows[0];
      if (!row) throw new NotFoundException('No open downtime for this asset.');
      const hours =
        (new Date(endedAt).getTime() - new Date(row.started_at as string).getTime()) / (1000 * 60 * 60);
      await client.query(
        `UPDATE gigalibs_cmms.asset_downtimes
            SET ended_at = $3, duration_hours = $4, notes = COALESCE($5, notes), updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, row.id, endedAt, Math.max(0, hours), body.resolutionNotes ?? null],
      );
      await recordMutation(client, context, {
        action: 'DOWNTIME_ENDED',
        aggregateType: 'asset_downtime',
        aggregateId: row.id,
        aggregateVersion: 2,
        payload: { assetId, endedAt: iso(endedAt), durationHours: hours },
      });
      await client.query(
        `INSERT INTO gigalibs_cmms.outbox_events
           (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version, correlation_id, schema_version, payload)
         VALUES ($1,$2,'cmms.downtime.v1','DOWNTIME_ENDED_V1','asset_downtime',$3,2,$4,1,$5::jsonb)`,
        [
          randomUUID(),
          context.principal.tenantId,
          row.id,
          context.correlationId,
          JSON.stringify({ assetId, downtimeId: row.id, endedAt, resolutionNotes: body.resolutionNotes ?? null }),
        ],
      );
      return { id: row.id, assetId, endedAt: iso(endedAt), durationHours: hours };
    });
  }
}
