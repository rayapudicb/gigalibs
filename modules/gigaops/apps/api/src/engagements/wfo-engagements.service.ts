import {
  type CreateWfoEngagementPositionV1,
  type CreateWfoEngagementV1,
  type UpdateWfoEngagementV1,
  type WfoEngagementPositionRecordV1,
  type WfoEngagementRecordV1,
  CreateWfoEngagementPositionV1Schema,
  CreateWfoEngagementV1Schema,
  UpdateWfoEngagementV1Schema,
} from '@gigalibs/contracts';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import { WorkforceDatabaseService } from '../database/database.service.js';

@Injectable()
export class WfoEngagementsService {
  constructor(private readonly database: WorkforceDatabaseService) {}

  // ─── Engagements ─────────────────────────────────────────────────────────────

  async createEngagement(
    principal: GigaOpsPrincipal,
    input: unknown,
  ): Promise<WfoEngagementRecordV1> {
    const data: CreateWfoEngagementV1 = CreateWfoEngagementV1Schema.parse(input);

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `INSERT INTO gigalibs_workforce.wfo_engagements (
          tenant_id, org_unit_id, place_id, source_type, external_id,
          client_id, engagement_type, name, starts_at, ends_at, status,
          per_diem_allowed, per_diem_amount, guaranteed_hours, config,
          created_by, updated_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'DRAFT',
          $11, $12, $13, $14, $15, $15
        ) RETURNING *`,
        [
          principal.tenantId,
          data.orgUnitId ?? null,
          data.placeId ?? null,
          data.sourceType,
          data.externalId ?? null,
          data.clientId ?? null,
          data.engagementType,
          data.name,
          data.startsAt,
          data.endsAt,
          data.perDiemAllowed,
          data.perDiemAmount ?? null,
          data.guaranteedHours ?? null,
          JSON.stringify(data.config),
          principal.subject,
        ],
      );

      return this.mapEngagement(res.rows[0]);
    });
  }

  async listEngagements(
    principal: GigaOpsPrincipal,
    filters: {
      orgUnitId?: string;
      clientId?: string;
      status?: string;
      engagementType?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ items: WfoEngagementRecordV1[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const offset = (page - 1) * limit;

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      let whereClause = `WHERE tenant_id = $1`;
      const params: any[] = [principal.tenantId];
      let pIdx = 2;

      if (filters.orgUnitId) {
        whereClause += ` AND org_unit_id = $${pIdx++}`;
        params.push(filters.orgUnitId);
      }
      if (filters.clientId) {
        whereClause += ` AND client_id = $${pIdx++}`;
        params.push(filters.clientId);
      }
      if (filters.status) {
        whereClause += ` AND status = $${pIdx++}`;
        params.push(filters.status);
      }
      if (filters.engagementType) {
        whereClause += ` AND engagement_type = $${pIdx++}`;
        params.push(filters.engagementType);
      }
      if (filters.dateFrom) {
        whereClause += ` AND ends_at >= $${pIdx++}`;
        params.push(filters.dateFrom);
      }
      if (filters.dateTo) {
        whereClause += ` AND starts_at <= $${pIdx++}`;
        params.push(filters.dateTo);
      }

      const countRes = await client.query(
        `SELECT COUNT(*)::int AS count FROM gigalibs_workforce.wfo_engagements ${whereClause}`,
        params,
      );
      const total = countRes.rows[0]?.count ?? 0;

      const rowsRes = await client.query(
        `SELECT * FROM gigalibs_workforce.wfo_engagements ${whereClause}
         ORDER BY starts_at ASC, name ASC
         LIMIT $${pIdx++} OFFSET $${pIdx++}`,
        [...params, limit, offset],
      );

      return {
        items: rowsRes.rows.map((r) => this.mapEngagement(r)),
        total,
      };
    });
  }

  async getEngagement(
    principal: GigaOpsPrincipal,
    id: string,
  ): Promise<WfoEngagementRecordV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `SELECT * FROM gigalibs_workforce.wfo_engagements WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, id],
      );
      if (!res.rowCount || res.rowCount === 0) {
        throw new NotFoundException(`Engagement ${id} not found.`);
      }
      return this.mapEngagement(res.rows[0]);
    });
  }

  async publishEngagement(
    principal: GigaOpsPrincipal,
    id: string,
  ): Promise<WfoEngagementRecordV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `UPDATE gigalibs_workforce.wfo_engagements
         SET status = 'PUBLISHED', version = version + 1, updated_by = $3, updated_at = now()
         WHERE tenant_id = $1 AND id = $2
         RETURNING *`,
        [principal.tenantId, id, principal.subject],
      );
      if (!res.rowCount || res.rowCount === 0) {
        throw new NotFoundException(`Engagement ${id} not found.`);
      }
      return this.mapEngagement(res.rows[0]);
    });
  }

  // ─── Positions ───────────────────────────────────────────────────────────────

  async createPosition(
    principal: GigaOpsPrincipal,
    engagementId: string,
    input: unknown,
  ): Promise<WfoEngagementPositionRecordV1> {
    const data: CreateWfoEngagementPositionV1 = CreateWfoEngagementPositionV1Schema.parse(input);

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      // Ensure engagement exists
      const eng = await client.query(
        `SELECT id FROM gigalibs_workforce.wfo_engagements WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, engagementId],
      );
      if (!eng.rowCount || eng.rowCount === 0) {
        throw new NotFoundException(`Engagement ${engagementId} not found.`);
      }

      const res = await client.query(
        `INSERT INTO gigalibs_workforce.wfo_engagement_positions (
          tenant_id, engagement_id, job_profile_id, title, org_unit_id,
          quantity, filled, rate_type, rate_amount, currency, status, config, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 0, $7, $8, $9, 'OPEN', $10, $11
        ) RETURNING *`,
        [
          principal.tenantId,
          engagementId,
          data.jobProfileId ?? null,
          data.title,
          data.orgUnitId ?? null,
          data.quantity,
          data.rateType,
          data.rateAmount,
          data.currency,
          JSON.stringify(data.config),
          principal.subject,
        ],
      );

      return this.mapPosition(res.rows[0]);
    });
  }

  async listPositions(
    principal: GigaOpsPrincipal,
    engagementId: string,
  ): Promise<WfoEngagementPositionRecordV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `SELECT * FROM gigalibs_workforce.wfo_engagement_positions
         WHERE tenant_id = $1 AND engagement_id = $2
         ORDER BY created_at ASC`,
        [principal.tenantId, engagementId],
      );
      return res.rows.map((r) => this.mapPosition(r));
    });
  }

  // ─── Private Mappers ─────────────────────────────────────────────────────────

  private mapEngagement(row: any): WfoEngagementRecordV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      orgUnitId: row.org_unit_id,
      placeId: row.place_id,
      sourceType: row.source_type,
      externalId: row.external_id,
      clientId: row.client_id,
      engagementType: row.engagement_type,
      name: row.name,
      startsAt: row.starts_at ? row.starts_at.toISOString().split('T')[0] : row.starts_at,
      endsAt: row.ends_at ? row.ends_at.toISOString().split('T')[0] : row.ends_at,
      status: row.status,
      perDiemAllowed: row.per_diem_allowed,
      perDiemAmount: row.per_diem_amount ? Number(row.per_diem_amount) : null,
      guaranteedHours: row.guaranteed_hours ? Number(row.guaranteed_hours) : null,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      version: row.version,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapPosition(row: any): WfoEngagementPositionRecordV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      engagementId: row.engagement_id,
      jobProfileId: row.job_profile_id,
      title: row.title,
      orgUnitId: row.org_unit_id,
      quantity: row.quantity,
      filled: row.filled,
      rateType: row.rate_type,
      rateAmount: Number(row.rate_amount),
      currency: row.currency,
      status: row.status,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
