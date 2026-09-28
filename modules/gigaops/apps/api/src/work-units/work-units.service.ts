import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { GIGAOPS_DB_POOL } from '../packs/packs.service.js';

export interface CreateWorkUnitDto {
  name: string;
  description?: string;
  startAt: string;
  endAt: string;
  timezone?: string;
  locationName?: string;
  locationCountryCode?: string;
  locationStateCode?: string;
  guaranteedHours?: number;
  headcountTarget?: number;
  industrySlug: string;
  tags?: string[];
}

@Injectable()
export class WorkUnitsService {
  constructor(@Inject(GIGAOPS_DB_POOL) private readonly db: Pool) {}

  async list(
    tenantId: string,
    params: {
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 20;
    const offset = (page - 1) * limit;

    let query = `
      SELECT id, tenant_id, name, description, start_at, end_at, timezone,
             location_name, location_country_code, location_state_code,
             guaranteed_hours, headcount_target, industry_slug, tags, status,
             created_at, updated_at
      FROM gigalibs_gigaops.work_units
      WHERE tenant_id = $1
    `;
    const values: any[] = [tenantId];
    let idx = 2;

    if (params.status) {
      query += ` AND status = $${idx++}`;
      values.push(params.status);
    }
    if (params.dateFrom) {
      query += ` AND start_at >= $${idx++}`;
      values.push(params.dateFrom);
    }
    if (params.dateTo) {
      query += ` AND end_at <= $${idx++}`;
      values.push(params.dateTo);
    }

    query += ` ORDER BY start_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    values.push(limit, offset);

    const res = await this.db.query(query, values);
    return res.rows;
  }

  async getById(tenantId: string, id: string) {
    const res = await this.db.query(
      `SELECT * FROM gigalibs_gigaops.work_units 
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Work unit '${id}' not found.`);
    }
    return res.rows[0];
  }

  async create(tenantId: string, dto: CreateWorkUnitDto) {
    const res = await this.db.query(
      `INSERT INTO gigalibs_gigaops.work_units (
        tenant_id, name, description, start_at, end_at, timezone,
        location_name, location_country_code, location_state_code,
        guaranteed_hours, headcount_target, industry_slug, tags, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'DRAFT')
      RETURNING *`,
      [
        tenantId,
        dto.name,
        dto.description ?? null,
        dto.startAt,
        dto.endAt,
        dto.timezone ?? 'UTC',
        dto.locationName ?? null,
        dto.locationCountryCode ?? 'US',
        dto.locationStateCode ?? null,
        dto.guaranteedHours ?? 0,
        dto.headcountTarget ?? 1,
        dto.industrySlug,
        dto.tags ?? [],
      ],
    );
    return res.rows[0];
  }

  async update(tenantId: string, id: string, dto: Partial<CreateWorkUnitDto>) {
    await this.getById(tenantId, id);
    const res = await this.db.query(
      `UPDATE gigalibs_gigaops.work_units
       SET name = COALESCE($3, name),
           description = COALESCE($4, description),
           location_name = COALESCE($5, location_name),
           guaranteed_hours = COALESCE($6, guaranteed_hours),
           headcount_target = COALESCE($7, headcount_target),
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [
        tenantId,
        id,
        dto.name ?? null,
        dto.description ?? null,
        dto.locationName ?? null,
        dto.guaranteedHours ?? null,
        dto.headcountTarget ?? null,
      ],
    );
    return res.rows[0];
  }

  async activate(tenantId: string, id: string) {
    const unit = await this.getById(tenantId, id);
    if (unit.status === 'CLOSED') {
      throw new BadRequestException('Cannot activate a closed work unit.');
    }
    const res = await this.db.query(
      `UPDATE gigalibs_gigaops.work_units 
       SET status = 'ACTIVE', updated_at = now() 
       WHERE tenant_id = $1 AND id = $2 
       RETURNING *`,
      [tenantId, id],
    );
    return res.rows[0];
  }

  async close(tenantId: string, id: string) {
    const unit = await this.getById(tenantId, id);
    if (unit.status === 'DRAFT') {
      throw new BadRequestException('Cannot close a work unit that is in DRAFT status.');
    }
    const res = await this.db.query(
      `UPDATE gigalibs_gigaops.work_units 
       SET status = 'CLOSED', updated_at = now() 
       WHERE tenant_id = $1 AND id = $2 
       RETURNING *`,
      [tenantId, id],
    );
    return res.rows[0];
  }

  async getDashboard(tenantId: string, id: string) {
    const unit = await this.getById(tenantId, id);

    // Count positions
    const posRes = await this.db.query(
      `SELECT 
         COUNT(*) as total_positions,
         COUNT(worker_id) as filled_positions
       FROM gigalibs_gigaops.positions p
       JOIN gigalibs_gigaops.roles r ON p.role_id = r.id
       WHERE p.tenant_id = $1 AND r.work_unit_id = $2`,
      [tenantId, id],
    );

    // Time entry stats
    const timeRes = await this.db.query(
      `SELECT 
         COUNT(*) as total_entries,
         COUNT(*) FILTER (WHERE status = 'APPROVED') as approved_entries,
         COUNT(*) FILTER (WHERE status = 'SUBMITTED') as pending_entries
       FROM gigalibs_gigaops.time_entries
       WHERE tenant_id = $1 AND work_unit_id = $2`,
      [tenantId, id],
    );

    const totalPos = Number.parseInt(posRes.rows[0]?.total_positions ?? '0', 10);
    const filledPos = Number.parseInt(posRes.rows[0]?.filled_positions ?? '0', 10);
    const target = unit.headcount_target;

    return {
      workUnit: unit,
      headcount: {
        target,
        totalSlots: totalPos,
        filled: filledPos,
        fillRate: totalPos > 0 ? Math.round((filledPos / totalPos) * 100) : 0,
      },
      timeEntries: {
        total: Number.parseInt(timeRes.rows[0]?.total_entries ?? '0', 10),
        approved: Number.parseInt(timeRes.rows[0]?.approved_entries ?? '0', 10),
        pending: Number.parseInt(timeRes.rows[0]?.pending_entries ?? '0', 10),
      },
    };
  }
}
